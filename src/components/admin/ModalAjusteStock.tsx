'use client';

/**
 * Ajuste de stock por variante con la RPC ajustar_stock (delta relativo,
 * atómico, nunca negativo). Permite también agregar y eliminar variantes.
 */
import { useState } from 'react';
import { COLUMNAS_VARIANTE_PANEL, type ProductoConVariantes, type Variante } from '@/types/database';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import { getSupabaseBrowser } from '@/lib/supabase';
import { errorDesdePostgrest } from '@/lib/errores';
import { comoFila } from '@/lib/datos';
import { cn, formatPrecio, mensajeError, nivelStock, parseEnteroNoNegativo, parseMonto } from '@/lib/utils';

type Props = {
  producto: ProductoConVariantes | null;
  onClose: () => void;
  onCambio: (productoId: string, variantes: Variante[]) => void;
};

export default function ModalAjusteStock(props: Props) {
  const { isSubmitting, run } = useSubmitLock();
  return (
    <Modal open={props.producto !== null} onClose={props.onClose} size="md">
      {props.producto && <Contenido {...props} producto={props.producto} isSubmitting={isSubmitting} run={run} />}
    </Modal>
  );
}

function Contenido({
  producto,
  onClose,
  onCambio,
  isSubmitting,
  run,
}: Props & { producto: ProductoConVariantes; isSubmitting: boolean; run: ReturnType<typeof useSubmitLock>['run'] }) {
  const [variantes, setVariantes] = useState(producto.variantes);
  const [error, setError] = useState<string | null>(null);
  const [nueva, setNueva] = useState({ talle: '', color: producto.variantes[0]?.color ?? 'Negro', stock: '0', minimo: '3' });

  const publicar = (vs: Variante[]) => {
    setVariantes(vs);
    onCambio(producto.id, vs);
  };

  const ajustar = (v: Variante, delta: number) => {
    if (delta === 0) return;
    void run(async () => {
      setError(null);
      try {
        const { data, error: err } = await getSupabaseBrowser().rpc('ajustar_stock', { p_variante_id: v.id, p_delta: delta });
        if (err) throw errorDesdePostgrest(err);
        publicar(variantes.map((x) => (x.id === v.id ? { ...x, stock: data } : x)));
      } catch (err) {
        setError(mensajeError(err));
      }
    });
  };

  const fijarMinimo = (v: Variante, texto: string) => {
    const min = parseEnteroNoNegativo(texto);
    if (min === null || min === v.stock_minimo) return;
    void run(async () => {
      try {
        const { error: err } = await getSupabaseBrowser().from('variantes').update({ stock_minimo: min }).eq('id', v.id);
        if (err) throw errorDesdePostgrest(err);
        publicar(variantes.map((x) => (x.id === v.id ? { ...x, stock_minimo: min } : x)));
      } catch (err) {
        setError(mensajeError(err));
      }
    });
  };

  /** Precio propio de la variante; vacío = vuelve a usar el precio del producto. */
  const fijarPrecio = (v: Variante, texto: string) => {
    const limpio = texto.trim();
    const precio = limpio === '' ? null : parseMonto(limpio);
    if (limpio !== '' && precio === null) return setError('Precio inválido: usá un número mayor o igual a 0.');
    if (precio === v.precio) return;
    void run(async () => {
      setError(null);
      try {
        const { error: err } = await getSupabaseBrowser().from('variantes').update({ precio }).eq('id', v.id);
        if (err) throw errorDesdePostgrest(err);
        publicar(variantes.map((x) => (x.id === v.id ? { ...x, precio } : x)));
      } catch (err) {
        setError(mensajeError(err));
      }
    });
  };

  const agregar = (e: React.FormEvent) => {
    e.preventDefault();
    const stock = parseEnteroNoNegativo(nueva.stock);
    const minimo = parseEnteroNoNegativo(nueva.minimo);
    if (!nueva.talle.trim()) return setError('Indicá el talle de la nueva variante.');
    if (stock === null || minimo === null) return setError('Stock y mínimo deben ser enteros ≥ 0.');
    const color = nueva.color.trim() || 'Único';
    if (variantes.some((v) => v.talle.toLowerCase() === nueva.talle.trim().toLowerCase() && v.color.toLowerCase() === color.toLowerCase())) {
      return setError('Esa combinación de talle y color ya existe.');
    }
    void run(async () => {
      setError(null);
      try {
        const { data, error: err } = await getSupabaseBrowser()
          .from('variantes')
          .insert({ producto_id: producto.id, talle: nueva.talle.trim(), color, stock, stock_minimo: minimo })
          .select(COLUMNAS_VARIANTE_PANEL)
          .single();
        if (err) throw errorDesdePostgrest(err);
        const v = comoFila<Omit<Variante, 'costo'>>(data);
        if (v) publicar([...variantes, { ...v, costo: null }]);
        setNueva((n) => ({ ...n, talle: '', stock: '0' }));
      } catch (err) {
        setError(mensajeError(err));
      }
    });
  };

  const eliminar = (v: Variante) => {
    if (!window.confirm(`¿Eliminar la variante T. ${v.talle} / ${v.color}? El historial de ventas se conserva.`)) return;
    void run(async () => {
      setError(null);
      try {
        const { error: err } = await getSupabaseBrowser().from('variantes').delete().eq('id', v.id);
        if (err) throw errorDesdePostgrest(err);
        publicar(variantes.filter((x) => x.id !== v.id));
      } catch (err) {
        setError(mensajeError(err));
      }
    });
  };

  return (
    <>
      <ModalHeader eyebrow="Ajuste de stock" titulo={producto.nombre} descripcion="Los ajustes son relativos y atómicos: nunca pisan ventas simultáneas." onClose={onClose} />
      <ModalBody className="space-y-4">
        <ul className="space-y-2">
          {variantes.map((v) => {
            const nivel = nivelStock(v.stock, v.stock_minimo);
            return (
              <li key={v.id} className="surface-muted flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-[110px] flex-1">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">T. {v.talle} <span className="font-normal text-slate-500">· {v.color}</span></div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <label className="flex items-center gap-1.5">
                      Mín.
                      <input
                        defaultValue={v.stock_minimo}
                        inputMode="numeric"
                        onBlur={(e) => fijarMinimo(v, e.target.value)}
                        className="input num h-7 w-14 rounded-md px-1.5 text-[11px]"
                        aria-label={`Stock mínimo T. ${v.talle}`}
                      />
                    </label>
                    <label className="flex items-center gap-1.5" title="Vacío = usa el precio del producto">
                      Precio
                      <input
                        defaultValue={v.precio ?? ''}
                        inputMode="decimal"
                        placeholder={formatPrecio(producto.precio)}
                        onBlur={(e) => fijarPrecio(v, e.target.value)}
                        className="input num h-7 w-24 rounded-md px-1.5 text-[11px]"
                        aria-label={`Precio propio T. ${v.talle} (vacío = precio del producto)`}
                      />
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {[-5, -1].map((d) => (
                    <button key={d} type="button" disabled={isSubmitting || v.stock + d < 0} onClick={() => ajustar(v, d)} className="btn-secondary btn-sm num w-10 px-0">
                      {d}
                    </button>
                  ))}
                  <span
                    className={cn(
                      'num w-14 text-center text-lg font-bold',
                      nivel === 'agotado' ? 'text-red-600' : nivel === 'bajo' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'
                    )}
                  >
                    {v.stock}
                  </span>
                  {[1, 5].map((d) => (
                    <button key={d} type="button" disabled={isSubmitting} onClick={() => ajustar(v, d)} className="btn-secondary btn-sm num w-10 px-0">
                      +{d}
                    </button>
                  ))}
                  <button type="button" disabled={isSubmitting} onClick={() => eliminar(v)} className="btn-ghost btn-icon ml-1 h-8 w-8 text-red-500" aria-label="Eliminar variante">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </li>
            );
          })}
          {variantes.length === 0 && <li className="text-center text-sm text-slate-500">Sin variantes: agregá al menos una para poder vender.</li>}
        </ul>

        <form onSubmit={agregar} className="rounded-xl border border-dashed border-slate-300 p-3 dark:border-white/10">
          <div className="label">Nueva variante</div>
          <div className="grid grid-cols-[1fr_1.3fr_64px_64px_auto] gap-2">
            <input value={nueva.talle} maxLength={20} onChange={(e) => setNueva({ ...nueva, talle: e.target.value })} className="input h-9" placeholder="Talle" aria-label="Talle" />
            <input value={nueva.color} maxLength={30} onChange={(e) => setNueva({ ...nueva, color: e.target.value })} className="input h-9" placeholder="Color" aria-label="Color" />
            <input value={nueva.stock} inputMode="numeric" onChange={(e) => setNueva({ ...nueva, stock: e.target.value.replace(/\D/g, '').slice(0, 6) })} className="input num h-9" aria-label="Stock inicial" />
            <input value={nueva.minimo} inputMode="numeric" onChange={(e) => setNueva({ ...nueva, minimo: e.target.value.replace(/\D/g, '').slice(0, 6) })} className="input num h-9" aria-label="Stock mínimo" />
            <button type="submit" disabled={isSubmitting} className="btn-primary btn-icon h-9 w-9" aria-label="Agregar variante">
              {isSubmitting ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="plus" size={15} />}
            </button>
          </div>
        </form>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs font-medium text-red-700 dark:text-red-300">
            <Icon name="alert" size={14} className="mt-px shrink-0" /> {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className="btn-primary">Listo</button>
      </ModalFooter>
    </>
  );
}
