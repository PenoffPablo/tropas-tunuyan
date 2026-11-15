'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';
import { cn } from '@/lib/utils';

export type TipoToast = 'exito' | 'error' | 'alerta' | 'info';
type ToastItem = { id: number; texto: string; tipo: TipoToast };
type ToastFn = (texto: string, tipo?: TipoToast) => void;

const ToastContext = createContext<ToastFn | null>(null);

const ESTILOS: Record<TipoToast, { clase: string; icono: 'check' | 'alert' | 'info' }> = {
  exito: { clase: 'text-emerald-500', icono: 'check' },
  error: { clase: 'text-red-500', icono: 'alert' },
  alerta: { clase: 'text-amber-500', icono: 'alert' },
  info: { clase: 'text-sky-500', icono: 'info' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const cerrar = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const toast = useCallback<ToastFn>(
    (texto, tipo = 'exito') => {
      const id = ++seq.current;
      setItems((prev) => [...prev.slice(-3), { id, texto, tipo }]);
      timers.current.set(id, setTimeout(() => cerrar(id), tipo === 'error' ? 6000 : 3500));
    },
    [cerrar]
  );

  useEffect(() => {
    const mapa = timers.current;
    return () => mapa.forEach((t) => clearTimeout(t));
  }, []);

  const valor = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={valor}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-3 bottom-20 z-[200] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:items-end lg:bottom-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tipo === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl border border-slate-200/80 bg-white/95 px-4 py-3 text-sm font-medium text-slate-800 shadow-soft-lg backdrop-blur-xl dark:border-white/10 dark:bg-ink-850/95 dark:text-slate-100 dark:shadow-lift"
          >
            <Icon name={ESTILOS[t.tipo].icono} size={18} className={cn('mt-0.5 shrink-0', ESTILOS[t.tipo].clase)} />
            <span className="flex-1 leading-snug">{t.texto}</span>
            <button
              type="button"
              onClick={() => cerrar(t.id)}
              className="-mr-1 rounded-md p-0.5 text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-white"
              aria-label="Cerrar notificación"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}
