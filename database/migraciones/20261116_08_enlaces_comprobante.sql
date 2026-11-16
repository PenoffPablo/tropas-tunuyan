-- ============================================================================
-- Enlaces para compartir el comprobante por WhatsApp.
--
--   · El POS pide un enlace corto e imposible de adivinar para una venta
--     (crear_enlace_comprobante) y lo manda en el mensaje de WhatsApp.
--   · La ruta pública /c/<token> lee la venta con comprobante_por_token (anon)
--     y genera el PDF en el momento: no se guardan archivos.
--   · El enlace vence a los 90 días. Nunca expone costos (usa venta_json).
--   · La tabla no es accesible directamente: solo a través de las dos RPC.
-- Requiere la migración 07.
-- ============================================================================

create table if not exists public.enlaces_comprobante (
  token      text primary key constraint enlaces_comprobante_token_valido check (token ~ '^[A-Za-z0-9_-]{22}$'),
  venta_id   uuid not null references public.ventas(id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  expira_at  timestamptz not null default now() + interval '90 days'
);
create index if not exists idx_enlaces_comprobante_venta on public.enlaces_comprobante (venta_id, expira_at desc);

alter table public.enlaces_comprobante enable row level security;
revoke all on public.enlaces_comprobante from anon, authenticated;

-- Devuelve un enlace vigente de la venta (reutiliza el existente si le quedan
-- más de 30 días). El vendedor solo puede pedirlo para sus propias ventas.
create or replace function public.crear_enlace_comprobante(p_venta_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_empleado uuid;
  v_token text;
begin
  if not private.es_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select empleado_id into v_empleado from public.ventas where id = p_venta_id;
  if not found or (not private.es_admin() and v_empleado is distinct from private.empleado_actual_id()) then
    raise exception 'Venta inexistente';
  end if;
  select token into v_token
    from public.enlaces_comprobante
   where venta_id = p_venta_id and expira_at > now() + interval '30 days'
   order by expira_at desc
   limit 1;
  if v_token is not null then
    return v_token;
  end if;
  -- 128 bits aleatorios en base64url (22 caracteres).
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '=');
  insert into public.enlaces_comprobante (token, venta_id) values (v_token, p_venta_id);
  return v_token;
end;
$$;

-- Lectura pública por token (la usa la ruta /c/<token>). NULL si no existe o venció.
create or replace function public.comprobante_por_token(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_venta uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22}$' then
    return null;
  end if;
  select venta_id into v_venta
    from public.enlaces_comprobante
   where token = p_token and expira_at > now();
  if v_venta is null then
    return null;
  end if;
  return private.venta_json(v_venta);
end;
$$;

revoke all on function public.crear_enlace_comprobante(uuid) from public, anon;
revoke all on function public.comprobante_por_token(text) from public;
grant execute on function public.crear_enlace_comprobante(uuid) to authenticated;
grant execute on function public.comprobante_por_token(text) to anon, authenticated;

notify pgrst, 'reload schema';
