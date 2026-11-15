import Link from 'next/link';
import Image from 'next/image';
import ThemeToggle from './ThemeToggle';
import Icon from './ui/Icon';
import { urlWhatsAppTienda } from '@/lib/config';

/** Header público (Server Component: sin JS de cliente salvo el toggle de tema). */
export default function CatalogoHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-bone-50/80 backdrop-blur-xl backdrop-saturate-150 dark:border-white/[0.06] dark:bg-ink-950/75">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/catalogo" className="group flex min-w-0 items-center gap-3" aria-label="Tropas Tunuyán — inicio">
          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-black shadow-sm transition-transform duration-300 ease-out group-hover:scale-105 dark:border-white/10">
            <Image src="/logo.png" alt="" fill sizes="40px" className="object-cover" priority />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
              Tropas Tunuyán
            </span>
            <span className="mt-0.5 hidden font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500 sm:block">
              Equipamiento táctico
            </span>
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-1 sm:gap-2" aria-label="Principal">
          <a
            href={urlWhatsAppTienda('Hola Tropas Tunuyán, quisiera hacer una consulta sobre su equipamiento.')}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Consultar por WhatsApp"
            title="Consultar por WhatsApp"
            className="btn w-10 border border-emerald-600/20 bg-emerald-500/10 px-0 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300 sm:w-auto sm:px-4"
          >
            <Icon name="whatsapp" size={17} />
            {/* En mobile solo el ícono: así entran WhatsApp, acceso del personal y tema sin cortar la marca. */}
            <span className="hidden sm:inline">Atención efectivos</span>
          </a>
          <Link
            href="/admin/login"
            className="btn-ghost btn-icon"
            aria-label="Acceso del personal"
            title="Acceso del personal"
          >
            <Icon name="lock" size={17} />
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
