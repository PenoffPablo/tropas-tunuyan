/**
 * Enlace público del comprobante: /c/<token>  (el que se envía por WhatsApp).
 *
 * · El token (128 bits, base64url) lo crea el POS con crear_enlace_comprobante.
 * · Se lee como anon con la RPC comprobante_por_token (SECURITY DEFINER): solo
 *   devuelve la venta si el enlace existe y no venció; nunca incluye costos.
 * · El PDF A4 se genera acá en el momento (mismo diseño que en el POS): no se
 *   guardan archivos.
 */
import { createSupabasePublic } from '@/lib/supabase';
import { generarTicketPdf, nombreArchivoComprobante } from '@/lib/pdfTicket';
import { comoFila } from '@/lib/datos';
import { TIENDA } from '@/lib/config';
import type { VentaConDetalles } from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_VALIDO = /^[A-Za-z0-9_-]{22}$/;

const CABECERAS_PRIVADAS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
};

function noDisponible(): Response {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comprobante no disponible · ${TIENDA.nombre}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#11131a;color:#e4e4e7;font:16px/1.5 system-ui,sans-serif;padding:24px}
main{max-width:420px;text-align:center}h1{font-size:20px;color:#fff;margin:0 0 8px}p{color:#a1a1aa;margin:0}b{color:#b1c27a}</style></head>
<body><main><h1>Comprobante no disponible</h1><p>El enlace no existe o ya venció (los enlaces duran 90 días). Pedile el comprobante de nuevo a <b>${TIENDA.nombre}</b>.</p></main></body></html>`;
  return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', ...CABECERAS_PRIVADAS } });
}

export async function GET(_req: Request, { params }: { params: { token: string } }): Promise<Response> {
  if (!TOKEN_VALIDO.test(params.token)) return noDisponible();

  const { data, error } = await createSupabasePublic().rpc('comprobante_por_token', { p_token: params.token });
  const venta = error ? null : comoFila<VentaConDetalles>(data);
  if (!venta || !Array.isArray(venta.detalles)) return noDisponible();

  const pdf = generarTicketPdf(venta);
  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${nombreArchivoComprobante(venta)}"`,
      ...CABECERAS_PRIVADAS,
    },
  });
}
