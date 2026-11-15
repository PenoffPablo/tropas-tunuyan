import type { ReactNode } from 'react';
import Icon, { type NombreIcono } from './Icon';

export default function EmptyState({
  icono = 'search',
  titulo,
  descripcion,
  accion,
}: {
  icono?: NombreIcono;
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400 dark:border-white/10 dark:bg-white/[0.03]">
        <Icon name={icono} size={20} />
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-white">{titulo}</h3>
      {descripcion && <p className="mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">{descripcion}</p>}
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  );
}
