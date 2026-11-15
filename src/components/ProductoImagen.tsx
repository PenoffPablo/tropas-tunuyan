import Image, { type ImageProps } from 'next/image';
import { cn } from '@/lib/utils';

/** Hosts que next/image puede optimizar (deben coincidir con next.config.js). */
function esOptimizable(src: string): boolean {
  if (src.startsWith('/')) return true;
  try {
    const { hostname, pathname } = new URL(src);
    return hostname.endsWith('.supabase.co') && pathname.startsWith('/storage/v1/object/public/');
  } catch {
    return false;
  }
}

type Props = Omit<ImageProps, 'src' | 'alt'> & {
  src: string | null | undefined;
  alt: string;
  fallbackClassName?: string;
};

/**
 * Imagen de producto con next/image (AVIF/WebP, lazy, srcset por `sizes`).
 * URLs externas no configuradas se sirven sin optimizar en vez de romper.
 */
export default function ProductoImagen({ src, alt, className, fallbackClassName, unoptimized, ...rest }: Props) {
  if (!src) {
    return (
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center bg-tactical-grid text-slate-300 dark:text-white/10',
          fallbackClassName
        )}
        aria-label={alt}
        role="img"
      >
        <svg viewBox="0 0 24 24" className="h-1/3 w-1/3" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </div>
    );
  }
  return (
    <Image
      {...rest}
      src={src}
      alt={alt}
      className={className}
      unoptimized={Boolean(unoptimized) || src.startsWith('data:') || src.startsWith('blob:') || !esOptimizable(src)}
    />
  );
}
