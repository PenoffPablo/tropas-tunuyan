'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import { getSupabaseBrowser } from '@/lib/supabase';
import { cambiarMiPassword } from '@/lib/cuenta-acciones';
import { LARGO_MINIMO_PASSWORD, problemaPassword } from '@/lib/acceso';
import { useSubmitLock } from '@/hooks/useSubmitLock';

export default function CambiarPasswordForm() {
  const router = useRouter();
  const { isSubmitting, run } = useSubmitLock();
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const problema = problemaPassword(password);
    if (problema) return setError(problema);
    if (password !== password2) return setError('Las contraseñas no coinciden.');
    void run(async () => {
      setError(null);
      try {
        const r = await cambiarMiPassword(password);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        // El navegador toma las cookies con el JWT nuevo que dejó el servidor.
        await getSupabaseBrowser().auth.getSession();
        router.replace(r.destino);
        router.refresh();
      } catch {
        setError('No se pudo conectar con el servidor. Reintentá.');
      }
    });
  };

  const salir = () =>
    void run(async () => {
      await getSupabaseBrowser().auth.signOut();
      router.replace('/admin/login');
      router.refresh();
    });

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
          <Icon name="alert" size={15} className="mt-px shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label htmlFor="pw-nueva" className="label">Nueva contraseña</label>
        <div className="relative">
          <Icon name="lock" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="pw-nueva"
            type={ver ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input h-11 px-9"
            placeholder={`Mínimo ${LARGO_MINIMO_PASSWORD} caracteres`}
            data-autofocus
          />
          <button
            type="button"
            onClick={() => setVer((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            <Icon name={ver ? 'eyeOff' : 'eye'} size={15} />
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="pw-repetir" className="label">Repetir contraseña</label>
        <div className="relative">
          <Icon name="lock" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="pw-repetir"
            type={ver ? 'text' : 'password'}
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            className="input h-11 pl-9"
          />
        </div>
      </div>

      <button type="submit" disabled={isSubmitting || !password || !password2} className="btn-primary btn-lg w-full">
        {isSubmitting ? <Spinner /> : <Icon name="check" size={16} />}
        {isSubmitting ? 'Guardando…' : 'Guardar y continuar'}
      </button>
      <button type="button" onClick={salir} disabled={isSubmitting} className="btn-ghost btn-sm w-full">
        <Icon name="logout" size={15} /> Salir
      </button>
    </form>
  );
}
