import type { CostoCatalogo, ProductoConVariantes, ProductoPanelSinCostos } from '@/types/database';

/**
 * Frontera tipada para resultados de PostgREST: las consultas declaran
 * explícitamente el tipo de fila que esperan (validado contra schema.sql).
 */
export function comoFilas<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

export function comoFila<T>(data: unknown): T | null {
  return data && typeof data === 'object' ? (data as T) : null;
}

/** Ordena variantes por color y talle natural (S, M, L… / 38, 40, 42…). */
function ordenarVariantes<V extends { color: string; talle: string }>(vs: readonly V[]): V[] {
  return [...vs].sort((a, b) => a.color.localeCompare(b.color) || a.talle.localeCompare(b.talle, 'es', { numeric: true }));
}

/**
 * Completa los productos del panel con sus costos (inventario del admin).
 * Sin fila de costos (o para el vendedor) el costo queda en 0 / null.
 */
export function conCostos(productos: readonly ProductoPanelSinCostos[], costos: readonly CostoCatalogo[] = []): ProductoConVariantes[] {
  const porProducto = new Map(costos.map((c) => [c.producto_id, c]));
  return productos.map((p) => {
    const c = porProducto.get(p.id);
    return {
      ...p,
      costo: Number(c?.costo ?? 0),
      porcentaje_ganancia: Number(c?.porcentaje_ganancia ?? 0),
      variantes: ordenarVariantes(p.variantes).map((v) => {
        const propio = c?.costos_variantes?.[v.id];
        return { ...v, costo: propio === undefined || propio === null ? null : Number(propio) };
      }),
    };
  });
}
