'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { RolUsuario } from '@/types/database';
import ThemeToggle from '@/components/ThemeToggle';
import Icon, { type NombreIcono } from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import { getSupabaseBrowser } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useSubmitLock } from '@/hooks/useSubmitLock';

type ItemNav = { href: string; label: string; corto: string; icono: NombreIcono; soloAdmin: boolean };

const NAV: ItemNav[] = [
  { href: '/admin/pos', label: 'Punto de venta', corto: 'POS', icono: 'pos', soloAdmin: false },
  { href: '/admin/inventario', label: 'Inventario', corto: 'Stock', icono: 'box', soloAdmin: true },
  { href: '/admin/finanzas', label: 'Caja & finanzas', corto: 'Caja', icono: 'dollar', soloAdmin: true },
  { href: '/admin/turnos', label: 'Turnos & personal', corto: 'Turnos', icono: 'users', soloAdmin: true },
];

export default function AdminShell({ rol, email, children }: { rol: RolUsuario; email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isSubmitting: saliendo, run } = useSubmitLock();
  const items = NAV.filter((i) => !i.soloAdmin || rol === 'admin');
  const activo = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const salir = () =>
    void run(async () => {
      await getSupabaseBrowser().auth.signOut();
      router.replace('/admin/login');
      router.refresh();
    });

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar escritorio ── */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200/70 bg-white/60 backdrop-blur-xl dark:border-white/[0.06] dark:bg-ink-950/60 lg:flex">
        <Link href="/admin" className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200/70 px-5 dark:border-white/[0.06]">
          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-black shadow-sm dark:border-white/10">
            <Image src="/logo.png" alt="" fill sizes="40px" className="object-cover" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">Tropas Tunuyán</span>
            <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Panel operativo</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1 px-3 py-3" aria-label="Panel">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              prefetch
              aria-current={activo(i.href) ? 'page' : undefined}
              className={cn(
                'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-[background-color,color] duration-150',
                activo(i.href)
                  ? 'bg-slate-900 text-white dark:bg-white/[0.08] dark:text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.04] dark:hover:text-white'
              )}
            >
              {activo(i.href) && <span className="absolute -left-3 h-5 w-1 rounded-r-full bg-militar-500" />}
              <Icon name={i.icono} size={17} />
              {i.label}
            </Link>
          ))}
          <Link
            href="/catalogo"
            target="_blank"
            className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/[0.04] dark:hover:text-white"
          >
            <Icon name="external" size={17} />
            Ver catálogo
          </Link>
        </nav>

        <div className="border-t border-slate-200/70 p-3 dark:border-white/[0.06]">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                rol === 'admin' ? 'bg-militar-500/15 text-militar-700 dark:text-militar-300' : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
              )}
            >
              {(email[0] ?? '?').toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{email || 'Usuario'}</span>
              <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{rol === 'admin' ? 'Administrador' : 'Vendedor'}</span>
            </span>
            <ThemeToggle />
          </div>
          <button type="button" onClick={salir} disabled={saliendo} className="btn-ghost btn-sm mt-1 w-full justify-start text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400">
            {saliendo ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="logout" size={15} />}
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Header móvil ── */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-slate-200/70 bg-bone-50/85 px-4 backdrop-blur-xl dark:border-white/[0.06] dark:bg-ink-950/80 sm:px-6 lg:hidden">
          <Link href="/admin" className="flex min-w-0 items-center gap-3">
            <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-black shadow-sm dark:border-white/10">
              <Image src="/logo.png" alt="" fill sizes="40px" className="object-cover" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">Tropas Tunuyán</span>
              <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
                {rol === 'admin' ? 'Administrador' : 'Vendedor'}
              </span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <button type="button" onClick={salir} disabled={saliendo} className="btn-ghost btn-icon text-red-500" aria-label="Cerrar sesión">
              {saliendo ? <Spinner /> : <Icon name="logout" size={17} />}
            </button>
          </div>
        </header>

        <main className="flex-1 pb-24 lg:pb-0">{children}</main>

        {/* ── Navegación inferior móvil ── */}
        <nav
          className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-slate-200/70 bg-white/90 px-2 pt-1.5 backdrop-blur-xl dark:border-white/[0.06] dark:bg-ink-950/90 lg:hidden"
          aria-label="Panel"
        >
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={activo(i.href) ? 'page' : undefined}
              className={cn(
                'flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] font-semibold transition-[color,transform] duration-150 active:scale-95',
                activo(i.href) ? 'text-militar-700 dark:text-militar-300' : 'text-slate-500'
              )}
            >
              <Icon name={i.icono} size={20} />
              {i.corto}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
