'use client';

import type { ProductoConVariantes, Variante } from '@/types/database';
import Modal, { ModalBody, ModalHeader } from '@/components/ui/Modal';
import { cn, formatPrecio, precioVariante, rangoPrecios } from '@/lib/utils';
import { colorDot } from '@/lib/config';

type Props = {
  producto: ProductoConVariantes | null;
  enCarrito: (varianteId: string) => number;
  onClose: () => void;
  onElegir: (producto: ProductoConVariantes, variante: Variante) => void;
};

function descripcionPrecio(p: ProductoConVariantes): string {
  const { min, max } = rangoPrecios(p, p.variantes);
  return min === max ? formatPrecio(min) : `${formatPrecio(min)} – ${formatPrecio(max)}`;
}

export default function ModalSelectorVariante({ producto, enCarrito, onClose, onElegir }: Props) {
  return (
    <Modal open={producto !== null} onClose={onClose} size="sm">
      {producto && (
        <>
          <ModalHeader eyebrow="Seleccionar talle / color" titulo={producto.nombre} descripcion={descripcionPrecio(producto)} onClose={onClose} />
          <ModalBody className="space-y-2">
            {producto.variantes.map((v, i) => {
              const libre = v.stock - enCarrito(v.id);
              const sinStock = libre <= 0;
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={sinStock}
                  data-autofocus={i === producto.variantes.findIndex((x) => x.stock - enCarrito(x.id) > 0) ? true : undefined}
                  onClick={() => onElegir(producto, v)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-[background-color,border-color,transform] duration-150 active:scale-[0.99]',
                    sinStock
                      ? 'cursor-not-allowed border-dashed border-slate-200 opacity-50 dark:border-white/10'
                      : 'border-slate-200 hover:border-militar-500/60 hover:bg-militar-500/[0.04] dark:border-white/10'
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: colorDot(v.color) }} />
                    <span>
                      <span className="block text-sm font-semibold text-slate-900 dark:text-white">Talle {v.talle}</span>
                      <span className="text-xs text-slate-500">
                        {v.color} · <span className="num font-semibold text-slate-700 dark:text-slate-300">{formatPrecio(precioVariante(producto, v))}</span>
                      </span>
                    </span>
                  </span>
                  <span className={cn('num rounded-lg px-2 py-1 text-xs font-semibold', sinStock ? 'bg-red-500/10 text-red-600' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')}>
                    {sinStock ? 'Sin stock' : `${libre} disp.`}
                  </span>
                </button>
              );
            })}
          </ModalBody>
        </>
      )}
    </Modal>
  );
}
