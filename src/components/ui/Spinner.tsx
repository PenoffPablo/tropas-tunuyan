import { cn } from '@/lib/utils';

/** Spinner minimalista (rotación por GPU). */
export default function Spinner({ className, label = 'Procesando' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn('inline-block h-4 w-4 shrink-0', className)}>
      <svg viewBox="0 0 24 24" className="h-full w-full animate-spin" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
