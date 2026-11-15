'use server';

/**
 * Server Actions de invalidación de caché. El catálogo público es estático (ISR):
 * tras cada mutación del panel se regenera al instante.
 */
import { revalidatePath } from 'next/cache';
import { createSupabaseServer } from './supabase-server';

export async function revalidarCatalogo(): Promise<void> {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const rol = user?.app_metadata?.rol;
  if (rol !== 'admin' && rol !== 'vendedor') return;
  revalidatePath('/catalogo');
}

