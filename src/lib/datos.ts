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
