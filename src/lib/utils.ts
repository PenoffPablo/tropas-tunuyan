/**
 * Utilidades puras (sin dependencias): seguras en servidor, cliente y tests.
 */

/**
 * Redondeo monetario a 2 decimales sin errores de coma flotante
 * (0.1 + 0.2 = 0.30000000000000004 → 0.3).
 */
export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Suma monetaria exacta a 2 decimales. */
export function sumCurrency(values: readonly number[]): number {
  return roundCurrency(values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0));
}

/** Multiplica precio × cantidad con redondeo monetario. */
export function multiplyCurrency(precio: number, cantidad: number): number {
  return roundCurrency(precio * cantidad);
}

/**
 * Precio vigente de una variante: el propio o, si es null, el del producto.
 * Es la misma regla que aplica la base en procesar_venta_pos.
 */
export function precioVariante(producto: { precio: number }, variante: { precio: number | null } | null | undefined): number {
  return roundCurrency(Number(variante?.precio ?? producto.precio) || 0);
}

/** Costo vigente de una variante: el propio o, si es null, el del producto. */
export function costoVariante(producto: { costo: number }, variante: { costo: number | null } | null | undefined): number {
  return roundCurrency(Number(variante?.costo ?? producto.costo) || 0);
}

/** Rango de precios de un producto según sus variantes ({min, max} iguales si no varía). */
export function rangoPrecios(
  producto: { precio: number },
  variantes: readonly { precio: number | null }[]
): { min: number; max: number } {
  if (variantes.length === 0) {
    const p = precioVariante(producto, null);
    return { min: p, max: p };
  }
  const precios = variantes.map((v) => precioVariante(producto, v));
  return { min: Math.min(...precios), max: Math.max(...precios) };
}

/** Compara dos montos con tolerancia de medio centavo. */
export function sameCurrency(a: number, b: number): boolean {
  return Math.abs(roundCurrency(a) - roundCurrency(b)) < 0.005;
}

const formateadorPrecio = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Formatea un número como precio en pesos argentinos ($ 45.500 / $ 12,50). */
export function formatPrecio(precio: number): string {
  return formateadorPrecio.format(roundCurrency(Number(precio) || 0));
}

/** Formatea un desvío con signo explícito (+$ 200 / −$ 300 / $ 0). */
export function formatDesvio(valor: number): string {
  const v = roundCurrency(valor);
  if (v === 0) return formatPrecio(0);
  return `${v > 0 ? '+' : '−'}${formatPrecio(Math.abs(v))}`;
}

/**
 * Parsea un monto ingresado por el usuario ("1.500,50", "1500.5", "$ 2000").
 * Devuelve null si no es un número válido, negativo o excede el máximo.
 */
export function parseMonto(input: string | number | null | undefined, max = 100_000_000): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    return Number.isFinite(input) && input >= 0 && input <= max ? roundCurrency(input) : null;
  }
  let s = input.replace(/[$\s]/g, '');
  if (!s) return null;
  // Formato es-AR: punto de miles y coma decimal.
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= max ? roundCurrency(n) : null;
}

/**
 * Parsea una cantidad de unidades discretas: entero, 1..max.
 * Rechaza 0, negativos, NaN, decimales y notación exponencial.
 */
export function parseCantidad(input: string | number, max = 9999): number | null {
  const s = String(input).trim();
  if (!/^\d{1,6}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= 1 && n <= max ? n : null;
}

/** Igual que parseCantidad pero admite 0 (stock inicial, stock mínimo). */
export function parseEnteroNoNegativo(input: string | number, max = 999_999): number | null {
  const s = String(input).trim();
  if (!/^\d{1,7}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= 0 && n <= max ? n : null;
}

/** Precio sugerido a partir de costo + margen %. */
export function calcularPrecioDesdeMargen(costo: number, margenPct: number): number {
  if (!(costo > 0) || !Number.isFinite(margenPct)) return 0;
  return roundCurrency(costo * (1 + margenPct / 100));
}

/** Margen % a partir de costo y precio (2 decimales). */
export function calcularMargen(costo: number, precio: number): number {
  if (!(costo > 0) || !(precio >= 0)) return 0;
  return roundCurrency(((precio - costo) / costo) * 100);
}

/** Suma de stock de un conjunto de variantes. */
export function calcularStockTotal(stocks: readonly number[]): number {
  return stocks.reduce((total, s) => total + (Number.isFinite(s) && s > 0 ? s : 0), 0);
}

export type NivelStock = 'agotado' | 'bajo' | 'ok';

export function nivelStock(stock: number, stockMinimo: number): NivelStock {
  if (stock <= 0) return 'agotado';
  if (stock <= stockMinimo) return 'bajo';
  return 'ok';
}

/** Concatenación condicional de clases CSS. */
export function cn(...clases: Array<string | false | null | undefined>): string {
  return clases.filter(Boolean).join(' ');
}

/** UUID v4 (para claves de idempotencia). */
export function nuevoUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Fecha/hora local argentina compacta. */
export function formatFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

/** Mensaje legible a partir de un error desconocido (Supabase, fetch, etc.). */
export function mensajeError(err: unknown, fallback = 'Ocurrió un error inesperado'): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string' && err.message) {
    return err.message;
  }
  if (typeof err === 'string' && err) return err;
  return fallback;
}

/** Valida que una URL de imagen sea local (/productos/...) o https. */
export function esUrlImagenPermitida(url: string): boolean {
  if (/^\/(productos|logo)[\w./-]*$/.test(url) && !url.includes('..')) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}
