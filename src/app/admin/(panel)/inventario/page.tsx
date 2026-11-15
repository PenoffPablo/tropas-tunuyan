import type { Metadata } from 'next';
import { COLUMNAS_PRODUCTO_PANEL } from '@/types/database';
import { createSupabaseServer } from '@/lib/supabase-server';
import { comoFilas } from '@/lib/datos';
import type { Categoria, ProductoConVariantes } from '@/types/database';
import AdminInventarioClient from './AdminInventarioClient';

export const metadata: Metadata = { title: 'Inventario' };
export const dynamic = 'force-dynamic';

export default async function AdminInventarioPage() {
  const supabase = createSupabaseServer();
  const [prod, cat] = await Promise.all([
    supabase.from('productos').select(`${COLUMNAS_PRODUCTO_PANEL}, variantes (*), categorias (*)`).order('nombre', { ascending: true }),
    supabase.from('categorias').select('*').order('orden', { ascending: true }),
  ]);
  if (prod.error) throw new Error(`No se pudo cargar el inventario: ${prod.error.message}`);

  const productos = comoFilas<ProductoConVariantes>(prod.data).map((p) => ({
    ...p,
    variantes: [...p.variantes].sort((a, b) => a.color.localeCompare(b.color) || a.talle.localeCompare(b.talle, 'es', { numeric: true })),
  }));

  return <AdminInventarioClient productos={productos} categorias={comoFilas<Categoria>(cat.data)} />;
}
