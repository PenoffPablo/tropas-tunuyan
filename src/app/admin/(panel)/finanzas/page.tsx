import type { Metadata } from 'next';
import { createSupabaseServer } from '@/lib/supabase-server';
import { exigirAdminPanel } from '@/lib/auth';
import { comoFila, comoFilas } from '@/lib/datos';
import type { MovimientoCaja, RankingProducto, TurnoCaja } from '@/types/database';
import AdminFinanzasClient, { type Periodo } from './AdminFinanzasClient';

export const metadata: Metadata = { title: 'Caja & finanzas' };
export const dynamic = 'force-dynamic';

const PERIODOS: Periodo[] = ['hoy', '7d', 'mes', 'todo'];

/** Inicio del período en hora argentina (UTC−03, sin horario de verano). */
function desdePeriodo(periodo: Periodo): string | null {
  if (periodo === 'todo') return null;
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [y, m, d] = partes.split('-').map(Number);
  const base = periodo === 'mes' ? new Date(Date.UTC(y, m - 1, 1, 3)) : new Date(Date.UTC(y, m - 1, d, 3));
  if (periodo === '7d') base.setUTCDate(base.getUTCDate() - 6);
  return base.toISOString();
}

export default async function AdminFinanzasPage({ searchParams }: { searchParams: { periodo?: string } }) {
  exigirAdminPanel();
  const periodo: Periodo = PERIODOS.includes(searchParams.periodo as Periodo) ? (searchParams.periodo as Periodo) : 'mes';
  const desde = desdePeriodo(periodo);
  const supabase = createSupabaseServer();

  let qMov = supabase.from('movimientos_caja').select('*').order('created_at', { ascending: false }).limit(2000);
  let qTur = supabase.from('turnos_caja').select('*').order('fecha_apertura', { ascending: false }).limit(300);
  if (desde) {
    qMov = qMov.gte('created_at', desde);
    qTur = qTur.gte('fecha_apertura', desde);
  }

  const [mov, tur, rank, prod, abierto] = await Promise.all([
    qMov,
    qTur,
    supabase.rpc('ranking_productos', { p_desde: desde }),
    supabase.from('productos').select('id, nombre, precio').eq('activo', true).order('nombre'),
    supabase.from('turnos_caja').select('*').eq('estado', 'abierto').eq('caja', 'principal').maybeSingle(),
  ]);
  if (mov.error) throw new Error(`No se pudieron cargar los movimientos: ${mov.error.message}`);

  return (
    <AdminFinanzasClient
      periodo={periodo}
      movimientos={comoFilas<MovimientoCaja>(mov.data)}
      turnos={comoFilas<TurnoCaja>(tur.data)}
      ranking={comoFilas<RankingProducto>(rank.data)}
      productos={comoFilas<{ id: string; nombre: string; precio: number }>(prod.data)}
      turnoAbierto={comoFila<TurnoCaja>(abierto.data)}
    />
  );
}
