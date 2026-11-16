'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { Empleado, TurnoCaja } from '@/types/database';
import Icon from '@/components/ui/Icon';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { copiarAlPortapapeles, etiquetaDesvio, textoActaTurno } from '@/lib/finanzas';
import { darDeBajaEmpleado } from '@/lib/personal-acciones';
import { cn, formatDesvio, formatFechaHora, formatPrecio, mensajeError } from '@/lib/utils';

const ModalEmpleado = dynamic(() => import('@/components/admin/ModalEmpleado'), { ssr: false });
const ModalAperturaTurno = dynamic(() => import('@/components/admin/ModalAperturaTurno'), { ssr: false });
const ModalArqueoCiego = dynamic(() => import('@/components/admin/ModalArqueoCiego'), { ssr: false });
const ModalAccesoEmpleado = dynamic(() => import('@/components/admin/ModalAccesoEmpleado'), { ssr: false });

type Props = { empleados: Empleado[]; turnos: TurnoCaja[]; turnoAbierto: TurnoCaja | null };

export default function AdminTurnosClient({ empleados, turnos, turnoAbierto: abiertoServidor }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pestana, setPestana] = useState<'turnos' | 'personal'>('turnos');
  const [turnoAbierto, setTurnoAbierto] = useState(abiertoServidor);
  const [modal, setModal] = useState<'empleado' | 'apertura' | 'arqueo' | null>(null);
  const [editando, setEditando] = useState<Empleado | null>(null);
  const [acceso, setAcceso] = useState<{ empleado: Empleado; modo: 'crear' | 'resetear' } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => setTurnoAbierto(abiertoServidor), [abiertoServidor]);

  const baja = async (e: Empleado) => {
    if (ocupado) return;
    const aviso = e.user_id
      ? `¿Dar de baja a ${e.nombre}? Se desactiva y su usuario "${e.usuario}" queda bloqueado (se conserva el historial).`
      : `¿Dar de baja a ${e.nombre}? Si tiene historial se desactiva (auditoría); si no, se elimina.`;
    if (!window.confirm(aviso)) return;
    setOcupado(e.id);
    try {
      const r = await darDeBajaEmpleado(e.id);
      if (!r.ok) {
        toast(r.error, 'error');
        return;
      }
      if (r.datos.aviso) toast(r.datos.aviso, 'alerta');
      else toast(r.datos.resultado === 'eliminado' ? `${e.nombre} eliminado` : `${e.nombre} desactivado${e.user_id ? ' y acceso bloqueado' : ' (conserva historial)'}`);
      router.refresh();
    } catch (err) {
      toast(mensajeError(err), 'error');
    } finally {
      setOcupado(null);
    }
  };

  const copiarActa = async (t: TurnoCaja) => {
    toast((await copiarAlPortapapeles(textoActaTurno(t))) ? 'Acta copiada' : 'No se pudo copiar', 'info');
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow">Turnos & personal</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">Control de mostrador</h1>
        </div>
        <button type="button" onClick={() => { setEditando(null); setModal('empleado'); }} className="btn-primary btn-sm self-start sm:self-auto">
          <Icon name="plus" size={14} /> Nuevo empleado
        </button>
      </header>

      <section className={cn('surface-elevated flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between', turnoAbierto && 'border-emerald-500/30')}>
        <div className="flex items-center gap-4">
          <span className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', turnoAbierto ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-100 text-slate-400 dark:bg-white/[0.04]')}>
            <Icon name={turnoAbierto ? 'unlock' : 'lock'} size={22} />
          </span>
          <div>
            <div className="eyebrow">{turnoAbierto ? 'Caja abierta' : 'Caja cerrada'}</div>
            <div className="text-lg font-semibold text-slate-900 dark:text-white">{turnoAbierto ? turnoAbierto.cajero_nombre : 'Sin turno activo'}</div>
            {turnoAbierto && (
              <div className="num text-xs text-slate-500">Desde {formatFechaHora(turnoAbierto.fecha_apertura)} · fondo {formatPrecio(turnoAbierto.monto_apertura)}</div>
            )}
          </div>
        </div>
        {turnoAbierto ? (
          <button type="button" onClick={() => setModal('arqueo')} className="btn-warning w-full sm:w-auto"><Icon name="lock" size={16} /> Arqueo ciego y cierre</button>
        ) : (
          <button type="button" onClick={() => setModal('apertura')} className="btn-primary w-full sm:w-auto"><Icon name="unlock" size={16} /> Abrir turno</button>
        )}
      </section>

      <div className="flex gap-1 border-b border-slate-200 dark:border-white/[0.08]" role="tablist">
        {(
          [
            ['turnos', 'Historial de turnos', turnos.length],
            ['personal', 'Personal', empleados.length],
          ] as const
        ).map(([id, txt, n]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pestana === id}
            onClick={() => setPestana(id)}
            className={cn('-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors', pestana === id ? 'border-militar-500 text-slate-900 dark:text-white' : 'border-transparent text-slate-500')}
          >
            {txt} <span className="num ml-1 text-xs opacity-60">{n}</span>
          </button>
        ))}
      </div>

      {pestana === 'personal' ? (
        empleados.length === 0 ? (
          <EmptyState icono="users" titulo="Sin personal cargado" descripcion="Dá de alta a cada vendedor: se le crea un usuario para iniciar sesión y abrir su turno." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {empleados.map((e) => (
              <article key={e.id} className={cn('surface flex items-center gap-3 p-4', !e.activo && 'opacity-60')}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-militar-500/15 text-sm font-bold text-militar-700 dark:text-militar-300">
                  {e.nombre.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{e.nombre}</div>
                  <div className="truncate text-xs text-slate-500">{e.puesto}{e.telefono ? ` · ${e.telefono}` : ''}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className={cn('badge', e.activo ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 text-slate-500 dark:border-white/15')}>
                      {e.activo ? 'Activo' : 'Inactivo'}
                    </span>
                    {e.user_id ? (
                      <span className="badge border-sky-500/30 font-mono normal-case text-sky-700 dark:text-sky-300" title="Usuario para iniciar sesión">
                        {e.usuario}
                      </span>
                    ) : (
                      <span className="badge border-amber-500/30 text-amber-700 dark:text-amber-300">Sin acceso</span>
                    )}
                  </div>
                  {e.activo && (
                    <button
                      type="button"
                      onClick={() => setAcceso({ empleado: e, modo: e.user_id ? 'resetear' : 'crear' })}
                      className="mt-1.5 text-xs font-semibold text-militar-700 hover:underline dark:text-militar-400"
                    >
                      {e.user_id ? 'Resetear contraseña' : 'Crear acceso'}
                    </button>
                  )}
                </div>
                <button type="button" onClick={() => { setEditando(e); setModal('empleado'); }} className="btn-ghost btn-icon h-8 w-8" aria-label={`Editar ${e.nombre}`}>
                  <Icon name="edit" size={14} />
                </button>
                <button type="button" onClick={() => baja(e)} disabled={ocupado === e.id} className="btn-ghost btn-icon h-8 w-8 text-red-500" aria-label={`Dar de baja a ${e.nombre}`}>
                  <Icon name="trash" size={14} />
                </button>
              </article>
            ))}
          </div>
        )
      ) : turnos.length === 0 ? (
        <EmptyState icono="clock" titulo="Todavía no hay turnos" descripcion="Abrí el primer turno de caja para empezar a vender." />
      ) : (
        <>
        <ul className="space-y-2 md:hidden">
          {turnos.map((t) => {
            const abierto = t.estado === 'abierto';
            const et = etiquetaDesvio(t.diferencia ?? 0);
            return (
              <li key={t.id} className="surface flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{t.cajero_nombre}</span>
                    <span className={cn('num shrink-0 text-sm font-semibold', abierto ? 'text-emerald-600' : et.tono === 'exacto' ? 'text-emerald-600 dark:text-emerald-400' : et.tono === 'sobrante' ? 'text-sky-600 dark:text-sky-400' : 'text-red-600 dark:text-red-400')}>
                      {abierto ? 'En curso' : et.tono === 'exacto' ? 'Exacta' : formatDesvio(t.diferencia ?? 0)}
                    </span>
                  </div>
                  <div className="num mt-0.5 text-xs text-slate-500">
                    {formatFechaHora(t.fecha_apertura)}{abierto ? '' : ` → ${formatFechaHora(t.fecha_cierre)}`}
                  </div>
                  {!abierto && (
                    <div className="num mt-1 text-xs text-slate-600 dark:text-slate-400">
                      {t.cantidad_ventas} ventas · {formatPrecio(t.total_ventas_efectivo + t.total_ventas_digital)}
                    </div>
                  )}
                </div>
                {!abierto && (
                  <button type="button" onClick={() => copiarActa(t)} className="btn-ghost btn-icon -mr-1 -mt-1" aria-label="Copiar acta">
                    <Icon name="copy" size={15} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="surface hidden overflow-x-auto md:block">
          <table className="tabla min-w-[760px]">
            <thead>
              <tr>
                <th>Cajero</th>
                <th>Apertura</th>
                <th>Cierre</th>
                <th className="text-right">Ventas</th>
                <th className="text-right">Recaudado</th>
                <th className="text-right">Resultado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {turnos.map((t) => {
                const abierto = t.estado === 'abierto';
                const et = etiquetaDesvio(t.diferencia ?? 0);
                return (
                  <tr key={t.id}>
                    <td className="font-medium text-slate-900 dark:text-white">{t.cajero_nombre}</td>
                    <td className="num text-xs text-slate-500">{formatFechaHora(t.fecha_apertura)}</td>
                    <td className="num text-xs text-slate-500">{abierto ? <span className="font-semibold text-emerald-600">En curso</span> : formatFechaHora(t.fecha_cierre)}</td>
                    <td className="num text-right">{abierto ? '—' : t.cantidad_ventas}</td>
                    <td className="num text-right">{abierto ? '—' : formatPrecio(t.total_ventas_efectivo + t.total_ventas_digital)}</td>
                    <td className={cn('num text-right font-semibold', abierto ? 'text-slate-400' : et.tono === 'exacto' ? 'text-emerald-600 dark:text-emerald-400' : et.tono === 'sobrante' ? 'text-sky-600 dark:text-sky-400' : 'text-red-600 dark:text-red-400')}>
                      {abierto ? '—' : et.tono === 'exacto' ? 'Exacta' : formatDesvio(t.diferencia ?? 0)}
                    </td>
                    <td className="w-10 text-right">
                      {!abierto && (
                        <button type="button" onClick={() => copiarActa(t)} className="btn-ghost btn-icon h-8 w-8" aria-label="Copiar acta">
                          <Icon name="copy" size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {modal === 'empleado' && (
        <ModalEmpleado
          abierto
          empleado={editando}
          onClose={() => {
            setModal(null);
            router.refresh();
          }}
          onGuardado={(m, tono) => {
            setModal(null);
            toast(m, tono);
            router.refresh();
          }}
        />
      )}
      {acceso && (
        <ModalAccesoEmpleado
          empleado={acceso.empleado}
          modo={acceso.modo}
          onClose={() => {
            setAcceso(null);
            router.refresh();
          }}
          onListo={(m) => {
            setAcceso(null);
            toast(m);
            router.refresh();
          }}
        />
      )}
      {modal === 'apertura' && (
        <ModalAperturaTurno
          abierto
          rol="admin"
          empleados={empleados}
          onClose={() => setModal(null)}
          onTurnoAbierto={(t) => {
            setTurnoAbierto(t);
            setModal(null);
            toast(`Turno abierto para ${t.cajero_nombre}`);
            router.refresh();
          }}
        />
      )}
      {modal === 'arqueo' && (
        <ModalArqueoCiego
          abierto
          turno={turnoAbierto}
          onClose={() => setModal(null)}
          onTurnoCerrado={(t) => {
            setTurnoAbierto(null);
            toast(`Turno cerrado · ${etiquetaDesvio(t.diferencia ?? 0).texto}`, t.diferencia === 0 ? 'exito' : 'alerta');
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
