/**
 * Clientes de Supabase seguros para el navegador y para lecturas públicas.
 *
 * · getSupabaseBrowser(): cliente con sesión en cookies (@supabase/ssr). Lo usan
 *   los Client Components del panel; cada consulta viaja con el JWT del usuario,
 *   por lo que RLS aplica el rol real (admin / vendedor).
 * · createSupabasePublic(): cliente anónimo SIN cookies para el catálogo público
 *   (permite ISR/caché porque no depende de la sesión).
 *
 * El cliente de servidor (cookies de next/headers) vive en supabase-server.ts
 * para no arrastrar código server-only al bundle del navegador.
 */
import { createBrowserClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export type TypedSupabase = SupabaseClient<Database>;

export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Copiá .env.example a .env.local.'
    );
  }
  return { url, anonKey };
}

let clienteNavegador: TypedSupabase | null = null;

export function getSupabaseBrowser(): TypedSupabase {
  if (!clienteNavegador) {
    const { url, anonKey } = supabaseEnv();
    clienteNavegador = createBrowserClient<Database>(url, anonKey);
  }
  return clienteNavegador;
}

export function createSupabasePublic(): TypedSupabase {
  const { url, anonKey } = supabaseEnv();
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Columnas del catálogo que puede leer el rol anon (sin costo ni margen). */
export const COLUMNAS_PRODUCTO_PUBLICO =
  'id, nombre, descripcion, precio, exige_credencial, categoria_id, imagen_url, activo, created_at, updated_at';

/** Columnas de empleados legibles por el panel (nunca el hash del PIN). */
export const COLUMNAS_EMPLEADO = 'id, nombre, puesto, telefono, activo, fecha_alta, created_at, updated_at';
