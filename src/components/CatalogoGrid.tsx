'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Categoria, ProductoPublicoConVariantes } from '@/types/database';
import ProductoCard from './ProductoCard';
import Icon from './ui/Icon';
import EmptyState from './ui/EmptyState';
import { cn, rangoPrecios } from '@/lib/utils';

/* El modal de detalle se descarga recién al abrir un producto (bundle inicial mínimo). */
const ProductoModal = dynamic(() => import('./ProductoModal'), { ssr: false });

type Orden = 'destacados' | 'precio-asc' | 'precio-desc' | 'nombre-asc';
type FiltroCredencial = 'todos' | 'libre' | 'credencial';

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export default function CatalogoGrid({
  productos,
  categorias,
}: {
  productos: ProductoPublicoConVariantes[];
  categorias: Categoria[];
}) {
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [orden, setOrden] = useState<Orden>('destacados');
  const [credencial, setCredencial] = useState<FiltroCredencial>('todos');
  const [seleccionado, setSeleccionado] = useState<ProductoPublicoConVariantes | null>(null);
  const busquedaDiferida = useDeferredValue(busqueda);

  /* Índice de búsqueda precomputado (sin acentos) una sola vez. */
  const indice = useMemo(
    () =>
      new Map(
        productos.map((p) => [
          p.id,
          normalizar(
            [p.nombre, p.descripcion ?? '', p.categorias?.nombre ?? '', ...p.variantes.flatMap((v) => [v.talle, v.color])].join(' ')
          ),
        ])
      ),
    [productos]
  );

  const filtrados = useMemo(() => {
    const q = normalizar(busquedaDiferida.trim());
    const res = productos.filter(
      (p) =>
        (!categoria || p.categoria_id === categoria) &&
        (credencial === 'todos' || (credencial === 'credencial' ? p.exige_credencial : !p.exige_credencial)) &&
        (!q || q.split(/\s+/).every((t) => indice.get(p.id)?.includes(t)))
    );
    const desde = (p: ProductoPublicoConVariantes) => rangoPrecios(p, p.variantes).min;
    if (orden === 'precio-asc') res.sort((a, b) => desde(a) - desde(b));
    else if (orden === 'precio-desc') res.sort((a, b) => desde(b) - desde(a));
    else if (orden === 'nombre-asc') res.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return res;
  }, [productos, categoria, credencial, busquedaDiferida, orden, indice]);

  const conteo = useMemo(() => {
    const c = new Map<string, number>();
    productos.forEach((p) => p.categoria_id && c.set(p.categoria_id, (c.get(p.categoria_id) ?? 0) + 1));
    return c;
  }, [productos]);

  const hayFiltros = busqueda !== '' || categoria !== null || credencial !== 'todos' || orden !== 'destacados';
  const limpiar = () => {
    setBusqueda('');
    setCategoria(null);
    setCredencial('todos');
    setOrden('destacados');
  };

  return (
    <div>
      {/* ── Barra de filtros sticky ── */}
      <div className="sticky top-16 z-30 -mx-4 mb-8 border-b border-slate-200/70 bg-bone-50/85 px-4 py-3 backdrop-blur-xl dark:border-white/[0.06] dark:bg-ink-950/80 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Buscar productos</span>
              <Icon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                inputMode="search"
                autoComplete="off"
                placeholder="Buscar por producto, talle o color…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="input pl-10"
              />
            </label>
            <div className="flex items-center gap-2">
              <label className="relative">
                <span className="sr-only">Ordenar</span>
                <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className="input w-auto pr-8 font-medium">
                  <option value="destacados">Destacados</option>
                  <option value="precio-asc">Menor precio</option>
                  <option value="precio-desc">Mayor precio</option>
                  <option value="nombre-asc">Nombre A–Z</option>
                </select>
              </label>
              <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold dark:border-white/10 dark:bg-white/[0.03]" role="radiogroup" aria-label="Requisito de credencial">
                {(
                  [
                    ['todos', 'Todos'],
                    ['libre', 'Venta libre'],
                    ['credencial', 'Credencial'],
                  ] as const
                ).map(([valor, texto]) => (
                  <button
                    key={valor}
                    type="button"
                    role="radio"
                    aria-checked={credencial === valor}
                    onClick={() => setCredencial(valor)}
                    className={cn(
                      'h-full whitespace-nowrap rounded-lg px-2.5 transition-[background-color,color] duration-150',
                      credencial === valor
                        ? valor === 'credencial'
                          ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                          : 'bg-slate-900 text-white dark:bg-white dark:text-ink-950'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    )}
                  >
                    {texto}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mask-fade-x -mx-4 flex items-center gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
            <button type="button" onClick={() => setCategoria(null)} className={cn('chip', categoria === null && 'chip-active')}>
              Todas <span className="num opacity-60">{productos.length}</span>
            </button>
            {categorias.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoria(categoria === c.id ? null : c.id)}
                className={cn('chip', categoria === c.id && 'chip-active')}
                aria-pressed={categoria === c.id}
              >
                {c.nombre} <span className="num opacity-60">{conteo.get(c.id) ?? 0}</span>
              </button>
            ))}
            {hayFiltros && (
              <button type="button" onClick={limpiar} className="ml-auto shrink-0 pl-2 text-xs font-semibold text-militar-700 underline-offset-4 hover:underline dark:text-militar-400">
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mb-5 flex items-center justify-between text-xs text-slate-500">
        <p aria-live="polite">
          <span className="num font-semibold text-slate-900 dark:text-white">{filtrados.length}</span> de{' '}
          <span className="num">{productos.length}</span> artículos
        </p>
        <span className="eyebrow hidden text-slate-400 dark:text-slate-600 sm:inline">Precios finales ARS</span>
      </div>

      {filtrados.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
          {filtrados.map((p, i) => (
            <ProductoCard key={p.id} producto={p} index={i} onSelect={setSeleccionado} />
          ))}
        </div>
      ) : (
        <EmptyState
          titulo="No encontramos artículos"
          descripcion="Probá con otro término de búsqueda o quitá algunos filtros."
          accion={
            <button type="button" onClick={limpiar} className="btn-primary">
              Ver todo el catálogo
            </button>
          }
        />
      )}

      {seleccionado && <ProductoModal producto={seleccionado} onClose={() => setSeleccionado(null)} />}
    </div>
  );
}
