'use client';

/**
 * Ticket post-venta. Se carga con next/dynamic (y jsPDF se precarga en segundo
 * plano al abrir), así el bundle inicial del POS no incluye la librería PDF.
 * Descarga/compartir sin popups: compatible con Safari iOS y Chrome Android.
 * WhatsApp: previa confirmación, envía el comprobante PDF A4 (hoja de compartir
 * en celulares; descarga + chat de WhatsApp Web en computadoras).
 */
import { useEffect, useRef, useState } from 'react';
import type { VentaConDetalles } from '@/types/database';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import { copiarAlPortapapeles } from '@/lib/finanzas';
import {
  NOMBRE_METODO_PAGO,
  enviarComprobanteWhatsApp,
  entregarArchivo,
  formatearTelefonoVisual,
  mensajeComprobanteWhatsApp,
  puedeCompartirArchivo,
  textoTicketWhatsApp,
  urlWhatsApp,
} from '@/lib/ticket';
import { formatFechaHora, formatPrecio } from '@/lib/utils';

type ModuloPdf = typeof import('@/lib/pdfTicket');

type Props = { venta: VentaConDetalles | null; onNuevaVenta: () => void };

export default function ModalTicketVenta({ venta, onNuevaVenta }: Props) {
  return (
    <Modal open={venta !== null} onClose={onNuevaVenta} size="md">
      {venta && <Contenido venta={venta} onNuevaVenta={onNuevaVenta} />}
    </Modal>
  );
}

function Contenido({ venta, onNuevaVenta }: { venta: VentaConDetalles; onNuevaVenta: () => void }) {
  const [telefono, setTelefono] = useState(venta.telefono_cliente ?? '');
  const [estado, setEstado] = useState<string | null>(null);
  const [pdfListo, setPdfListo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [compartirNativo, setCompartirNativo] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const pdfRef = useRef<ModuloPdf | null>(null);
  const logoRef = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCompartirNativo(puedeCompartirArchivo(new File([], 'x.pdf', { type: 'application/pdf' })));
    import('@/lib/pdfTicket')
      .then(async (m) => {
        if (!vivo) return;
        pdfRef.current = m;
        logoRef.current = await m.cargarLogoPdf();
        if (vivo) setPdfListo(true);
      })
      .catch(() => vivo && setEstado('No se pudo cargar el generador de PDF. Revisá la conexión.'));
    return () => {
      vivo = false;
    };
  }, []);

  const texto = textoTicketWhatsApp(venta);
  const mensaje = mensajeComprobanteWhatsApp(venta);
  const telVisual = formatearTelefonoVisual(telefono);
  const nombreArchivo = `Comprobante-${venta.numero_ticket}.pdf`;

  /* Sin awaits antes de compartir/descargar: conserva el gesto del usuario (Safari). */
  const enviarWhatsApp = () => {
    const m = pdfRef.current;
    if (!m) return;
    setConfirmando(false);
    try {
      const pdf = m.generarTicketPdf(venta, logoRef.current);
      void enviarComprobanteWhatsApp({ pdf, nombre: nombreArchivo, telefono, mensaje }).then((r) => {
        if (r === 'cancelado') return setEstado('Envío cancelado.');
        setEnviado(true);
        setEstado(
          r === 'compartido'
            ? 'Comprobante compartido.'
            : `${nombreArchivo} descargado. Arrastralo al chat de WhatsApp y tocá Enviar.`
        );
      });
    } catch {
      setEstado('No se pudo generar el PDF.');
    }
  };

  const descargarPdf = () => {
    const m = pdfRef.current;
    if (!m) return;
    try {
      const blob = m.generarTicketPdf(venta, logoRef.current);
      void entregarArchivo(blob, nombreArchivo).then((r) => {
        if (r === 'compartido') setEstado('Ticket compartido.');
        else if (r === 'descargado') setEstado(`${nombreArchivo} descargado.`);
      });
    } catch {
      setEstado('No se pudo generar el PDF.');
    }
  };

  const copiar = async () => {
    setEstado((await copiarAlPortapapeles(texto)) ? 'Texto del ticket copiado.' : 'No se pudo copiar.');
  };

  return (
    <>
      <ModalHeader
        tono="exito"
        eyebrow={<span className="text-emerald-600 dark:text-emerald-400">Venta registrada</span>}
        titulo={venta.numero_ticket}
        descripcion={venta.reintento ? 'Esta venta ya estaba registrada: no se duplicó.' : 'Stock descontado y caja actualizada.'}
        onClose={onNuevaVenta}
      />

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100/60 px-4 py-5 dark:bg-black/30 sm:px-6">
        {/* Ticket térmico (lo único que se imprime) */}
        <div className="print-area mx-auto max-w-[320px] rounded-lg bg-white px-5 py-6 font-mono text-[11px] leading-relaxed text-zinc-900 shadow-soft-lg">
          <div className="border-b border-dashed border-zinc-300 pb-3 text-center">
            <div className="text-sm font-bold tracking-wider">TROPAS TUNUYÁN</div>
            <div className="text-[10px] text-zinc-500">Indumentaria Militar & Equipamiento Táctico</div>
            <div className="text-[10px] text-zinc-500">Tunuyán, Mendoza</div>
          </div>
          <div className="space-y-0.5 border-b border-dashed border-zinc-300 py-2.5">
            <Fila a="Comprobante" b={venta.numero_ticket} fuerte />
            <Fila a="Fecha" b={formatFechaHora(venta.created_at)} />
            <Fila a="Cajero" b={venta.cajero_nombre} />
            {venta.nombre_cliente && <Fila a="Cliente" b={venta.nombre_cliente} />}
          </div>
          <div className="space-y-2 border-b border-dashed border-zinc-300 py-2.5">
            {venta.detalles.map((d) => (
              <div key={d.id}>
                <Fila a={`${d.cantidad}× ${d.nombre_producto}`} b={formatPrecio(d.subtotal)} fuerte />
                <div className="flex justify-between pl-3 text-[10px] text-zinc-500">
                  <span>T. {d.talle} / {d.color}</span>
                  <span className="tabular-nums">c/u {formatPrecio(d.precio_unitario)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-0.5 border-b border-dashed border-zinc-300 py-2.5">
            <div className="flex justify-between text-sm font-bold">
              <span>TOTAL</span>
              <span className="tabular-nums">{formatPrecio(venta.total)}</span>
            </div>
            <Fila a="Pago" b={NOMBRE_METODO_PAGO[venta.metodo_pago]} />
            {venta.metodo_pago === 'combinado' && (
              <>
                <Fila a="  Efectivo" b={formatPrecio(venta.monto_efectivo)} />
                <Fila a="  Digital" b={formatPrecio(venta.monto_digital)} />
              </>
            )}
            {venta.metodo_pago === 'efectivo' && venta.monto_recibido !== null && <Fila a="Recibido" b={formatPrecio(venta.monto_recibido)} />}
            {venta.vuelto > 0 && <Fila a="Vuelto" b={formatPrecio(venta.vuelto)} fuerte />}
            {venta.nro_comprobante_digital && <Fila a="N.º operación" b={venta.nro_comprobante_digital} />}
          </div>
          {venta.exigio_credencial && (
            <div className="border-b border-dashed border-zinc-300 py-2.5 text-[10px]">
              <div className="font-bold">CONTROL DE CREDENCIAL</div>
              <div>Fuerza: {venta.fuerza_institucion}</div>
              {venta.legajo_comprador && <div>Ref.: {venta.legajo_comprador}</div>}
              <div>✓ Credencial oficial constatada</div>
            </div>
          )}
          <div className="pt-3 text-center text-[10px] text-zinc-500">
            <div className="font-bold text-zinc-800">¡GRACIAS POR SU ELECCIÓN!</div>
            Comprobante no fiscal de control interno.
          </div>
        </div>

        {/* WhatsApp */}
        <div className="surface mx-auto mt-4 max-w-[420px] space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="label mb-0 flex items-center gap-1.5"><Icon name="whatsapp" size={14} /> Enviar al cliente</span>
            {telVisual && <span className="num text-[11px] text-emerald-700 dark:text-emerald-400">{telVisual}</span>}
          </div>
          <div className="flex gap-2">
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              inputMode="tel"
              placeholder="2622 662044"
              className="input num"
              maxLength={30}
            />
            <button type="button" onClick={copiar} className="btn-secondary btn-icon h-10 w-10 shrink-0" aria-label="Copiar texto del ticket">
              <Icon name="copy" size={15} />
            </button>
          </div>
          <button type="button" onClick={() => setConfirmando(true)} disabled={!pdfListo} className="btn-success w-full">
            {pdfListo ? <Icon name="whatsapp" size={16} /> : <Spinner />} Enviar comprobante PDF por WhatsApp
          </button>
          {estado && <p className="text-center text-[11px] font-medium text-slate-500" role="status">{estado}</p>}
          {enviado && !compartirNativo && (
            <a href={urlWhatsApp(telefono, mensaje)} target="_blank" rel="noopener noreferrer" className="block text-center text-[11px] font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
              ¿No se abrió WhatsApp? Abrir el chat de nuevo
            </a>
          )}
        </div>
      </div>

      <ModalFooter>
        <div className="grid flex-1 grid-cols-2 gap-2 sm:flex sm:flex-none">
          <button type="button" onClick={() => window.print()} className="btn-secondary">
            <Icon name="printer" size={15} /> Imprimir
          </button>
          <button type="button" onClick={descargarPdf} disabled={!pdfListo} className="btn-secondary">
            {pdfListo ? <Icon name="download" size={15} /> : <Spinner />} PDF
          </button>
        </div>
        <button type="button" onClick={onNuevaVenta} className="btn-primary" data-autofocus>
          <Icon name="plus" size={16} /> Nueva venta
        </button>
      </ModalFooter>

      <Modal open={confirmando} onClose={() => setConfirmando(false)} size="sm">
        <ModalHeader
          eyebrow={<span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><Icon name="whatsapp" size={13} /> WhatsApp</span>}
          titulo="¿Enviar el comprobante?"
          onClose={() => setConfirmando(false)}
        />
        <ModalBody className="space-y-4">
          <dl className="surface divide-y divide-slate-200/70 text-sm dark:divide-white/[0.06]">
            <div className="flex items-center justify-between gap-3 p-3">
              <dt className="text-xs text-slate-500">Para</dt>
              <dd className="num text-right font-semibold text-slate-900 dark:text-white">
                {venta.nombre_cliente ? `${venta.nombre_cliente} · ` : ''}
                {telVisual || <span className="font-normal text-slate-500">elegís el contacto en WhatsApp</span>}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 p-3">
              <dt className="text-xs text-slate-500">Archivo</dt>
              <dd className="flex min-w-0 items-center gap-1.5 font-medium text-slate-900 dark:text-white">
                <Icon name="file" size={14} className="shrink-0 text-red-500" />
                <span className="truncate">{nombreArchivo}</span>
                <span className="shrink-0 text-[11px] text-slate-500">A4</span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 p-3">
              <dt className="text-xs text-slate-500">Total</dt>
              <dd className="num font-semibold text-slate-900 dark:text-white">{formatPrecio(venta.total)}</dd>
            </div>
          </dl>
          <p className="flex items-start gap-2 rounded-xl bg-slate-100 p-3 text-xs leading-relaxed text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">
            <Icon name="info" size={14} className="mt-px shrink-0" />
            {compartirNativo
              ? 'Se abrirá el menú Compartir con el PDF adjunto: elegí WhatsApp y el chat del cliente.'
              : 'Se descargará el PDF y se abrirá el chat del cliente en WhatsApp con el mensaje listo. Arrastrá el archivo descargado al chat y enviá.'}
          </p>
          {telefono && !telVisual && (
            <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
              <Icon name="alert" size={14} className="mt-px shrink-0" />
              El teléfono no parece válido: vas a tener que elegir el contacto en WhatsApp.
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setConfirmando(false)} className="btn-secondary">Cancelar</button>
          <button type="button" onClick={enviarWhatsApp} className="btn-success" data-autofocus>
            <Icon name="whatsapp" size={16} /> Confirmar y enviar
          </button>
        </ModalFooter>
      </Modal>
    </>
  );
}

function Fila({ a, b, fuerte }: { a: string; b: string; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${fuerte ? 'font-semibold' : ''}`}>
      <span className="min-w-0 truncate">{a}</span>
      <span className="shrink-0 tabular-nums">{b}</span>
    </div>
  );
}
