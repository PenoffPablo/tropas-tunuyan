/**
 * Cliente de Supabase con la SERVICE ROLE (salta RLS y administra Auth).
 *
 * Solo servidor: `server-only` hace fallar el build si algún componente de
 * cliente lo importa. La clave se lee de SUPABASE_SERVICE_ROLE_KEY (SIN prefijo
 * NEXT_PUBLIC_, así nunca entra al bundle del navegador).
 *
 * Uso restringido a la gestión de cuentas del personal (auth.admin.*): los
 * datos de la app se siguen escribiendo con el JWT del admin para que RLS y la
 * auditoría registren quién hizo cada cambio.
 */
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseEnv } from './supabase';

export function createSupabaseAdmin() {
  const { url } = supabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el servidor (ver .env.example).');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
