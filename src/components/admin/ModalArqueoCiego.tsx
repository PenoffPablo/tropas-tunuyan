'use client';

/**
 * Arqueo ciego: el cajero declara el efectivo contado SIN ver lo esperado.
 * El esperado y el desvío los calcula PostgreSQL (cerrar_turno_ciego) dentro de
 * una transacción que bloquea el turno (ninguna venta puede colarse a mitad del cierre).
 */
import { useState } from 'react';
import type { TurnoCaja } from '@/types/database';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import { cerrarTurnoCiego, copiarAlPortapapeles, etiquetaDesvio, textoActaTurno } from '@/lib/finanzas';
import { cn, formatDesvio, formatFechaHora, formatPrecio, mensajeError, parseEnteroNoNegativo, parseMonto, roundCurrency, sumCurrency } from '@/lib/utils';

const DENOMINACIONES = [20000, 10000, 2000, 1000, 500, 200, 100, 50, 20, 10] as const;

type Props = {
  abierto: boolean;
  onClose: () => void;
  turno: TurnoCaja | null;
  onTurnoCerrado: (turno: TurnoCaja) => void;
};

export default function ModalArqueoCiego(props: Props) {
  const { isSubmitting, run } = useSubmitLock();
  const [resultado, setResultado] = useState<TurnoCaja | null>(null);

  const cerrar = () => {
    if (resultado) props.onTurnoCerrado(resultado);
    setResultado(null);
    props.onClose();
  };

  return (
    <Modal open={props.abierto && (props.turno !== null || resultado !== null)} onClose={cerrar} closeDisabled={isSubmitting} size="md">
      {resultado ? (
        <Resultado turno={resultado} onFinalizar={cerrar} />
      ) : (
        props.turno && (
          <Conteo turno={props.turno} onClose={cerrar} isSubmitting={isSubmitting} run={run} onCerrado={setResultado} />
        )
      )}
    </Modal>
  );
}

function Conteo({
  turno,
  onClose,
  isSubmitting,
  run,
  onCerrado,
}: {
  turno: TurnoCaja;
  onClose: () => void;
  isSubmitting: boolean;
  run: ReturnType<typeof useSubmitLock>['run'];
  onCerrado: (t: TurnoCaja) => void;
}) {
  const [modo, setModo] = useState<'directo' | 'desglose'>('desglose');
  const [directo, setDirecto] = useState('');
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [observaciones, setObservaciones] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const billetesInvalidos = DENOMINACIONES.some((d) => (cantidades[d] ?? '') !== '' && parseEnteroNoNegativo(cantidades[d] ?? '') === null);
  const totalDesglose = sumCurrency(DENOMINACIONES.map((d) => d * (parseEnteroNoNegativo(cantidades[d] ?? '') ?? 0)));
  const directoNum = parseMonto(directo);
  const declarado = modo === 'desglose' ? (billetesInvalidos ? null : totalDesglose) : directoNum;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (declarado === null) return setError('Revisá el conteo: hay valores inválidos (solo enteros ≥ 0).');
    if (!confirmando) return setConfirmando(true);
    void run(async () => {
      setError(null);
      try {
        onCerrado(await cerrarTurnoCiego(turno.id, declarado, observaciones));
      } catch (err) {
        setConfirmando(false);
        setError(mensajeError(err));
      }
    });
  };

  return (
    <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
      <ModalHeader
        tono="alerta"
        eyebrow={<span className="text-amber-600 dark:text-amber-400">Protocolo de arqueo ciego</span>}
        titulo="Cierre de turno"
        descripcion={`${turno.cajero_nombre} · abierto ${formatFechaHora(turno.fecha_apertura)}`}
        onClose={onClose}
        closeDisabled={isSubmitting}
      />
      <ModalBody className="space-y-5">
        <p className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          <Icon name="eyeOff" size={15} className="mt-px shrink-0" />
          Contá solo el efectivo físico del cajón. El sistema no muestra el saldo esperado hasta confirmar.
        </p>

        <div className="flex rounded-xl border border-slate-200 p-1 text-xs font-semibold dark:border-white/10" role="tablist">
          {(['desglose', 'directo'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modo === m}
              onClick={() => {
                setModo(m);
                setConfirmando(false);
              }}
              className={cn(
                'h-8 flex-1 rounded-lg transition-[background-color,color] duration-150',
                modo === m ? 'bg-slate-900 text-white dark:bg-white dark:text-ink-950' : 'text-slate-500'
              )}
            >
              {m === 'desglose' ? 'Por billetes' : 'Monto total'}
            </button>
          ))}
        </div>

        {modo === 'directo' ? (
          <div>
            <label htmlFor="arq-directo" className="label">Efectivo contado</label>
            <input
              id="arq-directo"
              inputMode="decimal"
              value={directo}
              onChange={(e) => {
                setDirecto(e.target.value);
                setConfirmando(false);
              }}
              className={cn('input num h-12 text-xl font-semibold', directo !== '' && directoNum === null && 'input-error')}
              placeholder="0"
              data-autofocus
            />
          </div>
        ) : (
          <div className="surface-muted divide-y divide-slate-200/70 dark:divide-white/[0.05]">
            {DENOMINACIONES.map((d, i) => {
              const valor = cantidades[d] ?? '';
              const invalido = valor !== '' && parseEnteroNoNegativo(valor) === null;
              return (
                <div key={d} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span className="num w-20 text-sm font-semibold text-slate-700 dark:text-slate-300">{formatPrecio(d)}</span>
                  <span className="text-xs text-slate-400">×</span>
                  <input
                    inputMode="numeric"
                    value={valor}
                    onChange={(e) => {
                      setCantidades((prev) => ({ ...prev, [d]: e.target.value.replace(/[^\d]/g, '').slice(0, 6) }));
                      setConfirmando(false);
                    }}
                    className={cn('input num h-8 w-20 text-right', invalido && 'input-error')}
                    placeholder="0"
                    aria-label={`Cantidad de billetes de ${d}`}
                    data-autofocus={i === 0 ? true : undefined}
                  />
                  <span className="num w-28 text-right text-xs text-slate-500">
                    {formatPrecio(roundCurrency(d * (parseEnteroNoNegativo(valor) ?? 0)))}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-baseline justify-between rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3">
          <span className="label mb-0">Total declarado</span>
          <span className="num text-2xl font-bold text-amber-700 dark:text-amber-300">{declarado !== null ? formatPrecio(declarado) : '—'}</span>
        </div>

        <div>
          <label htmlFor="arq-obs" className="label">Observaciones (opcional)</label>
          <textarea
            id="arq-obs"
            rows={2}
            maxLength={500}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            className="input h-auto py-2"
            placeholder="Ej.: billete roto, retiro autorizado…"
          />
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs font-medium text-red-700 dark:text-red-300">
            <Icon name="alert" size={14} className="mt-px shrink-0" /> {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={isSubmitting} className="btn-secondary">Continuar turno</button>
        <button type="submit" disabled={isSubmitting || declarado === null} className={confirmando ? 'btn-danger' : 'btn-warning'}>
          {isSubmitting ? <Spinner /> : <Icon name="lock" size={16} />}
          {confirmando ? `Confirmar ${declarado !== null ? formatPrecio(declarado) : ''} y cerrar` : 'Auditar y cerrar turno'}
        </button>
      </ModalFooter>
    </form>
  );
}

function Resultado({ turno, onFinalizar }: { turno: TurnoCaja; onFinalizar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const { texto, tono } = etiquetaDesvio(turno.diferencia ?? 0);
  const colores = {
    exacto: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    sobrante: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
    faltante: 'text-red-600 dark:text-red-400 bg-red-500/10',
  }[tono];

  return (
    <>
      <ModalHeader
        tono={tono === 'faltante' ? 'peligro' : 'exito'}
        eyebrow="Acta oficial de arqueo"
        titulo={texto}
        descripcion={`${turno.cajero_nombre} · cierre ${formatFechaHora(turno.fecha_cierre)}`}
        onClose={onFinalizar}
      />
      <ModalBody className="space-y-4">
        <div className="print-area surface-muted space-y-2 p-4 text-sm">
          <Linea a="Fondo inicial" b={formatPrecio(turno.monto_apertura)} />
          <Linea a="Ventas en efectivo" b={`+${formatPrecio(turno.total_ventas_efectivo)}`} />
          {turno.total_movimientos_efectivo !== 0 && <Linea a="Movimientos manuales (efectivo)" b={formatDesvio(turno.total_movimientos_efectivo)} />}
          <div className="border-t border-slate-200 pt-2 dark:border-white/[0.06]">
            <Linea a="Esperado en cajón" b={formatPrecio(turno.monto_cierre_esperado ?? 0)} fuerte />
            <Linea a="Declarado a ciegas" b={formatPrecio(turno.monto_cierre_declarado ?? 0)} fuerte />
          </div>
          <div className={cn('flex items-center justify-between rounded-lg px-3 py-2 font-semibold', colores)}>
            <span>Desvío</span>
            <span className="num text-lg">{formatDesvio(turno.diferencia ?? 0)}</span>
          </div>
          <div className="border-t border-slate-200 pt-2 dark:border-white/[0.06]">
            <Linea a="Cobros digitales" b={formatPrecio(turno.total_ventas_digital)} />
            <Linea a={`Recaudación total (${turno.cantidad_ventas} ventas)`} b={formatPrecio(roundCurrency(turno.total_ventas_efectivo + turno.total_ventas_digital))} fuerte />
          </div>
          {turno.observaciones && <p className="pt-1 text-xs text-slate-500">Nota: {turno.observaciones}</p>}
        </div>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            setCopiado(await copiarAlPortapapeles(textoActaTurno(turno)));
            setTimeout(() => setCopiado(false), 2000);
          }}
        >
          <Icon name={copiado ? 'check' : 'whatsapp'} size={15} /> {copiado ? 'Copiada' : 'Copiar acta'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => window.print()}>
          <Icon name="printer" size={15} /> Imprimir
        </button>
        <button type="button" className="btn-primary" onClick={onFinalizar} data-autofocus>
          Finalizar
        </button>
      </ModalFooter>
    </>
  );
}

function Linea({ a, b, fuerte }: { a: string; b: string; fuerte?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3', fuerte ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400')}>
      <span>{a}</span>
      <span className="num">{b}</span>
    </div>
  );
}
