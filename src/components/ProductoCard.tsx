'use client';

import { memo } from 'react';
import type { ProductoPublicoConVariantes } from '@/types/database';
import ProductoImagen from './ProductoImagen';
import { calcularStockTotal, formatPrecio, rangoPrecios } from '@/lib/utils';
import { colorDot } from '@/lib/config';

type Props = {
  producto: ProductoPublicoConVariantes;
  index: number;
  onSelect: (p: ProductoPublicoConVariantes) => void;
};

function ProductoCard({ producto, index, onSelect }: Props) {
  const stock = calcularStockTotal(producto.variantes.map((v) => v.stock));
  const agotado = stock === 0;
  const ultimas = !agotado && stock <= 5;
  const talles = Array.from(new Set(producto.variantes.map((v) => v.talle)));
  const colores = Array.from(new Set(producto.variantes.map((v) => v.color)));
  const { min, max } = rangoPrecios(producto, producto.variantes);

  return (
    <article
      className="surface surface-interactive group relative flex animate-fade-up flex-col overflow-hidden hover:-translate-y-0.5 hover:shadow-soft-lg dark:hover:shadow-lift"
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <button
        type="button"
        onClick={() => onSelect(producto)}
        className="absolute inset-0 z-10 rounded-2xl"
        aria-label={`Ver ${producto.nombre}`}
      />

      <div className="relative aspect-[4/3] overflow-hidden border-b border-slate-200/70 bg-white dark:border-white/[0.06] dark:bg-gradient-to-b dark:from-white/[0.97] dark:to-white/[0.9]">
        <ProductoImagen
          src={producto.imagen_url}
          alt={producto.nombre}
          fill
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
          priority={index < 2}
          className="object-contain p-4 transition-transform duration-500 ease-out will-change-transform group-hover:scale-105 sm:p-6"
          fallbackClassName="dark:bg-ink-850"
        />
        <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2 sm:inset-x-3 sm:top-3">
          {producto.categorias ? <span className="badge-neutral hidden sm:inline-flex">{producto.categorias.nombre}</span> : <span />}
          {producto.exige_credencial && <span className="badge-credencial">Credencial</span>}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3.5 sm:p-5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug tracking-tight text-slate-900 transition-colors group-hover:text-militar-700 dark:text-white dark:group-hover:text-militar-300 sm:text-base">
          {producto.nombre}
        </h3>
        <p className="mt-1 hidden text-xs leading-relaxed text-slate-500 dark:text-slate-400 sm:block">
          <span className="line-clamp-2">{producto.descripcion || 'Equipamiento táctico de alta calidad para fuerzas de seguridad.'}</span>
        </p>

        <div className="mt-3 hidden flex-wrap items-center gap-1 sm:flex">
          {talles.slice(0, 5).map((t) => (
            <span key={t} className="num rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-white/10 dark:text-slate-400">
              {t}
            </span>
          ))}
          {talles.length > 5 && <span className="num text-[10px] text-slate-400">+{talles.length - 5}</span>}
          <span className="ml-auto flex -space-x-1">
            {colores.slice(0, 4).map((c) => (
              <span
                key={c}
                title={c}
                className="h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm dark:border-ink-900"
                style={{ background: colorDot(c) }}
              />
            ))}
          </span>
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 pt-4">
          <span className="flex flex-col">
            {min !== max && <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Desde</span>}
            <span className="num text-lg font-bold leading-tight text-slate-900 dark:text-white sm:text-2xl">{formatPrecio(min)}</span>
          </span>
          <span
            className={
              agotado
                ? 'flex items-center gap-1.5 text-[11px] font-semibold text-slate-400'
                : ultimas
                ? 'flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400'
                : 'flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400'
            }
          >
            <span
              className={
                agotado
                  ? 'h-1.5 w-1.5 rounded-full bg-slate-400'
                  : ultimas
                  ? 'h-1.5 w-1.5 animate-pulse-dot rounded-full bg-amber-500'
                  : 'h-1.5 w-1.5 rounded-full bg-emerald-500'
              }
            />
            <span className="hidden sm:inline">{agotado ? 'Sin stock' : ultimas ? 'Últimas unidades' : 'En stock'}</span>
            <span className="sm:hidden">{agotado ? 'Agotado' : ultimas ? 'Últimas' : 'Stock'}</span>
          </span>
        </div>
      </div>
    </article>
  );
}

export default memo(ProductoCard);
