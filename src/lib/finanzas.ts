/**
 * Operaciones de caja: todas pasan por RPC transaccionales en PostgreSQL.
 * El cliente nunca escribe stock, ventas ni turnos directamente.
 */
import type {
  CredencialVenta,
  MetodoCaja,
  MetodoPagoTipo,
  MovimientoCaja,
  TipoMovimiento,
  TurnoCaja,
  VentaConDetalles,
  VentaItemCarrito,
} from '@/types/database';
import { getSupabaseBrowser } from './supabase';
import { ErrorOperacion, errorDesdePostgrest } from './errores';
import { comoFila } from './datos';
import { formatDesvio, formatFechaHora, formatPrecio, roundCurrency } from './utils';

export type DatosCobro = {
  metodoPago: MetodoPagoTipo;
  montoEfectivo: number;
  montoDigital: number;
  montoRecibido: number | null;
  nroComprobante: string;
  nombreCliente: string;
  telefonoCliente: string;
};

export async function procesarVentaPos(params: {
  turnoId: string;
  items: VentaItemCarrito[];
  cobro: DatosCobro;
  credencial: CredencialVenta | null;
  totalEsperado: number;
  idempotencyKey: string;
}): Promise<VentaConDetalles> {
  const { turnoId, items, cobro, credencial, totalEsperado, idempotencyKey } = params;
  const { data, error } = await getSupabaseBrowser().rpc('procesar_venta_pos', {
    p_turno_id: turnoId,
    p_items: items.map((i) => ({ variante_id: i.variante_id, cantidad: i.cantidad })),
    p_metodo_pago: cobro.metodoPago,
    p_monto_efectivo: cobro.metodoPago === 'combinado' ? roundCurrency(cobro.montoEfectivo) : null,
    p_monto_digital: cobro.metodoPago === 'combinado' ? roundCurrency(cobro.montoDigital) : null,
    p_monto_recibido: cobro.metodoPago === 'efectivo' ? cobro.montoRecibido : null,
    p_nro_comprobante: cobro.nroComprobante.trim() || null,
    p_nombre_cliente: cobro.nombreCliente.trim() || null,
    p_telefono_cliente: cobro.telefonoCliente.trim() || null,
    p_credencial: credencial,
    p_total_esperado: roundCurrency(totalEsperado),
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw errorDesdePostgrest(error);
  const venta = comoFila<VentaConDetalles>(data);
  if (!venta) throw new ErrorOperacion('La base no devolvió la venta registrada.', null);
  return venta;
}

export async function abrirTurno(empleadoId: string, pin: string, montoApertura: number): Promise<TurnoCaja> {
  const { data, error } = await getSupabaseBrowser().rpc('abrir_turno', {
    p_empleado_id: empleadoId,
    p_pin: pin,
    p_monto_apertura: roundCurrency(montoApertura),
  });
  if (error) throw errorDesdePostgrest(error);
  return data;
}

export async function cerrarTurnoCiego(turnoId: string, montoDeclarado: number, observaciones: string): Promise<TurnoCaja> {
  const { data, error } = await getSupabaseBrowser().rpc('cerrar_turno_ciego', {
    p_turno_id: turnoId,
    p_monto_declarado: roundCurrency(montoDeclarado),
    p_observaciones: observaciones.trim() || null,
  });
  if (error) throw errorDesdePostgrest(error);
  return data;
}

export async function registrarMovimiento(mov: {
  tipo: TipoMovimiento;
  monto: number;
  concepto: string;
  categoria_caja: string;
  metodo_pago: MetodoCaja;
  producto_id: string | null;
  cantidad: number;
  turno_id: string | null;
}): Promise<MovimientoCaja> {
  const { data, error } = await getSupabaseBrowser()
    .from('movimientos_caja')
    .insert({ ...mov, monto: roundCurrency(mov.monto), concepto: mov.concepto.trim() })
    .select('*')
    .single();
  if (error) throw errorDesdePostgrest(error);
  const fila = comoFila<MovimientoCaja>(data);
  if (!fila) throw new ErrorOperacion('No se pudo registrar el movimiento.', null);
  return fila;
}

export async function eliminarMovimiento(id: string): Promise<void> {
  const { error, count } = await getSupabaseBrowser()
    .from('movimientos_caja')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) throw errorDesdePostgrest(error);
  if (count === 0) throw new ErrorOperacion('Los movimientos generados por ventas no se pueden anular manualmente.', null);
}

export const NOMBRE_METODO_CAJA: Record<MetodoCaja, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
};

export function etiquetaDesvio(diferencia: number): { texto: string; tono: 'exacto' | 'sobrante' | 'faltante' } {
  const d = roundCurrency(diferencia);
  if (d === 0) return { texto: 'Caja exacta', tono: 'exacto' };
  if (d > 0) return { texto: `Sobrante ${formatDesvio(d)}`, tono: 'sobrante' };
  return { texto: `Faltante ${formatDesvio(d)}`, tono: 'faltante' };
}

/** Desvío porcentual sobre lo esperado (KPI ≤ 0,5 %). */
export function desvioPorcentual(t: Pick<TurnoCaja, 'diferencia' | 'monto_cierre_esperado'>): number {
  const esperado = t.monto_cierre_esperado ?? 0;
  if (!esperado) return t.diferencia ? 100 : 0;
  return roundCurrency((Math.abs(t.diferencia ?? 0) / esperado) * 100);
}

/** Acta de cierre de turno formateada para WhatsApp. */
export function textoActaTurno(t: TurnoCaja): string {
  const dif = t.diferencia ?? 0;
  const estado = dif === 0 ? '✅ CAJA EXACTA' : dif > 0 ? `🟢 SOBRANTE ${formatDesvio(dif)}` : `🔴 FALTANTE ${formatDesvio(dif)}`;
  const lineas = [
    '*TROPAS TUNUYÁN — ACTA DE ARQUEO DE TURNO*',
    `*Cierre:* ${formatFechaHora(t.fecha_cierre)}`,
    `*Cajero:* ${t.cajero_nombre}`,
    '━━━━━━━━━━━━━━━━━━━━',
    `Fondo inicial: ${formatPrecio(t.monto_apertura)}`,
    `Ventas efectivo: +${formatPrecio(t.total_ventas_efectivo)}`,
    ...(t.total_movimientos_efectivo !== 0 ? [`Mov. manuales efectivo: ${formatDesvio(t.total_movimientos_efectivo)}`] : []),
    `Esperado en cajón: ${formatPrecio(t.monto_cierre_esperado ?? 0)}`,
    `Declarado (ciego): ${formatPrecio(t.monto_cierre_declarado ?? 0)}`,
    `*Resultado:* ${estado}`,
    '━━━━━━━━━━━━━━━━━━━━',
    `Cobros digitales: ${formatPrecio(t.total_ventas_digital)}`,
    `*Recaudación total:* ${formatPrecio(roundCurrency(t.total_ventas_efectivo + t.total_ventas_digital))} (${t.cantidad_ventas} ventas)`,
  ];
  if (t.observaciones) lineas.push(`📝 ${t.observaciones}`);
  return lineas.join('\n');
}

/** Copia al portapapeles con fallback para navegadores sin Clipboard API. */
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* sigue al fallback */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
