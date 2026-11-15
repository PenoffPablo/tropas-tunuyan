import type { Metadata } from 'next';
import { COLUMNAS_PRODUCTO_PANEL } from '@/types/database';
import { createSupabaseServer } from '@/lib/supabase-server';
import { COLUMNAS_EMPLEADO } from '@/lib/supabase';
import { comoFila, comoFilas } from '@/lib/datos';
import type { Categoria, Empleado, ProductoConVariantes, TurnoCaja } from '@/types/database';
import AdminPosClient from './AdminPosClient';

export const metadata: Metadata = { title: 'Punto de venta' };
export const dynamic = 'force-dynamic';

export default async function AdminPosPage() {
  const supabase = createSupabaseServer();
  const [prod, cat, turno, emp] = await Promise.all([
    supabase
      .from('productos')
      .select(`${COLUMNAS_PRODUCTO_PANEL}, variantes (*), categorias (*)`)
      .eq('activo', true)
      .order('nombre', { ascending: true }),
    supabase.from('categorias').select('*').order('orden', { ascending: true }),
    supabase.from('turnos_caja').select('*').eq('estado', 'abierto').eq('caja', 'principal').maybeSingle(),
    supabase.from('empleados').select(COLUMNAS_EMPLEADO).eq('activo', true).order('nombre'),
  ]);

  if (prod.error) throw new Error(`No se pudo cargar el catálogo del POS: ${prod.error.message}`);

  const productos = comoFilas<ProductoConVariantes>(prod.data).map((p) => ({
    ...p,
    variantes: [...p.variantes].sort((a, b) => a.color.localeCompare(b.color) || a.talle.localeCompare(b.talle, 'es', { numeric: true })),
  }));

  return (
    <AdminPosClient
      productos={productos}
      categorias={comoFilas<Categoria>(cat.data)}
      turnoInicial={comoFila<TurnoCaja>(turno.data)}
      empleados={comoFilas<Empleado>(emp.data)}
    />
  );
}
