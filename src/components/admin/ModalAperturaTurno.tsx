'use client';

import { useState } from 'react';
import type { Empleado, RolUsuario, TurnoCaja } from '@/types/database';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import { abrirMiTurno, abrirTurno } from '@/lib/finanzas';
import { pinValido } from '@/lib/empleados';
import { cn, formatPrecio, mensajeError, parseMonto } from '@/lib/utils';

const PRESETS = [0, 5000, 10000, 15000, 20000, 30000];

type Props = {
  abierto: boolean;
  onClose: () => void;
  /**
   * admin → elige al cajero y firma con su PIN.
   * vendedor → abre SU turno: el empleado lo toma la base de la sesión
   * (en `empleados` solo llega su propio registro, por RLS).
   */
  rol: RolUsuario;
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
  rol,
  empleados,
  onTurnoAbierto,
  isSubmitting,
  run,
}: Props & { isSubmitting: boolean; run: ReturnType<typeof useSubmitLock>['run'] }) {
  const activos = empleados.filter((e) => e.activo);
  const propio = rol === 'vendedor';
  const yo = propio ? activos[0] ?? null : null;
  const [empleadoId, setEmpleadoId] = useState(activos[0]?.id ?? '');
  const [pin, setPin] = useState('');
  const [fondo, setFondo] = useState('15000');
  const [error, setError] = useState<string | null>(null);
  const fondoNum = parseMonto(fondo);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (fondoNum === null) return setError('El fondo inicial no es un monto válido.');
    if (!propio) {
      if (!empleadoId) return setError('Seleccioná el cajero responsable.');
      if (!pinValido(pin)) return setError('Ingresá el PIN de 4 a 6 dígitos del cajero.');
    }
    void run(async () => {
      setError(null);
      try {
        onTurnoAbierto(propio ? await abrirMiTurno(fondoNum) : await abrirTurno(empleadoId, pin, fondoNum));
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
        descripcion={propio ? 'Declarás el fondo de cambio del cajón. El turno queda a tu nombre.' : 'El cajero firma con su PIN y declara el fondo de cambio del cajón.'}
        onClose={onClose}
        closeDisabled={isSubmitting}
      />
      <ModalBody className="space-y-5">
        {activos.length === 0 ? (
          <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            <Icon name="alert" size={15} className="shrink-0" />
            {propio
              ? 'Tu usuario no está vinculado a un empleado activo. Pedile al administrador que lo revise.'
              : 'No hay empleados activos. Un administrador debe darlos de alta en «Turnos & personal».'}
          </div>
        ) : (
          <>
            {yo ? (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sm font-bold text-sky-700 dark:text-sky-300">
                  {yo.nombre.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="eyebrow">Cajero responsable</div>
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{yo.nombre} — {yo.puesto}</div>
                </div>
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
            </>
            )}
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
