/**
 * Utilidades livianas del ticket (texto, WhatsApp, entrega del PDF).
 * jsPDF vive aparte en pdfTicket.ts y se carga bajo demanda.
 */
import type { MetodoPagoTipo, VentaConDetalles } from '@/types/database';
import { formatFechaHora, formatPrecio } from './utils';

/** Normaliza un teléfono argentino a E.164 sin "+" para WhatsApp (549 + área + número). */
export function sanitizarTelefonoWhatsApp(tel: string): string {
  let d = (tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('549')) return d.length >= 12 && d.length <= 13 ? d : '';
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 6) d = `2622${d}`; // número local de Tunuyán
  if (d.length === 8 && d.startsWith('15')) d = `2622${d.slice(2)}`;
  // 2622 15 662044 → 2622 662044 (quita el 15 tras el código de área de 2 a 4 dígitos)
  if (d.length === 12) {
    for (const largoArea of [4, 3, 2]) {
      if (d.slice(largoArea, largoArea + 2) === '15') {
        d = d.slice(0, largoArea) + d.slice(largoArea + 2);
        break;
      }
    }
  }
  if (d.startsWith('9') && d.length === 11) d = d.slice(1);
  return d.length === 10 ? `549${d}` : '';
}

export function formatearTelefonoVisual(tel: string): string {
  const s = sanitizarTelefonoWhatsApp(tel);
  if (!s) return '';
  const resto = s.slice(3);
  return `+54 9 ${resto.slice(0, 4)} ${resto.slice(4, 6)}-${resto.slice(6)}`;
}

export const NOMBRE_METODO_PAGO: Record<MetodoPagoTipo, string> = {
  efectivo: 'Efectivo',
  transferencia_alias: 'Mercado Pago / Transferencia',
  tarjeta_postnet: 'Tarjeta (Postnet)',
  combinado: 'Pago combinado',
};

export function textoTicketWhatsApp(venta: VentaConDetalles): string {
  const l: string[] = [
    '*TROPAS TUNUYÁN — COMPROBANTE DE COMPRA*',
    '━━━━━━━━━━━━━━━━━━━━',
    `*Ticket:* ${venta.numero_ticket}`,
    `*Fecha:* ${formatFechaHora(venta.created_at)}`,
    `*Atendido por:* ${venta.cajero_nombre}`,
  ];
  if (venta.nombre_cliente) l.push(`*Cliente:* ${venta.nombre_cliente}`);
  l.push('━━━━━━━━━━━━━━━━━━━━');
  venta.detalles.forEach((d) => {
    l.push(`• *${d.cantidad}x* ${d.nombre_producto} (T. ${d.talle} / ${d.color}) — ${formatPrecio(d.subtotal)}`);
  });
  l.push('━━━━━━━━━━━━━━━━━━━━', `*TOTAL:* ${formatPrecio(venta.total)}`, `*Pago:* ${NOMBRE_METODO_PAGO[venta.metodo_pago]}`);
  if (venta.metodo_pago === 'combinado') {
    l.push(`Efectivo ${formatPrecio(venta.monto_efectivo)} · Digital ${formatPrecio(venta.monto_digital)}`);
  }
  if (venta.vuelto > 0) l.push(`*Vuelto:* ${formatPrecio(venta.vuelto)}`);
  if (venta.nro_comprobante_digital) l.push(`*Comprobante:* ${venta.nro_comprobante_digital}`);
  if (venta.exigio_credencial && venta.fuerza_institucion) {
    l.push(`🛡️ Credencial verificada: ${venta.fuerza_institucion}`);
  }
  l.push('━━━━━━━━━━━━━━━━━━━━', '¡Gracias por su compra!');
  return l.join('\n');
}

/**
 * Enlace de WhatsApp universal (api.whatsapp.com abre la app en móviles y
 * WhatsApp Web en escritorio). Se usa en un <a>, nunca con window.open:
 * los anchors no son bloqueados como popups en Safari iOS ni Chrome Android.
 */
export function urlWhatsApp(telefono: string, texto: string): string {
  const tel = sanitizarTelefonoWhatsApp(telefono);
  const q = new URLSearchParams({ text: texto });
  if (tel) q.set('phone', tel);
  return `https://api.whatsapp.com/send?${q.toString()}`;
}

/** Mensaje que acompaña al PDF del comprobante en WhatsApp. */
export function mensajeComprobanteWhatsApp(venta: VentaConDetalles): string {
  const saludo = venta.nombre_cliente ? `¡Hola ${venta.nombre_cliente.split(/\s+/)[0]}!` : '¡Hola!';
  return `${saludo} Te enviamos el comprobante de tu compra en *Tropas Tunuyán* (${venta.numero_ticket}) por *${formatPrecio(venta.total)}*. ¡Gracias por elegirnos!`;
}

/** Hay hoja nativa de compartir con archivos (celulares y tablets). */
export function puedeCompartirArchivo(archivo: File): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const esTactil = window.matchMedia?.('(pointer: coarse)').matches;
  return !!esTactil && typeof nav.share === 'function' && !!nav.canShare?.({ files: [archivo] });
}

/** Descarga directa con <a download> (sin popups). */
export function descargarArchivo(archivo: Blob, nombre: string): void {
  const url = URL.createObjectURL(archivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Abre un enlace en otra pestaña. Llamar dentro del gesto del usuario. */
export function abrirEnPestana(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Envía el comprobante PDF por WhatsApp de la forma más directa que permite
 * cada dispositivo (una web no puede adjuntar archivos a WhatsApp por enlace):
 *  · Celular/tablet: hoja nativa de compartir con el PDF adjunto → WhatsApp.
 *  · Computadora: descarga el PDF y abre el chat del cliente en WhatsApp Web
 *    con el mensaje listo; solo resta arrastrar el archivo.
 * SINCRÓNICA hasta el share/descarga: llamarla directo desde el clic.
 */
export async function enviarComprobanteWhatsApp(params: {
  pdf: Blob;
  nombre: string;
  telefono: string;
  mensaje: string;
}): Promise<'compartido' | 'cancelado' | 'descargado_y_abierto'> {
  const archivo = new File([params.pdf], params.nombre, { type: 'application/pdf' });
  if (puedeCompartirArchivo(archivo)) {
    try {
      await navigator.share({ files: [archivo], text: params.mensaje, title: params.nombre });
      return 'compartido';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelado';
      // Otro error: cae a descarga + WhatsApp
    }
  }
  descargarArchivo(archivo, params.nombre);
  abrirEnPestana(urlWhatsApp(params.telefono, params.mensaje));
  return 'descargado_y_abierto';
}

/**
 * Entrega un PDF sin popups:
 *  1. Móvil con Web Share API de archivos (iOS Safari ≥15, Chrome Android):
 *     hoja nativa de compartir → WhatsApp, Drive, imprimir, guardar.
 *  2. Resto: descarga directa con <a download> sobre un Object URL.
 * Debe llamarse de forma SINCRÓNICA dentro del gesto del usuario (sin awaits
 * previos) para conservar la "activación transitoria" que exige Safari.
 */
export async function entregarArchivo(blob: Blob, nombre: string): Promise<'compartido' | 'descargado' | 'cancelado'> {
  const archivo = new File([blob], nombre, { type: blob.type || 'application/pdf' });
  if (puedeCompartirArchivo(archivo)) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return 'compartido';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelado';
      // NotAllowedError u otro: cae a la descarga
    }
  }
  descargarArchivo(archivo, nombre);
  return 'descargado';
}
