/**
 * Comprobante de compra en PDF A4 (jsPDF).
 * Módulo pesado: solo se importa dinámicamente desde ModalTicketVenta.
 *
 * La generación es SINCRÓNICA a propósito: así se puede llamar dentro del
 * gesto del usuario (clic) y enseguida descargar sin perder la "activación
 * transitoria" que exige Safari. También corre en el servidor (ruta /c/[token]).
 */
import { jsPDF } from 'jspdf';
import type { VentaConDetalles } from '@/types/database';
import { TIENDA } from './config';
import { formatFechaHora, formatPrecio } from './utils';
import { NOMBRE_METODO_PAGO, formatearTelefonoVisual } from './ticket';
import { LOGO_PDF } from './logoPdf';

type RGB = [number, number, number];

const C = {
  tinta: [17, 19, 26] as RGB, // ink-900
  texto: [39, 39, 42] as RGB,
  suave: [113, 113, 122] as RGB,
  linea: [228, 228, 231] as RGB,
  fondo: [246, 247, 242] as RGB,
  zebra: [250, 250, 247] as RGB,
  militar: [107, 142, 35] as RGB, // militar-600
  militarOscuro: [63, 84, 24] as RGB, // militar-800
  militarClaro: [177, 194, 122] as RGB, // militar-300
  blanco: [255, 255, 255] as RGB,
};

const A4 = { ancho: 210, alto: 297 };
const M = 16; // margen
const ANCHO_UTIL = A4.ancho - M * 2;
const PIE = 24; // reservado al pie de cada página

/** Las fuentes estándar de jsPDF solo cubren Latin-1: normaliza el resto. */
function t(s: string): string {
  return s
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\xFF]/g, '');
}

export function nombreArchivoComprobante(venta: VentaConDetalles): string {
  return `Comprobante-${venta.numero_ticket}.pdf`;
}

export function generarTicketPdf(venta: VentaConDetalles, logo: string | null = LOGO_PDF): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({
    title: `Comprobante ${venta.numero_ticket} - ${TIENDA.nombre}`,
    subject: 'Comprobante de compra',
    author: TIENDA.nombre,
    creator: TIENDA.nombre,
  });

  const color = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const relleno = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const trazo = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const fuente = (tam: number, negrita = false) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.setFontSize(tam);
  };
  /** `espaciado` (charSpace) solo se aplica alineado a la izquierda: jsPDF no lo compensa al centrar/alinear a la derecha. */
  const texto = (s: string, x: number, y: number, opts?: { align?: 'left' | 'right' | 'center'; espaciado?: number }) =>
    doc.text(t(s), x, y, { align: opts?.align, charSpace: opts?.align && opts.align !== 'left' ? undefined : opts?.espaciado });
  /** Recorta a un ancho con "…" (en Latin-1: "...") si no entra. */
  const recortar = (s: string, ancho: number) => {
    const limpio = t(s);
    if (doc.getTextWidth(limpio) <= ancho) return limpio;
    let r = limpio;
    while (r.length > 1 && doc.getTextWidth(`${r}...`) > ancho) r = r.slice(0, -1);
    return `${r.trimEnd()}...`;
  };

  /* ── Encabezado ─────────────────────────────────────────────────────── */
  const ALTO_CAB = 40;
  relleno(C.tinta);
  doc.rect(0, 0, A4.ancho, ALTO_CAB, 'F');
  relleno(C.militar);
  doc.rect(0, ALTO_CAB, A4.ancho, 1.4, 'F');

  let xMarca = M;
  if (logo) {
    try {
      doc.addImage(logo, 'JPEG', M, 8, 24, 24);
      xMarca = M + 30;
    } catch {
      /* logo inválido: se omite */
    }
  }
  color(C.blanco);
  fuente(19, true);
  texto('TROPAS TUNUYÁN', xMarca, 18.5, { espaciado: 0.3 });
  color(C.militarClaro);
  fuente(9);
  texto('Indumentaria Militar & Equipamiento Táctico', xMarca, 24.5);
  color([161, 161, 170]);
  fuente(8);
  texto(TIENDA.ubicacion, xMarca, 29.5);

  const xDer = A4.ancho - M;
  color(C.militarClaro);
  fuente(7.5, true);
  texto('COMPROBANTE DE COMPRA', xDer, 15, { align: 'right', espaciado: 0.6 });
  color(C.blanco);
  fuente(15, true);
  texto(venta.numero_ticket, xDer, 22.5, { align: 'right' });
  color([161, 161, 170]);
  fuente(8.5);
  texto(formatFechaHora(venta.created_at), xDer, 28.5, { align: 'right' });

  /* ── Tarjetas de datos ──────────────────────────────────────────────── */
  let y = ALTO_CAB + 10;
  const anchoTarjeta = (ANCHO_UTIL - 6) / 2;

  const tarjeta = (x: number, titulo: string, filas: [string, string][]) => {
    const alto = 11 + filas.length * 5.6;
    relleno(C.fondo);
    doc.roundedRect(x, y, anchoTarjeta, alto, 2.5, 2.5, 'F');
    color(C.militarOscuro);
    fuente(7, true);
    texto(titulo, x + 5, y + 6.5, { espaciado: 0.5 });
    filas.forEach(([etq, val], i) => {
      const yy = y + 12.5 + i * 5.6;
      color(C.suave);
      fuente(8.5);
      texto(etq, x + 5, yy);
      color(C.texto);
      fuente(9, true);
      doc.text(recortar(val, anchoTarjeta - 40), x + anchoTarjeta - 5, yy, { align: 'right' });
    });
    return alto;
  };

  const telCliente = venta.telefono_cliente ? formatearTelefonoVisual(venta.telefono_cliente) || venta.telefono_cliente : '';
  const filasCliente: [string, string][] = [['Nombre', venta.nombre_cliente || 'Consumidor final']];
  if (telCliente) filasCliente.push(['Teléfono', telCliente]);
  const filasOperacion: [string, string][] = [
    // cajero_nombre es "Nombre (Puesto)": en el comprobante alcanza con el nombre.
    ['Atendido por', venta.cajero_nombre.replace(/\s*\([^)]*\)\s*$/, '') || venta.cajero_nombre],
    ['Medio de pago', NOMBRE_METODO_PAGO[venta.metodo_pago]],
  ];
  if (venta.nro_comprobante_digital) filasOperacion.push(['N.º de operación', venta.nro_comprobante_digital]);

  const altoTarjetas = Math.max(
    tarjeta(M, 'CLIENTE', filasCliente),
    tarjeta(M + anchoTarjeta + 6, 'OPERACIÓN', filasOperacion)
  );
  y += altoTarjetas + 10;

  /* ── Detalle de artículos ───────────────────────────────────────────── */
  const col = {
    producto: M + 4,
    variante: M + 84,
    cant: M + 124,
    unit: M + 150,
    subtotal: A4.ancho - M - 4,
  };
  const anchoProducto = col.variante - col.producto - 4;
  const anchoVariante = col.cant - col.variante - 8;

  const cabeceraTabla = () => {
    relleno(C.militarOscuro);
    doc.roundedRect(M, y, ANCHO_UTIL, 9, 1.5, 1.5, 'F');
    color(C.blanco);
    fuente(7.5, true);
    const yy = y + 5.9;
    texto('ARTÍCULO', col.producto, yy, { espaciado: 0.4 });
    texto('TALLE / COLOR', col.variante, yy, { espaciado: 0.4 });
    texto('CANT.', col.cant, yy, { align: 'center', espaciado: 0.4 });
    texto('P. UNIT.', col.unit, yy, { align: 'right', espaciado: 0.4 });
    texto('SUBTOTAL', col.subtotal, yy, { align: 'right', espaciado: 0.4 });
    y += 9;
  };

  const nuevaPagina = () => {
    doc.addPage();
    y = M;
    cabeceraTabla();
  };

  cabeceraTabla();
  venta.detalles.forEach((d, i) => {
    fuente(9.5, true);
    const lineasProd: string[] = doc.splitTextToSize(t(d.nombre_producto), anchoProducto);
    fuente(8.5);
    const lineasVar: string[] = doc.splitTextToSize(t(`${d.talle} / ${d.color}`), anchoVariante);
    const lineas = Math.max(lineasProd.length, lineasVar.length);
    const alto = 5 + lineas * 4.4;
    if (y + alto > A4.alto - PIE) nuevaPagina();

    if (i % 2 === 1) {
      relleno(C.zebra);
      doc.rect(M, y, ANCHO_UTIL, alto, 'F');
    }
    const yy = y + 6;
    color(C.texto);
    fuente(9.5, true);
    doc.text(lineasProd, col.producto, yy, { lineHeightFactor: 1.3 });
    color(C.suave);
    fuente(8.5);
    doc.text(lineasVar, col.variante, yy, { lineHeightFactor: 1.3 });
    color(C.texto);
    fuente(9.5);
    texto(String(d.cantidad), col.cant, yy, { align: 'center' });
    texto(formatPrecio(d.precio_unitario), col.unit, yy, { align: 'right' });
    fuente(9.5, true);
    texto(formatPrecio(d.subtotal), col.subtotal, yy, { align: 'right' });

    y += alto;
    trazo(C.linea);
    doc.setLineWidth(0.2);
    doc.line(M, y, A4.ancho - M, y);
  });

  /* ── Pago y totales ─────────────────────────────────────────────────── */
  const filasPago: [string, string][] = [];
  if (venta.metodo_pago === 'combinado') {
    filasPago.push(['Efectivo', formatPrecio(venta.monto_efectivo)], ['Digital', formatPrecio(venta.monto_digital)]);
  }
  if (venta.metodo_pago === 'efectivo' && venta.monto_recibido !== null) filasPago.push(['Recibido', formatPrecio(venta.monto_recibido)]);
  if (venta.vuelto > 0) filasPago.push(['Vuelto', formatPrecio(venta.vuelto)]);
  const altoCredencial = venta.exigio_credencial ? 32 : 0;
  const altoResumen = 30 + filasPago.length * 5.5 + altoCredencial;
  if (y + 8 + altoResumen > A4.alto - PIE) {
    doc.addPage();
    y = M;
  } else {
    y += 8;
  }

  const unidades = venta.detalles.reduce((s, d) => s + d.cantidad, 0);
  const anchoTotales = 78;
  const xTot = A4.ancho - M - anchoTotales;

  // Izquierda: resumen del pago
  color(C.militarOscuro);
  fuente(7, true);
  texto('FORMA DE PAGO', M, y + 4, { espaciado: 0.5 });
  color(C.texto);
  fuente(10, true);
  texto(NOMBRE_METODO_PAGO[venta.metodo_pago], M, y + 10);
  fuente(8.5);
  color(C.suave);
  let yPago = y + 15.5;
  filasPago.forEach(([a, b]) => {
    texto(a, M, yPago);
    color(C.texto);
    texto(b, M + 50, yPago, { align: 'right' });
    color(C.suave);
    yPago += 5.5;
  });

  // Derecha: totales
  color(C.suave);
  fuente(8.5);
  texto(`Artículos (${unidades} ${unidades === 1 ? 'unidad' : 'unidades'})`, xTot + 4, y + 4);
  color(C.texto);
  texto(formatPrecio(venta.total), A4.ancho - M - 4, y + 4, { align: 'right' });
  relleno(C.militar);
  doc.roundedRect(xTot, y + 8, anchoTotales, 14, 2.5, 2.5, 'F');
  color(C.blanco);
  fuente(9, true);
  texto('TOTAL', xTot + 5, y + 16.8, { espaciado: 0.6 });
  fuente(15, true);
  texto(formatPrecio(venta.total), A4.ancho - M - 5, y + 17.2, { align: 'right' });

  y = Math.max(yPago, y + 22) + 8;

  /* ── Control de credencial (ventas reguladas) ───────────────────────── */
  if (venta.exigio_credencial) {
    trazo(C.militar);
    doc.setLineWidth(0.4);
    relleno(C.fondo);
    doc.roundedRect(M, y, ANCHO_UTIL, 24, 2.5, 2.5, 'FD');
    color(C.militarOscuro);
    fuente(7.5, true);
    texto('CONTROL REGLAMENTARIO DE CREDENCIAL', M + 5, y + 6.5, { espaciado: 0.5 });
    color(C.texto);
    fuente(9);
    texto(`Fuerza / institución: ${venta.fuerza_institucion ?? '-'}`, M + 5, y + 12.5);
    if (venta.legajo_comprador) texto(`Referencia / legajo: ${venta.legajo_comprador}`, M + 5, y + 17.5);
    color(C.suave);
    fuente(8);
    texto('Credencial oficial constatada en mostrador por el operador.', A4.ancho - M - 5, y + 19.5, { align: 'right' });
    y += 32;
  }

  /* ── Pie (todas las páginas) ────────────────────────────────────────── */
  const paginas = doc.getNumberOfPages();
  const contacto: string[] = [];
  if (TIENDA.whatsapp !== '5492622000000') {
    const tel = formatearTelefonoVisual(TIENDA.whatsapp);
    if (tel) contacto.push(`WhatsApp ${tel}`);
  }
  if (TIENDA.urlSitio) contacto.push(TIENDA.urlSitio.replace(/^https?:\/\//, ''));

  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    const yPie = A4.alto - PIE + 4;
    if (p === paginas) {
      color(C.militarOscuro);
      fuente(11, true);
      texto('¡Gracias por su elección!', A4.ancho / 2, yPie - 4, { align: 'center' });
    }
    trazo(C.linea);
    doc.setLineWidth(0.3);
    doc.line(M, yPie, A4.ancho - M, yPie);
    color(C.suave);
    fuente(7.5);
    texto('Comprobante no fiscal de control interno. Conservalo para cambios y garantías.', M, yPie + 5);
    if (contacto.length) texto(contacto.join('  ·  '), M, yPie + 9.5);
    texto(`${venta.numero_ticket}  ·  Página ${p} de ${paginas}`, A4.ancho - M, yPie + 5, { align: 'right' });
  }

  return doc.output('arraybuffer');
}
