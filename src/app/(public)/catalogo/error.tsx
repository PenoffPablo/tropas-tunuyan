'use client';

import Icon from '@/components/ui/Icon';

export default function ErrorCatalogo({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <Icon name="alert" size={28} className="mx-auto text-amber-500" />
      <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">No pudimos cargar el catálogo</h1>
      <p className="mt-2 text-sm text-slate-500">Puede ser un problema momentáneo de conexión.</p>
      <button type="button" onClick={reset} className="btn-primary mt-6">
        <Icon name="refresh" size={16} />
        Reintentar
      </button>
    </div>
  );
}
