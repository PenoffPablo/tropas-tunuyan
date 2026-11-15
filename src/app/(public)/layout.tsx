import Image from 'next/image';
import Link from 'next/link';
import CatalogoHeader from '@/components/CatalogoHeader';
import Icon from '@/components/ui/Icon';
import { TIENDA, urlWhatsAppTienda } from '@/lib/config';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <CatalogoHeader />
      <main className="flex-1">{children}</main>

      <footer className="mt-20 border-t border-slate-200/70 dark:border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-3">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <span className="relative h-8 w-8 overflow-hidden rounded-lg border border-slate-200 bg-black dark:border-white/10">
                  <Image src="/logo.png" alt="" fill sizes="32px" className="object-cover" />
                </span>
                <span className="font-bold tracking-tight text-slate-900 dark:text-white">Tropas Tunuyán</span>
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                Indumentaria militar, borceguíes tácticos, protección balística y accesorios reglamentarios.
              </p>
            </div>
            <div>
              <h4 className="eyebrow mb-3">Venta regulada</h4>
              <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                Los artículos con requisito de credencial se entregan únicamente contra presentación de credencial oficial
                vigente, conforme la normativa aplicable.
              </p>
            </div>
            <div>
              <h4 className="eyebrow mb-3">Contacto</h4>
              <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Icon name="pin" size={15} className="text-militar-600 dark:text-militar-400" />
                {TIENDA.ubicacion}
              </p>
              <a
                href={urlWhatsAppTienda()}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                <Icon name="whatsapp" size={15} />
                WhatsApp oficial
              </a>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-200/70 pt-6 text-xs text-slate-500 dark:border-white/[0.06] sm:flex-row">
            <p>© {new Date().getFullYear()} Tropas Tunuyán. Todos los derechos reservados.</p>
            <Link href="/admin/login" className="inline-flex items-center gap-1.5 hover:text-slate-800 dark:hover:text-slate-300">
              <Icon name="lock" size={12} />
              Acceso personal
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
