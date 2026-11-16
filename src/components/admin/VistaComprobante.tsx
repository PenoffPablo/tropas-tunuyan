/**
 * Vista previa en pantalla del comprobante A4 (réplica del PDF de pdfTicket.ts).
 * Comparte los datos con el PDF vía datosComprobante(), así ambos coinciden.
 * Colores fijos (no dependen del tema): es una "hoja" impresa.
 */
import type { VentaConDetalles } from '@/types/database';
import { TIENDA } from '@/lib/config';
import { GRACIAS_COMPROBANTE, LEYENDA_COMPROBANTE, NOMBRE_METODO_PAGO, datosComprobante } from '@/lib/ticket';
import { formatFechaHora, formatPrecio } from '@/lib/utils';

export default function VistaComprobante({ venta }: { venta: VentaConDetalles }) {
  const d = datosComprobante(venta, TIENDA.whatsapp, TIENDA.urlSitio);

  return (
    <div className="mx-auto w-full max-w-[460px] overflow-hidden rounded-md bg-white text-[#27272a] shadow-soft-lg" aria-label="Vista previa del comprobante">
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-3 border-b-[3px] border-[#6b8e23] bg-[#11131a] px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/logo.png" alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold tracking-wide text-white">TROPAS TUNUYÁN</div>
            <div className="truncate text-[8.5px] text-[#b1c27a]">Indumentaria Militar &amp; Equipamiento Táctico</div>
            <div className="truncate text-[8px] text-[#a1a1aa]">{TIENDA.ubicacion}</div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[7px] font-bold tracking-[0.12em] text-[#b1c27a]">COMPROBANTE DE COMPRA</div>
          <div className="text-[13px] font-bold text-white">{venta.numero_ticket}</div>
          <div className="text-[8px] text-[#a1a1aa]">{formatFechaHora(venta.created_at)}</div>
        </div>
      </div>

      <div className="space-y-3.5 px-4 pb-3 pt-4">
        {/* Tarjetas */}
        <div className={d.cliente.length ? 'grid grid-cols-2 gap-2' : ''}>
          {d.cliente.length > 0 && <Tarjeta titulo="CLIENTE" filas={d.cliente} />}
          <Tarjeta titulo="OPERACIÓN" filas={d.operacion} />
        </div>

        {/* Artículos */}
        <table className="w-full table-fixed border-collapse text-[9px]">
          <thead>
            <tr className="bg-[#3f5418] text-[7px] font-bold tracking-[0.06em] text-white">
              <th className="w-[38%] rounded-l px-1.5 py-1.5 text-left">ARTÍCULO</th>
              <th className="w-[22%] px-1 py-1.5 text-left">TALLE / COLOR</th>
              <th className="w-[10%] px-1 py-1.5 text-center">CANT.</th>
              <th className="w-[15%] px-1 py-1.5 text-right">P. UNIT.</th>
              <th className="w-[15%] rounded-r px-1.5 py-1.5 text-right">SUBTOTAL</th>
            </tr>
          </thead>
          <tbody>
            {venta.detalles.map((det, i) => (
              <tr key={det.id} className={`border-b border-[#e4e4e7] align-top ${i % 2 ? 'bg-[#fafaf7]' : ''}`}>
                <td className="break-words px-1.5 py-1.5 font-semibold">{det.nombre_producto}</td>
                <td className="break-words px-1 py-1.5 text-[8.5px] text-[#71717a]">{det.talle} / {det.color}</td>
                <td className="px-1 py-1.5 text-center tabular-nums">{det.cantidad}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{formatPrecio(det.precio_unitario)}</td>
                <td className="px-1.5 py-1.5 text-right font-semibold tabular-nums">{formatPrecio(det.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pago y totales */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-[9px]">
            <div className="text-[7px] font-bold tracking-[0.1em] text-[#3f5418]">FORMA DE PAGO</div>
            <div className="mt-0.5 text-[10px] font-bold">{NOMBRE_METODO_PAGO[venta.metodo_pago]}</div>
            {d.pago.map(([a, b]) => (
              <div key={a} className="flex w-28 justify-between text-[#71717a]">
                <span>{a}</span>
                <span className="tabular-nums text-[#27272a]">{b}</span>
              </div>
            ))}
          </div>
          <div className="w-[45%] shrink-0">
            <div className="flex justify-between px-1 text-[8.5px] text-[#71717a]">
              <span>Artículos ({d.unidades} {d.unidades === 1 ? 'unidad' : 'unidades'})</span>
              <span className="tabular-nums text-[#27272a]">{formatPrecio(venta.total)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between rounded-md bg-[#6b8e23] px-2.5 py-2 text-white">
              <span className="text-[8px] font-bold tracking-[0.12em]">TOTAL</span>
              <span className="text-[13px] font-bold tabular-nums">{formatPrecio(venta.total)}</span>
            </div>
          </div>
        </div>

        {venta.exigio_credencial && (
          <div className="rounded-md border border-[#6b8e23] bg-[#f6f7f2] px-3 py-2 text-[9px]">
            <div className="text-[7px] font-bold tracking-[0.1em] text-[#3f5418]">CONTROL REGLAMENTARIO DE CREDENCIAL</div>
            <div className="mt-0.5">Fuerza / institución: {venta.fuerza_institucion ?? '-'}</div>
            {venta.legajo_comprador && <div>Referencia / legajo: {venta.legajo_comprador}</div>}
            <div className="text-right text-[8px] text-[#71717a]">Credencial oficial constatada en mostrador por el operador.</div>
          </div>
        )}

        {/* Pie */}
        <div className="pt-2">
          <div className="text-center text-[11px] font-bold text-[#3f5418]">{GRACIAS_COMPROBANTE}</div>
          <div className="mt-2 border-t border-[#e4e4e7] pt-1.5 text-[7.5px] leading-relaxed text-[#71717a]">
            <div className="flex justify-between gap-2">
              <span>{LEYENDA_COMPROBANTE}</span>
              <span className="shrink-0">{venta.numero_ticket}</span>
            </div>
            {d.contacto.length > 0 && <div>{d.contacto.join('  ·  ')}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Tarjeta({ titulo, filas }: { titulo: string; filas: [string, string][] }) {
  return (
    <div className="min-w-0 rounded-md bg-[#f6f7f2] px-3 py-2">
      <div className="mb-1 text-[7px] font-bold tracking-[0.1em] text-[#3f5418]">{titulo}</div>
      {filas.map(([a, b]) => (
        <div key={a} className="flex justify-between gap-2 text-[9px] leading-relaxed">
          <span className="shrink-0 text-[#71717a]">{a}</span>
          <span className="truncate text-right font-semibold">{b}</span>
        </div>
      ))}
    </div>
  );
}
