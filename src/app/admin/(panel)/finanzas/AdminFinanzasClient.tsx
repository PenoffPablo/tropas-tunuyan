'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MetodoCaja, MovimientoCaja, RankingProducto, TurnoCaja } from '@/types/database';
import ProductoImagen from '@/components/ProductoImagen';
import Icon, { type NombreIcono } from '@/components/ui/Icon';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { NOMBRE_METODO_CAJA, copiarAlPortapapeles, desvioPorcentual, eliminarMovimiento, etiquetaDesvio } from '@/lib/finanzas';
import { cn, formatDesvio, formatFechaHora, formatPrecio, mensajeError, roundCurrency, sumCurrency } from '@/lib/utils';

const ModalNuevoMovimiento = dynamic(() => import('@/components/admin/ModalNuevoMovimiento'), { ssr: false });

export type Periodo = 'hoy' | '7d' | 'mes' | 'todo';

const NOMBRE_PERIODO: Record<Periodo, string> = { hoy: 'Hoy', '7d': '7 días', mes: 'Este mes', todo: 'Todo' };

type Props = {
  periodo: Periodo;
  movimientos: MovimientoCaja[];
  turnos: TurnoCaja[];
  ranking: RankingProducto[];
  productos: { id: string; nombre: string; precio: number }[];
  turnoAbierto: TurnoCaja | null;
};

export default function AdminFinanzasClient({ periodo, movimientos: movServidor, turnos, ranking, productos, turnoAbierto }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [movimientos, setMovimientos] = useState(movServidor);
  const [pestana, setPestana] = useState<'libro' | 'turnos'>('libro');
  const [tipo, setTipo] = useState<'todos' | 'ingreso' | 'egreso'>('todos');
  const [metodo, setMetodo] = useState<'todos' | MetodoCaja>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);

  useEffect(() => setMovimientos(movServidor), [movServidor]);

  const kpi = useMemo(() => {
    const ingresos = sumCurrency(movimientos.filter((m) => m.tipo === 'ingreso').map((m) => m.monto));
    const egresos = sumCurrency(movimientos.filter((m) => m.tipo === 'egreso').map((m) => m.monto));
    const porMetodo = (Object.keys(NOMBRE_METODO_CAJA) as MetodoCaja[]).map((k) => ({
      metodo: k,
      monto: sumCurrency(movimientos.filter((m) => m.tipo === 'ingreso' && m.metodo_pago === k).map((m) => m.monto)),
    }));
    const saldo = roundCurrency(ingresos - egresos);
    return { ingresos, egresos, saldo, margen: ingresos > 0 ? roundCurrency((saldo / ingresos) * 100) : 0, porMetodo };
  }, [movimientos]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return movimientos.filter(
      (m) =>
        (tipo === 'todos' || m.tipo === tipo) &&
        (metodo === 'todos' || m.metodo_pago === metodo) &&
        (!q || m.concepto.toLowerCase().includes(q) || m.categoria_caja.toLowerCase().includes(q))
    );
  }, [movimientos, tipo, metodo, busqueda]);

  const auditoria = useMemo(() => {
    const cerrados = turnos.filter((t) => t.estado === 'cerrado');
    const enTolerancia = cerrados.filter((t) => desvioPorcentual(t) <= 0.5).length;
    return {
      cerrados: cerrados.length,
      exactos: cerrados.filter((t) => (t.diferencia ?? 0) === 0).length,
      cumplimiento: cerrados.length ? Math.round((enTolerancia / cerrados.length) * 100) : 100,
      desvioNeto: sumCurrency(cerrados.map((t) => t.diferencia ?? 0)),
    };
  }, [turnos]);

  const maxUnidades = Math.max(1, ...ranking.map((r) => r.unidades));

  const borrar = async (m: MovimientoCaja) => {
    if (borrando) return;
    if (!window.confirm(`¿Anular el movimiento «${m.concepto}» por ${formatPrecio(m.monto)}?`)) return;
    setBorrando(m.id);
    try {
      await eliminarMovimiento(m.id);
      setMovimientos((prev) => prev.filter((x) => x.id !== m.id));
      toast('Movimiento anulado');
      router.refresh();
    } catch (err) {
      toast(mensajeError(err), 'error');
    } finally {
      setBorrando(null);
    }
  };

  const exportarCsv = () => {
    const esc = (v: string | number | null) => {
      const s = v === null ? '' : String(v);
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const num = (n: number | null) => (n === null ? '' : roundCurrency(n).toFixed(2).replace('.', ','));
    const filas: string[] = [
      `TROPAS TUNUYÁN — REPORTE DE CAJA (${NOMBRE_PERIODO[periodo]})`,
      `Emitido;${esc(formatFechaHora(new Date().toISOString()))}`,
      `Ingresos;${num(kpi.ingresos)}`,
      `Egresos;${num(kpi.egresos)}`,
      `Saldo;${num(kpi.saldo)}`,
      '',
      'LIBRO DIARIO',
      'Fecha;Tipo;Concepto;Categoría;Medio;Monto;Origen',
      ...movimientos.map((m) =>
        [formatFechaHora(m.created_at), m.tipo.toUpperCase(), esc(m.concepto), esc(m.categoria_caja), NOMBRE_METODO_CAJA[m.metodo_pago], num(m.monto), m.venta_id ? 'POS' : 'Manual'].join(';')
      ),
      '',
      'AUDITORÍA DE TURNOS (ARQUEO CIEGO)',
      'Cajero;Apertura;Cierre;Fondo;Ventas efectivo;Ventas digitales;Esperado;Declarado;Diferencia;Desvío %;Estado;Observaciones',
      ...turnos.map((t) =>
        [
          esc(t.cajero_nombre),
          formatFechaHora(t.fecha_apertura),
          t.fecha_cierre ? formatFechaHora(t.fecha_cierre) : 'ABIERTO',
          num(t.monto_apertura),
          num(t.total_ventas_efectivo),
          num(t.total_ventas_digital),
          num(t.monto_cierre_esperado),
          num(t.monto_cierre_declarado),
          num(t.diferencia),
          t.estado === 'cerrado' ? num(desvioPorcentual(t)) : '',
          t.estado.toUpperCase(),
          esc(t.observaciones),
        ].join(';')
      ),
    ];
    const blob = new Blob(['﻿' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TropasTunuyan_Caja_${periodo}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    toast('Planilla CSV descargada', 'info');
  };

  const copiarResumen = async () => {
    const texto = [
      `*TROPAS TUNUYÁN — RESUMEN DE CAJA (${NOMBRE_PERIODO[periodo]})*`,
      `Ingresos: ${formatPrecio(kpi.ingresos)}`,
      `Egresos: ${formatPrecio(kpi.egresos)}`,
      `Saldo: ${formatPrecio(kpi.saldo)} (margen ${kpi.margen}%)`,
      '',
      '*Top vendidos:*',
      ...ranking.slice(0, 3).map((r, i) => `${i + 1}. ${r.nombre}: ${r.unidades} u. (${formatPrecio(r.ingresos)})`),
    ].join('\n');
    toast((await copiarAlPortapapeles(texto)) ? 'Resumen copiado' : 'No se pudo copiar', 'info');
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="eyebrow">Caja & finanzas</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">Libro financiero</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 w-full rounded-xl border border-slate-200 p-1 text-xs font-semibold dark:border-white/10 sm:w-auto">
            {(Object.keys(NOMBRE_PERIODO) as Periodo[]).map((p) => (
              <Link
                key={p}
                href={`/admin/finanzas?periodo=${p}`}
                scroll={false}
                className={cn('flex flex-1 items-center justify-center rounded-lg px-3 transition-colors sm:flex-none', periodo === p ? 'bg-slate-900 text-white dark:bg-white dark:text-ink-950' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white')}
              >
                {NOMBRE_PERIODO[p]}
              </Link>
            ))}
          </div>
          <button type="button" onClick={copiarResumen} className="btn-secondary btn-sm"><Icon name="copy" size={14} /> Resumen</button>
          <button type="button" onClick={exportarCsv} className="btn-secondary btn-sm"><Icon name="download" size={14} /> CSV</button>
          <button type="button" onClick={() => setModal(true)} className="btn-primary btn-sm"><Icon name="plus" size={14} /> Movimiento</button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Ingresos" valor={formatPrecio(kpi.ingresos)} icono="trendUp" tono="text-emerald-600 dark:text-emerald-400" />
        <Kpi titulo="Egresos" valor={formatPrecio(kpi.egresos)} icono="trendDown" tono="text-red-600 dark:text-red-400" />
        <Kpi titulo="Saldo" valor={formatPrecio(kpi.saldo)} icono="wallet" tono={kpi.saldo >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-600'} />
        <Kpi titulo="Margen operativo" valor={`${kpi.margen.toLocaleString('es-AR')}%`} icono="scale" tono="text-slate-900 dark:text-white" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="surface min-w-0 p-4 sm:p-5 lg:col-span-2">
          <h2 className="mb-4 flex items-center justify-between text-sm font-semibold text-slate-900 dark:text-white">
            Más vendidos <span className="eyebrow text-slate-500 dark:text-slate-500">{NOMBRE_PERIODO[periodo]}</span>
          </h2>
          {ranking.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Todavía no hay ventas del POS en este período.</p>
          ) : (
            <ol className="space-y-3">
              {ranking.slice(0, 6).map((r, i) => (
                <li key={r.producto_id ?? r.nombre} className="flex items-center gap-3">
                  <span className="num w-5 text-center text-xs font-semibold text-slate-400">{i + 1}</span>
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/10">
                    <ProductoImagen src={r.imagen_url} alt="" fill sizes="36px" className="object-contain p-1" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
                      <span className="min-w-0 truncate text-sm font-medium text-slate-900 dark:text-white">{r.nombre}</span>
                      <span className="num shrink-0 text-xs text-slate-500">
                        {r.unidades} u. · {formatPrecio(r.ingresos)}
                        <span className="ml-1 font-semibold text-emerald-600 dark:text-emerald-400 sm:hidden">· +{formatPrecio(r.ganancia)}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.05]">
                      <div className="h-full origin-left rounded-full bg-gradient-to-r from-militar-600 to-militar-400 transition-transform duration-700 ease-out" style={{ transform: `scaleX(${r.unidades / maxUnidades})` }} />
                    </div>
                  </div>
                  <span className="num hidden w-24 text-right text-xs font-semibold text-emerald-600 dark:text-emerald-400 sm:block">+{formatPrecio(r.ganancia)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="surface min-w-0 p-4 sm:p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Ingresos por medio</h2>
          <ul className="space-y-3">
            {kpi.porMetodo.map((m) => (
              <li key={m.metodo} className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">{NOMBRE_METODO_CAJA[m.metodo]}</span>
                <span className="num font-semibold text-slate-900 dark:text-white">{formatPrecio(m.monto)}</span>
              </li>
            ))}
          </ul>
          {turnoAbierto && (
            <div className="mt-5 rounded-xl bg-emerald-500/[0.07] p-3 text-xs text-emerald-800 dark:text-emerald-300">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-500 align-middle" />
              Turno abierto: {turnoAbierto.cajero_nombre}
            </div>
          )}
        </section>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-white/[0.08]" role="tablist">
        {(
          [
            ['libro', 'Libro diario', movimientos.length],
            ['turnos', 'Auditoría de turnos', turnos.length],
          ] as const
        ).map(([id, txt, n]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pestana === id}
            onClick={() => setPestana(id)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
              pestana === id ? 'border-militar-500 text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            )}
          >
            {txt} <span className="num ml-1 text-xs opacity-60">{n}</span>
          </button>
        ))}
      </div>

      {pestana === 'libro' ? (
        <section className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Buscar</span>
              <Icon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="input pl-10" placeholder="Buscar concepto o categoría…" />
            </label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className="input sm:w-36" aria-label="Tipo">
              <option value="todos">Todos</option>
              <option value="ingreso">Ingresos</option>
              <option value="egreso">Egresos</option>
            </select>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value as typeof metodo)} className="input sm:w-40" aria-label="Medio">
              <option value="todos">Todos los medios</option>
              {(Object.keys(NOMBRE_METODO_CAJA) as MetodoCaja[]).map((m) => (
                <option key={m} value={m}>{NOMBRE_METODO_CAJA[m]}</option>
              ))}
            </select>
          </div>
          {filtrados.length === 0 ? (
            <EmptyState icono="file" titulo="Sin movimientos" descripcion="No hay registros para los filtros y el período elegidos." />
          ) : (
            <>
            <ul className="space-y-2 md:hidden">
              {filtrados.map((m) => (
                <li key={m.id} className="surface flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium leading-snug text-slate-900 dark:text-white">{m.concepto}</span>
                      <span className={cn('num shrink-0 text-sm font-semibold', m.tipo === 'ingreso' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                        {m.tipo === 'ingreso' ? '+' : '−'}
                        {formatPrecio(m.monto)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span className="num">{formatFechaHora(m.created_at)}</span>
                      <span>· {m.categoria_caja}</span>
                      <span>· {NOMBRE_METODO_CAJA[m.metodo_pago] ?? m.metodo_pago}</span>
                      <span className={cn('badge', m.venta_id ? 'border-sky-500/30 text-sky-700 dark:text-sky-300' : 'border-slate-300 text-slate-500 dark:border-white/15')}>
                        {m.venta_id ? 'POS' : 'Manual'}
                      </span>
                    </div>
                  </div>
                  {!m.venta_id && (
                    <button type="button" onClick={() => borrar(m)} disabled={borrando === m.id} className="btn-ghost btn-icon -mr-1 -mt-1 text-red-500" aria-label="Anular movimiento">
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="surface hidden overflow-x-auto md:block">
              <table className="tabla min-w-[720px]">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Concepto</th>
                    <th>Categoría</th>
                    <th>Medio</th>
                    <th className="text-right">Monto</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((m) => (
                    <tr key={m.id}>
                      <td className="num whitespace-nowrap text-xs text-slate-500">{formatFechaHora(m.created_at)}</td>
                      <td>
                        <span className="font-medium text-slate-900 dark:text-white">{m.concepto}</span>
                        <span className={cn('badge ml-2', m.venta_id ? 'border-sky-500/30 text-sky-700 dark:text-sky-300' : 'border-slate-300 text-slate-500 dark:border-white/15')}>
                          {m.venta_id ? 'POS' : 'Manual'}
                        </span>
                      </td>
                      <td className="text-slate-500">{m.categoria_caja}</td>
                      <td className="text-slate-500">{NOMBRE_METODO_CAJA[m.metodo_pago] ?? m.metodo_pago}</td>
                      <td className={cn('num whitespace-nowrap text-right font-semibold', m.tipo === 'ingreso' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                        {m.tipo === 'ingreso' ? '+' : '−'}
                        {formatPrecio(m.monto)}
                      </td>
                      <td className="w-10 text-right">
                        {!m.venta_id && (
                          <button type="button" onClick={() => borrar(m)} disabled={borrando === m.id} className="btn-ghost btn-icon h-8 w-8 text-red-500" aria-label="Anular movimiento">
                            <Icon name="trash" size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi titulo="Turnos cerrados" valor={String(auditoria.cerrados)} icono="clock" tono="text-slate-900 dark:text-white" />
            <Kpi titulo="Cajas exactas" valor={String(auditoria.exactos)} icono="check" tono="text-emerald-600 dark:text-emerald-400" />
            <Kpi titulo="Cumplimiento ≤ 0,5 %" valor={`${auditoria.cumplimiento}%`} icono="shieldCheck" tono={auditoria.cumplimiento >= 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'} />
            <Kpi titulo="Desvío neto" valor={formatDesvio(auditoria.desvioNeto)} icono="scale" tono={auditoria.desvioNeto < 0 ? 'text-red-600' : 'text-slate-900 dark:text-white'} />
          </div>
          {turnos.length === 0 ? (
            <EmptyState icono="clock" titulo="Sin turnos en el período" />
          ) : (
            <>
            <ul className="space-y-2 md:hidden">
              {turnos.map((t) => {
                const abierto = t.estado === 'abierto';
                const et = etiquetaDesvio(t.diferencia ?? 0);
                return (
                  <li key={t.id} className="surface p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-white">{t.cajero_nombre}</span>
                      <span className={cn('num shrink-0 text-sm font-semibold', abierto ? 'text-emerald-600' : et.tono === 'exacto' ? 'text-emerald-600 dark:text-emerald-400' : et.tono === 'sobrante' ? 'text-sky-600 dark:text-sky-400' : 'text-red-600 dark:text-red-400')}>
                        {abierto ? 'Abierto' : `${formatDesvio(t.diferencia ?? 0)} · ${desvioPorcentual(t).toLocaleString('es-AR')}%`}
                      </span>
                    </div>
                    <div className="num mt-0.5 text-xs text-slate-500">
                      {formatFechaHora(t.fecha_apertura)} → {abierto ? 'en curso' : formatFechaHora(t.fecha_cierre)}
                    </div>
                    <dl className="num mt-2 grid grid-cols-3 gap-2 text-xs">
                      {(
                        [
                          ['Fondo', t.monto_apertura],
                          ['Efectivo', abierto ? null : t.total_ventas_efectivo],
                          ['Digital', abierto ? null : t.total_ventas_digital],
                          ['Esperado', abierto ? null : t.monto_cierre_esperado ?? 0],
                          ['Declarado', abierto ? null : t.monto_cierre_declarado ?? 0],
                        ] as const
                      ).map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-[10px] uppercase tracking-wide text-slate-400">{k}</dt>
                          <dd className="font-semibold text-slate-800 dark:text-slate-200">{v === null ? '—' : formatPrecio(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                );
              })}
            </ul>
            <div className="surface hidden overflow-x-auto md:block">
              <table className="tabla min-w-[860px]">
                <thead>
                  <tr>
                    <th>Cajero</th>
                    <th>Apertura → cierre</th>
                    <th className="text-right">Fondo</th>
                    <th className="text-right">Efectivo</th>
                    <th className="text-right">Digital</th>
                    <th className="text-right">Esperado</th>
                    <th className="text-right">Declarado</th>
                    <th className="text-right">Desvío</th>
                  </tr>
                </thead>
                <tbody>
                  {turnos.map((t) => {
                    const abierto = t.estado === 'abierto';
                    const et = etiquetaDesvio(t.diferencia ?? 0);
                    return (
                      <tr key={t.id}>
                        <td className="font-medium text-slate-900 dark:text-white">{t.cajero_nombre}</td>
                        <td className="num whitespace-nowrap text-xs text-slate-500">
                          {formatFechaHora(t.fecha_apertura)} → {abierto ? <span className="font-semibold text-emerald-600">abierto</span> : formatFechaHora(t.fecha_cierre)}
                        </td>
                        <td className="num text-right">{formatPrecio(t.monto_apertura)}</td>
                        <td className="num text-right">{abierto ? '—' : formatPrecio(t.total_ventas_efectivo)}</td>
                        <td className="num text-right">{abierto ? '—' : formatPrecio(t.total_ventas_digital)}</td>
                        <td className="num text-right">{abierto ? '—' : formatPrecio(t.monto_cierre_esperado ?? 0)}</td>
                        <td className="num text-right">{abierto ? '—' : formatPrecio(t.monto_cierre_declarado ?? 0)}</td>
                        <td className={cn('num whitespace-nowrap text-right font-semibold', et.tono === 'exacto' ? 'text-emerald-600 dark:text-emerald-400' : et.tono === 'sobrante' ? 'text-sky-600 dark:text-sky-400' : 'text-red-600 dark:text-red-400')}>
                          {abierto ? '—' : `${formatDesvio(t.diferencia ?? 0)} · ${desvioPorcentual(t).toLocaleString('es-AR')}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </section>
      )}

      {modal && (
        <ModalNuevoMovimiento
          abierto={modal}
          onClose={() => setModal(false)}
          productos={productos}
          turnoAbierto={turnoAbierto}
          onRegistrado={(m) => {
            setMovimientos((prev) => [m, ...prev]);
            setModal(false);
            toast(`${m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} de ${formatPrecio(m.monto)} registrado`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Kpi({ titulo, valor, icono, tono }: { titulo: string; valor: string; icono: NombreIcono; tono: string }) {
  return (
    <div className="surface p-4">
      <div className="flex items-center justify-between text-slate-400">
        <span className="label mb-0">{titulo}</span>
        <Icon name={icono} size={16} />
      </div>
      <div className={cn('num mt-2 truncate text-xl font-bold sm:text-2xl', tono)}>{valor}</div>
    </div>
  );
}
