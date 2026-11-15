-- ============================================================================
-- Seguridad: los costos y márgenes solo los ve el administrador.
--   · Con sesión (authenticated) ya no se pueden leer las columnas de costo de
--     productos, variantes ni venta_detalles; el admin las pide con la RPC
--     costos_catalogo(), que valida el rol.
--   · La respuesta de procesar_venta_pos ya no incluye costo_unitario.
--   · ranking_productos (ganancia) pasa a ser solo admin.
-- Requiere la migración 05 (lectura del panel solo para staff).
-- ============================================================================
revoke select on public.productos, public.variantes, public.venta_detalles from authenticated;
grant select (id, nombre, slug, descripcion, categoria_id, precio, exige_credencial, imagen_url, etiquetas, activo, created_at, updated_at)
  on public.productos to authenticated;
grant select (id, producto_id, sku, codigo_barras, talle, color, precio, stock, stock_minimo, created_at, updated_at)
  on public.variantes to authenticated;
grant select (id, venta_id, producto_id, variante_id, nombre_producto, talle, color, precio_unitario, cantidad, subtotal, created_at)
  on public.venta_detalles to authenticated;

create or replace function private.venta_json(p_venta_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(v) || jsonb_build_object(
           'detalles',
           coalesce((select jsonb_agg(to_jsonb(d) - 'costo_unitario' order by d.nombre_producto, d.talle)
                       from public.venta_detalles d where d.venta_id = v.id), '[]'::jsonb))
    from public.ventas v
   where v.id = p_venta_id;
$$;
revoke all on function private.venta_json(uuid) from public, anon, authenticated;

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

revoke all on function public.ranking_productos(timestamptz) from public, anon;
revoke all on function public.costos_catalogo() from public, anon;
grant execute on function public.ranking_productos(timestamptz) to authenticated;
grant execute on function public.costos_catalogo() to authenticated;

notify pgrst, 'reload schema';
