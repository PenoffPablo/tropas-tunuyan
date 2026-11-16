/** Constantes y helpers de autorización sin dependencias de servidor (Edge/cliente). */
import type { RolUsuario } from '@/types/database';

export const HEADER_ROL = 'x-tt-rol';
export const HEADER_EMAIL = 'x-tt-email';

/** Pantalla obligatoria tras el primer ingreso o un reseteo de contraseña. */
export const RUTA_CAMBIAR_PASSWORD = '/admin/cambiar-password';

export function esRolValido(rol: unknown): rol is RolUsuario {
  return rol === 'admin' || rol === 'vendedor';
}

/** Rutas del panel restringidas al administrador. */
export const RUTAS_SOLO_ADMIN = ['/admin/inventario', '/admin/finanzas', '/admin/turnos'] as const;

export function esRutaSoloAdmin(pathname: string): boolean {
  return RUTAS_SOLO_ADMIN.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export function rutaInicialPorRol(rol: RolUsuario): string {
  return rol === 'admin' ? '/admin/inventario' : '/admin/pos';
}

/** Evita open-redirects: solo rutas internas del panel. */
export function destinoSeguro(next: string | null | undefined, rol: RolUsuario): string {
  if (next && /^\/admin(\/[\w-]*)*$/.test(next) && next !== '/admin/login' && next !== RUTA_CAMBIAR_PASSWORD) {
    if (rol === 'vendedor' && esRutaSoloAdmin(next)) return '/admin/pos';
    return next;
  }
  return rutaInicialPorRol(rol);
}
