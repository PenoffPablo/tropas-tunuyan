'use client';

import { useEffect } from 'react';
import Icon from '@/components/ui/Icon';

export default function ErrorPanel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[panel]', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
        <Icon name="alert" size={22} />
      </div>
      <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">No se pudo cargar esta sección</h1>
      <p className="mt-2 text-sm text-slate-500">
        Puede ser un corte de conexión con la base de datos. Tus datos no se modificaron.
      </p>
      <button type="button" onClick={reset} className="btn-primary mt-6">
        <Icon name="refresh" size={16} /> Reintentar
      </button>
    </div>
  );
}
