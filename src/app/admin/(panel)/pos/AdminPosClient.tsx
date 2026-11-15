'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type {
  Categoria,
  CredencialVenta,
  Empleado,
  ProductoConVariantes,
  TurnoCaja,
  Variante,
  VentaConDetalles,
  VentaItemCarrito,
} from '@/types/database';
import ProductoImagen from '@/components/ProductoImagen';
import Icon from '@/components/ui/Icon';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import ModalSelectorVariante from '@/components/admin/ModalSelectorVariante';
import ModalVerificacionCredencial from '@/components/admin/ModalVerificacionCredencial';
import ModalCobroTactico from '@/components/admin/ModalCobroTactico';
import ModalAperturaTurno from '@/components/admin/ModalAperturaTurno';
import { procesarVentaPos, type DatosCobro } from '@/lib/finanzas';
import { ErrorOperacion } from '@/lib/errores';
import { revalidarCatalogo } from '@/lib/actions';
import {
  calcularStockTotal,
  cn,
  formatPrecio,
  mensajeError,
  multiplyCurrency,
  nuevoUuid,
  parseCantidad,
  precioVariante,
  rangoPrecios,
  sumCurrency,
} from '@/lib/utils';

/* Modales pesados o de uso eventual: se descargan bajo demanda. */
const ModalTicketVenta = dynamic(() => import('@/components/admin/ModalTicketVenta'), { ssr: false });
const ModalArqueoCiego = dynamic(() => import('@/components/admin/ModalArqueoCiego'), { ssr: false });

type Props = {
  productos: ProductoConVariantes[];
  categorias: Categoria[];
  turnoInicial: TurnoCaja | null;
  empleados: Empleado[];
};

type ModalActivo = 'variante' | 'credencial' | 'cobro' | 'apertura' | 'arqueo' | 'ticket' | null;

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export default function AdminPosClient({ productos: productosServidor, categorias, turnoInicial, empleados }: Props) {
  const router = useRouter();
  const toast = useToast();

  const [productos, setProductos] = useState(productosServidor);
  const [turno, setTurno] = useState<TurnoCaja | null>(turnoInicial);
  const [carrito, setCarrito] = useState<VentaItemCarrito[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [vista, setVista] = useState<'catalogo' | 'carrito'>('catalogo');
  const [modal, setModal] = useState<ModalActivo>(null);
  const [productoVariante, setProductoVariante] = useState<ProductoConVariantes | null>(null);
  const [credencial, setCredencial] = useState<CredencialVenta | null>(null);
  const [venta, setVenta] = useState<VentaConDetalles | null>(null);
  const busquedaRef = useRef<HTMLInputElement>(null);
  const idempotencyRef = useRef<string | null>(null);

  /* ── Sincronización con datos frescos del servidor (router.refresh) ── */
  useEffect(() => setProductos(productosServidor), [productosServidor]);
  useEffect(() => setTurno(turnoInicial), [turnoInicial]);

  /* Reconciliación del carrito si cambió precio/stock/catálogo en la base. */
  useEffect(() => {
    const variantes = new Map<string, { p: ProductoConVariantes; v: Variante }>();
    productos.forEach((p) => p.variantes.forEach((v) => variantes.set(v.id, { p, v })));
    setCarrito((prev) => {
      let cambios = false;
      const next: VentaItemCarrito[] = [];
      for (const it of prev) {
        const ref = variantes.get(it.variante_id);
        if (!ref || ref.v.stock <= 0) {
          cambios = true;
          continue;
        }
        const cantidad = Math.min(it.cantidad, ref.v.stock);
        const precio = precioVariante(ref.p, ref.v);
        if (cantidad !== it.cantidad || precio !== it.precio || ref.v.stock !== it.stock_disponible || ref.p.exige_credencial !== it.exige_credencial) {
          cambios = true;
        }
        next.push({ ...it, cantidad, precio, stock_disponible: ref.v.stock, exige_credencial: ref.p.exige_credencial });
      }
      if (cambios && prev.length > 0) {
        queueMicrotask(() => toast('El carrito se actualizó con precios y stock vigentes.', 'alerta'));
      }
      return cambios ? next : prev;
    });
  }, [productos, toast]);

  /* ── Derivados ── */
  const indice = useMemo(
    () =>
      new Map(
        productos.map((p) => [
          p.id,
          normalizar(
            [p.nombre, p.descripcion ?? '', ...p.etiquetas, ...p.variantes.flatMap((v) => [v.talle, v.color, v.sku ?? '', v.codigo_barras ?? ''])].join(' ')
          ),
        ])
      ),
    [productos]
  );

  /* Lector de código de barras / SKU: coincidencia exacta con una variante. */
  const porCodigo = useMemo(() => {
    const m = new Map<string, { p: ProductoConVariantes; v: Variante }>();
    productos.forEach((p) =>
      p.variantes.forEach((v) => {
        if (v.codigo_barras) m.set(v.codigo_barras.trim().toLowerCase(), { p, v });
        if (v.sku) m.set(v.sku.trim().toLowerCase(), { p, v });
      })
    );
    return m;
  }, [productos]);

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return productos.filter(
      (p) => (!categoria || p.categoria_id === categoria) && (!q || q.split(/\s+/).every((t) => indice.get(p.id)?.includes(t)))
    );
  }, [productos, categoria, busqueda, indice]);

  const enCarrito = useCallback((varianteId: string) => carrito.find((i) => i.variante_id === varianteId)?.cantidad ?? 0, [carrito]);
  const unidades = carrito.reduce((s, i) => s + i.cantidad, 0);
  const total = sumCurrency(carrito.map((i) => multiplyCurrency(i.precio, i.cantidad)));
  const restringidos = carrito.filter((i) => i.exige_credencial);
  const exigeCredencial = restringidos.length > 0;
  const operador = turno?.empleado_id ? { id: turno.empleado_id, nombre: turno.cajero_nombre } : null;

  /* Si ya no hay artículos restringidos, la acreditación previa no aplica. */
  useEffect(() => {
    if (!exigeCredencial && credencial) setCredencial(null);
  }, [exigeCredencial, credencial]);

  /* La clave de idempotencia identifica "este carrito + este intento de cobro". */
  useEffect(() => {
    idempotencyRef.current = null;
  }, [carrito]);

  /* ── Carrito ── */
  const agregar = useCallback(
    (p: ProductoConVariantes, v: Variante) => {
      const actual = carrito.find((i) => i.variante_id === v.id)?.cantidad ?? 0;
      if (actual + 1 > v.stock) {
        toast(v.stock <= 0 ? `Sin stock: ${p.nombre} (${v.talle})` : `Stock máximo alcanzado (${v.stock} u.)`, 'alerta');
        return;
      }
      setCarrito((prev) =>
        prev.some((i) => i.variante_id === v.id)
          ? prev.map((i) => (i.variante_id === v.id ? { ...i, cantidad: i.cantidad + 1 } : i))
          : [
              ...prev,
              {
                variante_id: v.id,
                producto_id: p.id,
                nombre: p.nombre,
                talle: v.talle,
                color: v.color,
                precio: precioVariante(p, v),
                cantidad: 1,
                exige_credencial: p.exige_credencial,
                imagen_url: p.imagen_url,
                stock_disponible: v.stock,
              },
            ]
      );
      setProductoVariante(null);
      setModal(null);
      toast(`${p.nombre} · T. ${v.talle} agregado`, 'exito');
    },
    [carrito, toast]
  );

  const elegirProducto = useCallback(
    (p: ProductoConVariantes) => {
      const conStock = p.variantes.filter((v) => v.stock > 0);
      if (conStock.length === 0) {
        toast('Producto sin stock disponible', 'alerta');
        return;
      }
      if (p.variantes.length === 1) {
        agregar(p, p.variantes[0]);
        return;
      }
      setProductoVariante(p);
      setModal('variante');
    },
    [agregar, toast]
  );

  const fijarCantidad = (varianteId: string, entrada: string | number) => {
    const item = carrito.find((i) => i.variante_id === varianteId);
    if (!item) return;
    const cantidad = parseCantidad(entrada);
    if (cantidad === null) {
      toast('Cantidad inválida: usá un número entero mayor a 0.', 'alerta');
      return;
    }
    if (cantidad > item.stock_disponible) {
      toast(`Solo hay ${item.stock_disponible} u. disponibles`, 'alerta');
    }
    const final = Math.min(cantidad, item.stock_disponible);
    setCarrito((prev) => prev.map((i) => (i.variante_id === varianteId ? { ...i, cantidad: final } : i)));
  };

  const quitar = (varianteId: string) => setCarrito((prev) => prev.filter((i) => i.variante_id !== varianteId));

  const vaciar = () => {
    if (carrito.length === 0) return;
    if (window.confirm('¿Vaciar el carrito y cancelar la venta actual?')) {
      setCarrito([]);
      setCredencial(null);
    }
  };

  /* ── Flujo de cobro ── */
  const iniciarCobro = useCallback(() => {
    if (carrito.length === 0) return toast('Agregá productos para cobrar.', 'alerta');
    if (!turno) {
      toast('Abrí el turno de caja antes de cobrar.', 'alerta');
      return setModal('apertura');
    }
    if (exigeCredencial && !credencial) return setModal('credencial');
    setModal('cobro');
  }, [carrito.length, turno, exigeCredencial, credencial, toast]);

  const confirmarVenta = async (cobro: DatosCobro): Promise<string | null> => {
    if (!turno) return 'No hay turno abierto.';
    if (!idempotencyRef.current) idempotencyRef.current = nuevoUuid();
    try {
      const registrada = await procesarVentaPos({
        turnoId: turno.id,
        items: carrito,
        cobro,
        credencial: exigeCredencial ? credencial : null,
        totalEsperado: total,
        idempotencyKey: idempotencyRef.current,
      });
      // Stock local inmediato (el refresh del servidor lo confirma).
      const vendidos = new Map(registrada.detalles.map((d) => [d.variante_id, d.cantidad]));
      if (!registrada.reintento) {
        setProductos((prev) =>
          prev.map((p) => ({ ...p, variantes: p.variantes.map((v) => (vendidos.has(v.id) ? { ...v, stock: Math.max(0, v.stock - (vendidos.get(v.id) ?? 0)) } : v)) }))
        );
      }
      setCarrito([]);
      setCredencial(null);
      idempotencyRef.current = null;
      setVenta(registrada);
      setModal('ticket');
      router.refresh();
      void revalidarCatalogo();
      return null;
    } catch (err) {
      if (err instanceof ErrorOperacion) {
        switch (err.codigo) {
          case 'STOCK_INSUFICIENTE':
          case 'CATALOGO_DESACTUALIZADO':
          case 'TOTAL_DESACTUALIZADO':
            router.refresh();
            break;
          case 'TURNO_CERRADO':
            setTurno(null);
            setModal(null);
            router.refresh();
            toast(err.message, 'error');
            return null;
          case 'PIN_INVALIDO':
          case 'PIN_BLOQUEADO':
          case 'CREDENCIAL_REQUERIDA':
            setCredencial(null);
            setModal('credencial');
            toast(err.message, 'error');
            return null;
        }
      }
      return mensajeError(err);
    }
  };

  const nuevaVenta = () => {
    setVenta(null);
    setModal(null);
    setVista('catalogo');
    requestAnimationFrame(() => busquedaRef.current?.focus());
  };

  /* ── Atajos de teclado: F2 buscar · F4 cobrar · Esc lo maneja cada modal ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modal !== null) return;
      if (e.key === 'F2') {
        e.preventDefault();
        setVista('catalogo');
        busquedaRef.current?.focus();
        busquedaRef.current?.select();
      } else if (e.key === 'F4' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        iniciarCobro();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, iniciarCobro]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-3 sm:p-5 lg:p-6">
      {/* ── Barra de estado ── */}
      <div className="surface flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="eyebrow flex items-center gap-2">
            <span className={cn('h-1.5 w-1.5 rounded-full', turno ? 'animate-pulse-dot bg-emerald-500' : 'bg-slate-400')} />
            Punto de venta · Caja principal
          </div>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">Mostrador</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {turno ? (
            <>
              <div className="mr-1 text-right">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{turno.cajero_nombre}</div>
                <div className="num text-[11px] text-slate-500">Fondo {formatPrecio(turno.monto_apertura)}</div>
              </div>
              <button type="button" onClick={() => setModal('arqueo')} className="btn-warning btn-sm">
                <Icon name="lock" size={14} /> Arqueo y cierre
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setModal('apertura')} className="btn-primary btn-sm">
              <Icon name="unlock" size={14} /> Abrir turno
            </button>
          )}
          <span className="hidden items-center gap-1.5 text-[11px] text-slate-500 xl:flex">
            <span className="kbd">F2</span> buscar <span className="kbd ml-2">F4</span> cobrar
          </span>
        </div>
      </div>

      {!turno && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          <Icon name="alert" size={17} className="shrink-0" />
          La caja está cerrada. Podés armar el carrito, pero para cobrar hay que abrir un turno con PIN.
        </div>
      )}

      {/* ── Selector móvil ── */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-200/60 p-1 dark:bg-white/[0.04] lg:hidden">
        {(['catalogo', 'carrito'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVista(v)}
            className={cn(
              'flex h-10 items-center justify-center gap-2 rounded-xl text-xs font-semibold transition-[background-color,color] duration-150',
              vista === v ? 'bg-white text-slate-900 shadow-sm dark:bg-ink-850 dark:text-white' : 'text-slate-500'
            )}
          >
            <Icon name={v === 'catalogo' ? 'tag' : 'cart'} size={15} />
            {v === 'catalogo' ? 'Catálogo' : 'Carrito'}
            {v === 'carrito' && unidades > 0 && <span className="num rounded-full bg-emerald-600 px-1.5 text-[10px] text-white">{unidades}</span>}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-12">
        {/* ── Catálogo ── */}
        <section className={cn('space-y-4 lg:col-span-7 xl:col-span-8', vista === 'carrito' && 'hidden lg:block')}>
          <div className="surface space-y-3 p-3 sm:p-4">
            <div className="relative">
              <Icon name="search" size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={busquedaRef}
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => {
                  const codigo = porCodigo.get(busqueda.trim().toLowerCase());
                  if (e.key === 'Enter' && codigo) {
                    e.preventDefault();
                    agregar(codigo.p, codigo.v);
                    setBusqueda('');
                  } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && filtrados.length === 1) {
                    e.preventDefault();
                    elegirProducto(filtrados[0]);
                    setBusqueda('');
                  } else if (e.key === 'Escape' && busqueda) {
                    e.preventDefault();
                    setBusqueda('');
                  }
                }}
                placeholder="Buscar o escanear código…"
                className="input h-12 pl-11 pr-24 text-base"
                autoComplete="off"
                autoFocus
              />
              <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 text-[10px] text-slate-400 sm:flex">
                <span className="kbd">Enter</span> agrega
              </span>
            </div>
            <div className="mask-fade-x -mx-3 flex gap-1.5 overflow-x-auto px-3 scrollbar-none sm:-mx-4 sm:px-4">
              <button type="button" onClick={() => setCategoria(null)} className={cn('chip', categoria === null && 'chip-active')}>
                Todos <span className="num opacity-60">{productos.length}</span>
              </button>
              {categorias.map((c) => (
                <button key={c.id} type="button" onClick={() => setCategoria(c.id)} className={cn('chip', categoria === c.id && 'chip-active')}>
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>

          {filtrados.length === 0 ? (
            <EmptyState titulo="Sin resultados" descripcion="No hay artículos que coincidan con la búsqueda." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filtrados.map((p) => {
                const stock = calcularStockTotal(p.variantes.map((v) => v.stock));
                const agotado = stock === 0;
                const rango = rangoPrecios(p, p.variantes);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={agotado}
                    onClick={() => elegirProducto(p)}
                    className={cn(
                      'surface surface-interactive group flex flex-col overflow-hidden text-left active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45',
                      'transition-[transform,border-color,box-shadow] duration-150'
                    )}
                  >
                    <span className="relative block aspect-square bg-white">
                      <ProductoImagen
                        src={p.imagen_url}
                        alt={p.nombre}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 15vw"
                        className="object-contain p-3 transition-transform duration-500 ease-out group-hover:scale-105"
                      />
                      {p.exige_credencial && <span className="badge-credencial absolute left-2 top-2">Credencial</span>}
                      <span
                        className={cn(
                          'num absolute bottom-2 right-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold',
                          agotado ? 'bg-red-600 text-white' : stock <= 5 ? 'bg-amber-400 text-amber-950' : 'bg-ink-950/80 text-white backdrop-blur'
                        )}
                      >
                        {agotado ? 'Agotado' : `${stock} u.`}
                      </span>
                    </span>
                    <span className="flex flex-1 flex-col p-3">
                      <span className="line-clamp-2 text-xs font-semibold leading-snug text-slate-900 dark:text-white sm:text-sm">{p.nombre}</span>
                      <span className="mt-auto flex items-center justify-between pt-2">
                        <span className="num text-sm font-bold text-militar-700 dark:text-militar-300">
                          {rango.min !== rango.max && <span className="mr-1 text-[10px] font-semibold text-slate-500">desde</span>}
                          {formatPrecio(rango.min)}
                        </span>
                        <span className="text-[10px] text-slate-500">{p.variantes.length} var.</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Carrito ── */}
        <aside className={cn('surface-elevated flex flex-col lg:sticky lg:top-4 lg:col-span-5 lg:max-h-[calc(100dvh-2rem)] xl:col-span-4', vista === 'catalogo' && 'hidden lg:flex')}>
          <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3 dark:border-white/[0.06]">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Icon name="cart" size={16} /> Venta actual
              <span className="num text-xs font-normal text-slate-500">{unidades} u.</span>
            </h2>
            {carrito.length > 0 && (
              <button type="button" onClick={vaciar} className="btn-ghost btn-sm text-red-600 dark:text-red-400">
                <Icon name="trash" size={13} /> Vaciar
              </button>
            )}
          </div>

          <div className="min-h-[160px] flex-1 space-y-2 overflow-y-auto p-3">
            {carrito.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-10 text-center text-slate-400">
                <Icon name="tag" size={26} />
                <p className="mt-3 text-sm">Sin productos cargados</p>
                <p className="mt-1 text-xs">Buscá con <span className="kbd">F2</span> y agregá con Enter.</p>
              </div>
            ) : (
              carrito.map((it) => (
                <div
                  key={it.variante_id}
                  className={cn('animate-fade-up rounded-xl border p-3', it.exige_credencial ? 'border-red-500/25 bg-red-500/[0.04]' : 'border-slate-200/80 dark:border-white/[0.06]')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{it.nombre}</div>
                      <div className="text-[11px] text-slate-500">
                        T. {it.talle} · {it.color} · <span className="num">{formatPrecio(it.precio)}</span>
                        {it.exige_credencial && <span className="ml-1.5 font-semibold text-red-600 dark:text-red-400">· restringido</span>}
                      </div>
                    </div>
                    <button type="button" onClick={() => quitar(it.variante_id)} className="btn-ghost btn-icon h-7 w-7" aria-label={`Quitar ${it.nombre}`}>
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => (it.cantidad <= 1 ? quitar(it.variante_id) : fijarCantidad(it.variante_id, it.cantidad - 1))}
                        className="btn-secondary btn-icon h-8 w-8"
                        aria-label="Restar uno"
                      >
                        <Icon name="minus" size={14} />
                      </button>
                      <CantidadInput valor={it.cantidad} max={it.stock_disponible} onCommit={(v) => fijarCantidad(it.variante_id, v)} />
                      <button
                        type="button"
                        onClick={() => fijarCantidad(it.variante_id, it.cantidad + 1)}
                        disabled={it.cantidad >= it.stock_disponible}
                        className="btn-secondary btn-icon h-8 w-8"
                        aria-label="Sumar uno"
                      >
                        <Icon name="plus" size={14} />
                      </button>
                    </div>
                    <span className="num text-sm font-bold text-slate-900 dark:text-white">{formatPrecio(multiplyCurrency(it.precio, it.cantidad))}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-3 border-t border-slate-200/80 p-4 dark:border-white/[0.06]">
            {exigeCredencial && (
              <button
                type="button"
                onClick={() => (turno ? setModal('credencial') : setModal('apertura'))}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-xs transition-colors',
                  credencial
                    ? 'border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-800 dark:text-emerald-300'
                    : 'border-red-500/30 bg-red-500/[0.06] text-red-800 dark:text-red-300'
                )}
              >
                <Icon name={credencial ? 'shieldCheck' : 'shield'} size={17} className="shrink-0" />
                <span className="flex-1">
                  <strong className="block">{credencial ? 'Credencial acreditada' : 'Requiere credencial habilitante'}</strong>
                  {credencial ? credencial.fuerza_institucion : 'Verificar antes de cobrar'}
                </span>
                <span className="font-semibold underline-offset-2 hover:underline">{credencial ? 'Cambiar' : 'Verificar'}</span>
              </button>
            )}
            <div className="flex items-baseline justify-between">
              <span className="label mb-0">Total</span>
              <span className="num text-3xl font-bold text-slate-900 dark:text-white">{formatPrecio(total)}</span>
            </div>
            <button type="button" onClick={iniciarCobro} disabled={carrito.length === 0} className={cn('btn-lg w-full', exigeCredencial && !credencial ? 'btn-danger' : 'btn-success')}>
              <Icon name={exigeCredencial && !credencial ? 'lock' : 'check'} size={18} />
              {exigeCredencial && !credencial ? 'Verificar credencial y cobrar' : 'Cobrar'}
              <span className="kbd ml-1 hidden border-white/30 bg-white/10 text-white/80 sm:inline-flex">F4</span>
            </button>
          </div>
        </aside>
      </div>

      {/* Barra flotante móvil */}
      {carrito.length > 0 && vista === 'catalogo' && (
        <button
          type="button"
          onClick={() => setVista('carrito')}
          className="fixed inset-x-3 bottom-[76px] z-30 flex animate-toast-in items-center justify-between rounded-2xl border border-white/10 bg-ink-900/95 p-3 text-white shadow-lift backdrop-blur-xl active:scale-[0.99] lg:hidden"
        >
          <span className="flex items-center gap-2.5 text-sm font-semibold">
            <span className="num flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">{unidades}</span>
            Ver carrito
          </span>
          <span className="num text-base font-bold text-emerald-300">{formatPrecio(total)}</span>
        </button>
      )}

      {/* ── Modales ── */}
      <ModalSelectorVariante
        producto={modal === 'variante' ? productoVariante : null}
        enCarrito={enCarrito}
        onClose={() => setModal(null)}
        onElegir={agregar}
      />
      <ModalVerificacionCredencial
        abierto={modal === 'credencial'}
        onClose={() => setModal(null)}
        itemsRestringidos={restringidos}
        operador={operador}
        credencialPrevia={credencial}
        onConfirmar={(c) => {
          setCredencial(c);
          setModal('cobro');
        }}
      />
      <ModalCobroTactico
        abierto={modal === 'cobro'}
        onClose={() => setModal(null)}
        total={total}
        unidades={unidades}
        credencialAcreditada={exigeCredencial ? credencial?.fuerza_institucion ?? null : null}
        onConfirmar={confirmarVenta}
      />
      <ModalAperturaTurno
        abierto={modal === 'apertura'}
        onClose={() => setModal(null)}
        empleados={empleados}
        onTurnoAbierto={(t) => {
          setTurno(t);
          setModal(null);
          toast(`Turno abierto: ${t.cajero_nombre} · fondo ${formatPrecio(t.monto_apertura)}`);
          router.refresh();
        }}
      />
      {modal === 'arqueo' && (
        <ModalArqueoCiego
          abierto={modal === 'arqueo'}
          onClose={() => setModal(null)}
          turno={turno}
          onTurnoCerrado={(t) => {
            setTurno(null);
            setCredencial(null);
            toast(`Turno cerrado · ${t.diferencia === 0 ? 'caja exacta' : `desvío ${formatPrecio(t.diferencia ?? 0)}`}`, t.diferencia === 0 ? 'exito' : 'alerta');
            router.refresh();
          }}
        />
      )}
      {venta && <ModalTicketVenta venta={modal === 'ticket' ? venta : null} onNuevaVenta={nuevaVenta} />}
    </div>
  );
}

/** Input de cantidad: acepta solo enteros; confirma al salir o con Enter. */
function CantidadInput({ valor, max, onCommit }: { valor: number; max: number; onCommit: (v: string) => void }) {
  const [texto, setTexto] = useState(String(valor));
  useEffect(() => setTexto(String(valor)), [valor]);
  const commit = () => {
    if (texto === String(valor)) return;
    if (parseCantidad(texto) === null) setTexto(String(valor));
    onCommit(texto);
  };
  return (
    <input
      value={texto}
      inputMode="numeric"
      onChange={(e) => setTexto(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="input num h-8 w-12 px-1 text-center font-semibold"
      aria-label={`Cantidad (máximo ${max})`}
    />
  );
}
