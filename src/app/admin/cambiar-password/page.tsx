import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';
import { leerSesionPanel } from '@/lib/auth';
import { etiquetaCuenta } from '@/lib/acceso';
import CambiarPasswordForm from './CambiarPasswordForm';

export const metadata: Metadata = {
  title: 'Cambiar contraseña',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/**
 * Paso obligatorio tras el primer ingreso (o un reseteo del admin): el
 * middleware no deja usar ninguna otra pantalla hasta completarlo.
 */
export default function CambiarPasswordPage() {
  const sesion = leerSesionPanel();
  if (!sesion) redirect('/admin/login');

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="bg-tactical-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      <div className="absolute inset-x-0 top-0 mx-auto flex h-16 max-w-7xl items-center justify-end px-4 sm:px-6 lg:px-8">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8 text-center">
          <div className="relative mx-auto mb-5 h-16 w-16 overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-soft-lg dark:border-white/10 dark:shadow-lift">
            <Image src="/logo.png" alt="Tropas Tunuyán" fill sizes="64px" className="object-cover" priority />
          </div>
          <div className="eyebrow">Primer ingreso</div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Elegí tu contraseña</h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Hola <span className="font-semibold text-slate-700 dark:text-slate-300">{etiquetaCuenta(sesion.email)}</span>: antes de
            seguir, reemplazá la contraseña que te dio el administrador por una propia.
          </p>
        </div>

        <div className="surface-elevated p-6 sm:p-7">
          <CambiarPasswordForm />
        </div>
      </div>
    </div>
  );
}
