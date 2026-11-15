import { Skeleton, SkeletonProductoCard } from '@/components/ui/Skeleton';

export default function CargandoCatalogo() {
  return (
    <div aria-busy="true" aria-label="Cargando catálogo">
      <section className="border-b border-slate-200/70 dark:border-white/[0.06]">
        <div className="mx-auto max-w-7xl space-y-5 px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <Skeleton className="h-6 w-64 rounded-full" />
          <Skeleton className="h-14 w-full max-w-2xl" />
          <Skeleton className="h-5 w-full max-w-xl" />
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex gap-2">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <SkeletonProductoCard key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
