/**
 * Nombres de usuario del personal (sin dependencias: sirve en cliente, Edge y servidor).
 *
 * Supabase Auth exige un email, pero los empleados no tienen por qué tener uno:
 * cada empleado entra con un usuario ("juan.perez") y la cuenta de Auth usa el
 * email sintético `<usuario>@tropastunuyan.local`, que el empleado nunca ve.
 * Lo que tenga "@" se toma como email real (así entra el admin).
 */

export const DOMINIO_INTERNO = 'tropastunuyan.local';

const PATRON_USUARIO = /^[a-z0-9]+([._-][a-z0-9]+)*$/;

export function usuarioValido(usuario: string): boolean {
  return usuario.length >= 3 && usuario.length <= 40 && PATRON_USUARIO.test(usuario);
}

/** Lo escrito en el login → email para signInWithPassword. */
export function emailDeLogin(entrada: string): string {
  const t = entrada.trim().toLowerCase();
  return t.includes('@') ? t : `${t}@${DOMINIO_INTERNO}`;
}

export function emailInterno(usuario: string): string {
  return `${usuario}@${DOMINIO_INTERNO}`;
}

/** Para mostrar: "juan.perez" en vez del email sintético. */
export function etiquetaCuenta(email: string): string {
  const sufijo = `@${DOMINIO_INTERNO}`;
  return email.toLowerCase().endsWith(sufijo) ? email.slice(0, -sufijo.length) : email;
}

/** Texto libre → fragmento de usuario: minúsculas, sin tildes ni símbolos. */
function limpiar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '');
}

/** "José María Pérez Núñez" → "jose.nunez" (primer nombre + último apellido). */
export function usuarioBase(nombre: string): string {
  const partes = nombre.split(/\s+/).map(limpiar).filter(Boolean);
  if (partes.length === 0) return '';
  const base = partes.length === 1 ? partes[0] : `${partes[0]}.${partes[partes.length - 1]}`;
  return base.slice(0, 36).replace(/\.$/, '');
}

/** Primer usuario libre: base, base2, base3… */
export function usuarioDisponible(base: string, ocupados: Iterable<string>): string {
  const usados = new Set(ocupados);
  if (!usados.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidato = `${base}${n}`;
    if (!usados.has(candidato)) return candidato;
  }
}

export const LARGO_MINIMO_PASSWORD = 8;

/** null si la contraseña es aceptable; si no, el motivo. */
export function problemaPassword(password: string): string | null {
  if (password.length < LARGO_MINIMO_PASSWORD) return `La contraseña debe tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`;
  if (password.length > 72) return 'La contraseña es demasiado larga (máximo 72 caracteres).';
  if (/^(.)\1+$/.test(password)) return 'Elegí una contraseña menos predecible.';
  return null;
}

export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}
