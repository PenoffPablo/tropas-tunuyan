/**
 * Generación del ticket térmico (80 mm) con jsPDF.
 * Módulo pesado: solo se importa dinámicamente desde ModalTicketVenta.
 */
import { jsPDF } from 'jspdf';
import type { VentaConDetalles } from '@/types/database';
import { formatFechaHora, formatPrecio } from './utils';
import { NOMBRE_METODO_PAGO } from './ticket';

/** jsPDF con fuentes estándar no soporta todos los glifos: normaliza el texto. */
function t(s: string): string {
  return s.replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[^\x20-\xFF]/g, '');
}

export function generarTicketPdf(venta: VentaConDetalles): Blob {
  const ancho = 80;
  const m = 5;
  const alto = Math.max(
    130,
    105 + venta.detalles.length * 8 + (venta.exigio_credencial ? 20 : 0) + (venta.nombre_cliente ? 4 : 0) + (venta.metodo_pago === 'combinado' ? 8 : 0)
  );
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [ancho, alto] });
  let y = 9;

  const fila = (izq: string, der: string, tam = 7.5, negrita = false) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.setFontSize(tam);
    doc.text(t(izq), m, y);
    doc.text(t(der), ancho - m, y, { align: 'right' });
    y += tam * 0.47;
  };
  const linea = () => {
    y += 1;
    doc.setLineDashPattern([1, 1], 0);
    doc.setLineWidth(0.2);
    doc.line(m, y, ancho - m, y);
    y += 4;
  };
  const centro = (s: string, tam: number, negrita = false, gris = false) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.setFontSize(tam);
    doc.setTextColor(gris ? 110 : 0);
    doc.text(t(s), ancho / 2, y, { align: 'center' });
    doc.setTextColor(0);
    y += tam * 0.45;
  };

  centro('TROPAS TUNUYÁN', 13, true);
  centro('Indumentaria Militar & Equipamiento Táctico', 7.5);
  centro('Tunuyán, Mendoza - Rep. Argentina', 6.5, false, true);
  linea();

  fila('COMPROBANTE:', venta.numero_ticket, 7.5, true);
  fila('FECHA:', formatFechaHora(venta.created_at));
  fila('CAJERO:', venta.cajero_nombre.slice(0, 32));
  if (venta.nombre_cliente) fila('CLIENTE:', venta.nombre_cliente.slice(0, 32));
  linea();

  venta.detalles.forEach((d) => {
    const nombre = d.nombre_producto.length > 26 ? `${d.nombre_producto.slice(0, 24)}...` : d.nombre_producto;
    fila(`${d.cantidad}x ${nombre}`, formatPrecio(d.subtotal), 7.5, true);
    doc.setTextColor(110);
    fila(`   T. ${d.talle} / ${d.color}`, `c/u ${formatPrecio(d.precio_unitario)}`, 6.5);
    doc.setTextColor(0);
    y += 0.6;
  });
  linea();

  fila('TOTAL:', formatPrecio(venta.total), 10, true);
  y += 0.8;
  fila('Medio de pago:', NOMBRE_METODO_PAGO[venta.metodo_pago]);
  if (venta.metodo_pago === 'combinado') {
    fila('  Efectivo:', formatPrecio(venta.monto_efectivo));
    fila('  Digital:', formatPrecio(venta.monto_digital));
  }
  if (venta.monto_recibido !== null && venta.metodo_pago === 'efectivo') fila('Recibido:', formatPrecio(venta.monto_recibido));
  if (venta.vuelto > 0) fila('Vuelto:', formatPrecio(venta.vuelto));
  if (venta.nro_comprobante_digital) fila('Nro. operación:', venta.nro_comprobante_digital.slice(0, 24), 7);

  if (venta.exigio_credencial) {
    linea();
    centro('CONTROL REGLAMENTARIO DE CREDENCIAL', 6.8, true);
    fila('Fuerza:', (venta.fuerza_institucion ?? '-').slice(0, 34), 6.5);
    if (venta.legajo_comprador) fila('Ref / Legajo:', venta.legajo_comprador, 6.5);
    centro('Credencial oficial constatada en mostrador', 6.2, false, true);
  }

  linea();
  centro('¡GRACIAS POR SU ELECCIÓN!', 7.5, true);
  centro('Comprobante no fiscal de control interno.', 6, false, true);

  return doc.output('blob');
}
