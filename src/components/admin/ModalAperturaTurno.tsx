'use client';

import { useState } from 'react';
import type { Empleado, TurnoCaja } from '@/types/database';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import { abrirTurno } from '@/lib/finanzas';
import { pinValido } from '@/lib/empleados';
import { cn, formatPrecio, mensajeError, parseMonto } from '@/lib/utils';

const PRESETS = [0, 5000, 10000, 15000, 20000, 30000];

type Props = {
  abierto: boolean;
  onClose: () => void;
  empleados: Empleado[];
  onTurnoAbierto: (turno: TurnoCaja) => void;
};

export default function ModalAperturaTurno(props: Props) {
  const { isSubmitting, run } = useSubmitLock();
  return (
    <Modal open={props.abierto} onClose={props.onClose} closeDisabled={isSubmitting} size="sm">
      <Contenido {...props} isSubmitting={isSubmitting} run={run} />
    </Modal>
  );
}

function Contenido({
  onClose,
  empleados,
  onTurnoAbierto,
  isSubmitting,
  run,
}: Props & { isSubmitting: boolean; run: ReturnType<typeof useSubmitLock>['run'] }) {
  const activos = empleados.filter((e) => e.activo);
  const [empleadoId, setEmpleadoId] = useState(activos[0]?.id ?? '');
  const [pin, setPin] = useState('');
  const [fondo, setFondo] = useState('15000');
  const [error, setError] = useState<string | null>(null);
  const fondoNum = parseMonto(fondo);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!empleadoId) return setError('Seleccioná el cajero responsable.');
    if (!pinValido(pin)) return setError('Ingresá el PIN de 4 a 6 dígitos del cajero.');
    if (fondoNum === null) return setError('El fondo inicial no es un monto válido.');
    void run(async () => {
      setError(null);
      try {
        onTurnoAbierto(await abrirTurno(empleadoId, pin, fondoNum));
      } catch (err) {
        setPin('');
        setError(mensajeError(err));
      }
    });
  };

  return (
    <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
      <ModalHeader
        eyebrow="Control de turno"
        titulo="Apertura de caja"
        descripcion="El cajero firma con su PIN y declara el fondo de cambio del cajón."
        onClose={onClose}
        closeDisabled={isSubmitting}
      />
      <ModalBody className="space-y-5">
        {activos.length === 0 ? (
          <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            <Icon name="alert" size={15} className="shrink-0" />
            No hay empleados activos. Un administrador debe darlos de alta en «Turnos & personal».
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="ap-emp" className="label">Cajero responsable</label>
              <select id="ap-emp" value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} className="input">
                {activos.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre} — {e.puesto}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ap-pin" className="label">PIN del cajero</label>
              <input
                id="ap-pin"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input num h-11 text-center text-lg tracking-[0.5em]"
                placeholder="••••"
                data-autofocus
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="ap-fondo" className="label">Fondo inicial</label>
                <span className="num text-xs font-semibold text-militar-700 dark:text-militar-400">{fondoNum !== null ? formatPrecio(fondoNum) : '—'}</span>
              </div>
              <input
                id="ap-fondo"
                inputMode="decimal"
                value={fondo}
                onChange={(e) => setFondo(e.target.value)}
                className={cn('input num h-11 text-base font-semibold', fondoNum === null && 'input-error')}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button key={p} type="button" onClick={() => setFondo(String(p))} className={cn('chip num', fondoNum === p && 'chip-active')}>
                    {formatPrecio(p)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs font-medium text-red-700 dark:text-red-300">
            <Icon name="alert" size={14} className="mt-px shrink-0" /> {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={isSubmitting} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={isSubmitting || activos.length === 0} className="btn-primary">
          {isSubmitting ? <Spinner /> : <Icon name="unlock" size={16} />} Abrir turno
        </button>
      </ModalFooter>
    </form>
  );
}
