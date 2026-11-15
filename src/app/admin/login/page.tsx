import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import LoginForm from './LoginForm';
import ThemeToggle from '@/components/ThemeToggle';
import Icon from '@/components/ui/Icon';

export const metadata: Metadata = {
  title: 'Acceso del personal',
  robots: { index: false, follow: false },
};

export default function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="bg-tactical-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[420px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-militar-500/[0.12] blur-[120px]" />

      {/* Barra superior alineada con el header público: volver a la izquierda, tema a la derecha. */}
      <div className="absolute inset-x-0 top-0 mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/catalogo" className="btn-ghost -ml-2 px-2">
          <Icon name="chevronLeft" size={17} /> Catálogo
        </Link>
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8 text-center">
          <div className="relative mx-auto mb-5 h-16 w-16 overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-soft-lg dark:border-white/10 dark:shadow-lift">
            <Image src="/logo.png" alt="Tropas Tunuyán" fill sizes="64px" className="object-cover" priority />
          </div>
          <div className="eyebrow">Terminal segura</div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Acceso del personal</h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">Inventario, punto de venta y caja</p>
        </div>

        <div className="surface-elevated p-6 sm:p-7">
          <LoginForm next={searchParams.next ?? null} errorInicial={searchParams.error ?? null} />
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          ¿Sin acceso? Pedile al administrador que te cree un usuario.
        </p>
      </div>
    </div>
  );
}
