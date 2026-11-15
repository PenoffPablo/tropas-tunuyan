'use client';

/**
 * Carga de imagen de producto: arrastrar/soltar o elegir archivo, vista previa
 * local inmediata (Object URL, liberada al desmontar) y subida al endpoint
 * protegido /api/upload. Admite también URLs https o imágenes locales.
 */
import { useEffect, useRef, useState } from 'react';
import ProductoImagen from '@/components/ProductoImagen';
import Icon from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import { ACCEPT_IMAGENES, subirImagenProducto, validarArchivoImagen } from '@/lib/storage';
import { cn, esUrlImagenPermitida } from '@/lib/utils';

const PRESETS = [
  { label: 'Uniforme', url: '/productos/uniforme.png' },
  { label: 'Borceguí', url: '/productos/borcegui.png' },
  { label: 'Chaleco', url: '/productos/chaleco.png' },
  { label: 'Cinturón', url: '/productos/cinturon.png' },
  { label: 'Funda', url: '/productos/funda.png' },
];

type Props = {
  imagenUrl: string;
  setImagenUrl: (url: string) => void;
  nombreProducto: string;
  onSubiendoChange?: (subiendo: boolean) => void;
};

export default function CargadorImagenTactico({ imagenUrl, setImagenUrl, nombreProducto, onSubiendoChange }: Props) {
  const [modo, setModo] = useState<'archivo' | 'url'>('archivo');
  const [preview, setPreview] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [urlTexto, setUrlTexto] = useState(imagenUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    []
  );

  useEffect(() => onSubiendoChange?.(subiendo), [subiendo, onSubiendoChange]);

  const fijarPreview = (url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreview(url);
  };

  const procesar = async (file: File) => {
    const problema = validarArchivoImagen(file);
    if (problema) {
      setError(problema);
      return;
    }
    setError(null);
    fijarPreview(URL.createObjectURL(file));
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSubiendo(true);
    const res = await subirImagenProducto(file, ctrl.signal);
    if (ctrl.signal.aborted) return;
    setSubiendo(false);
    if (res.url === null) {
      setError(res.error);
      fijarPreview(null);
    } else {
      setImagenUrl(res.url);
    }
  };

  const mostrar = preview ?? imagenUrl;

  return (
    <div className="surface-muted space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="label mb-0">Imagen del producto</span>
        <div className="flex rounded-lg border border-slate-200 p-0.5 text-[11px] font-semibold dark:border-white/10">
          {(['archivo', 'url'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className={cn('rounded-md px-2.5 py-1 transition-colors', modo === m ? 'bg-slate-900 text-white dark:bg-white dark:text-ink-950' : 'text-slate-500')}
            >
              {m === 'archivo' ? 'Subir archivo' : 'URL / catálogo'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto]">
        {modo === 'archivo' ? (
          <div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_IMAGENES}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void procesar(f);
              }}
            />
            <button
              type="button"
              disabled={subiendo}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setArrastrando(true);
              }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastrando(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void procesar(f);
              }}
              className={cn(
                'flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-[border-color,background-color] duration-150',
                arrastrando ? 'border-militar-500 bg-militar-500/[0.06]' : 'border-slate-300 hover:border-militar-500/60 dark:border-white/10'
              )}
            >
              {subiendo ? <Spinner className="h-5 w-5 text-militar-600" /> : <Icon name="upload" size={20} className="text-slate-400" />}
              <span className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                {subiendo ? 'Subiendo de forma segura…' : 'Arrastrá una imagen o hacé clic'}
              </span>
              <span className="mt-1 text-[10px] text-slate-500">WEBP, PNG o JPG · máx. 2 MB</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              value={urlTexto}
              onChange={(e) => {
                const v = e.target.value.trim();
                setUrlTexto(v);
                fijarPreview(null);
                if (!v) {
                  setError(null);
                  setImagenUrl('');
                } else if (esUrlImagenPermitida(v)) {
                  setError(null);
                  setImagenUrl(v);
                } else {
                  setError('URL inválida: debe ser https:// o una imagen local (/productos/...).');
                }
              }}
              className="input num text-xs"
              placeholder="https://… o /productos/chaleco.png"
            />
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.url}
                  type="button"
                  onClick={() => {
                    setUrlTexto(p.url);
                    fijarPreview(null);
                    setError(null);
                    setImagenUrl(p.url);
                  }}
                  className={cn('chip h-7 text-[11px]', imagenUrl === p.url && 'chip-active')}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-1.5">
          <div className="relative h-28 w-28 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10">
            {mostrar ? (
              <ProductoImagen src={mostrar} alt={nombreProducto || 'Vista previa'} fill sizes="112px" className="object-contain p-2" unoptimized={Boolean(preview)} />
            ) : (
              <span className="flex h-full items-center justify-center text-slate-300"><Icon name="image" size={28} /></span>
            )}
          </div>
          {imagenUrl && !subiendo && (
            <button
              type="button"
              onClick={() => {
                setImagenUrl('');
                setUrlTexto('');
                fijarPreview(null);
              }}
              className="text-[11px] font-medium text-red-600 hover:underline dark:text-red-400"
            >
              Quitar imagen
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 text-xs font-medium text-red-600 dark:text-red-400">
          <Icon name="alert" size={13} className="mt-px shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
