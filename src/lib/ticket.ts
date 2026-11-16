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

/* ── Validación de los datos que se cargan al cobrar ─────────────────────── */

/** Al tipear el nombre: solo letras (con acentos), espacios, apóstrofo, punto y guion. */
export function limpiarNombreCliente(s: string): string {
  return s.replace(/[^\p{L}\s'.-]/gu, '').replace(/\s{2,}/g, ' ').trimStart();
}

/** null si es válido (vacío = opcional). */
export function validarNombreCliente(nombre: string): string | null {
  const n = nombre.trim();
  if (!n) return null;
  if (!/^[\p{L}][\p{L}\s'.-]*$/u.test(n)) return 'El nombre solo puede tener letras.';
  if ((n.match(/\p{L}/gu) ?? []).length < 2) return 'El nombre debe tener al menos 2 letras.';
  return null;
}

/** Al tipear el teléfono: dígitos y separadores habituales. */
export function limpiarTelefono(s: string): string {
  return s.replace(/[^\d+\s()-]/g, '');
}

/** null si es válido (vacío = opcional). */
export function validarTelefonoCliente(tel: string): string | null {
  if (!tel.trim()) return null;
  return sanitizarTelefonoWhatsApp(tel) ? null : 'Teléfono inválido: ingresá código de área y número (ej. 2622 662044).';
}

/**
 * Al tipear el comprobante del pago digital. La transferencia lleva solo
 * números; el cupón de Postnet y el pago combinado admiten letras y guiones.
 */
export function limpiarNroOperacion(s: string, metodo: MetodoPagoTipo): string {
  return metodo === 'transferencia_alias' ? s.replace(/\D/g, '') : s.toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

/** null si es válido. `requerido` = false permite dejarlo vacío (pago combinado). */
export function validarNroOperacion(valor: string, metodo: MetodoPagoTipo, requerido: boolean): string | null {
  const v = valor.trim();
  if (!v) {
    if (!requerido) return null;
    return metodo === 'tarjeta_postnet' ? 'Ingresá el número de cupón del Postnet.' : 'Ingresá el número de operación de la transferencia.';
  }
  if (metodo === 'transferencia_alias') {
    return /^\d{4,30}$/.test(v) ? null : 'El N.º de operación debe tener solo números (mínimo 4 dígitos).';
  }
  if (!/^[A-Z0-9-]{3,30}$/.test(v) || (v.match(/\d/g) ?? []).length < 3) {
    return metodo === 'tarjeta_postnet'
      ? 'El cupón debe tener al menos 3 números (puede incluir letras y guiones).'
      : 'El N.º de operación debe tener al menos 3 números.';
  }
  return null;
}

export const NOMBRE_METODO_PAGO: Record<MetodoPagoTipo, string> = {
  efectivo: 'Efectivo',
  transferencia_alias: 'Mercado Pago / Transferencia',
  tarjeta_postnet: 'Tarjeta (Postnet)',
  combinado: 'Pago combinado',
};

type Fila = [string, string];

/**
 * Contenido del comprobante A4. Lo usan el PDF (pdfTicket.ts) y la vista
 * previa del POS, así ambos muestran siempre lo mismo.
 */
export function datosComprobante(venta: VentaConDetalles, whatsappTienda: string, urlSitio: string) {
  const tel = venta.telefono_cliente ? formatearTelefonoVisual(venta.telefono_cliente) || venta.telefono_cliente : '';
  // La tarjeta del cliente solo aparece si se cargó algún dato al cobrar.
  const cliente: Fila[] = [];
  if (venta.nombre_cliente) cliente.push(['Nombre', venta.nombre_cliente]);
  if (tel) cliente.push(['Teléfono', tel]);

  const operacion: Fila[] = [
    // cajero_nombre es "Nombre (Puesto)": en el comprobante alcanza con el nombre.
    ['Atendido por', venta.cajero_nombre.replace(/\s*\([^)]*\)\s*$/, '') || venta.cajero_nombre],
    ['Medio de pago', NOMBRE_METODO_PAGO[venta.metodo_pago]],
  ];
  if (venta.nro_comprobante_digital) operacion.push(['N.º de operación', venta.nro_comprobante_digital]);

  const pago: Fila[] = [];
  if (venta.metodo_pago === 'combinado') {
    pago.push(['Efectivo', formatPrecio(venta.monto_efectivo)], ['Digital', formatPrecio(venta.monto_digital)]);
  }
  if (venta.metodo_pago === 'efectivo' && venta.monto_recibido !== null) pago.push(['Recibido', formatPrecio(venta.monto_recibido)]);
  if (venta.vuelto > 0) pago.push(['Vuelto', formatPrecio(venta.vuelto)]);

  const contacto: string[] = [];
  if (whatsappTienda !== '5492622000000') {
    const t = formatearTelefonoVisual(whatsappTienda);
    if (t) contacto.push(`WhatsApp ${t}`);
  }
  if (urlSitio) contacto.push(urlSitio.replace(/^https?:\/\//, ''));

  return {
    cliente,
    operacion,
    pago,
    contacto,
    unidades: venta.detalles.reduce((s, d) => s + d.cantidad, 0),
  };
}

export const GRACIAS_COMPROBANTE = '¡Gracias por su compra!';
export const LEYENDA_COMPROBANTE = 'Comprobante no fiscal de control interno. Conservalo para cambios y garantías.';

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

/** Mensaje de WhatsApp con el enlace al comprobante PDF. */
export function mensajeComprobanteWhatsApp(venta: VentaConDetalles, enlace: string): string {
  const saludo = venta.nombre_cliente ? `¡Hola ${venta.nombre_cliente.split(/\s+/)[0]}!` : '¡Hola!';
  return [
    `${saludo} Gracias por tu compra en *Tropas Tunuyán*.`,
    `Comprobante ${venta.numero_ticket} · Total *${formatPrecio(venta.total)}*`,
    '',
    `📄 Podés ver y descargar tu comprobante acá:`,
    enlace,
  ].join('\n');
}

/** Enlace público al comprobante (/c/<token>) sobre el dominio oficial. */
export function urlComprobante(token: string, base: string): string {
  return `${base.replace(/\/+$/, '')}/c/${token}`;
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
