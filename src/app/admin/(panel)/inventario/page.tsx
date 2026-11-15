import type { Metadata } from 'next';
import { createSupabaseServer } from '@/lib/supabase-server';
import { comoFilas, conCostos } from '@/lib/datos';
import {
  COLUMNAS_PRODUCTO_PANEL,
  COLUMNAS_VARIANTE_PANEL,
  type Categoria,
  type CostoCatalogo,
  type ProductoPanelSinCostos,
} from '@/types/database';
import AdminInventarioClient from './AdminInventarioClient';

export const metadata: Metadata = { title: 'Inventario' };
export const dynamic = 'force-dynamic';

export default async function AdminInventarioPage() {
  const supabase = createSupabaseServer();
  const [prod, cat, costos] = await Promise.all([
    supabase
      .from('productos')
      .select(`${COLUMNAS_PRODUCTO_PANEL}, variantes (${COLUMNAS_VARIANTE_PANEL}), categorias (*)`)
      .order('nombre', { ascending: true }),
    supabase.from('categorias').select('*').order('orden', { ascending: true }),
    // Costos y márgenes: RPC que solo responde al administrador.
    supabase.rpc('costos_catalogo'),
  ]);
  if (prod.error) throw new Error(`No se pudo cargar el inventario: ${prod.error.message}`);
  // Si la RPC falla (p. ej. migración aún no aplicada) el inventario se muestra igual, sin costos.
  if (costos.error) console.error('[inventario] costos_catalogo:', costos.error.message);

  const productos = conCostos(
    comoFilas<ProductoPanelSinCostos>(prod.data),
    costos.error ? [] : comoFilas<CostoCatalogo>(costos.data)
  );

  return <AdminInventarioClient productos={productos} categorias={comoFilas<Categoria>(cat.data)} />;
}
