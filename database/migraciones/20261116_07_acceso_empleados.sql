-- ============================================================================
-- Acceso propio para cada empleado (usuario + contraseña en Supabase Auth).
--
--   · empleados.user_id → auth.users (único) y empleados.usuario (nombre de
--     login, p. ej. "juan.perez"). La cuenta de Auth la crea el servidor de la
--     app con la service role (auth.admin.createUser); el rol vive en
--     app_metadata (no editable por el usuario).
--   · Un vendedor es staff solo si su cuenta está vinculada a un empleado
--     ACTIVO: dar de baja al empleado le corta el acceso a los datos aunque el
--     bloqueo en Auth demore o falle. Tampoco opera mientras tenga pendiente
--     el cambio de la contraseña inicial (app_metadata.debe_cambiar_password).
--   · El vendedor solo ve su propio registro, sus turnos y sus ventas; solo
--     opera (vende, cierra) sobre su propio turno.
--   · abrir_mi_turno(): el empleado sale de la sesión (auth.uid()), no del
--     cliente. abrir_turno() con PIN queda solo para el administrador.
--   · Un empleado con acceso nunca se borra: se desactiva (historial).
-- Requiere la migración 06.
-- ============================================================================

alter table public.empleados
  add column if not exists user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists usuario text unique
    constraint empleados_usuario_valido check (usuario ~ '^[a-z0-9]+([._-][a-z0-9]+)*$' and char_length(usuario) between 3 and 40);

grant select (usuario, user_id) on public.empleados to authenticated;

-- ── Identidad del usuario actual ─────────────────────────────────────────────
-- Empleado ACTIVO vinculado a la sesión (NULL si no hay). SECURITY DEFINER para
-- que las políticas de empleados puedan usarla sin recursión de RLS.
create or replace function private.empleado_actual_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select e.id from public.empleados e where e.user_id = auth.uid() and e.activo;
$$;
revoke all on function private.empleado_actual_id() from public;
grant execute on function private.empleado_actual_id() to anon, authenticated;

create or replace function private.es_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select case private.rol_actual()
           when 'admin' then true
           -- Con la contraseña inicial pendiente de cambio no opera (ni por API directa).
           when 'vendedor' then private.empleado_actual_id() is not null
                                and coalesce(auth.jwt() -> 'app_metadata' ->> 'debe_cambiar_password', '') <> 'true'
           else false
         end;
$$;
revoke all on function private.es_staff() from public;
grant execute on function private.es_staff() to anon, authenticated;

-- ── Lectura: el vendedor solo ve lo suyo ─────────────────────────────────────
drop policy if exists empleados_lectura_staff on public.empleados;
create policy empleados_lectura_staff on public.empleados
  for select to authenticated
  using ((select private.es_admin()) or ((select private.es_staff()) and user_id = (select auth.uid())));

drop policy if exists turnos_lectura_staff on public.turnos_caja;
create policy turnos_lectura_staff on public.turnos_caja
  for select to authenticated
  using ((select private.es_admin()) or ((select private.es_staff()) and empleado_id = (select private.empleado_actual_id())));

drop policy if exists ventas_lectura_staff on public.ventas;
create policy ventas_lectura_staff on public.ventas
  for select to authenticated
  using ((select private.es_admin()) or ((select private.es_staff()) and empleado_id = (select private.empleado_actual_id())));

drop policy if exists venta_detalles_lectura_staff on public.venta_detalles;
create policy venta_detalles_lectura_staff on public.venta_detalles
  for select to authenticated
  using ((select private.es_admin()) or ((select private.es_staff()) and exists (select 1 from public.ventas v where v.id = venta_id)));

-- ── Personal ─────────────────────────────────────────────────────────────────
-- El vendedor solo valida SU PIN (firma de ventas reguladas); el admin, cualquiera.
create or replace function public.verificar_credencial_empleado(p_empleado_id uuid, p_pin text)
returns table (id uuid, nombre text, puesto text)
language plpgsql security definer set search_path = '' as $$
declare
  v_emp public.empleados;
begin
  if not private.es_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not private.es_admin() and p_empleado_id is distinct from private.empleado_actual_id() then
    raise exception 'Solo podés validar tu propio PIN' using errcode = '42501';
  end if;
  v_emp := private.validar_pin_empleado(p_empleado_id, p_pin);
  if v_emp.id is null then
    return;
  end if;
  return query select v_emp.id, v_emp.nombre, v_emp.puesto;
end;
$$;

-- Vincula una cuenta de Auth (ya creada por el servidor) a un empleado existente.
create or replace function public.vincular_acceso_empleado(p_empleado_id uuid, p_user_id uuid, p_usuario text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_usuario text := lower(btrim(coalesce(p_usuario, '')));
  v_emp public.empleados;
begin
  if not private.es_admin() then
    raise exception 'Solo el administrador puede gestionar personal' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Falta la cuenta de acceso';
  end if;
  if v_usuario !~ '^[a-z0-9]+([._-][a-z0-9]+)*$' or char_length(v_usuario) not between 3 and 40 then
    raise exception 'Usuario inválido: de 3 a 40 caracteres, solo letras, números y . _ -' using hint = 'USUARIO_INVALIDO';
  end if;
  select * into v_emp from public.empleados where id = p_empleado_id for update;
  if not found then
    raise exception 'Empleado inexistente';
  end if;
  if v_emp.user_id is not null then
    raise exception 'Este empleado ya tiene acceso' using hint = 'YA_TIENE_ACCESO';
  end if;
  if not v_emp.activo then
    raise exception 'El empleado está inactivo: reactivalo antes de crearle acceso';
  end if;
  begin
    update public.empleados set user_id = p_user_id, usuario = v_usuario where id = p_empleado_id;
  exception when unique_violation then
    raise exception 'El usuario "%" ya está en uso', v_usuario using hint = 'USUARIO_DUPLICADO';
  end;
end;
$$;

-- Alta de empleado + vínculo con su cuenta, en una sola transacción.
create or replace function public.alta_empleado_con_acceso(
  p_nombre text, p_puesto text, p_telefono text, p_pin text, p_user_id uuid, p_usuario text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  v_id := public.guardar_empleado(null, p_nombre, p_puesto, p_telefono, true, p_pin);
  perform public.vincular_acceso_empleado(v_id, p_user_id, p_usuario);
  return v_id;
end;
$$;

-- Con historial o con cuenta de acceso → se desactiva; si no, se elimina.
create or replace function public.eliminar_empleado(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not private.es_admin() then
    raise exception 'Solo el administrador puede gestionar personal' using errcode = '42501';
  end if;
  if exists (select 1 from public.empleados where id = p_id and user_id is not null)
     or exists (select 1 from public.turnos_caja where empleado_id = p_id)
     or exists (select 1 from public.ventas where empleado_id = p_id or credencial_verificada_por = p_id) then
    update public.empleados set activo = false where id = p_id;
    return 'desactivado';
  end if;
  delete from public.empleados where id = p_id;
  return 'eliminado';
end;
$$;

-- ── Turnos ───────────────────────────────────────────────────────────────────
-- Apertura a nombre de otro empleado (firma con su PIN): solo administrador.
create or replace function public.abrir_turno(p_empleado_id uuid, p_pin text, p_monto_apertura numeric, p_caja text default 'principal')
returns public.turnos_caja language plpgsql security definer set search_path = '' as $$
declare
  v_emp public.empleados;
  v_turno public.turnos_caja;
  v_monto numeric(12, 2) := round(coalesce(p_monto_apertura, -1), 2);
begin
  if not private.es_admin() then
    raise exception 'Solo el administrador puede abrir un turno a nombre de otro empleado' using errcode = '42501';
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

-- Apertura del propio turno: el empleado se toma de la sesión.
create or replace function public.abrir_mi_turno(p_monto_apertura numeric, p_caja text default 'principal')
returns public.turnos_caja language plpgsql security definer set search_path = '' as $$
declare
  v_emp public.empleados;
  v_turno public.turnos_caja;
  v_monto numeric(12, 2) := round(coalesce(p_monto_apertura, -1), 2);
begin
  if not private.es_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into v_emp from public.empleados where user_id = auth.uid() and activo;
  if not found then
    raise exception 'Tu usuario no está vinculado a un empleado activo' using hint = 'SIN_EMPLEADO';
  end if;
  if v_monto < 0 or v_monto > 100000000 then
    raise exception 'El fondo inicial debe ser un monto válido mayor o igual a 0';
  end if;
  begin
    insert into public.turnos_caja (cajero_nombre, empleado_id, caja, monto_apertura, estado, abierto_por)
    values (v_emp.nombre || ' (' || v_emp.puesto || ')', v_emp.id, coalesce(nullif(btrim(p_caja), ''), 'principal'),
            v_monto, 'abierto', auth.uid())
    returning * into v_turno;
  exception when unique_violation then
    raise exception 'Ya hay un turno abierto en esta caja. Debe cerrarlo quien lo abrió (o un administrador).'
      using hint = 'TURNO_YA_ABIERTO';
  end;
  return v_turno;
end;
$$;

-- Cierre con ARQUEO CIEGO: el vendedor solo cierra su propio turno.
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
  if not found or (not private.es_admin() and v_turno.empleado_id is distinct from private.empleado_actual_id()) then
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

-- VENTA ATÓMICA DEL POS (igual que antes + el vendedor solo vende en su turno).
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
  v_es_admin boolean := private.es_admin();
  v_mi_empleado uuid := private.empleado_actual_id();
begin
  if not private.es_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'Falta la clave de idempotencia de la operación';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select id into v_existente from public.ventas
   where idempotency_key = p_idempotency_key and (v_es_admin or empleado_id = v_mi_empleado);
  if found then
    return private.venta_json(v_existente) || jsonb_build_object('reintento', true);
  end if;

  select * into v_turno from public.turnos_caja where id = p_turno_id for share;
  if not found or v_turno.estado <> 'abierto'
     or (not v_es_admin and v_turno.empleado_id is distinct from v_mi_empleado) then
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
      raise exception 'El turno no tiene un operador identificado. Reabrí el turno.' using hint = 'CREDENCIAL_REQUERIDA';
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

revoke all on function public.vincular_acceso_empleado(uuid, uuid, text) from public, anon;
revoke all on function public.alta_empleado_con_acceso(text, text, text, text, uuid, text) from public, anon;
revoke all on function public.abrir_mi_turno(numeric, text) from public, anon;
grant execute on function public.vincular_acceso_empleado(uuid, uuid, text) to authenticated;
grant execute on function public.alta_empleado_con_acceso(text, text, text, text, uuid, text) to authenticated;
grant execute on function public.abrir_mi_turno(numeric, text) to authenticated;

notify pgrst, 'reload schema';
