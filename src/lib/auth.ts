/**
 * Contexto de sesión del panel en el servidor.
 *
 * El middleware valida el JWT contra Supabase Auth (getUser) en cada request a
 * /admin/* y reenvía rol y email en cabeceras internas (x-tt-*) que SIEMPRE
 * sobrescribe: un cliente no puede inyectarlas. La autorización de datos la
 * aplica RLS en PostgreSQL con el mismo JWT.
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { HEADER_EMAIL, HEADER_ROL, esRolValido } from './auth-shared';
import type { RolUsuario } from '@/types/database';

export type SesionPanel = { rol: RolUsuario; email: string };

export function leerSesionPanel(): SesionPanel | null {
  const h = headers();
  const rol = h.get(HEADER_ROL);
  if (!esRolValido(rol)) return null;
  return { rol, email: h.get(HEADER_EMAIL) ?? '' };
}

/**
 * Páginas solo-admin: segunda barrera en el servidor (además del middleware).
 * Sin sesión → login; vendedor → POS.
 */
export function exigirAdminPanel(): SesionPanel {
  const sesion = leerSesionPanel();
  if (!sesion) redirect('/admin/login');
  if (sesion.rol !== 'admin') redirect('/admin/pos');
  return sesion;
}
