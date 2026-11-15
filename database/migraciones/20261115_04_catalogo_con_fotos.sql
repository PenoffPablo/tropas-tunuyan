-- ============================================================================
-- Reemplaza el catálogo de demo migrado desde v1 (13 productos con íconos)
-- por el catálogo inicial con fotos (database/seed.sql).
-- Los productos de demo siguen disponibles en respaldo_v1.
-- Ejecutar este archivo y a continuación database/seed.sql, en una transacción.
-- ============================================================================
do $$
begin
  if exists (select 1 from public.venta_detalles) then
    raise exception 'Hay ventas registradas: no se reemplaza el catálogo automáticamente.';
  end if;
end $$;

delete from public.movimientos_stock;
delete from public.productos;   -- las variantes caen en cascada
delete from public.categorias;
