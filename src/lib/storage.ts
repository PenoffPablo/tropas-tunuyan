/**
 * Carga de imágenes de producto — lógica ÚNICA compartida entre el cliente
 * (CargadorImagenTactico) y el Route Handler /api/upload.
 *
 * El navegador nunca escribe en Storage directamente: envía el archivo a
 * /api/upload, que valida sesión de administrador, tipo MIME, firma binaria
 * real (magic bytes), extensión y tamaño, y lo guarda con nombre UUID.
 */

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB
export const BUCKET_PRODUCTOS = 'productos';

export const TIPOS_PERMITIDOS = {
  'image/webp': ['webp'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
} as const;

export type MimePermitido = keyof typeof TIPOS_PERMITIDOS;

export const ACCEPT_IMAGENES = Object.keys(TIPOS_PERMITIDOS).join(',');

export function esMimePermitido(mime: string): mime is MimePermitido {
  return Object.prototype.hasOwnProperty.call(TIPOS_PERMITIDOS, mime);
}

export function extensionDe(nombre: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(nombre.trim());
  return m ? m[1].toLowerCase() : '';
}

/** Detecta el tipo REAL del archivo por su firma binaria (no por el nombre). */
export function detectarMimePorFirma(bytes: Uint8Array): MimePermitido | null {
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }
  return null;
}

/** Validación previa (UX inmediata); el servidor vuelve a validar todo. */
export function validarArchivoImagen(file: { name: string; type: string; size: number }): string | null {
  if (!file || file.size === 0) return 'El archivo está vacío.';
  if (file.size > MAX_UPLOAD_BYTES) return 'La imagen supera el máximo de 2 MB.';
  if (!esMimePermitido(file.type)) return 'Formato no admitido. Usá WEBP, PNG o JPG.';
  const ext = extensionDe(file.name);
  if (!(TIPOS_PERMITIDOS[file.type] as readonly string[]).includes(ext)) {
    return 'La extensión del archivo no coincide con su formato.';
  }
  return null;
}

export type UploadResult = { url: string; error: null } | { url: null; error: string };

/** Sube una imagen a través del endpoint protegido. */
export async function subirImagenProducto(file: File, signal?: AbortSignal): Promise<UploadResult> {
  const errorLocal = validarArchivoImagen(file);
  if (errorLocal) return { url: null, error: errorLocal };

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData, signal, credentials: 'same-origin' });
    const data: unknown = await res.json().catch(() => null);
    const cuerpo = (data ?? {}) as { url?: unknown; error?: unknown };
    if (!res.ok || typeof cuerpo.url !== 'string') {
      const msg = typeof cuerpo.error === 'string' ? cuerpo.error : `Error ${res.status} al subir la imagen.`;
      return { url: null, error: msg };
    }
    return { url: cuerpo.url, error: null };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { url: null, error: 'Subida cancelada.' };
    }
    return { url: null, error: 'No se pudo conectar con el servidor. Revisá tu conexión.' };
  }
}
