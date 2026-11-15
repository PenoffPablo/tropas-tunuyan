-- ============================================================================
-- Seguridad: un usuario autenticado SIN rol (p. ej. alguien que se registró solo
-- con la clave pública) podía leer costos y márgenes de productos y variantes.
-- Ahora el panel (authenticated) solo lee si es staff; el catálogo público sigue
-- consultándose como anon con permisos por columna (sin costos).
-- ============================================================================
drop policy if exists productos_lectura_panel on public.productos;
create policy productos_lectura_panel on public.productos
  for select to authenticated using ((select private.es_staff()));

drop policy if exists variantes_lectura_panel on public.variantes;
create policy variantes_lectura_panel on public.variantes
  for select to authenticated using ((select private.es_staff()));
