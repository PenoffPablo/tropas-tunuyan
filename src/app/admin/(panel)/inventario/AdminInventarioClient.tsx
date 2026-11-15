'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { Categoria, ProductoConVariantes, Variante } from '@/types/database';
import ProductoImagen from '@/components/ProductoImagen';
import Icon from '@/components/ui/Icon';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { getSupabaseBrowser } from '@/lib/supabase';
import { errorDesdePostgrest } from '@/lib/errores';
import { revalidarCatalogo } from '@/lib/actions';
import { copiarAlPortapapeles } from '@/lib/finanzas';
import {
  calcularStockTotal,
  cn,
  costoVariante,
  formatPrecio,
  mensajeError,
  nivelStock,
  precioVariante,
  rangoPrecios,
  roundCurrency,
  sumCurrency,
} from '@/lib/utils';

const ModalProductoForm = dynamic(() => import('@/components/admin/ModalProductoForm'), { ssr: false });
const ModalAjusteStock = dynamic(() => import('@/components/admin/ModalAjusteStock'), { ssr: false });
const ModalGestionCategorias = dynamic(() => import('@/components/admin/ModalGestionCategorias'), { ssr: false });

type Filtro = 'todos' | 'bajo' | 'credencial' | 'inactivos';

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export default function AdminInventarioClient({ productos: productosServidor, categorias: categoriasServidor }: { productos: ProductoConVariantes[]; categorias: Categoria[] }) {
  const router = useRouter();
  const toast = useToast();
  const [productos, setProductos] = useState(productosServidor);
  const [categorias, setCategorias] = useState(categoriasServidor);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [vista, setVista] = useState<'grupos' | 'tabla'>('grupos');
  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<ProductoConVariantes | null>(null);
  const [ajuste, setAjuste] = useState<ProductoConVariantes | null>(null);
  const [categoriasAbierto, setCategoriasAbierto] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => setProductos(productosServidor), [productosServidor]);
  useEffect(() => setCategorias(categoriasServidor), [categoriasServidor]);

  const sincronizar = (mensaje?: string) => {
    if (mensaje) toast(mensaje);
    router.refresh();
    void revalidarCatalogo();
  };

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const variantes = productos.flatMap((p) => p.variantes);
    return {
      articulos: productos.length,
      unidades: calcularStockTotal(variantes.map((v) => v.stock)),
      bajo: variantes.filter((v) => nivelStock(v.stock, v.stock_minimo) !== 'ok').length,
      valorCosto: sumCurrency(productos.flatMap((p) => p.variantes.map((v) => roundCurrency(Math.max(0, v.stock) * costoVariante(p, v))))),
    };
  }, [productos]);

  const porCategoria = useMemo(() => {
    const m = new Map<string, number>();
    productos.forEach((p) => p.categoria_id && m.set(p.categoria_id, (m.get(p.categoria_id) ?? 0) + 1));
    return m;
  }, [productos]);

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return productos.filter((p) => {
      if (categoria && p.categoria_id !== categoria) return false;
      if (filtro === 'bajo' && !p.variantes.some((v) => v.stock <= v.stock_minimo)) return false;
      if (filtro === 'credencial' && !p.exige_credencial) return false;
      if (filtro === 'inactivos' && p.activo) return false;
      if (!q) return true;
      const texto = normalizar([p.nombre, p.descripcion ?? '', p.categorias?.nombre ?? '', ...p.variantes.flatMap((v) => [v.talle, v.color])].join(' '));
      return q.split(/\s+/).every((t) => texto.includes(t));
    });
  }, [productos, busqueda, filtro, categoria]);

  const grupos = useMemo(() => {
    const m = new Map<string, { nombre: string; items: ProductoConVariantes[] }>();
    categorias.forEach((c) => m.set(c.id, { nombre: c.nombre, items: [] }));
    m.set('__sin', { nombre: 'Sin categoría', items: [] });
    filtrados.forEach((p) => (m.get(p.categoria_id ?? '__sin') ?? m.get('__sin'))?.items.push(p));
    return Array.from(m.entries()).filter(([, g]) => g.items.length > 0);
  }, [filtrados, categorias]);

  /* ── Acciones rápidas ── */
  const alternar = async (p: ProductoConVariantes, campo: 'exige_credencial' | 'activo') => {
    if (ocupado) return;
    const nuevo = !p[campo];
    const parche = (valor: boolean) => (campo === 'activo' ? { activo: valor } : { exige_credencial: valor });
    setOcupado(p.id);
    setProductos((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...parche(nuevo) } : x)));
    try {
      const { error } = await getSupabaseBrowser().from('productos').update(parche(nuevo)).eq('id', p.id);
      if (error) throw errorDesdePostgrest(error);
      sincronizar(campo === 'activo' ? (nuevo ? 'Producto visible en catálogo' : 'Producto oculto del catálogo') : `Credencial ${nuevo ? 'requerida' : 'no requerida'}`);
    } catch (err) {
      setProductos((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...parche(!nuevo) } : x)));
      toast(mensajeError(err), 'error');
    } finally {
      setOcupado(null);
    }
  };

  const eliminar = async (p: ProductoConVariantes) => {
    if (ocupado) return;
    if (!window.confirm(`¿Eliminar «${p.nombre}» y todas sus variantes?\n\nSugerencia: si tiene ventas, conviene ocultarlo en lugar de borrarlo.`)) return;
    setOcupado(p.id);
    try {
      const { error } = await getSupabaseBrowser().from('productos').delete().eq('id', p.id);
      if (error) throw errorDesdePostgrest(error);
      setProductos((prev) => prev.filter((x) => x.id !== p.id));
      sincronizar(`«${p.nombre}» eliminado`);
    } catch (err) {
      toast(mensajeError(err), 'error');
    } finally {
      setOcupado(null);
    }
  };

  const copiarReporte = async () => {
    const lineas = [`*INVENTARIO — TROPAS TUNUYÁN* (${new Date().toLocaleDateString('es-AR')})`, `Unidades: ${kpis.unidades} · Artículos: ${kpis.articulos} · Alertas: ${kpis.bajo}`, ''];
    grupos.forEach(([, g]) => {
      lineas.push(`*${g.nombre.toUpperCase()}*`);
      g.items.forEach((p) => lineas.push(`• ${p.nombre}: ${p.variantes.map((v) => `${v.talle}/${v.color}=${v.stock}`).join(' · ') || 'sin variantes'}`));
      lineas.push('');
    });
    toast((await copiarAlPortapapeles(lineas.join('\n'))) ? 'Reporte de stock copiado' : 'No se pudo copiar', 'info');
  };

  const actualizarVariantes = (productoId: string, variantes: Variante[]) => {
    setProductos((prev) => prev.map((p) => (p.id === productoId ? { ...p, variantes } : p)));
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow">Inventario & stock</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">Control de depósito</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copiarReporte} className="btn-secondary btn-sm"><Icon name="copy" size={14} /> Reporte</button>
          <button type="button" onClick={() => setCategoriasAbierto(true)} className="btn-secondary btn-sm"><Icon name="layers" size={14} /> Categorías</button>
          <button type="button" onClick={() => { setEditando(null); setFormAbierto(true); }} className="btn-primary btn-sm"><Icon name="plus" size={14} /> Nuevo producto</button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Artículos" valor={String(kpis.articulos)} icono="box" />
        <Kpi titulo="Unidades en depósito" valor={kpis.unidades.toLocaleString('es-AR')} icono="layers" />
        <Kpi titulo="Variantes en alerta" valor={String(kpis.bajo)} icono="alert" tono={kpis.bajo > 0 ? 'alerta' : undefined} onClick={() => setFiltro('bajo')} />
        <Kpi titulo="Valor a costo" valor={formatPrecio(kpis.valorCosto)} icono="wallet" />
      </div>

      <div className="surface space-y-3 p-3 sm:p-4">
        <div className="flex flex-col gap-2 md:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Buscar</span>
            <Icon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto, talle, color…" className="input pl-10" />
          </label>
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {(
              [
                ['todos', 'Todos'],
                ['bajo', 'Stock bajo'],
                ['credencial', 'Credencial'],
                ['inactivos', 'Ocultos'],
              ] as const
            ).map(([v, t]) => (
              <button key={v} type="button" onClick={() => setFiltro(v)} className={cn('chip h-10 rounded-xl', filtro === v && 'chip-active')}>
                {t}
              </button>
            ))}
            <div className="flex h-10 rounded-xl border border-slate-200 p-1 dark:border-white/10">
              {(['grupos', 'tabla'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVista(v)}
                  className={cn('flex h-8 w-8 items-center justify-center rounded-lg transition-colors', vista === v ? 'bg-slate-900 text-white dark:bg-white dark:text-ink-950' : 'text-slate-500')}
                  aria-label={v === 'grupos' ? 'Vista agrupada' : 'Vista de tabla'}
                  aria-pressed={vista === v}
                >
                  <Icon name={v === 'grupos' ? 'grid' : 'list'} size={15} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mask-fade-x -mx-3 flex gap-1.5 overflow-x-auto px-3 scrollbar-none sm:-mx-4 sm:px-4">
          <button type="button" onClick={() => setCategoria(null)} className={cn('chip', !categoria && 'chip-active')}>Todas</button>
          {categorias.map((c) => (
            <button key={c.id} type="button" onClick={() => setCategoria(categoria === c.id ? null : c.id)} className={cn('chip', categoria === c.id && 'chip-active')}>
              {c.nombre} <span className="num opacity-60">{porCategoria.get(c.id) ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {filtrados.length === 0 ? (
        <EmptyState icono="box" titulo="Sin productos para mostrar" descripcion="Ajustá los filtros o cargá un producto nuevo." />
      ) : vista === 'tabla' ? (
        <div className="surface overflow-x-auto">
          <table className="tabla min-w-[760px]">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th className="text-right">Costo</th>
                <th className="text-right">Precio</th>
                <th className="text-right">Stock</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <FilaTabla key={p.id} p={p} ocupado={ocupado === p.id} onEditar={() => { setEditando(p); setFormAbierto(true); }} onStock={() => setAjuste(p)} onAlternar={alternar} onEliminar={eliminar} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-8">
          {grupos.map(([id, g]) => (
            <section key={id}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                {g.nombre}
                <span className="num rounded-full bg-slate-200/70 px-2 text-[11px] text-slate-600 dark:bg-white/[0.06] dark:text-slate-400">{g.items.length}</span>
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {g.items.map((p) => (
                  <TarjetaInventario key={p.id} p={p} ocupado={ocupado === p.id} onEditar={() => { setEditando(p); setFormAbierto(true); }} onStock={() => setAjuste(p)} onAlternar={alternar} onEliminar={eliminar} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {formAbierto && (
        <ModalProductoForm
          abierto={formAbierto}
          onClose={() => setFormAbierto(false)}
          producto={editando}
          categorias={categorias}
          onGuardado={(m) => {
            setFormAbierto(false);
            sincronizar(m);
          }}
        />
      )}
      {ajuste && (
        <ModalAjusteStock
          producto={ajuste}
          onClose={() => {
            setAjuste(null);
            sincronizar();
          }}
          onCambio={actualizarVariantes}
        />
      )}
      {categoriasAbierto && (
        <ModalGestionCategorias
          abierto={categoriasAbierto}
          onClose={() => setCategoriasAbierto(false)}
          categorias={categorias}
          productosPorCategoria={porCategoria}
          onCambio={(cs, m) => {
            setCategorias(cs);
            sincronizar(m);
          }}
        />
      )}
    </div>
  );
}

type AccionesProducto = {
  p: ProductoConVariantes;
  ocupado: boolean;
  onEditar: () => void;
  onStock: () => void;
  onAlternar: (p: ProductoConVariantes, campo: 'exige_credencial' | 'activo') => void;
  onEliminar: (p: ProductoConVariantes) => void;
};

/** "$ 38.500" o "$ 38.500 – $ 41.000" si alguna variante tiene precio propio. */
function textoPrecio(p: ProductoConVariantes): string {
  const { min, max } = rangoPrecios(p, p.variantes);
  return min === max ? formatPrecio(min) : `${formatPrecio(min)} – ${formatPrecio(max)}`;
}

function TarjetaInventario({ p, ocupado, onEditar, onStock, onAlternar, onEliminar }: AccionesProducto) {
  const stock = calcularStockTotal(p.variantes.map((v) => v.stock));
  return (
    <article className={cn('surface surface-interactive flex flex-col overflow-hidden', !p.activo && 'opacity-60')}>
      <div className="flex gap-3 p-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10">
          <ProductoImagen src={p.imagen_url} alt={p.nombre} fill sizes="64px" className="object-contain p-1.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-white">{p.nombre}</h3>
            {!p.activo && <span className="badge border-slate-300 text-slate-500 dark:border-white/15">Oculto</span>}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="num text-base font-bold text-slate-900 dark:text-white">{textoPrecio(p)}</span>
            {p.costo > 0 && <span className="num text-[11px] text-slate-500">costo {formatPrecio(p.costo)}</span>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 px-4 pb-3">
        {p.variantes.map((v) => {
          const n = nivelStock(v.stock, v.stock_minimo);
          return (
            <span
              key={v.id}
              title={`${v.color} · ${formatPrecio(precioVariante(p, v))} · mínimo ${v.stock_minimo}`}
              className={cn(
                'num rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                n === 'agotado' ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300' : n === 'bajo' ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300' : 'border-slate-200 text-slate-600 dark:border-white/10 dark:text-slate-400'
              )}
            >
              {v.talle}:{v.stock}
            </span>
          );
        })}
        {p.variantes.length === 0 && <span className="text-[11px] text-red-500">Sin variantes</span>}
      </div>
      <div className="mt-auto flex items-center gap-1 border-t border-slate-200/70 px-2 py-1.5 dark:border-white/[0.06]">
        <span className="num px-2 text-xs text-slate-500">{stock} u.</span>
        <button type="button" onClick={() => onAlternar(p, 'exige_credencial')} disabled={ocupado} className={cn('btn-ghost btn-sm', p.exige_credencial && 'text-red-600 dark:text-red-400')} title="Requisito de credencial">
          <Icon name="shield" size={14} />
        </button>
        <button type="button" onClick={() => onAlternar(p, 'activo')} disabled={ocupado} className="btn-ghost btn-sm" title={p.activo ? 'Ocultar del catálogo' : 'Mostrar en catálogo'}>
          <Icon name={p.activo ? 'eye' : 'eyeOff'} size={14} />
        </button>
        <span className="flex-1" />
        <button type="button" onClick={onStock} className="btn-ghost btn-sm"><Icon name="layers" size={14} /> Stock</button>
        <button type="button" onClick={onEditar} className="btn-ghost btn-sm" aria-label={`Editar ${p.nombre}`}><Icon name="edit" size={14} /></button>
        <button type="button" onClick={() => onEliminar(p)} disabled={ocupado} className="btn-ghost btn-sm text-red-500" aria-label={`Eliminar ${p.nombre}`}><Icon name="trash" size={14} /></button>
      </div>
    </article>
  );
}

function FilaTabla({ p, ocupado, onEditar, onStock, onAlternar, onEliminar }: AccionesProducto) {
  const stock = calcularStockTotal(p.variantes.map((v) => v.stock));
  const alerta = p.variantes.some((v) => v.stock <= v.stock_minimo);
  return (
    <tr className={cn(!p.activo && 'opacity-60')}>
      <td>
        <div className="flex items-center gap-3">
          <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/10">
            <ProductoImagen src={p.imagen_url} alt="" fill sizes="36px" className="object-contain p-1" />
          </span>
          <span className="font-medium text-slate-900 dark:text-white">{p.nombre}</span>
          {p.exige_credencial && <span className="badge-credencial">Cred.</span>}
        </div>
      </td>
      <td className="text-slate-500">{p.categorias?.nombre ?? '—'}</td>
      <td className="num text-right text-slate-500">{formatPrecio(p.costo)}</td>
      <td className="num whitespace-nowrap text-right font-semibold">{textoPrecio(p)}</td>
      <td className={cn('num text-right font-semibold', alerta && 'text-amber-600 dark:text-amber-400')}>{stock}</td>
      <td className="text-xs">{p.activo ? 'Visible' : 'Oculto'}</td>
      <td>
        <div className="flex justify-end gap-0.5">
          <button type="button" onClick={onStock} className="btn-ghost btn-icon h-8 w-8" aria-label="Stock"><Icon name="layers" size={14} /></button>
          <button type="button" onClick={() => onAlternar(p, 'activo')} disabled={ocupado} className="btn-ghost btn-icon h-8 w-8" aria-label="Visibilidad"><Icon name={p.activo ? 'eye' : 'eyeOff'} size={14} /></button>
          <button type="button" onClick={onEditar} className="btn-ghost btn-icon h-8 w-8" aria-label="Editar"><Icon name="edit" size={14} /></button>
          <button type="button" onClick={() => onEliminar(p)} disabled={ocupado} className="btn-ghost btn-icon h-8 w-8 text-red-500" aria-label="Eliminar"><Icon name="trash" size={14} /></button>
        </div>
      </td>
    </tr>
  );
}

function Kpi({ titulo, valor, icono, tono, onClick }: { titulo: string; valor: string; icono: 'box' | 'layers' | 'alert' | 'wallet'; tono?: 'alerta'; onClick?: () => void }) {
  const contenido = (
    <>
      <div className="flex items-center justify-between text-slate-400">
        <span className="label mb-0">{titulo}</span>
        <Icon name={icono} size={16} className={tono === 'alerta' ? 'text-amber-500' : undefined} />
      </div>
      <div className={cn('num mt-2 text-xl font-bold sm:text-2xl', tono === 'alerta' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white')}>{valor}</div>
    </>
  );
  const clase = cn('surface p-4 text-left', onClick && 'surface-interactive', tono === 'alerta' && 'border-amber-500/30');
  return onClick ? (
    <button type="button" onClick={onClick} className={clase}>{contenido}</button>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}
