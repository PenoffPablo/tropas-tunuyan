-- ============================================================================
-- TROPAS TUNUYÁN — ESQUEMA v2 (Supabase / PostgreSQL 15+)
-- ============================================================================
-- Instalación sobre una base VACÍA (schema public sin tablas de la app):
--   Supabase Dashboard → SQL Editor → ejecutar este archivo completo.
-- Cambios posteriores: nuevas migraciones en database/migraciones/.
--
-- Modelo de seguridad:
--   · anon           → solo lectura del catálogo público (sin costos ni márgenes).
--   · authenticated  → acceso según rol en auth.users.raw_app_meta_data->>'rol':
--                        'admin'    → todo el panel.
--                        'vendedor' → POS, turnos y arqueos.
--   · Operaciones críticas (ventas, turnos, PIN, stock) SOLO vía funciones RPC
--     transaccionales SECURITY DEFINER.
--
-- Pensado para crecer:
--   · Precio/costo por variante (opcional; si es NULL rige el del producto).
--   · SKU y código de barras únicos por variante (lector en el POS).
--   · Slugs estables para URLs públicas y búsqueda full-text en español.
--   · movimientos_stock: libro de inventario (cada alta, venta y ajuste).
--   · auditoria: historial de cambios del catálogo y del personal.
--
-- Asignar rol a un usuario (como postgres en el SQL Editor):
--   update auth.users
--      set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || '{"rol":"admin"}'
--    where email = 'tu-correo@dominio.com';
--   (el usuario debe volver a iniciar sesión para que el JWT incluya el rol)
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. HELPERS
-- ────────────────────────────────────────────────────────────────────────────
create or replace function private.rol_actual()
returns text language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'rol', '');
$$;

create or replace function private.es_admin()
returns boolean language sql stable set search_path = '' as $$
  select private.rol_actual() = 'admin';
$$;

create or replace function private.es_staff()
returns boolean language sql stable set search_path = '' as $$
  select private.rol_actual() in ('admin', 'vendedor');
$$;

revoke all on function private.rol_actual() from public;
revoke all on function private.es_admin() from public;
revoke all on function private.es_staff() from public;
grant execute on function private.rol_actual() to anon, authenticated;
grant execute on function private.es_admin() to anon, authenticated;
grant execute on function private.es_staff() to anon, authenticated;

-- "Pantalón Táctico BDU" → "pantalon-tactico-bdu"
create or replace function private.slugify(p_texto text)
returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_texto, ''))),
                              '[^a-z0-9]+', '-', 'g'), '-');
$$;

create or replace function private.tocar_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Asigna un slug único al insertar (o si viene vacío). Una vez fijado no cambia
-- al renombrar: los enlaces públicos no se rompen.
create or replace function private.asignar_slug()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_base text;
  v_slug text;
  v_n integer := 1;
  v_existe boolean;
begin
  if new.slug is not null and btrim(new.slug) <> '' then
    new.slug := private.slugify(new.slug);
    return new;
  end if;
  v_base := left(coalesce(nullif(private.slugify(new.nombre), ''), 'item'), 80);
  v_slug := v_base;
  loop
    execute format('select exists (select 1 from %I.%I where slug = $1 and id <> $2)', tg_table_schema, tg_table_name)
       into v_existe using v_slug, new.id;
    exit when not v_existe;
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  new.slug := v_slug;
  return new;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. TABLAS
-- ────────────────────────────────────────────────────────────────────────────
create table public.categorias (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null constraint categorias_nombre_valido check (char_length(btrim(nombre)) between 2 and 60),
  slug        text not null unique,
  descripcion text,
  orden       integer not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index categorias_nombre_uidx on public.categorias (lower(nombre));

create table public.productos (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null constraint productos_nombre_valido check (char_length(btrim(nombre)) between 2 and 160),
  slug                text not null unique,
  descripcion         text constraint productos_descripcion_larga check (char_length(descripcion) <= 4000),
  categoria_id        uuid references public.categorias(id) on delete set null,
  precio              numeric(12, 2) not null default 0 constraint productos_precio_no_negativo check (precio >= 0),
  costo               numeric(12, 2) not null default 0 constraint productos_costo_no_negativo check (costo >= 0),
  porcentaje_ganancia numeric(7, 2) not null default 0,
  exige_credencial    boolean not null default false,
  imagen_url          text,
  etiquetas           text[] not null default '{}',
  activo              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  busqueda            tsvector generated always as (
                        setweight(to_tsvector('spanish'::regconfig, coalesce(nombre, '')), 'A') ||
                        setweight(to_tsvector('spanish'::regconfig, coalesce(descripcion, '')), 'B')
                      ) stored
);

create table public.variantes (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid not null references public.productos(id) on delete cascade,
  sku           text unique,
  codigo_barras text unique,
  talle         text not null constraint variantes_talle_valido check (char_length(btrim(talle)) between 1 and 20),
  color         text not null default 'Único' constraint variantes_color_valido check (char_length(btrim(color)) between 1 and 30),
  precio        numeric(12, 2) constraint variantes_precio_no_negativo check (precio >= 0),  -- NULL = precio del producto
  costo         numeric(12, 2) constraint variantes_costo_no_negativo check (costo >= 0),    -- NULL = costo del producto
  stock         integer not null default 0 constraint variantes_stock_no_negativo check (stock >= 0),
  stock_minimo  integer not null default 5 constraint variantes_stock_minimo_no_negativo check (stock_minimo >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (producto_id, talle, color)
);

create table public.empleados (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null constraint empleados_nombre_valido check (char_length(btrim(nombre)) between 2 and 80),
  puesto                text not null default 'Vendedor Mostrador',
  telefono              text,
  activo                boolean not null default true,
  pin_hash              text not null,
  pin_intentos_fallidos integer not null default 0,
  pin_bloqueado_hasta   timestamptz,
  fecha_alta            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.turnos_caja (
  id                         uuid primary key default gen_random_uuid(),
  caja                       text not null default 'principal',
  empleado_id                uuid references public.empleados(id) on delete set null,
  cajero_nombre              text not null,
  monto_apertura             numeric(12, 2) not null default 0 constraint turnos_apertura_no_negativa check (monto_apertura >= 0),
  monto_cierre_declarado     numeric(12, 2),
  monto_cierre_esperado      numeric(12, 2),
  diferencia                 numeric(12, 2),
  total_ventas_efectivo      numeric(12, 2) not null default 0,
  total_ventas_digital       numeric(12, 2) not null default 0,
  total_movimientos_efectivo numeric(12, 2) not null default 0,
  cantidad_ventas            integer not null default 0,
  estado                     text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  observaciones              text,
  fecha_apertura             timestamptz not null default now(),
  fecha_cierre               timestamptz,
  abierto_por                uuid,
  cerrado_por                uuid
);
-- Una sola caja abierta por mostrador:
create unique index turnos_un_abierto_por_caja_uidx on public.turnos_caja (caja) where estado = 'abierto';

create sequence public.ventas_ticket_seq;

create table public.ventas (
  id                        uuid primary key default gen_random_uuid(),
  numero_ticket             text not null unique,
  turno_id                  uuid references public.turnos_caja(id) on delete set null,
  cajero_nombre             text not null,
  empleado_id               uuid references public.empleados(id) on delete set null,
  operador_user_id          uuid,
  total                     numeric(12, 2) not null,
  metodo_pago               text not null check (metodo_pago in ('efectivo', 'transferencia_alias', 'tarjeta_postnet', 'combinado')),
  monto_efectivo            numeric(12, 2) not null default 0,
  monto_digital             numeric(12, 2) not null default 0,
  monto_recibido            numeric(12, 2),
  vuelto                    numeric(12, 2) not null default 0,
  nro_comprobante_digital   text,
  exigio_credencial         boolean not null default false,
  fuerza_institucion        text,
  credencial_verificada     boolean not null default false,
  credencial_verificada_por uuid references public.empleados(id) on delete set null,
  legajo_comprador          text,
  nombre_cliente            text,
  telefono_cliente          text,
  idempotency_key           uuid unique,
  created_at                timestamptz not null default now(),
  constraint ventas_montos_validos check (total >= 0 and monto_efectivo >= 0 and monto_digital >= 0)
);

create table public.venta_detalles (
  id              uuid primary key default gen_random_uuid(),
  venta_id        uuid not null references public.ventas(id) on delete cascade,
  producto_id     uuid references public.productos(id) on delete set null,
  variante_id     uuid references public.variantes(id) on delete set null,
  nombre_producto text not null,
  talle           text not null,
  color           text not null,
  precio_unitario numeric(12, 2) not null,
  costo_unitario  numeric(12, 2) not null default 0,
  cantidad        integer not null default 1 constraint venta_detalles_cantidad_positiva check (cantidad > 0),
  subtotal        numeric(12, 2) not null,
  created_at      timestamptz not null default now()
);

create table public.movimientos_caja (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('ingreso', 'egreso')),
  monto          numeric(12, 2) not null constraint movimientos_monto_positivo check (monto > 0),
  concepto       text not null,
  categoria_caja text not null default 'General',
  metodo_pago    text not null default 'efectivo' constraint movimientos_metodo_valido check (metodo_pago in ('efectivo', 'transferencia', 'tarjeta', 'otro')),
  producto_id    uuid references public.productos(id) on delete set null,
  cantidad       integer not null default 1 constraint movimientos_cantidad_positiva check (cantidad > 0),
  turno_id       uuid references public.turnos_caja(id) on delete set null,
  venta_id       uuid references public.ventas(id) on delete cascade,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);

-- Libro de inventario: lo escribe el trigger de variantes, nunca el cliente.
create table public.movimientos_stock (
  id               bigint generated always as identity primary key,
  variante_id      uuid references public.variantes(id) on delete set null,
  producto_id      uuid references public.productos(id) on delete set null,
  delta            integer not null check (delta <> 0),
  stock_resultante integer not null,
  motivo           text not null check (motivo in ('alta', 'venta', 'ajuste', 'correccion', 'devolucion')),
  venta_id         uuid references public.ventas(id) on delete set null,
  nota             text,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now()
);

-- Historial de cambios (lo escriben triggers; solo lectura para el admin).
create table public.auditoria (
  id          bigint generated always as identity primary key,
  tabla       text not null,
  registro_id uuid,
  accion      text not null check (accion in ('alta', 'modificacion', 'baja')),
  antes       jsonb,
  despues     jsonb,
  actor       uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ÍNDICES
-- ────────────────────────────────────────────────────────────────────────────
create index idx_categorias_orden            on public.categorias (orden, nombre);
create index idx_productos_categoria         on public.productos (categoria_id);
create index idx_productos_activo_nombre     on public.productos (activo, nombre);
create index idx_productos_busqueda          on public.productos using gin (busqueda);
create index idx_productos_nombre_trgm       on public.productos using gin (nombre extensions.gin_trgm_ops);
create index idx_productos_etiquetas         on public.productos using gin (etiquetas);
create index idx_variantes_producto          on public.variantes (producto_id);
create index idx_turnos_estado               on public.turnos_caja (estado);
create index idx_turnos_empleado             on public.turnos_caja (empleado_id);
create index idx_turnos_fecha_apertura       on public.turnos_caja (fecha_apertura desc);
create index idx_ventas_turno                on public.ventas (turno_id);
create index idx_ventas_fecha                on public.ventas (created_at desc);
create index idx_ventas_empleado             on public.ventas (empleado_id);
create index idx_ventas_credencial_por       on public.ventas (credencial_verificada_por);
create index idx_venta_detalles_venta        on public.venta_detalles (venta_id);
create index idx_venta_detalles_producto     on public.venta_detalles (producto_id);
create index idx_venta_detalles_variante     on public.venta_detalles (variante_id);
create index idx_movimientos_fecha           on public.movimientos_caja (created_at desc);
create index idx_movimientos_turno           on public.movimientos_caja (turno_id);
create index idx_movimientos_venta           on public.movimientos_caja (venta_id);
create index idx_movimientos_producto        on public.movimientos_caja (producto_id);
create index idx_mov_stock_variante_fecha    on public.movimientos_stock (variante_id, created_at desc);
create index idx_mov_stock_producto          on public.movimientos_stock (producto_id);
create index idx_mov_stock_venta             on public.movimientos_stock (venta_id);
create index idx_mov_stock_fecha             on public.movimientos_stock (created_at desc);
create index idx_auditoria_registro          on public.auditoria (tabla, registro_id, created_at desc);
create index idx_auditoria_fecha             on public.auditoria (created_at desc);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. TRIGGERS
-- ────────────────────────────────────────────────────────────────────────────
create trigger categorias_updated_at before update on public.categorias for each row execute function private.tocar_updated_at();
create trigger productos_updated_at  before update on public.productos  for each row execute function private.tocar_updated_at();
create trigger variantes_updated_at  before update on public.variantes  for each row execute function private.tocar_updated_at();
create trigger empleados_updated_at  before update on public.empleados  for each row execute function private.tocar_updated_at();

create trigger categorias_slug before insert or update of slug on public.categorias for each row execute function private.asignar_slug();
create trigger productos_slug  before insert or update of slug on public.productos  for each row execute function private.asignar_slug();

-- Libro de inventario. Las RPC indican el motivo con set_config('tt.motivo_stock', ...)
-- y la venta con 'tt.venta_id'; un cambio directo del admin queda como 'ajuste'.
create or replace function private.registrar_movimiento_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_delta integer := new.stock - case when tg_op = 'INSERT' then 0 else old.stock end;
  v_motivo text := nullif(current_setting('tt.motivo_stock', true), '');
begin
  if v_delta = 0 then
    return null;
  end if;
  insert into public.movimientos_stock (variante_id, producto_id, delta, stock_resultante, motivo, venta_id, nota)
  values (new.id, new.producto_id, v_delta, new.stock,
          coalesce(v_motivo, case when tg_op = 'INSERT' then 'alta' else 'ajuste' end),
          nullif(current_setting('tt.venta_id', true), '')::uuid,
          nullif(left(current_setting('tt.nota_stock', true), 300), ''));
  return null;
end;
$$;
create trigger variantes_movimiento_stock after insert or update of stock on public.variantes
  for each row execute function private.registrar_movimiento_stock();

-- Auditoría genérica. Nunca guarda el hash del PIN; ignora cambios que solo tocan
-- stock (esos van al libro de inventario) o columnas técnicas.
create or replace function private.auditar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ignorar text[] := array['updated_at', 'busqueda', 'pin_hash', 'pin_intentos_fallidos', 'pin_bloqueado_hasta', 'stock'];
  v_antes jsonb;
  v_despues jsonb;
begin
  if tg_op <> 'INSERT' then v_antes := to_jsonb(old) - v_ignorar; end if;
  if tg_op <> 'DELETE' then v_despues := to_jsonb(new) - v_ignorar; end if;
  if tg_op = 'UPDATE' and v_antes = v_despues then
    return null;
  end if;
  insert into public.auditoria (tabla, registro_id, accion, antes, despues)
  values (tg_table_name, coalesce((v_despues ->> 'id'), (v_antes ->> 'id'))::uuid,
          case tg_op when 'INSERT' then 'alta' when 'UPDATE' then 'modificacion' else 'baja' end,
          v_antes, v_despues);
  return null;
end;
$$;
create trigger categorias_auditoria after insert or update or delete on public.categorias for each row execute function private.auditar();
create trigger productos_auditoria  after insert or update or delete on public.productos  for each row execute function private.auditar();
create trigger variantes_auditoria  after insert or update or delete on public.variantes  for each row execute function private.auditar();
create trigger empleados_auditoria  after insert or update or delete on public.empleados  for each row execute function private.auditar();

revoke all on function private.slugify(text) from public;
revoke all on function private.asignar_slug() from public, anon, authenticated;
revoke all on function private.registrar_movimiento_stock() from public, anon, authenticated;
revoke all on function private.auditar() from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. PRIVILEGIOS (mínimo privilegio)
-- ────────────────────────────────────────────────────────────────────────────
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Catálogo público: SIN costos ni márgenes.
grant select on public.categorias to anon, authenticated;
grant select (id, nombre, slug, descripcion, categoria_id, precio, exige_credencial, imagen_url, etiquetas, activo, created_at, updated_at)
  on public.productos to anon;
grant select (id, producto_id, talle, color, precio, stock, stock_minimo, created_at, updated_at)
  on public.variantes to anon;

-- Panel (RLS decide filas y rol). Las columnas de COSTO no se leen directo ni
-- siquiera con sesión: el vendedor no las ve y el admin las obtiene con la RPC
-- costos_catalogo() (valida el rol adentro).
grant select, insert, update, delete on public.categorias to authenticated;
grant insert, update, delete on public.productos, public.variantes to authenticated;
grant select (id, nombre, slug, descripcion, categoria_id, precio, exige_credencial, imagen_url, etiquetas, activo, created_at, updated_at)
  on public.productos to authenticated;
grant select (id, producto_id, sku, codigo_barras, talle, color, precio, stock, stock_minimo, created_at, updated_at)
  on public.variantes to authenticated;
grant select (id, venta_id, producto_id, variante_id, nombre_producto, talle, color, precio_unitario, cantidad, subtotal, created_at)
  on public.venta_detalles to authenticated;
grant select (id, nombre, puesto, telefono, activo, fecha_alta, created_at, updated_at) on public.empleados to authenticated;
grant select on public.turnos_caja, public.ventas, public.movimientos_stock, public.auditoria to authenticated;
grant select, insert, delete on public.movimientos_caja to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────────────────────
alter table public.categorias        enable row level security;
alter table public.productos         enable row level security;
alter table public.variantes         enable row level security;
alter table public.empleados         enable row level security;
alter table public.turnos_caja       enable row level security;
alter table public.ventas            enable row level security;
alter table public.venta_detalles    enable row level security;
alter table public.movimientos_caja  enable row level security;
alter table public.movimientos_stock enable row level security;
alter table public.auditoria         enable row level security;

create policy categorias_lectura on public.categorias
  for select to anon, authenticated using (activo or (select private.es_staff()));
create policy categorias_admin_insert on public.categorias
  for insert to authenticated with check ((select private.es_admin()));
create policy categorias_admin_update on public.categorias
  for update to authenticated using ((select private.es_admin())) with check ((select private.es_admin()));
create policy categorias_admin_delete on public.categorias
  for delete to authenticated using ((select private.es_admin()));

create policy productos_lectura_publica on public.productos
  for select to anon using (activo);
-- Usuarios autenticados SIN rol no ven nada (tienen permiso de tabla completo,
-- incluidos costos): el catálogo público se consulta como anon.
create policy productos_lectura_panel on public.productos
  for select to authenticated using ((select private.es_staff()));
create policy productos_admin_insert on public.productos
  for insert to authenticated with check ((select private.es_admin()));
create policy productos_admin_update on public.productos
  for update to authenticated using ((select private.es_admin())) with check ((select private.es_admin()));
create policy productos_admin_delete on public.productos
  for delete to authenticated using ((select private.es_admin()));

create policy variantes_lectura_publica on public.variantes
  for select to anon
  using (exists (select 1 from public.productos p where p.id = producto_id and p.activo));
create policy variantes_lectura_panel on public.variantes
  for select to authenticated using ((select private.es_staff()));
create policy variantes_admin_insert on public.variantes
  for insert to authenticated with check ((select private.es_admin()));
create policy variantes_admin_update on public.variantes
  for update to authenticated using ((select private.es_admin())) with check ((select private.es_admin()));
create policy variantes_admin_delete on public.variantes
  for delete to authenticated using ((select private.es_admin()));

create policy empleados_lectura_staff on public.empleados
  for select to authenticated using ((select private.es_staff()));

create policy turnos_lectura_staff on public.turnos_caja
  for select to authenticated using ((select private.es_staff()));
create policy ventas_lectura_staff on public.ventas
  for select to authenticated using ((select private.es_staff()));
create policy venta_detalles_lectura_staff on public.venta_detalles
  for select to authenticated using ((select private.es_staff()));

-- Libro financiero exclusivo del admin; los movimientos de ventas no se borran a mano.
create policy movimientos_lectura_admin on public.movimientos_caja
  for select to authenticated using ((select private.es_admin()));
create policy movimientos_admin_insert on public.movimientos_caja
  for insert to authenticated
  with check ((select private.es_admin()) and venta_id is null and created_by = (select auth.uid()));
create policy movimientos_admin_delete on public.movimientos_caja
  for delete to authenticated using ((select private.es_admin()) and venta_id is null);

create policy movimientos_stock_lectura_admin on public.movimientos_stock
  for select to authenticated using ((select private.es_admin()));
create policy auditoria_lectura_admin on public.auditoria
  for select to authenticated using ((select private.es_admin()));

-- ────────────────────────────────────────────────────────────────────────────
-- 7. FUNCIONES INTERNAS
-- ────────────────────────────────────────────────────────────────────────────

-- PIN con bloqueo anti fuerza bruta (5 fallos → 5 minutos). NULL si es inválido.
create or replace function private.validar_pin_empleado(p_empleado_id uuid, p_pin text)
returns public.empleados language plpgsql security definer set search_path = '' as $$
declare
  v_emp public.empleados;
begin
  if p_empleado_id is null or p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    return null;
  end if;
  select * into v_emp from public.empleados where id = p_empleado_id for update;
  if not found or not v_emp.activo then
    return null;
  end if;
  if v_emp.pin_bloqueado_hasta is not null and v_emp.pin_bloqueado_hasta > now() then
    raise exception 'Operador bloqueado por intentos fallidos. Reintentá en % minuto(s).',
      greatest(1, ceil(extract(epoch from (v_emp.pin_bloqueado_hasta - now())) / 60)::int)
      using errcode = 'P0001', hint = 'PIN_BLOQUEADO';
  end if;
  if v_emp.pin_hash = extensions.crypt(p_pin, v_emp.pin_hash) then
    if v_emp.pin_intentos_fallidos <> 0 or v_emp.pin_bloqueado_hasta is not null then
      update public.empleados set pin_intentos_fallidos = 0, pin_bloqueado_hasta = null where id = v_emp.id;
    end if;
    return v_emp;
  end if;
  update public.empleados
     set pin_intentos_fallidos = case when pin_intentos_fallidos + 1 >= 5 then 0 else pin_intentos_fallidos + 1 end,
         pin_bloqueado_hasta   = case when pin_intentos_fallidos + 1 >= 5 then now() + interval '5 minutes' else null end
   where id = v_emp.id;
  return null;
end;
$$;
revoke all on function private.validar_pin_empleado(uuid, text) from public, anon, authenticated;

create or replace function private.venta_json(p_venta_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  -- Sin costo_unitario: la respuesta llega al POS (también al vendedor).
  select to_jsonb(v) || jsonb_build_object(
           'detalles',
           coalesce((select jsonb_agg(to_jsonb(d) - 'costo_unitario' order by d.nombre_producto, d.talle)
                       from public.venta_detalles d where d.venta_id = v.id), '[]'::jsonb))
    from public.ventas v
   where v.id = p_venta_id;
$$;
revoke all on function private.venta_json(uuid) from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. RPC (autenticadas; el rol se valida adentro)
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.verificar_credencial_empleado(p_empleado_id uuid, p_pin text)
returns table (id uuid, nombre text, puesto text)
language plpgsql security definer set search_path = '' as $$
declare
  v_emp public.empleados;
begin
  if not private.es_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  v_emp := private.validar_pin_empleado(p_empleado_id, p_pin);
  if v_emp.id is null then
    return;
  end if;
  return query select v_emp.id, v_emp.nombre, v_emp.puesto;
end;
$$;

create or replace function public.guardar_empleado(
  p_id uuid, p_nombre text, p_puesto text, p_telefono text, p_activo boolean, p_pin text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  if not private.es_admin() then
    raise exception 'Solo el administrador puede gestionar personal' using errcode = '42501';
  end if;
  if char_length(v_nombre) < 2 or char_length(v_nombre) > 80 then
    raise exception 'El nombre debe tener entre 2 y 80 caracteres';
  end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'El PIN debe tener entre 4 y 6 dígitos numéricos';
  end if;
  if p_id is null then
    if p_pin is null then
      raise exception 'El PIN es obligatorio para dar de alta un empleado';
    end if;
    insert into public.empleados (nombre, puesto, telefono, activo, pin_hash)
    values (v_nombre, coalesce(nullif(btrim(p_puesto), ''), 'Vendedor Mostrador'), nullif(btrim(p_telefono), ''),
            coalesce(p_activo, true), extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
    returning id into v_id;
  else
    update public.empleados
       set nombre   = v_nombre,
           puesto   = coalesce(nullif(btrim(p_puesto), ''), puesto),
           telefono = nullif(btrim(p_telefono), ''),
           activo   = coalesce(p_activo, activo),
           pin_hash = case when p_pin is null then pin_hash else extensions.crypt(p_pin, extensions.gen_salt('bf', 10)) end,
           pin_intentos_fallidos = case when p_pin is null then pin_intentos_fallidos else 0 end,
           pin_bloqueado_hasta   = case when p_pin is null then pin_bloqueado_hasta else null end
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Empleado inexistente';
    end if;
  end if;
  return v_id;
end;
$$;

-- Si tiene historial se desactiva (auditoría); si no, se elimina.
create or replace function public.eliminar_empleado(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not private.es_admin() then
    raise exception 'Solo el administrador puede gestionar personal' using errcode = '42501';
  end if;
  if exists (select 1 from public.turnos_caja where empleado_id = p_id)
     or exists (select 1 from public.ventas where empleado_id = p_id or credencial_verificada_por = p_id) then
    update public.empleados set activo = false where id = p_id;
    return 'desactivado';
  end if;
  delete from public.empleados where id = p_id;
  return 'eliminado';
end;
$$;

create or replace function public.abrir_turno(p_empleado_id uuid, p_pin text, p_monto_apertura numeric, p_caja text default 'principal')
returns public.turnos_caja language plpgsql security definer set search_path = '' as $$
declare
  v_emp public.empleados;
  v_turno public.turnos_caja;
  v_monto numeric(12, 2) := round(coalesce(p_monto_apertura, -1), 2);
begin
  if not private.es_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_monto < 0 or v_monto > 100000000 then
    raise exception 'El fondo inicial debe ser un monto válido mayor o igual a 0';
  end if;
  v_emp := private.validar_pin_empleado(p_empleado_id, p_pin);
  if v_emp.id is null then
    raise exception 'PIN incorrecto o empleado inactivo' using hint = 'PIN_INVALIDO';
  end if;
  begin
    insert into public.turnos_caja (cajero_nombre, empleado_id, caja, monto_apertura, estado, abierto_por)
    values (v_emp.nombre || ' (' || v_emp.puesto || ')', v_emp.id, coalesce(nullif(btrim(p_caja), ''), 'principal'),
            v_monto, 'abierto', auth.uid())
    returning * into v_turno;
  exception when unique_violation then
    raise exception 'Ya hay un turno abierto en esta caja. Cerralo con arqueo antes de abrir otro.'
      using hint = 'TURNO_YA_ABIERTO';
  end;
  return v_turno;
end;
$$;

-- Cierre con ARQUEO CIEGO: el sistema calcula lo esperado.
create or replace function public.cerrar_turno_ciego(p_turno_id uuid, p_monto_declarado numeric, p_observaciones text default null)
returns public.turnos_caja language plpgsql security definer set search_path = '' as $$
declare
  v_turno public.turnos_caja;
  v_declarado numeric(12, 2) := round(coalesce(p_monto_declarado, -1), 2);
  v_ef numeric(12, 2);
  v_dig numeric(12, 2);
  v_cant integer;
  v_mov_ef numeric(12, 2);
  v_esperado numeric(12, 2);
begin
  if not private.es_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_declarado < 0 or v_declarado > 100000000 then
    raise exception 'El efectivo declarado debe ser un monto válido mayor o igual a 0';
  end if;
  -- FOR UPDATE espera a las ventas en curso (que toman FOR SHARE).
  select * into v_turno from public.turnos_caja where id = p_turno_id for update;
  if not found then
    raise exception 'Turno inexistente';
  end if;
  if v_turno.estado <> 'abierto' then
    raise exception 'Este turno ya fue cerrado' using hint = 'TURNO_CERRADO';
  end if;
  select coalesce(sum(monto_efectivo), 0), coalesce(sum(monto_digital), 0), count(*)
    into v_ef, v_dig, v_cant
    from public.ventas where turno_id = v_turno.id;
  select coalesce(sum(case when tipo = 'ingreso' then monto else -monto end), 0)
    into v_mov_ef
    from public.movimientos_caja
   where turno_id = v_turno.id and venta_id is null and metodo_pago = 'efectivo';
  v_esperado := v_turno.monto_apertura + v_ef + v_mov_ef;
  update public.turnos_caja
     set estado = 'cerrado', monto_cierre_declarado = v_declarado, monto_cierre_esperado = v_esperado,
         diferencia = v_declarado - v_esperado, total_ventas_efectivo = v_ef, total_ventas_digital = v_dig,
         total_movimientos_efectivo = v_mov_ef, cantidad_ventas = v_cant,
         observaciones = nullif(left(btrim(coalesce(p_observaciones, '')), 500), ''),
         fecha_cierre = now(), cerrado_por = auth.uid()
   where id = v_turno.id
  returning * into v_turno;
  return v_turno;
end;
$$;

-- VENTA ATÓMICA DEL POS
--   · Precio vigente = precio de la variante o, si es NULL, el del producto.
--   · Precios y stock se leen de la base (nunca se confía en el cliente).
--   · Variantes bloqueadas FOR UPDATE en orden estable (sin deadlocks).
--   · Idempotente por p_idempotency_key.
--   · Cualquier error → ROLLBACK completo (stock, venta, detalles, caja y libro).
create or replace function public.procesar_venta_pos(
  p_turno_id uuid, p_items jsonb, p_metodo_pago text, p_monto_efectivo numeric, p_monto_digital numeric,
  p_monto_recibido numeric, p_nro_comprobante text, p_nombre_cliente text, p_telefono_cliente text,
  p_credencial jsonb, p_total_esperado numeric, p_idempotency_key uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_turno public.turnos_caja;
  v_existente uuid;
  v_ids uuid[];
  v_cants integer[];
  v_item record;
  v_total numeric(12, 2) := 0;
  v_exige boolean := false;
  v_ef numeric(12, 2) := 0;
  v_dig numeric(12, 2) := 0;
  v_recibido numeric(12, 2);
  v_vuelto numeric(12, 2) := 0;
  v_comprobante text := nullif(btrim(coalesce(p_nro_comprobante, '')), '');
  v_fuerza text;
  v_legajo text;
  v_verificador public.empleados;
  v_venta_id uuid;
  v_numero text;
begin
  if not private.es_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'Falta la clave de idempotencia de la operación';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select id into v_existente from public.ventas where idempotency_key = p_idempotency_key;
  if found then
    return private.venta_json(v_existente) || jsonb_build_object('reintento', true);
  end if;

  select * into v_turno from public.turnos_caja where id = p_turno_id for share;
  if not found or v_turno.estado <> 'abierto' then
    raise exception 'El turno de caja no está abierto. Abrí un turno para poder cobrar.' using hint = 'TURNO_CERRADO';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'El carrito está vacío o es inválido';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(e ->> 'variante_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or coalesce(e ->> 'cantidad', '') !~ '^[1-9][0-9]{0,3}$'
  ) then
    raise exception 'Cantidades inválidas: deben ser enteros entre 1 y 9999';
  end if;

  select array_agg(s.variante_id order by s.variante_id), array_agg(s.cantidad order by s.variante_id)
    into v_ids, v_cants
    from (select (e ->> 'variante_id')::uuid as variante_id, sum((e ->> 'cantidad')::int)::int as cantidad
            from jsonb_array_elements(p_items) e group by 1) s;

  perform 1 from public.variantes where id = any (v_ids) order by id for update;

  for v_item in
    select r.variante_id, r.cantidad, v.id as vid, v.stock, v.talle, v.color,
           p.nombre, coalesce(v.precio, p.precio) as precio, p.activo, p.exige_credencial
      from unnest(v_ids, v_cants) as r(variante_id, cantidad)
      left join public.variantes v on v.id = r.variante_id
      left join public.productos p on p.id = v.producto_id
  loop
    if v_item.vid is null then
      raise exception 'Uno de los artículos ya no existe. Actualizá el catálogo del POS.' using hint = 'CATALOGO_DESACTUALIZADO';
    end if;
    if not v_item.activo then
      raise exception '"%" fue dado de baja y no puede venderse', v_item.nombre using hint = 'CATALOGO_DESACTUALIZADO';
    end if;
    if v_item.stock < v_item.cantidad then
      raise exception 'Stock insuficiente: % (T. % / %). Disponible: %, solicitado: %',
        v_item.nombre, v_item.talle, v_item.color, v_item.stock, v_item.cantidad using hint = 'STOCK_INSUFICIENTE';
    end if;
    v_total := v_total + round(v_item.precio * v_item.cantidad, 2);
    v_exige := v_exige or v_item.exige_credencial;
  end loop;

  if p_total_esperado is not null and round(p_total_esperado, 2) <> v_total then
    raise exception 'Los precios cambiaron desde que se armó el carrito. Total vigente: %', v_total
      using hint = 'TOTAL_DESACTUALIZADO';
  end if;

  case p_metodo_pago
    when 'efectivo' then
      v_ef := v_total;
      v_recibido := round(coalesce(p_monto_recibido, v_total), 2);
      if v_recibido < v_total then
        raise exception 'El efectivo recibido es menor al total de la venta';
      end if;
      v_vuelto := v_recibido - v_total;
    when 'transferencia_alias', 'tarjeta_postnet' then
      if v_comprobante is null then
        raise exception 'Ingresá el número de comprobante / cupón del pago digital';
      end if;
      v_dig := v_total;
    when 'combinado' then
      v_ef := round(coalesce(p_monto_efectivo, 0), 2);
      v_dig := round(coalesce(p_monto_digital, 0), 2);
      if v_ef <= 0 or v_dig <= 0 then
        raise exception 'En el pago combinado ambas partes deben ser mayores a 0';
      end if;
      if v_ef + v_dig <> v_total then
        raise exception 'La suma de efectivo y digital (%) no coincide con el total (%)', v_ef + v_dig, v_total;
      end if;
    else
      raise exception 'Medio de pago inválido';
  end case;
  if v_comprobante is not null and char_length(v_comprobante) > 64 then
    raise exception 'El número de comprobante es demasiado largo';
  end if;

  if v_exige then
    v_fuerza := nullif(btrim(coalesce(p_credencial ->> 'fuerza_institucion', '')), '');
    v_legajo := nullif(left(btrim(coalesce(p_credencial ->> 'legajo', '')), 40), '');
    if v_fuerza is null or char_length(v_fuerza) > 120 then
      raise exception 'Falta indicar la fuerza / institución del comprador' using hint = 'CREDENCIAL_REQUERIDA';
    end if;
    if coalesce((p_credencial ->> 'declaracion_jurada')::boolean, false) is not true then
      raise exception 'Falta la declaración de verificación de credencial' using hint = 'CREDENCIAL_REQUERIDA';
    end if;
    if v_turno.empleado_id is null then
      raise exception 'El turno no tiene un operador identificado. Reabrí el turno con PIN.' using hint = 'CREDENCIAL_REQUERIDA';
    end if;
    v_verificador := private.validar_pin_empleado(v_turno.empleado_id, p_credencial ->> 'pin_operador');
    if v_verificador.id is null then
      raise exception 'PIN del operador incorrecto: la credencial no quedó acreditada' using hint = 'PIN_INVALIDO';
    end if;
  end if;

  v_numero := 'TT-' || to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYMMDD')
              || '-' || lpad(nextval('public.ventas_ticket_seq')::text, 5, '0');

  insert into public.ventas (
    numero_ticket, cajero_nombre, turno_id, empleado_id, operador_user_id, total, metodo_pago,
    monto_efectivo, monto_digital, monto_recibido, vuelto, nro_comprobante_digital,
    exigio_credencial, fuerza_institucion, credencial_verificada, credencial_verificada_por, legajo_comprador,
    nombre_cliente, telefono_cliente, idempotency_key
  ) values (
    v_numero, v_turno.cajero_nombre, v_turno.id, v_turno.empleado_id, auth.uid(), v_total, p_metodo_pago,
    v_ef, v_dig, v_recibido, v_vuelto, v_comprobante,
    v_exige, v_fuerza, v_exige, v_verificador.id, v_legajo,
    nullif(left(btrim(coalesce(p_nombre_cliente, '')), 80), ''),
    nullif(left(regexp_replace(coalesce(p_telefono_cliente, ''), '[^0-9+ ()-]', '', 'g'), 30), ''),
    p_idempotency_key
  )
  returning id into v_venta_id;

  insert into public.venta_detalles (venta_id, producto_id, variante_id, nombre_producto, talle, color,
                                     precio_unitario, costo_unitario, cantidad, subtotal)
  select v_venta_id, p.id, v.id, p.nombre, v.talle, v.color,
         coalesce(v.precio, p.precio), coalesce(v.costo, p.costo), r.cantidad,
         round(coalesce(v.precio, p.precio) * r.cantidad, 2)
    from unnest(v_ids, v_cants) as r(variante_id, cantidad)
    join public.variantes v on v.id = r.variante_id
    join public.productos p on p.id = v.producto_id;

  -- El trigger de variantes registra la salida en el libro de inventario.
  perform set_config('tt.motivo_stock', 'venta', true);
  perform set_config('tt.venta_id', v_venta_id::text, true);
  update public.variantes v
     set stock = v.stock - r.cantidad
    from unnest(v_ids, v_cants) as r(variante_id, cantidad)
   where v.id = r.variante_id;
  perform set_config('tt.motivo_stock', '', true);
  perform set_config('tt.venta_id', '', true);

  if v_ef > 0 then
    insert into public.movimientos_caja (tipo, monto, concepto, categoria_caja, metodo_pago, cantidad, turno_id, venta_id, created_by)
    values ('ingreso', v_ef, 'Venta ' || v_numero || case when v_dig > 0 then ' (parte efectivo)' else '' end,
            'Ventas Mostrador', 'efectivo', 1, v_turno.id, v_venta_id, auth.uid());
  end if;
  if v_dig > 0 then
    insert into public.movimientos_caja (tipo, monto, concepto, categoria_caja, metodo_pago, cantidad, turno_id, venta_id, created_by)
    values ('ingreso', v_dig, 'Venta ' || v_numero || case when v_ef > 0 then ' (parte digital)' else '' end,
            'Ventas Mostrador', case when p_metodo_pago = 'tarjeta_postnet' then 'tarjeta' else 'transferencia' end,
            1, v_turno.id, v_venta_id, auth.uid());
  end if;

  return private.venta_json(v_venta_id) || jsonb_build_object('reintento', false);
end;
$$;

-- Alta atómica de producto + variantes (precio/costo/sku/código de barras opcionales por variante).
create or replace function public.crear_producto(p_producto jsonb, p_variantes jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not private.es_admin() then
    raise exception 'Solo el administrador puede crear productos' using errcode = '42501';
  end if;
  if p_variantes is null or jsonb_typeof(p_variantes) <> 'array' or jsonb_array_length(p_variantes) = 0 then
    raise exception 'El producto debe tener al menos una variante (talle / color)';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_variantes) e
     where char_length(btrim(coalesce(e ->> 'talle', ''))) = 0
        or coalesce(e ->> 'stock', '') !~ '^[0-9]{1,6}$'
        or coalesce(e ->> 'stock_minimo', '') !~ '^[0-9]{1,6}$'
        or (e ? 'precio' and jsonb_typeof(e -> 'precio') not in ('number', 'null'))
        or (e ? 'costo' and jsonb_typeof(e -> 'costo') not in ('number', 'null'))
  ) then
    raise exception 'Variantes inválidas: talle obligatorio, stock entero ≥ 0 y precios numéricos';
  end if;

  insert into public.productos (nombre, descripcion, precio, costo, porcentaje_ganancia, categoria_id,
                                exige_credencial, imagen_url, etiquetas, activo)
  select btrim(x.nombre), nullif(btrim(coalesce(x.descripcion, '')), ''),
         round(coalesce(x.precio, 0), 2), round(coalesce(x.costo, 0), 2), round(coalesce(x.porcentaje_ganancia, 0), 2),
         x.categoria_id, coalesce(x.exige_credencial, false), nullif(btrim(coalesce(x.imagen_url, '')), ''),
         coalesce(x.etiquetas, '{}'), coalesce(x.activo, true)
    from jsonb_to_record(p_producto) as x(
      nombre text, descripcion text, precio numeric, costo numeric, porcentaje_ganancia numeric,
      categoria_id uuid, exige_credencial boolean, imagen_url text, etiquetas text[], activo boolean)
  returning id into v_id;

  begin
    insert into public.variantes (producto_id, talle, color, stock, stock_minimo, precio, costo, sku, codigo_barras)
    select v_id, btrim(e ->> 'talle'), coalesce(nullif(btrim(e ->> 'color'), ''), 'Único'),
           (e ->> 'stock')::int, (e ->> 'stock_minimo')::int,
           round((e ->> 'precio')::numeric, 2), round((e ->> 'costo')::numeric, 2),
           nullif(btrim(e ->> 'sku'), ''), nullif(btrim(e ->> 'codigo_barras'), '')
      from jsonb_array_elements(p_variantes) e;
  exception when unique_violation then
    raise exception 'Hay variantes repetidas (mismo talle y color) o un SKU / código de barras ya usado';
  end;
  return v_id;
end;
$$;

-- Ajuste atómico de stock (relativo: sin "lost updates" entre terminales).
create or replace function public.ajustar_stock(p_variante_id uuid, p_delta integer, p_nota text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_stock integer;
begin
  if not private.es_admin() then
    raise exception 'Solo el administrador puede ajustar stock' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 100000 then
    raise exception 'Ajuste de stock inválido';
  end if;
  perform set_config('tt.motivo_stock', 'ajuste', true);
  perform set_config('tt.nota_stock', coalesce(p_nota, ''), true);
  update public.variantes set stock = stock + p_delta
   where id = p_variante_id and stock + p_delta >= 0
  returning stock into v_stock;
  perform set_config('tt.motivo_stock', '', true);
  perform set_config('tt.nota_stock', '', true);
  if v_stock is null then
    raise exception 'El stock no puede quedar negativo (o la variante no existe)' using hint = 'STOCK_INSUFICIENTE';
  end if;
  return v_stock;
end;
$$;

-- Ranking de productos vendidos con ganancia: solo administrador.
create or replace function public.ranking_productos(p_desde timestamptz default null)
returns table (producto_id uuid, nombre text, imagen_url text, unidades bigint, ingresos numeric, ganancia numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.es_admin() then
    raise exception 'Solo el administrador puede ver la rentabilidad' using errcode = '42501';
  end if;
  return query
  select d.producto_id, max(d.nombre_producto), max(p.imagen_url), sum(d.cantidad)::bigint, sum(d.subtotal),
         sum((d.precio_unitario - d.costo_unitario) * d.cantidad)
    from public.venta_detalles d
    join public.ventas v on v.id = d.venta_id
    left join public.productos p on p.id = d.producto_id
   where p_desde is null or v.created_at >= p_desde
   group by d.producto_id
   order by 4 desc, 5 desc
   limit 20;
end;
$$;

-- Costos del catálogo para el panel del administrador (el vendedor no los ve).
-- costos_variantes: {variante_id: costo} solo de variantes con costo propio.
create or replace function public.costos_catalogo()
returns table (producto_id uuid, costo numeric, porcentaje_ganancia numeric, costos_variantes jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.es_admin() then
    raise exception 'Solo el administrador puede ver costos' using errcode = '42501';
  end if;
  return query
  select p.id, p.costo, p.porcentaje_ganancia,
         coalesce((select jsonb_object_agg(v.id, v.costo) from public.variantes v
                    where v.producto_id = p.id and v.costo is not null), '{}'::jsonb)
    from public.productos p;
end;
$$;

revoke all on function public.verificar_credencial_empleado(uuid, text) from public, anon;
revoke all on function public.guardar_empleado(uuid, text, text, text, boolean, text) from public, anon;
revoke all on function public.eliminar_empleado(uuid) from public, anon;
revoke all on function public.abrir_turno(uuid, text, numeric, text) from public, anon;
revoke all on function public.cerrar_turno_ciego(uuid, numeric, text) from public, anon;
revoke all on function public.procesar_venta_pos(uuid, jsonb, text, numeric, numeric, numeric, text, text, text, jsonb, numeric, uuid) from public, anon;
revoke all on function public.crear_producto(jsonb, jsonb) from public, anon;
revoke all on function public.ajustar_stock(uuid, integer, text) from public, anon;
revoke all on function public.ranking_productos(timestamptz) from public, anon;
revoke all on function public.costos_catalogo() from public, anon;

grant execute on function public.verificar_credencial_empleado(uuid, text) to authenticated;
grant execute on function public.guardar_empleado(uuid, text, text, text, boolean, text) to authenticated;
grant execute on function public.eliminar_empleado(uuid) to authenticated;
grant execute on function public.abrir_turno(uuid, text, numeric, text) to authenticated;
grant execute on function public.cerrar_turno_ciego(uuid, numeric, text) to authenticated;
grant execute on function public.procesar_venta_pos(uuid, jsonb, text, numeric, numeric, numeric, text, text, text, jsonb, numeric, uuid) to authenticated;
grant execute on function public.crear_producto(jsonb, jsonb) to authenticated;
grant execute on function public.ajustar_stock(uuid, integer, text) to authenticated;
grant execute on function public.ranking_productos(timestamptz) to authenticated;
grant execute on function public.costos_catalogo() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. STORAGE: bucket 'productos' (lectura pública por URL, escritura admin)
-- ────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', true, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists productos_storage_admin_insert on storage.objects;
drop policy if exists productos_storage_admin_update on storage.objects;
drop policy if exists productos_storage_admin_delete on storage.objects;
-- Sin política SELECT: el bucket público sirve archivos por URL y nadie puede listarlo.
create policy productos_storage_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'productos' and (select private.es_admin()));
create policy productos_storage_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'productos' and (select private.es_admin()));
create policy productos_storage_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'productos' and (select private.es_admin()));

notify pgrst, 'reload schema';
