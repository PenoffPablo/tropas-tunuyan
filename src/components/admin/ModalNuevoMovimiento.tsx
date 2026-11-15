'use client';

import { useState } from 'react';
import type { MetodoCaja, MovimientoCaja, TipoMovimiento, TurnoCaja } from '@/types/database';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import { NOMBRE_METODO_CAJA, registrarMovimiento } from '@/lib/finanzas';
import { cn, formatPrecio, mensajeError, multiplyCurrency, parseCantidad, parseMonto } from '@/lib/utils';

type ProductoRef = { id: string; nombre: string; precio: number };

const CATEGORIAS = {
  ingreso: ['Ventas Mostrador', 'Ventas Especiales', 'Aporte de capital', 'Otros ingresos'],
  egreso: ['Proveedores', 'Gastos Operativos', 'Fletes', 'Sueldos', 'Impuestos', 'Retiro de caja', 'Otros egresos'],
} as const;

type Props = {
  abierto: boolean;
  onClose: () => void;
  productos: ProductoRef[];
  turnoAbierto: TurnoCaja | null;
  onRegistrado: (m: MovimientoCaja) => void;
};

export default function ModalNuevoMovimiento(props: Props) {
  const { isSubmitting, run } = useSubmitLock();
  return (
    <Modal open={props.abierto} onClose={props.onClose} closeDisabled={isSubmitting} size="md">
      <Contenido {...props} isSubmitting={isSubmitting} run={run} />
    </Modal>
  );
}

function Contenido({
  onClose,
  productos,
  turnoAbierto,
  onRegistrado,
  isSubmitting,
  run,
}: Props & { isSubmitting: boolean; run: ReturnType<typeof useSubmitLock>['run'] }) {
  const [tipo, setTipo] = useState<TipoMovimiento>('egreso');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [categoria, setCategoria] = useState<string>(CATEGORIAS.egreso[0]);
  const [metodo, setMetodo] = useState<MetodoCaja>('efectivo');
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [vincularTurno, setVincularTurno] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const montoNum = parseMonto(monto);
  const afectaArqueo = metodo === 'efectivo' && turnoAbierto !== null && vincularTurno;

  const elegirProducto = (id: string, cant = cantidad) => {
    setProductoId(id);
    const p = productos.find((x) => x.id === id);
    const c = parseCantidad(cant);
    if (p && c) {
      setMonto(String(multiplyCurrency(p.precio, c)));
      if (!concepto) setConcepto(`Venta ${p.nombre}`);
    }
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (montoNum === null || montoNum <= 0) return setError('El monto debe ser mayor a $ 0.');
    if (concepto.trim().length < 3) return setError('Describí el concepto (mínimo 3 caracteres).');
    const cant = productoId ? parseCantidad(cantidad) : 1;
    if (cant === null) return setError('Cantidad inválida.');
    void run(async () => {
      setError(null);
      try {
        const m = await registrarMovimiento({
          tipo,
          monto: montoNum,
          concepto: concepto.slice(0, 200),
          categoria_caja: categoria,
          metodo_pago: metodo,
          producto_id: productoId || null,
          cantidad: cant,
          turno_id: afectaArqueo && turnoAbierto ? turnoAbierto.id : null,
        });
        onRegistrado(m);
      } catch (err) {
        setError(mensajeError(err));
      }
    });
  };

  return (
    <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
      <ModalHeader eyebrow="Libro de caja" titulo="Registrar movimiento" descripcion="Ingresos y egresos manuales (las ventas del POS se registran solas)." onClose={onClose} closeDisabled={isSubmitting} />
      <ModalBody className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(['ingreso', 'egreso'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTipo(t);
                setCategoria(CATEGORIAS[t][0]);
              }}
              className={cn(
                'flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-[background-color,border-color,color]',
                tipo === t
                  ? t === 'ingreso'
                    ? 'border-emerald-500 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300'
                    : 'border-red-500 bg-red-500/[0.08] text-red-700 dark:text-red-300'
                  : 'border-slate-200 text-slate-500 dark:border-white/10'
              )}
            >
              <Icon name={t === 'ingreso' ? 'trendUp' : 'trendDown'} size={16} /> {t === 'ingreso' ? 'Ingreso' : 'Egreso'}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="mov-monto" className="label">Monto *</label>
            <input id="mov-monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} className={cn('input num h-11 text-base font-semibold', monto !== '' && montoNum === null && 'input-error')} placeholder="0" data-autofocus />
          </div>
          <div>
            <label htmlFor="mov-metodo" className="label">Medio</label>
            <select id="mov-metodo" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoCaja)} className="input h-11">
              {(Object.keys(NOMBRE_METODO_CAJA) as MetodoCaja[]).map((m) => (
                <option key={m} value={m}>{NOMBRE_METODO_CAJA[m]}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="mov-concepto" className="label">Concepto *</label>
          <input id="mov-concepto" value={concepto} maxLength={200} onChange={(e) => setConcepto(e.target.value)} className="input" placeholder={tipo === 'egreso' ? 'Pago de flete a proveedor' : 'Venta por WhatsApp'} />
        </div>

        <div>
          <label htmlFor="mov-cat" className="label">Categoría</label>
          <select id="mov-cat" value={categoria} onChange={(e) => setCategoria(e.target.value)} className="input">
            {CATEGORIAS[tipo].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {tipo === 'ingreso' && (
          <div className="grid grid-cols-[1fr_80px] gap-3">
            <div>
              <label htmlFor="mov-prod" className="label">Producto (opcional)</label>
              <select id="mov-prod" value={productoId} onChange={(e) => elegirProducto(e.target.value)} className="input">
                <option value="">—</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} · {formatPrecio(p.precio)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="mov-cant" className="label">Cant.</label>
              <input
                id="mov-cant"
                inputMode="numeric"
                value={cantidad}
                disabled={!productoId}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setCantidad(v);
                  if (productoId) elegirProducto(productoId, v);
                }}
                className="input num"
              />
            </div>
          </div>
        )}

        {metodo === 'efectivo' && turnoAbierto && (
          <label className="surface-muted flex cursor-pointer items-start gap-3 p-3 text-xs">
            <input type="checkbox" checked={vincularTurno} onChange={(e) => setVincularTurno(e.target.checked)} className="mt-0.5 h-4 w-4 accent-militar-600" />
            <span className="text-slate-600 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-white">Afecta el cajón del turno abierto</strong> ({turnoAbierto.cajero_nombre}). Se considerará en el arqueo ciego.
            </span>
          </label>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs font-medium text-red-700 dark:text-red-300">
            <Icon name="alert" size={14} className="mt-px shrink-0" /> {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={isSubmitting} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className={tipo === 'ingreso' ? 'btn-success' : 'btn-danger'}>
          {isSubmitting ? <Spinner /> : <Icon name="check" size={16} />} Registrar {montoNum ? formatPrecio(montoNum) : ''}
        </button>
      </ModalFooter>
    </form>
  );
}
