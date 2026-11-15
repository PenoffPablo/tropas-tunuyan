'use client';

import { useMemo, useState } from 'react';
import type { ProductoPublicoConVariantes } from '@/types/database';
import Modal, { ModalBody } from './ui/Modal';
import Icon from './ui/Icon';
import ProductoImagen from './ProductoImagen';
import { cn, formatPrecio, precioVariante, rangoPrecios } from '@/lib/utils';
import { colorDot, urlWhatsAppTienda } from '@/lib/config';

type Props = { producto: ProductoPublicoConVariantes; onClose: () => void };

/** Quick-view del catálogo (cargado bajo demanda con next/dynamic). */
export default function ProductoModal({ producto, onClose }: Props) {
  return (
    <Modal open onClose={onClose} size="xl" ariaLabel={producto.nombre}>
      <Contenido producto={producto} onClose={onClose} />
    </Modal>
  );
}

function Contenido({ producto, onClose }: Props) {
  const colores = useMemo(() => Array.from(new Set(producto.variantes.map((v) => v.color))), [producto]);
  const colorInicial = useMemo(
    () => producto.variantes.find((v) => v.stock > 0)?.color ?? colores[0] ?? '',
    [producto, colores]
  );
  const [color, setColor] = useState(colorInicial);
  const variantesColor = producto.variantes.filter((v) => v.color === color);
  const [talle, setTalle] = useState(() => (variantesColor.find((v) => v.stock > 0) ?? variantesColor[0])?.talle ?? '');

  const variante = variantesColor.find((v) => v.talle === talle);
  const disponible = (variante?.stock ?? 0) > 0;
  const ultimas = disponible && (variante?.stock ?? 0) <= 5;
  const rango = rangoPrecios(producto, producto.variantes);
  const precio = variante ? precioVariante(producto, variante) : rango.min;

  const elegirColor = (c: string) => {
    setColor(c);
    const vs = producto.variantes.filter((v) => v.color === c);
    setTalle((vs.find((v) => v.stock > 0) ?? vs[0])?.talle ?? '');
  };

  const mensaje =
    `Hola Tropas Tunuyán, quisiera consultar/reservar:\n\n` +
    `• Producto: ${producto.nombre}\n` +
    `• Color: ${color || 'Estándar'}\n` +
    `• Talle: ${talle || 'Único'}\n` +
    `• Precio: ${formatPrecio(precio)}\n` +
    (producto.exige_credencial ? `• Cuento con credencial oficial habilitante.\n` : '') +
    `\n¿Me confirman disponibilidad y retiro en Tunuyán? Gracias.`;

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <button
        type="button"
        onClick={onClose}
        className="btn-secondary btn-icon absolute right-3 top-3 z-20 rounded-full bg-white/90 backdrop-blur dark:bg-ink-900/80"
        aria-label="Cerrar (Esc)"
      >
        <Icon name="x" size={18} />
      </button>

      <div className="relative h-60 shrink-0 bg-white sm:h-72 md:h-auto md:w-1/2">
        <ProductoImagen
          src={producto.imagen_url}
          alt={producto.nombre}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-contain p-6 sm:p-10"
          priority
        />
        {producto.exige_credencial && (
          <span className="badge-credencial absolute left-4 top-4">
            <Icon name="shield" size={11} /> Requiere credencial
          </span>
        )}
      </div>

      <ModalBody className="flex flex-col md:w-1/2 md:py-8">
        {producto.categorias && <div className="eyebrow">{producto.categorias.nombre}</div>}
        <h2 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-3xl">
          {producto.nombre}
        </h2>
        <div className="mt-3 flex items-baseline gap-2">
          {!variante && rango.min !== rango.max && <span className="text-sm font-semibold text-slate-500">Desde</span>}
          <span className="num text-3xl font-bold text-slate-900 dark:text-white">{formatPrecio(precio)}</span>
        </div>
        {producto.descripcion && (
          <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{producto.descripcion}</p>
        )}

        {colores.length > 0 && (
          <fieldset className="mt-6">
            <legend className="label">
              Color: <span className="normal-case tracking-normal text-slate-900 dark:text-white">{color}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {colores.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => elegirColor(c)}
                  aria-pressed={c === color}
                  className={cn('chip', c === color && 'border-militar-500 text-slate-900 ring-2 ring-militar-500/25 dark:text-white')}
                >
                  <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: colorDot(c) }} />
                  {c}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {variantesColor.length > 0 && (
          <fieldset className="mt-5">
            <legend className="label">Talle</legend>
            <div className="flex flex-wrap gap-2">
              {variantesColor.map((v) => {
                const conStock = v.stock > 0;
                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={!conStock}
                    onClick={() => setTalle(v.talle)}
                    aria-pressed={v.talle === talle}
                    className={cn(
                      'num h-10 min-w-[3rem] rounded-xl border px-3 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]',
                      v.talle === talle
                        ? 'border-militar-600 bg-militar-600 text-white'
                        : conStock
                        ? 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-white/10 dark:text-slate-200 dark:hover:border-white/25'
                        : 'cursor-not-allowed border-dashed border-slate-200 text-slate-300 line-through dark:border-white/10 dark:text-slate-600'
                    )}
                  >
                    {v.talle}
                  </button>
                );
              })}
            </div>
            <p
              className={cn(
                'mt-3 flex items-center gap-2 text-xs font-medium',
                !disponible ? 'text-red-600 dark:text-red-400' : ultimas ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full bg-current', ultimas && 'animate-pulse-dot')} />
              {!disponible ? 'Sin stock momentáneo en este talle' : ultimas ? 'Últimas unidades en este talle' : 'En stock para entrega inmediata'}
            </p>
          </fieldset>
        )}

        {producto.exige_credencial && (
          <div className="mt-6 flex gap-3 rounded-xl border border-red-200/70 bg-red-50/70 p-4 text-xs leading-relaxed text-slate-600 dark:border-red-500/20 dark:bg-red-500/[0.06] dark:text-slate-300">
            <Icon name="shieldCheck" size={18} className="shrink-0 text-red-600 dark:text-red-400" />
            Para confirmar este pedido se solicitará tu credencial oficial (Policía, FF.AA., Servicio Penitenciario o seguridad
            privada habilitada).
          </div>
        )}

        <div className="mt-auto pt-6">
          <a
            href={urlWhatsAppTienda(mensaje)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('btn-success btn-lg w-full', !disponible && 'opacity-90')}
          >
            <Icon name="whatsapp" size={18} />
            {disponible ? 'Reservar por WhatsApp' : 'Consultar ingreso por WhatsApp'}
          </a>
          <p className="mt-2 text-center text-[11px] text-slate-500">Se envía el detalle con talle y color seleccionados.</p>
        </div>
      </ModalBody>
    </div>
  );
}
