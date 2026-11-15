'use client';

/**
 * Modal base del sistema:
 * · Portal a <body>, fondo con desenfoque y entrada tipo spring (transform/opacity).
 * · Cierre con Escape (solo el modal superior de la pila) y click en el fondo.
 * · Bloqueo de scroll del body con contador (soporta modales anidados) y
 *   compensación del ancho de la scrollbar (sin saltos de layout).
 * · Trampa de foco + restauración del foco al cerrar.
 * · Cuando `open` es false el contenido se DESMONTA: el estado interno de cada
 *   modal se limpia solo.
 */
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { cn } from '@/lib/utils';

const TituloContext = createContext<string | undefined>(undefined);

const pila: string[] = [];
let bloqueos = 0;
let overflowPrevio = '';
let paddingPrevio = '';

function bloquearScroll() {
  if (bloqueos === 0) {
    const body = document.body;
    const anchoScrollbar = window.innerWidth - document.documentElement.clientWidth;
    overflowPrevio = body.style.overflow;
    paddingPrevio = body.style.paddingRight;
    body.style.overflow = 'hidden';
    if (anchoScrollbar > 0) body.style.paddingRight = `${anchoScrollbar}px`;
  }
  bloqueos += 1;
}

function liberarScroll() {
  bloqueos = Math.max(0, bloqueos - 1);
  if (bloqueos === 0) {
    document.body.style.overflow = overflowPrevio;
    document.body.style.paddingRight = paddingPrevio;
  }
}

const FOCUSABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const TAMANOS = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
} as const;

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof TAMANOS;
  /** Impide cerrar (Escape/fondo) mientras hay una operación en curso. */
  closeDisabled?: boolean;
  /** Etiqueta accesible si no se usa <ModalHeader>. */
  ariaLabel?: string;
  className?: string;
};

export default function Modal({
  open,
  onClose,
  children,
  size = 'md',
  closeDisabled = false,
  ariaLabel,
  className,
}: ModalProps) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  const [montado, setMontado] = useState(false);

  onCloseRef.current = onClose;
  closeDisabledRef.current = closeDisabled;

  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (!open) return;
    const focoPrevio = document.activeElement as HTMLElement | null;
    pila.push(id);
    bloquearScroll();

    const panel = panelRef.current;
    const enfocar = () => {
      const auto = panel?.querySelector<HTMLElement>('[data-autofocus]');
      const primero = auto ?? panel?.querySelector<HTMLElement>(FOCUSABLES);
      (primero ?? panel)?.focus({ preventScroll: true });
    };
    const raf = requestAnimationFrame(enfocar);

    const onKeyDown = (e: KeyboardEvent) => {
      if (pila[pila.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (!closeDisabledRef.current) onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && panel) {
        const nodos = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLES)).filter(
          (n) => n.offsetParent !== null
        );
        if (nodos.length === 0) {
          e.preventDefault();
          return;
        }
        const primero = nodos[0];
        const ultimo = nodos[nodos.length - 1];
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      const idx = pila.lastIndexOf(id);
      if (idx >= 0) pila.splice(idx, 1);
      liberarScroll();
      if (focoPrevio && document.contains(focoPrevio)) focoPrevio.focus({ preventScroll: true });
    };
  }, [open, id]);

  if (!open || !montado) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-md"
        onMouseDown={() => {
          if (!closeDisabledRef.current) onCloseRef.current();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : `${id}-titulo`}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[94dvh] w-full animate-modal-in flex-col overflow-hidden rounded-t-3xl border border-slate-200/80 bg-white shadow-soft-lg will-change-transform focus:outline-none sm:max-h-[90dvh] sm:rounded-2xl',
          'dark:border-white/[0.08] dark:bg-ink-900 dark:shadow-lift',
          TAMANOS[size],
          className
        )}
        data-modal-id={id}
      >
        <TituloContext.Provider value={`${id}-titulo`}>{children}</TituloContext.Provider>
      </div>
    </div>,
    document.body
  );
}

type HeaderProps = {
  titulo: ReactNode;
  eyebrow?: ReactNode;
  descripcion?: ReactNode;
  onClose?: () => void;
  closeDisabled?: boolean;
  tono?: 'neutro' | 'peligro' | 'alerta' | 'exito';
  extra?: ReactNode;
};

const TONOS = {
  neutro: '',
  peligro: 'bg-gradient-to-b from-red-500/[0.08] to-transparent',
  alerta: 'bg-gradient-to-b from-amber-500/[0.08] to-transparent',
  exito: 'bg-gradient-to-b from-emerald-500/[0.09] to-transparent',
} as const;

/** Cabecera estándar. Su título etiqueta el diálogo (aria-labelledby). */
export function ModalHeader({ titulo, eyebrow, descripcion, onClose, closeDisabled, tono = 'neutro', extra }: HeaderProps) {
  const tituloId = useContext(TituloContext);
  return (
    <div
      className={cn(
        'flex shrink-0 items-start justify-between gap-4 border-b border-slate-200/80 px-5 pb-4 pt-5 dark:border-white/[0.06] sm:px-6',
        TONOS[tono]
      )}
    >
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h2 className="truncate text-lg font-bold tracking-tight text-slate-900 dark:text-white" id={tituloId}>
          {titulo}
        </h2>
        {descripcion && <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{descripcion}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {extra}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            className="btn-ghost btn-icon -mr-1.5 -mt-1"
            aria-label="Cerrar (Esc)"
            title="Cerrar (Esc)"
          >
            <Icon name="x" size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

export function ModalBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6', className)}>{children}</div>;
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'safe-bottom flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200/80 bg-slate-50/70 px-5 pt-3 dark:border-white/[0.06] dark:bg-black/20 sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:pb-3',
        className
      )}
    >
      {children}
    </div>
  );
}
