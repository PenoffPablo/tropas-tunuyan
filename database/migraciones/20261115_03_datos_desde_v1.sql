-- ============================================================================
-- Migración v1 → v2 · Paso 3: carga el catálogo desde `respaldo_v1`.
--   · Conserva IDs, nombres, descripciones, imágenes, códigos de barras y stock.
--   · Precio/costo base del producto = el menor de sus variantes; las variantes
--     con otro precio lo guardan como propio (antes todo era por variante).
--   · "fuerza" (v1, por variante) pasa a etiquetas del producto.
--   · Turnos, ventas y usuarios propios de v1 NO se migran (eran datos de prueba
--     y el login ahora es Supabase Auth); quedan consultables en respaldo_v1.
-- ============================================================================
select set_config('tt.nota_stock', 'Migración desde esquema v1', true);

insert into public.categorias (nombre, descripcion, orden)
select c.nombre, c.descripcion, c.orden
  from (values
    ('Uniformes',             'Uniformes reglamentarios, de fajina y de combate', 1),
    ('Insignias y Atributos', 'Jerarquías, escudos y atributos bordados',        2),
    ('Táctico y Correaje',    'Chalecos, pistoleras, cinturones y correaje',     3),
    ('Calzado',               'Borceguíes y calzado táctico',                    4),
    ('Accesorios Civiles',    'Mochilas, linternas, gorras y accesorios',        5)
  ) as c(nombre, descripcion, orden)
 where exists (select 1 from respaldo_v1.productos p where p.categoria = c.nombre);

-- Categorías de v1 que no estén en la lista anterior.
insert into public.categorias (nombre, orden)
select distinct p.categoria, 100
  from respaldo_v1.productos p
 where p.categoria is not null
   and not exists (select 1 from public.categorias c where lower(c.nombre) = lower(p.categoria));

with base as (
  select v.producto_id, min(v.precio_venta) as precio, min(v.precio_costo) as costo,
         coalesce(array_agg(distinct v.fuerza order by v.fuerza) filter (where v.fuerza is not null), '{}') as etiquetas
    from respaldo_v1.variantes v
   group by v.producto_id
)
insert into public.productos (id, nombre, descripcion, categoria_id, precio, costo, porcentaje_ganancia,
                              exige_credencial, imagen_url, etiquetas, activo, created_at)
select p.id, btrim(p.nombre), p.descripcion, c.id,
       coalesce(b.precio, 0), coalesce(b.costo, 0),
       case when coalesce(b.costo, 0) > 0 then round((b.precio - b.costo) / b.costo * 100, 2) else 0 end,
       p.exige_credencial, p.imagen_url, coalesce(b.etiquetas, '{}'), p.activo, p.created_at
  from respaldo_v1.productos p
  left join base b on b.producto_id = p.id
  left join public.categorias c on lower(c.nombre) = lower(p.categoria);

insert into public.variantes (id, producto_id, codigo_barras, talle, color, precio, costo, stock, stock_minimo)
select v.id, v.producto_id, nullif(btrim(v.codigo_barras), ''), btrim(v.talle), coalesce(nullif(btrim(v.color), ''), 'Único'),
       nullif(v.precio_venta, p.precio), nullif(v.precio_costo, p.costo),
       greatest(coalesce(v.stock_actual, 0), 0), greatest(coalesce(v.stock_minimo, 0), 0)
  from respaldo_v1.variantes v
  join public.productos p on p.id = v.producto_id
 where coalesce(v.activo, true);

select set_config('tt.nota_stock', '', true);
