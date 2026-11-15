-- ============================================================================
-- Migración v1 → v2 · Paso 1: aparta el esquema anterior en `respaldo_v1`.
-- No borra datos: las tablas viejas quedan intactas fuera de la API pública
-- (PostgREST solo expone `public`). Se pueden eliminar cuando ya no hagan falta:
--   drop schema respaldo_v1 cascade;
-- Se aplica junto con los pasos 2 (database/schema.sql) y 3 en una sola transacción.
-- ============================================================================
create schema if not exists respaldo_v1;
revoke all on schema respaldo_v1 from public, anon, authenticated;

drop view if exists public.v_reposicion;

-- Funciones del modelo anterior (sus triggers caen con CASCADE).
drop function if exists public.fn_turno_cerrado_guard() cascade;
drop function if exists public.fn_inmutable() cascade;
drop function if exists public.fn_ventas_guard() cascade;
drop function if exists public.fn_movcaja_guard() cascade;
drop function if exists public.anular_venta(uuid, uuid, text) cascade;
drop function if exists public.fn_audit(uuid, text, text, jsonb) cascade;
drop function if exists public.registrar_venta(uuid, uuid, jsonb, jsonb, jsonb) cascade;
drop function if exists public.calcular_efectivo_esperado(uuid) cascade;
drop function if exists public.abrir_turno(uuid, numeric) cascade;

do $$
declare
  r record;
begin
  -- Tablas (sus secuencias propias se mueven con ellas).
  for r in
    select c.relname from pg_catalog.pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
       and c.relname in ('_migraciones', 'usuarios', 'turnos_caja', 'movimientos_caja', 'productos', 'variantes',
                         'ventas', 'ventas_credencial', 'ventas_items', 'pagos', 'auditoria_logs')
  loop
    execute format('alter table public.%I set schema respaldo_v1', r.relname);
  end loop;
  -- Secuencias sueltas.
  for r in
    select c.relname from pg_catalog.pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'S' and c.relname = 'ventas_numero_seq'
  loop
    execute format('alter sequence public.%I set schema respaldo_v1', r.relname);
  end loop;
  -- Tipos enumerados.
  for r in
    select t.typname from pg_catalog.pg_type t
     where t.typnamespace = 'public'::regnamespace
       and t.typname in ('estado_turno', 'estado_venta', 'rol_usuario', 'tipo_movimiento_caja', 'medio_pago')
  loop
    execute format('alter type public.%I set schema respaldo_v1', r.typname);
  end loop;
  -- pg_trgm vivía en public: se mueve a extensions (recomendación de Supabase).
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_trgm' and extnamespace = 'public'::regnamespace) then
    alter extension pg_trgm set schema extensions;
  end if;
end $$;

revoke all on all tables in schema respaldo_v1 from public, anon, authenticated;
