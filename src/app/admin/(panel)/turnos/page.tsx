import type { Metadata } from 'next';
import { createSupabaseServer } from '@/lib/supabase-server';
import { exigirAdminPanel } from '@/lib/auth';
import { COLUMNAS_EMPLEADO } from '@/lib/supabase';
import { comoFila, comoFilas } from '@/lib/datos';
import type { Empleado, TurnoCaja } from '@/types/database';
import AdminTurnosClient from './AdminTurnosClient';

export const metadata: Metadata = { title: 'Turnos & personal' };
export const dynamic = 'force-dynamic';

export default async function AdminTurnosPage() {
  exigirAdminPanel();
  const supabase = createSupabaseServer();
  const [emp, tur, abierto] = await Promise.all([
    supabase.from('empleados').select(COLUMNAS_EMPLEADO).order('activo', { ascending: false }).order('nombre'),
    supabase.from('turnos_caja').select('*').order('fecha_apertura', { ascending: false }).limit(100),
    supabase.from('turnos_caja').select('*').eq('estado', 'abierto').eq('caja', 'principal').maybeSingle(),
  ]);
  if (emp.error) throw new Error(`No se pudo cargar el personal: ${emp.error.message}`);

  return (
    <AdminTurnosClient
      empleados={comoFilas<Empleado>(emp.data)}
      turnos={comoFilas<TurnoCaja>(tur.data)}
      turnoAbierto={comoFila<TurnoCaja>(abierto.data)}
    />
  );
}
