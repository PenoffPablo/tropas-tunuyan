'use client';

/**
 * Alta (atómica vía RPC crear_producto: producto + variantes en una sola
 * transacción) y edición de productos.
 */
import { useState } from 'react';
import type { Categoria, ProductoConVariantes } from '@/types/database';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import CalculadorPrecioTactico, { leerValoresPrecio, type ValoresPrecio } from './CalculadorPrecioTactico';
import CargadorImagenTactico from './CargadorImagenTactico';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import { getSupabaseBrowser } from '@/lib/supabase';
import { errorDesdePostgrest } from '@/lib/errores';
import { cn, mensajeError, parseEnteroNoNegativo } from '@/lib/utils';

type FilaVariante = { talle: string; color: string; stock: string; minimo: string };

const PRESETS: Record<'indumentaria' | 'calzado' | 'unico', FilaVariante[]> = {
  indumentaria: ['S', 'M', 'L', 'XL'].map((t) => ({ talle: t, color: 'Verde Oliva', stock: '0', minimo: '3' })),
  calzado: ['39', '40', '41', '42', '43', '44'].map((t) => ({ talle: t, color: 'Negro', stock: '0', minimo: '2' })),
  unico: [{ talle: 'Único', color: 'Negro', stock: '0', minimo: '5' }],
};

type Props = {
  abierto: boolean;
  onClose: () => void;
  producto: ProductoConVariantes | null;
  categorias: Categoria[];
  onGuardado: (mensaje: string) => void;
};

export default function ModalProductoForm(props: Props) {
  const { isSubmitting, run } = useSubmitLock();
  const [subiendo, setSubiendo] = useState(false);
  return (
    <Modal open={props.abierto} onClose={props.onClose} closeDisabled={isSubmitting || subiendo} size="lg">
      <Contenido {...props} isSubmitting={isSubmitting} run={run} subiendo={subiendo} setSubiendo={setSubiendo} />
    </Modal>
  );
}

function Contenido({
  onClose,
  producto,
  categorias,
  onGuardado,
  isSubmitting,
  run,
  subiendo,
  setSubiendo,
}: Props & {
  isSubmitting: boolean;
  run: ReturnType<typeof useSubmitLock>['run'];
  subiendo: boolean;
  setSubiendo: (v: boolean) => void;
}) {
  const esEdicion = producto !== null;
  const [nombre, setNombre] = useState(producto?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? '');
  const [categoriaId, setCategoriaId] = useState(producto?.categoria_id ?? categorias[0]?.id ?? '');
  const [exige, setExige] = useState(producto?.exige_credencial ?? false);
  const [activo, setActivo] = useState(producto?.activo ?? true);
  const [imagen, setImagen] = useState(producto?.imagen_url ?? '');
  const [precio, setPrecio] = useState<ValoresPrecio>({
    costo: producto ? String(producto.costo ?? 0) : '',
    margen: producto ? String(producto.porcentaje_ganancia ?? 0) : '40',
    precio: producto ? String(producto.precio) : '',
  });
  const [variantes, setVariantes] = useState<FilaVariante[]>(PRESETS.indumentaria);
  const [error, setError] = useState<string | null>(null);

  const validar = (): string | null => {
    if (nombre.trim().length < 2 || nombre.trim().length > 160) return 'El nombre debe tener entre 2 y 160 caracteres.';
    const { costo, margen, precio: p } = leerValoresPrecio(precio);
    if (costo === null) return 'Costo inválido.';
    if (margen === null) return 'Margen inválido.';
    if (p === null || p <= 0) return 'El precio final debe ser mayor a $ 0.';
    if (!esEdicion) {
      if (variantes.length === 0) return 'Agregá al menos una variante (talle / color).';
      const claves = new Set<string>();
      for (const v of variantes) {
        if (!v.talle.trim()) return 'Todas las variantes necesitan un talle.';
        if (parseEnteroNoNegativo(v.stock) === null || parseEnteroNoNegativo(v.minimo) === null) {
          return 'Stock y stock mínimo deben ser enteros mayores o iguales a 0.';
        }
        const k = `${v.talle.trim().toLowerCase()}|${(v.color.trim() || 'Único').toLowerCase()}`;
        if (claves.has(k)) return `Variante repetida: ${v.talle} / ${v.color || 'Único'}.`;
        claves.add(k);
      }
    }
    return null;
  };

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    const problema = validar();
    if (problema) return setError(problema);
    const { costo, margen, precio: p } = leerValoresPrecio(precio);
    void run(async () => {
      setError(null);
      const datos = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        precio: p ?? 0,
        costo: costo ?? 0,
        porcentaje_ganancia: margen ?? 0,
        categoria_id: categoriaId || null,
        exige_credencial: exige,
        imagen_url: imagen.trim() || null,
        activo,
      };
      try {
        const supabase = getSupabaseBrowser();
        if (esEdicion && producto) {
          const { error: err } = await supabase.from('productos').update(datos).eq('id', producto.id);
          if (err) throw errorDesdePostgrest(err);
          onGuardado(`«${datos.nombre}» actualizado`);
        } else {
          const { error: err } = await supabase.rpc('crear_producto', {
            p_producto: datos,
            p_variantes: variantes.map((v) => ({
              talle: v.talle.trim(),
              color: v.color.trim() || 'Único',
              stock: parseEnteroNoNegativo(v.stock) ?? 0,
              stock_minimo: parseEnteroNoNegativo(v.minimo) ?? 0,
            })),
          });
          if (err) throw errorDesdePostgrest(err);
          onGuardado(`«${datos.nombre}» creado con ${variantes.length} variante(s)`);
        }
      } catch (err) {
        setError(mensajeError(err));
      }
    });
  };

  const actualizarFila = (i: number, campo: keyof FilaVariante, valor: string) =>
    setVariantes((prev) => prev.map((v, idx) => (idx === i ? { ...v, [campo]: valor } : v)));

  return (
    <form onSubmit={guardar} className="flex min-h-0 flex-1 flex-col">
      <ModalHeader
        eyebrow="Inventario"
        titulo={esEdicion ? 'Editar producto' : 'Nuevo producto'}
        descripcion={esEdicion ? 'El stock por talle se ajusta desde «Stock».' : 'Ficha, precio, imagen y variantes en una sola operación.'}
        onClose={onClose}
        closeDisabled={isSubmitting || subiendo}
      />
      <ModalBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pf-nombre" className="label">Nombre *</label>
            <input id="pf-nombre" value={nombre} maxLength={160} onChange={(e) => setNombre(e.target.value)} className="input" placeholder="Guantes tácticos de asalto" data-autofocus />
          </div>
          <div>
            <label htmlFor="pf-cat" className="label">Categoría</label>
            <select id="pf-cat" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="input">
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="pf-desc" className="label">Descripción</label>
          <textarea id="pf-desc" rows={2} maxLength={1000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="input h-auto py-2" placeholder="Material, uso, certificaciones…" />
        </div>

        <CalculadorPrecioTactico valores={precio} onChange={setPrecio} />
        <CargadorImagenTactico imagenUrl={imagen} setImagenUrl={setImagen} nombreProducto={nombre} onSubiendoChange={setSubiendo} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Interruptor activo={exige} onChange={setExige} titulo="Exige credencial" detalle="Venta regulada: el POS pide acreditación con PIN." tono="rojo" />
          <Interruptor activo={activo} onChange={setActivo} titulo="Visible en catálogo y POS" detalle="Desactivalo para ocultarlo sin borrar historial." tono="verde" />
        </div>

        {!esEdicion && (
          <div className="surface-muted space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="label mb-0">Variantes y stock inicial</span>
              <div className="flex gap-1.5">
                {(['indumentaria', 'calzado', 'unico'] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setVariantes(PRESETS[k])} className="chip h-7 text-[11px] capitalize">
                    {k === 'unico' ? 'Talle único' : k}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1.4fr_72px_72px_32px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <span>Talle</span><span>Color</span><span>Stock</span><span>Mín.</span><span />
              </div>
              {variantes.map((v, i) => (
                <div key={i} className="grid grid-cols-[1fr_1.4fr_72px_72px_32px] gap-2">
                  <input value={v.talle} maxLength={20} onChange={(e) => actualizarFila(i, 'talle', e.target.value)} className="input h-9" aria-label="Talle" />
                  <input value={v.color} maxLength={30} onChange={(e) => actualizarFila(i, 'color', e.target.value)} className="input h-9" aria-label="Color" />
                  <input value={v.stock} inputMode="numeric" onChange={(e) => actualizarFila(i, 'stock', e.target.value.replace(/\D/g, '').slice(0, 6))} className="input num h-9" aria-label="Stock" />
                  <input value={v.minimo} inputMode="numeric" onChange={(e) => actualizarFila(i, 'minimo', e.target.value.replace(/\D/g, '').slice(0, 6))} className="input num h-9" aria-label="Stock mínimo" />
                  <button type="button" onClick={() => setVariantes((prev) => prev.filter((_, idx) => idx !== i))} className="btn-ghost btn-icon h-9 w-8 text-red-500" aria-label="Quitar variante">
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setVariantes((prev) => [...prev, { talle: '', color: prev[prev.length - 1]?.color ?? 'Negro', stock: '0', minimo: '2' }])} className="btn-ghost btn-sm">
              <Icon name="plus" size={14} /> Agregar variante
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs font-medium text-red-700 dark:text-red-300">
            <Icon name="alert" size={14} className="mt-px shrink-0" /> {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={isSubmitting || subiendo} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={isSubmitting || subiendo} className="btn-primary">
          {isSubmitting ? <Spinner /> : <Icon name="check" size={16} />}
          {esEdicion ? 'Guardar cambios' : 'Crear producto'}
        </button>
      </ModalFooter>
    </form>
  );
}

function Interruptor({
  activo,
  onChange,
  titulo,
  detalle,
  tono,
}: {
  activo: boolean;
  onChange: (v: boolean) => void;
  titulo: string;
  detalle: string;
  tono: 'rojo' | 'verde';
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => onChange(!activo)}
      className={cn(
        'flex items-start gap-3 rounded-xl border p-3 text-left transition-[border-color,background-color] duration-150',
        activo
          ? tono === 'rojo'
            ? 'border-red-500/30 bg-red-500/[0.05]'
            : 'border-emerald-500/30 bg-emerald-500/[0.05]'
          : 'border-slate-200 dark:border-white/10'
      )}
    >
      <span
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
          activo ? (tono === 'rojo' ? 'bg-red-600' : 'bg-emerald-600') : 'bg-slate-300 dark:bg-white/15'
        )}
      >
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ease-out', activo ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </span>
      <span>
        <span className="block text-sm font-semibold text-slate-900 dark:text-white">{titulo}</span>
        <span className="text-xs text-slate-500">{detalle}</span>
      </span>
    </button>
  );
}
