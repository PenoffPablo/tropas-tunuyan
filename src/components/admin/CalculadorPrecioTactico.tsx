'use client';

/**
 * Calculadora costo ⇄ margen ⇄ precio con aritmética monetaria exacta
 * (roundCurrency) — sin errores de coma flotante.
 */
import { useState } from 'react';
import { calcularMargen, calcularPrecioDesdeMargen, cn, formatPrecio, parseMonto, roundCurrency } from '@/lib/utils';

export type ValoresPrecio = { costo: string; margen: string; precio: string };

const PRESETS = [25, 35, 50, 75, 100];

export function leerValoresPrecio(v: ValoresPrecio): { costo: number | null; margen: number | null; precio: number | null } {
  return { costo: parseMonto(v.costo || '0'), margen: parseMonto(v.margen || '0', 10_000), precio: parseMonto(v.precio) };
}

export default function CalculadorPrecioTactico({ valores, onChange }: { valores: ValoresPrecio; onChange: (v: ValoresPrecio) => void }) {
  const [modo, setModo] = useState<'auto' | 'manual'>(() => (valores.precio && valores.costo ? 'manual' : 'auto'));
  const { costo, margen, precio } = leerValoresPrecio(valores);

  const cambiarCosto = (txt: string) => {
    const c = parseMonto(txt || '0');
    if (modo === 'auto' && c !== null && c > 0 && margen !== null) {
      onChange({ ...valores, costo: txt, precio: String(calcularPrecioDesdeMargen(c, margen)) });
    } else if (c !== null && c > 0 && precio !== null) {
      onChange({ ...valores, costo: txt, margen: String(calcularMargen(c, precio)) });
    } else {
      onChange({ ...valores, costo: txt });
    }
  };

  const cambiarMargen = (txt: string) => {
    setModo('auto');
    const m = parseMonto(txt || '0', 10_000);
    if (costo !== null && costo > 0 && m !== null) {
      onChange({ ...valores, margen: txt, precio: String(calcularPrecioDesdeMargen(costo, m)) });
    } else {
      onChange({ ...valores, margen: txt });
    }
  };

  const cambiarPrecio = (txt: string) => {
    setModo('manual');
    const p = parseMonto(txt);
    if (costo !== null && costo > 0 && p !== null) {
      onChange({ ...valores, precio: txt, margen: String(Math.max(0, calcularMargen(costo, p))) });
    } else {
      onChange({ ...valores, precio: txt });
    }
  };

  const ganancia = costo !== null && precio !== null ? roundCurrency(precio - costo) : null;

  return (
    <div className="surface-muted space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="label mb-0">Precio y rentabilidad</span>
        <span className="eyebrow text-slate-500 dark:text-slate-500">{modo === 'auto' ? 'Costo + margen' : 'Precio manual'}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="calc-costo" className="label">Costo</label>
          <input
            id="calc-costo"
            inputMode="decimal"
            value={valores.costo}
            onChange={(e) => cambiarCosto(e.target.value)}
            className={cn('input num', costo === null && 'input-error')}
            placeholder="0"
          />
        </div>
        <div>
          <label htmlFor="calc-margen" className="label">Margen %</label>
          <input
            id="calc-margen"
            inputMode="decimal"
            value={valores.margen}
            onChange={(e) => cambiarMargen(e.target.value)}
            className={cn('input num', margen === null && 'input-error')}
            placeholder="40"
          />
        </div>
        <div>
          <label htmlFor="calc-precio" className="label">Precio final *</label>
          <input
            id="calc-precio"
            inputMode="decimal"
            required
            value={valores.precio}
            onChange={(e) => cambiarPrecio(e.target.value)}
            className={cn('input num font-semibold ring-1 ring-militar-500/30', valores.precio !== '' && precio === null && 'input-error')}
            placeholder="0"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <button key={p} type="button" onClick={() => cambiarMargen(String(p))} className={cn('chip num h-7', margen === p && modo === 'auto' && 'chip-active')}>
            +{p}%
          </button>
        ))}
      </div>
      {ganancia !== null && costo !== null && costo > 0 && precio !== null && precio > 0 && (
        <div className={cn('flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium', ganancia >= 0 ? 'bg-militar-500/10 text-militar-800 dark:text-militar-300' : 'bg-red-500/10 text-red-700 dark:text-red-300')}>
          <span>{ganancia >= 0 ? 'Ganancia por unidad' : 'Precio por debajo del costo'}</span>
          <span className="num font-bold">{formatPrecio(ganancia)} · {calcularMargen(costo, precio)}%</span>
        </div>
      )}
    </div>
  );
}
