'use client';

import Icon from './ui/Icon';
import { cn } from '@/lib/utils';

/**
 * Alternador de tema sin parpadeo ni salto de layout: el ícono se resuelve por
 * CSS (clase .dark en <html>, aplicada antes del primer pintado), así que el
 * HTML del servidor y el del cliente son idénticos y no hace falta "montar".
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const alternar = () => {
    const html = document.documentElement;
    const oscuro = !html.classList.contains('dark');
    html.classList.toggle('dark', oscuro);
    try {
      localStorage.setItem('tropas-theme', oscuro ? 'dark' : 'light');
    } catch {
      /* modo privado: el tema dura la sesión */
    }
  };

  return (
    <button
      type="button"
      onClick={alternar}
      className={cn('btn-ghost btn-icon relative', className)}
      aria-label="Alternar modo claro u oscuro"
      title="Alternar tema"
    >
      <Icon name="moon" size={17} className="dark:hidden" />
      <Icon name="sun" size={17} className="hidden text-amber-300 dark:block" />
    </button>
  );
}
