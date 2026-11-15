/**
 * Cliente de Supabase para Server Components, Route Handlers y Server Actions.
 * Usa las cookies de la request → las consultas corren con el JWT del usuario
 * autenticado (RLS real), nunca con privilegios de anon.
 */
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/types/database';
import { supabaseEnv, type TypedSupabase } from './supabase';

export function createSupabaseServer(): TypedSupabase {
  const { url, anonKey } = supabaseEnv();
  const cookieStore = cookies();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component (cookies de solo lectura): el middleware refresca la sesión.
        }
      },
    },
  });
}
