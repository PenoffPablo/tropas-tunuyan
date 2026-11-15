/**
 * Contexto de sesión del panel en el servidor.
 *
 * El middleware valida el JWT contra Supabase Auth (getUser) en cada request a
 * /admin/* y reenvía rol y email en cabeceras internas (x-tt-*) que SIEMPRE
 * sobrescribe: un cliente no puede inyectarlas. La autorización de datos la
 * aplica RLS en PostgreSQL con el mismo JWT.
 */
import { headers } from 'next/headers';
import { HEADER_EMAIL, HEADER_ROL, esRolValido } from './auth-shared';
import type { RolUsuario } from '@/types/database';

export type SesionPanel = { rol: RolUsuario; email: string };

export function leerSesionPanel(): SesionPanel | null {
  const h = headers();
  const rol = h.get(HEADER_ROL);
  if (!esRolValido(rol)) return null;
  return { rol, email: h.get(HEADER_EMAIL) ?? '' };
}
