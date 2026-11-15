/**
 * POST /api/upload — subida blindada de imágenes de producto.
 *
 * Capas de defensa:
 *  1. middleware.ts: rechaza sin sesión (401) o sin rol admin (403).
 *  2. Re-verificación aquí (getUser + rol) — no depende solo del middleware.
 *  3. Límite de tamaño por Content-Length y por bytes reales (≤ 2 MB).
 *  4. MIME declarado ∈ {webp, png, jpeg} + extensión coherente + firma binaria real.
 *  5. Nombre de archivo = UUID generado en servidor (sin input del usuario).
 *  6. Escritura con el JWT del usuario: las políticas de Storage exigen admin.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import {
  BUCKET_PRODUCTOS,
  MAX_UPLOAD_BYTES,
  TIPOS_PERMITIDOS,
  detectarMimePorFirma,
  validarArchivoImagen,
} from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function error(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return error('No autenticado', 401);
  if (user.app_metadata?.rol !== 'admin') return error('Permisos insuficientes', 403);

  const declarado = Number(req.headers.get('content-length') ?? '0');
  if (declarado > MAX_UPLOAD_BYTES + 64 * 1024) return error('La imagen supera el máximo de 2 MB.', 413);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return error('Solicitud inválida', 400);
  }

  const file = formData.get('file');
  if (!(file instanceof File)) return error('No se envió ningún archivo', 400);

  const problema = validarArchivoImagen(file);
  if (problema) return error(problema, file.size > MAX_UPLOAD_BYTES ? 413 : 415);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return error('La imagen supera el máximo de 2 MB.', 413);

  const mimeReal = detectarMimePorFirma(bytes);
  if (!mimeReal || mimeReal !== file.type) {
    return error('El contenido del archivo no es una imagen WEBP, PNG o JPG válida.', 415);
  }

  const extension = TIPOS_PERMITIDOS[mimeReal][0];
  const ruta = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${extension}`;

  const { error: errSubida } = await supabase.storage.from(BUCKET_PRODUCTOS).upload(ruta, bytes, {
    contentType: mimeReal,
    cacheControl: '31536000',
    upsert: false,
  });
  if (errSubida) {
    console.error('[upload] Storage:', errSubida.message);
    return error('No se pudo guardar la imagen en Storage.', 502);
  }

  const { data } = supabase.storage.from(BUCKET_PRODUCTOS).getPublicUrl(ruta);
  return NextResponse.json({ url: data.publicUrl }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

export function GET() {
  return error('Método no permitido', 405);
}
