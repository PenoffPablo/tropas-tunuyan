import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

/* next/font: fuentes auto-hospedadas, precargadas y con métricas de fallback
   ajustadas → cero saltos de layout (CLS) al cargar la tipografía. */
const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: {
    default: 'Tropas Tunuyán — Equipamiento Táctico e Indumentaria',
    template: '%s · Tropas Tunuyán',
  },
  description:
    'Tropas Tunuyán: equipamiento e indumentaria para fuerzas armadas, seguridad privada y uso táctico. ' +
    'Catálogo completo con precios, talles y disponibilidad.',
  keywords: [
    'equipamiento táctico',
    'indumentaria militar',
    'fuerzas armadas',
    'seguridad privada',
    'Tunuyán',
    'Mendoza',
    'uniformes tácticos',
    'borceguíes',
  ],
  icons: { icon: '/logo.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#090A0F' },
    { media: '(prefers-color-scheme: light)', color: '#F8FAFC' },
  ],
};

/* Se ejecuta antes del primer pintado: aplica el tema guardado sin parpadeo (FOUC). */
const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem('tropas-theme');var d=document.documentElement;if(t==='light'){d.classList.remove('dark');}else{d.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${sans.variable} ${mono.variable} dark`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
