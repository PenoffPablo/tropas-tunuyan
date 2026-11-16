'use client';

/**
 * Ticket post-venta. Se carga con next/dynamic (y jsPDF se precarga en segundo
 * plano al abrir), así el bundle inicial del POS no incluye la librería PDF.
 * WhatsApp: al abrir se crea un enlace privado al comprobante (/c/<token>, el
 * PDF A4 se genera en el servidor). Tras confirmar, se abre el chat del
 * cliente con el mensaje y el enlace listos: solo resta tocar Enviar.
 */
import { useEffect, useRef, useState } from 'react';
import type { VentaConDetalles } from '@/types/database';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import VistaComprobante from '@/components/admin/VistaComprobante';
import { copiarAlPortapapeles } from '@/lib/finanzas';
import { getSupabaseBrowser } from '@/lib/supabase';
import { TIENDA } from '@/lib/config';
import {
  NOMBRE_METODO_PAGO,
  abrirEnPestana,
  entregarArchivo,
  GRACIAS_COMPROBANTE,
  formatearTelefonoVisual,
  limpiarTelefono,
  mensajeComprobanteWhatsApp,
  textoTicketWhatsApp,
  urlComprobante,
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
  const [enlace, setEnlace] = useState<string | null>(null);
  const [errorEnlace, setErrorEnlace] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const pdfRef = useRef<ModuloPdf | null>(null);

  useEffect(() => {
    let vivo = true;
    import('@/lib/pdfTicket')
      .then((m) => {
        if (!vivo) return;
        pdfRef.current = m;
        setPdfListo(true);
      })
      .catch(() => vivo && setEstado('No se pudo cargar el generador de PDF. Revisá la conexión.'));
    // Enlace al comprobante: se pide ya, así al confirmar se abre WhatsApp sin esperas
    // (una espera haría que el navegador bloquee la ventana nueva).
    getSupabaseBrowser()
      .rpc('crear_enlace_comprobante', { p_venta_id: venta.id })
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error || !data) return setErrorEnlace(true);
        setEnlace(urlComprobante(data, TIENDA.urlSitio || window.location.origin));
      });
    return () => {
      vivo = false;
    };
  }, [venta.id]);

  const texto = textoTicketWhatsApp(venta);
  const mensaje = enlace ? mensajeComprobanteWhatsApp(venta, enlace) : '';
  const telVisual = formatearTelefonoVisual(telefono);
  const nombreArchivo = `Comprobante-${venta.numero_ticket}.pdf`;

  /* Sincrónico desde el clic: el navegador no bloquea la pestaña de WhatsApp. */
  const enviarWhatsApp = () => {
    if (!enlace) return;
    setConfirmando(false);
    abrirEnPestana(urlWhatsApp(telefono, mensaje));
    setEnviado(true);
    setEstado(telVisual ? `Chat con ${telVisual} abierto: tocá Enviar en WhatsApp.` : 'WhatsApp abierto: elegí el contacto y tocá Enviar.');
  };

  const descargarPdf = () => {
    const m = pdfRef.current;
    if (!m) return;
    try {
      const blob = new Blob([m.generarTicketPdf(venta)], { type: 'application/pdf' });
      void entregarArchivo(blob, nombreArchivo).then((r) => {
        if (r === 'compartido') setEstado('Comprobante compartido.');
        else if (r === 'descargado') setEstado(`${nombreArchivo} descargado.`);
      });
    } catch {
      setEstado('No se pudo generar el PDF.');
    }
  };

  const copiar = async () => {
    const ok = await copiarAlPortapapeles(mensaje || texto);
    setEstado(ok ? (mensaje ? 'Mensaje con el enlace copiado.' : 'Texto del ticket copiado.') : 'No se pudo copiar.');
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
        {/* Vista previa: la misma hoja A4 que el PDF / enlace de WhatsApp */}
        <VistaComprobante venta={venta} />

        {/* Ticket térmico 80 mm: no se ve en pantalla, es lo único que sale con "Imprimir" */}
        <div className="print-area hidden max-w-[320px] print:block rounded-lg bg-white px-5 py-6 font-mono text-[11px] leading-relaxed text-zinc-900 shadow-soft-lg">
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
            <div className="font-bold uppercase text-zinc-800">{GRACIAS_COMPROBANTE}</div>
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
              onChange={(e) => setTelefono(limpiarTelefono(e.target.value))}
              inputMode="tel"
              placeholder="2622 662044"
              className="input num"
              maxLength={20}
            />
            <button type="button" onClick={copiar} className="btn-secondary btn-icon h-10 w-10 shrink-0" aria-label="Copiar mensaje con el enlace">
              <Icon name="copy" size={15} />
            </button>
          </div>
          <button type="button" onClick={() => setConfirmando(true)} disabled={!enlace} className="btn-success w-full">
            {enlace || errorEnlace ? <Icon name="whatsapp" size={16} /> : <Spinner />} Enviar comprobante por WhatsApp
          </button>
          {errorEnlace && (
            <p className="flex items-start gap-2 text-[11px] text-red-600 dark:text-red-400">
              <Icon name="alert" size={13} className="mt-px shrink-0" />
              No se pudo crear el enlace del comprobante. Podés descargar el PDF y enviarlo a mano.
            </p>
          )}
          {estado && <p className="text-center text-[11px] font-medium text-slate-500" role="status">{estado}</p>}
          {enviado && enlace && (
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
              <dt className="text-xs text-slate-500">Comprobante</dt>
              <dd className="flex min-w-0 items-center gap-1.5 font-medium text-slate-900 dark:text-white">
                <Icon name="file" size={14} className="shrink-0 text-red-500" />
                <span className="truncate">PDF A4 · enlace por 90 días</span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 p-3">
              <dt className="text-xs text-slate-500">Total</dt>
              <dd className="num font-semibold text-slate-900 dark:text-white">{formatPrecio(venta.total)}</dd>
            </div>
          </dl>
          <p className="flex items-start gap-2 rounded-xl bg-slate-100 p-3 text-xs leading-relaxed text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">
            <Icon name="info" size={14} className="mt-px shrink-0" />
            {telVisual
              ? 'Se abrirá WhatsApp en el chat del cliente con el mensaje y el enlace al comprobante listos. Solo tocá Enviar.'
              : 'Se abrirá WhatsApp con el mensaje y el enlace listos: elegí el contacto y tocá Enviar.'}
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
