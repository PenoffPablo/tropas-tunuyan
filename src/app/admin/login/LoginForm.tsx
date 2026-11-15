'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import { getSupabaseBrowser } from '@/lib/supabase';
import { destinoSeguro, esRolValido } from '@/lib/auth-shared';
import { useSubmitLock } from '@/hooks/useSubmitLock';

const ERRORES: Record<string, string> = {
  'sin-rol': 'Tu usuario no tiene un rol asignado en el panel. Contactá al administrador.',
};

export default function LoginForm({ next, errorInicial }: { next: string | null; errorInicial: string | null }) {
  const router = useRouter();
  const { isSubmitting, run } = useSubmitLock();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState<string | null>(errorInicial ? ERRORES[errorInicial] ?? null : null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setError(null);
      const supabase = getSupabaseBrowser();
      const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err || !data.user) {
        setError(
          err?.status === 429
            ? 'Demasiados intentos. Esperá unos minutos antes de reintentar.'
            : 'Credenciales inválidas. Verificá tu correo y contraseña.'
        );
        setPassword('');
        return;
      }
      const rol = data.user.app_metadata?.rol;
      if (!esRolValido(rol)) {
        await supabase.auth.signOut();
        setError(ERRORES['sin-rol']);
        return;
      }
      router.replace(destinoSeguro(next, rol));
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
          <Icon name="alert" size={15} className="mt-px shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div>
        <label htmlFor="email" className="label">Correo electrónico</label>
        <div className="relative">
          <Icon name="mail" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input h-11 pl-9"
            placeholder="nombre@tropastunuyan.com"
            data-autofocus
          />
        </div>
      </div>

      <div>
        <label htmlFor="password" className="label">Contraseña</label>
        <div className="relative">
          <Icon name="lock" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="password"
            type={verPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input h-11 px-9"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setVerPassword((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            <Icon name={verPassword ? 'eyeOff' : 'eye'} size={15} />
          </button>
        </div>
      </div>

      <button type="submit" disabled={isSubmitting || !email || !password} className="btn-primary btn-lg w-full">
        {isSubmitting ? <Spinner /> : <Icon name="login" size={16} />}
        {isSubmitting ? 'Verificando…' : 'Ingresar al panel'}
      </button>
    </form>
  );
}
