'use client';

/**
 * Cobro del POS. El bloqueo síncrono (useSubmitLock) garantiza que un doble
 * clic o un doble Enter no disparen dos ventas; además la RPC es idempotente.
 */
import { useMemo, useState } from 'react';
import type { MetodoPagoTipo } from '@/types/database';
import type { DatosCobro } from '@/lib/finanzas';
import { copiarAlPortapapeles } from '@/lib/finanzas';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '@/components/ui/Modal';
import Icon, { type NombreIcono } from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import { TIENDA } from '@/lib/config';
import {
  limpiarNombreCliente,
  limpiarNroOperacion,
  limpiarTelefono,
  validarNombreCliente,
  validarNroOperacion,
  validarTelefonoCliente,
} from '@/lib/ticket';
import { cn, formatPrecio, parseMonto, roundCurrency, sameCurrency } from '@/lib/utils';

type Props = {
  abierto: boolean;
  onClose: () => void;
  total: number;
  unidades: number;
  credencialAcreditada: string | null;
  /** Devuelve un mensaje de error para mostrar o null si la venta se registró. */
  onConfirmar: (cobro: DatosCobro) => Promise<string | null>;
};

const METODOS: { id: MetodoPagoTipo; label: string; icono: NombreIcono }[] = [
  { id: 'efectivo', label: 'Efectivo', icono: 'cash' },
  { id: 'transferencia_alias', label: 'Transferencia', icono: 'phone' },
  { id: 'tarjeta_postnet', label: 'Tarjeta', icono: 'card' },
  { id: 'combinado', label: 'Combinado', icono: 'scale' },
];

const BILLETES = [10000, 20000, 50000, 100000];

export default function ModalCobroTactico(props: Props) {
  const { isSubmitting, run } = useSubmitLock();
  return (
    <Modal open={props.abierto} onClose={props.onClose} closeDisabled={isSubmitting} size="lg">
      <Contenido {...props} isSubmitting={isSubmitting} run={run} />
    </Modal>
  );
}

function Contenido({
  onClose,
  total,
  unidades,
  credencialAcreditada,
  onConfirmar,
  isSubmitting,
  run,
}: Props & { isSubmitting: boolean; run: ReturnType<typeof useSubmitLock>['run'] }) {
  const [metodo, setMetodo] = useState<MetodoPagoTipo>('efectivo');
  const [recibido, setRecibido] = useState('');
  const [comprobante, setComprobante] = useState('');
  const [efectivoComb, setEfectivoComb] = useState(String(Math.floor(total / 2)));
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aliasCopiado, setAliasCopiado] = useState(false);

  const recibidoNum = recibido.trim() === '' ? total : parseMonto(recibido);
  const vuelto = recibidoNum !== null ? Math.max(0, roundCurrency(recibidoNum - total)) : 0;
  const efComb = parseMonto(efectivoComb);
  const digComb = efComb !== null ? roundCurrency(total - efComb) : null;
  const errorComprobante = metodo === 'efectivo' ? null : validarNroOperacion(comprobante, metodo, metodo !== 'combinado');
  const errorNombre = validarNombreCliente(nombre);
  const errorTelefono = validarTelefonoCliente(telefono);

  const validacion = useMemo<string | null>(() => {
    if (!(total > 0)) return 'El total debe ser mayor a 0.';
    if (metodo === 'efectivo') {
      if (recibidoNum === null) return 'Monto recibido inválido.';
      if (recibidoNum < total) return `Faltan ${formatPrecio(roundCurrency(total - recibidoNum))} para cubrir el total.`;
    }
    if (errorComprobante) return errorComprobante;
    if (metodo === 'combinado') {
      if (efComb === null || digComb === null) return 'Monto en efectivo inválido.';
      if (efComb <= 0 || digComb <= 0) return 'Ambas partes del pago combinado deben ser mayores a $ 0.';
      if (!sameCurrency(efComb + digComb, total)) return 'La suma no coincide con el total.';
    }
    return errorNombre ?? errorTelefono;
  }, [metodo, recibidoNum, total, errorComprobante, efComb, digComb, errorNombre, errorTelefono]);

  const copiarAlias = async () => {
    if (await copiarAlPortapapeles(TIENDA.alias)) {
      setAliasCopiado(true);
      setTimeout(() => setAliasCopiado(false), 2000);
    }
  };

  const confirmar = (e: React.FormEvent) => {
    e.preventDefault();
    if (validacion) {
      setError(validacion);
      return;
    }
    void run(async () => {
      setError(null);
      const msg = await onConfirmar({
        metodoPago: metodo,
        montoEfectivo: metodo === 'combinado' ? efComb ?? 0 : metodo === 'efectivo' ? total : 0,
        montoDigital: metodo === 'combinado' ? digComb ?? 0 : metodo === 'efectivo' ? 0 : total,
        montoRecibido: metodo === 'efectivo' ? recibidoNum : null,
        nroComprobante: metodo === 'efectivo' ? '' : comprobante,
        nombreCliente: nombre.trim(),
        telefonoCliente: telefono.trim(),
      });
      if (msg) setError(msg);
    });
  };

  return (
    <form onSubmit={confirmar} className="flex min-h-0 flex-1 flex-col">
      <ModalHeader
        tono="exito"
        eyebrow="Punto de cobro"
        titulo="Cobrar venta"
        descripcion={`${unidades} ${unidades === 1 ? 'unidad' : 'unidades'}`}
        onClose={onClose}
        closeDisabled={isSubmitting}
        extra={
          <div className="text-right">
            <div className="eyebrow text-slate-500 dark:text-slate-500">Total</div>
            <div className="num text-2xl font-bold text-emerald-600 dark:text-emerald-400 sm:text-3xl">{formatPrecio(total)}</div>
          </div>
        }
      />

      <ModalBody className="space-y-5">
        {credencialAcreditada && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <Icon name="shieldCheck" size={15} /> Credencial acreditada: {credencialAcreditada}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Medio de pago">
          {METODOS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={metodo === m.id}
              onClick={() => {
                setMetodo(m.id);
                setComprobante((c) => limpiarNroOperacion(c, m.id));
                setError(null);
              }}
              className={cn(
                'flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98]',
                metodo === m.id
                  ? 'border-emerald-500 bg-emerald-500/[0.08] text-emerald-700 ring-4 ring-emerald-500/10 dark:text-emerald-300'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-white/10 dark:text-slate-400 dark:hover:border-white/20'
              )}
            >
              <Icon name={m.icono} size={20} />
              {m.label}
            </button>
          ))}
        </div>

        {metodo === 'efectivo' && (
          <div className="surface-muted space-y-3 p-4">
            <label htmlFor="cobro-recibido" className="label">Monto recibido</label>
            <div className="relative">
              <span className="num pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-slate-400">$</span>
              <input
                id="cobro-recibido"
                inputMode="decimal"
                autoComplete="off"
                value={recibido}
                onChange={(e) => setRecibido(e.target.value)}
                placeholder={String(total)}
                className={cn('input num h-12 pl-8 text-xl font-semibold', recibidoNum === null && 'input-error')}
                data-autofocus
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setRecibido(String(total))} className="chip">Exacto</button>
              {BILLETES.filter((b) => b >= total * 0.2).map((b) => (
                <button key={b} type="button" onClick={() => setRecibido(String(b))} className="chip num">
                  {formatPrecio(b)}
                </button>
              ))}
            </div>
            <div className="flex items-baseline justify-between border-t border-slate-200 pt-3 dark:border-white/[0.06]">
              <span className="label mb-0">Vuelto</span>
              <span className={cn('num text-2xl font-bold', vuelto > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')}>
                {formatPrecio(vuelto)}
              </span>
            </div>
          </div>
        )}

        {(metodo === 'transferencia_alias' || metodo === 'combinado') && (
          <div className="surface-muted flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="label mb-1">Alias de la tienda</div>
              <div className="num truncate text-base font-semibold text-sky-700 dark:text-sky-300">{TIENDA.alias}</div>
              <div className="truncate text-[11px] text-slate-500">
                {TIENDA.titular}
                {TIENDA.cvu && <> · CVU {TIENDA.cvu}</>}
              </div>
            </div>
            <button type="button" onClick={copiarAlias} className="btn-secondary btn-sm shrink-0">
              <Icon name={aliasCopiado ? 'check' : 'copy'} size={14} />
              {aliasCopiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        )}

        {metodo === 'combinado' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="comb-ef" className="label">Parte efectivo</label>
              <input
                id="comb-ef"
                inputMode="decimal"
                value={efectivoComb}
                onChange={(e) => setEfectivoComb(e.target.value)}
                className={cn('input num', efComb === null && 'input-error')}
                data-autofocus
              />
            </div>
            <div>
              <span className="label">Parte digital</span>
              <div className="input num flex items-center bg-slate-50 font-semibold text-sky-700 dark:bg-white/[0.02] dark:text-sky-300">
                {digComb !== null && digComb >= 0 ? formatPrecio(digComb) : '—'}
              </div>
            </div>
          </div>
        )}

        {metodo !== 'efectivo' && (
          <div>
            <label htmlFor="cobro-comp" className="label">
              {metodo === 'tarjeta_postnet' ? 'N.º de cupón / autorización' : 'N.º de operación'}
              {metodo === 'combinado' && <span className="normal-case tracking-normal text-slate-400"> (opcional)</span>}
            </label>
            <input
              id="cobro-comp"
              value={comprobante}
              maxLength={30}
              autoComplete="off"
              inputMode={metodo === 'transferencia_alias' ? 'numeric' : 'text'}
              onChange={(e) => setComprobante(limpiarNroOperacion(e.target.value, metodo))}
              className={cn('input num', comprobante && errorComprobante && 'input-error')}
              placeholder={metodo === 'tarjeta_postnet' ? 'CUP-10492' : '89452301'}
              aria-invalid={!!(comprobante && errorComprobante)}
              data-autofocus={metodo !== 'combinado' ? true : undefined}
            />
            {comprobante && errorComprobante && <ErrorCampo>{errorComprobante}</ErrorCampo>}
          </div>
        )}

        <fieldset className="rounded-xl border border-slate-200 p-4 dark:border-white/[0.08]">
          <legend className="flex items-center gap-2 px-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
            <Icon name="users" size={14} /> Datos del cliente
            <span className="font-normal text-slate-400">(opcional · salen en el comprobante)</span>
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="cobro-nombre" className="label">Nombre y apellido</label>
              <input
                id="cobro-nombre"
                value={nombre}
                onChange={(e) => setNombre(limpiarNombreCliente(e.target.value))}
                className={cn('input', errorNombre && 'input-error')}
                placeholder="Juan Pérez"
                autoComplete="off"
                maxLength={80}
                aria-invalid={!!errorNombre}
              />
              {errorNombre && <ErrorCampo>{errorNombre}</ErrorCampo>}
            </div>
            <div>
              <label htmlFor="cobro-tel" className="label">WhatsApp</label>
              <input
                id="cobro-tel"
                value={telefono}
                onChange={(e) => setTelefono(limpiarTelefono(e.target.value))}
                className={cn('input num', errorTelefono && 'input-error')}
                inputMode="tel"
                placeholder="2622 662044"
                autoComplete="off"
                maxLength={20}
                aria-invalid={!!errorTelefono}
              />
              {errorTelefono && <ErrorCampo>{errorTelefono}</ErrorCampo>}
            </div>
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs font-medium text-red-700 dark:text-red-300">
            <Icon name="alert" size={14} className="mt-px shrink-0" /> {error}
          </p>
        )}
      </ModalBody>

      <ModalFooter>
        <button type="button" onClick={onClose} disabled={isSubmitting} className="btn-secondary">Volver al carrito</button>
        <button type="submit" disabled={isSubmitting} className="btn-success btn-lg min-w-[220px]">
          {isSubmitting ? <Spinner /> : <Icon name="check" size={18} />}
          {isSubmitting ? 'Registrando venta…' : `Confirmar ${formatPrecio(total)}`}
        </button>
      </ModalFooter>
    </form>
  );
}

function ErrorCampo({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[11px] font-medium text-red-600 dark:text-red-400">{children}</p>;
}
