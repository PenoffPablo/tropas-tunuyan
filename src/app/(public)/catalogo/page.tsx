import type { Metadata } from 'next';
import Image from 'next/image';
import { createSupabasePublic } from '@/lib/supabase';
import { comoFilas } from '@/lib/datos';
import { COLUMNAS_PRODUCTO_PUBLICO, COLUMNAS_VARIANTE_PUBLICA, type Categoria, type ProductoPublicoConVariantes } from '@/types/database';
import CatalogoGrid from '@/components/CatalogoGrid';
import Icon from '@/components/ui/Icon';

export const metadata: Metadata = {
  title: 'Catálogo',
  description:
    'Catálogo de equipamiento táctico e indumentaria militar: precios, talles y disponibilidad actualizados.',
};

/** ISR: HTML estático regenerado cada 60 s y al instante tras cada cambio del panel (revalidatePath). */
export const revalidate = 60;

async function getCatalogo(): Promise<{
  productos: ProductoPublicoConVariantes[];
  categorias: Categoria[];
  error: boolean;
}> {
  try {
    const supabase = createSupabasePublic();
    const [prod, cat] = await Promise.all([
      supabase
        .from('productos')
        // anon solo puede leer columnas públicas: se piden explícitamente (sin costos).
        .select(`${COLUMNAS_PRODUCTO_PUBLICO}, variantes (${COLUMNAS_VARIANTE_PUBLICA}), categorias (*)`)
        .eq('activo', true)
        .order('nombre', { ascending: true }),
      supabase.from('categorias').select('*').order('orden', { ascending: true }),
    ]);
    if (prod.error) console.error('[catalogo] productos:', prod.error.message);
    if (cat.error) console.error('[catalogo] categorias:', cat.error.message);
    const productos = comoFilas<ProductoPublicoConVariantes>(prod.data).map((p) => ({
      ...p,
      variantes: [...(p.variantes ?? [])].sort((a, b) => a.color.localeCompare(b.color) || a.talle.localeCompare(b.talle, 'es', { numeric: true })),
    }));
    return { productos, categorias: comoFilas<Categoria>(cat.data), error: Boolean(prod.error) };
  } catch (err) {
    console.error('[catalogo]', err);
    return { productos: [], categorias: [], error: true };
  }
}

export default async function CatalogoPage() {
  const { productos, categorias, error } = await getCatalogo();

  return (
    <>
      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden border-b border-slate-200/70 dark:border-white/[0.06]">
        <div className="bg-tactical-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[480px] w-[880px] -translate-x-1/2 rounded-full bg-militar-500/[0.12] blur-[120px] dark:bg-militar-400/[0.10]" />

        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1fr_auto] lg:px-8">
          <div className="max-w-2xl animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-militar-700 backdrop-blur dark:border-white/10 dark:bg-white/[0.03] dark:text-militar-400">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-militar-500" />
              Fuerzas armadas · Seguridad privada
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-slate-900 dark:text-white sm:text-6xl">
              Equipamiento de servicio, <span className="text-gradient">precisión táctica.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-400 sm:text-lg">
              Indumentaria homologada, calzado de alta resistencia y complementos para servicio activo y operaciones de campo.
            </p>
            <div className="mt-7 flex max-w-xl items-start gap-3 rounded-2xl border border-red-200/70 bg-red-50/70 p-4 text-sm dark:border-red-500/20 dark:bg-red-500/[0.06]">
              <Icon name="shield" size={18} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
              <p className="leading-relaxed text-slate-700 dark:text-slate-300">
                <strong className="font-semibold text-slate-900 dark:text-white">Venta regulada.</strong> Los artículos marcados
                con <span className="badge-credencial mx-0.5 align-middle">Credencial</span> requieren acreditar condición de
                personal activo de fuerzas o seguridad privada habilitada.
              </p>
            </div>
          </div>

          <div className="relative hidden lg:block" aria-hidden="true">
            <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-militar-500/30 via-transparent to-lime-300/10 blur-2xl" />
            <div className="relative h-60 w-60 overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-lift">
              <Image src="/logo.png" alt="" fill sizes="240px" className="object-cover" priority />
            </div>
          </div>
        </div>
      </section>

      {/* ── Catálogo ── */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {error && productos.length === 0 ? (
          <div className="surface flex items-start gap-3 p-5 text-sm text-slate-600 dark:text-slate-300" role="alert">
            <Icon name="alert" size={18} className="mt-0.5 text-amber-500" />
            No pudimos cargar el catálogo en este momento. Reintentá en unos segundos o consultanos por WhatsApp.
          </div>
        ) : (
          <CatalogoGrid productos={productos} categorias={categorias} />
        )}
      </section>
    </>
  );
}
