'use client';

import { useState } from 'react';
import type { Empleado } from '@/types/database';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import { guardarEmpleado, pinValido } from '@/lib/empleados';
import { cn, mensajeError } from '@/lib/utils';

type Props = {
  abierto: boolean;
  empleado: Empleado | null;
  onClose: () => void;
  onGuardado: (mensaje: string) => void;
};

export default function ModalEmpleado(props: Props) {
  const { isSubmitting, run } = useSubmitLock();
  return (
    <Modal open={props.abierto} onClose={props.onClose} closeDisabled={isSubmitting} size="sm">
      <Contenido {...props} isSubmitting={isSubmitting} run={run} />
    </Modal>
  );
}

function Contenido({
  empleado,
  onClose,
  onGuardado,
  isSubmitting,
  run,
}: Props & { isSubmitting: boolean; run: ReturnType<typeof useSubmitLock>['run'] }) {
  const [nombre, setNombre] = useState(empleado?.nombre ?? '');
  const [puesto, setPuesto] = useState(empleado?.puesto ?? 'Vendedor Mostrador');
  const [telefono, setTelefono] = useState(empleado?.telefono ?? '');
  const [activo, setActivo] = useState(empleado?.activo ?? true);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const esAlta = empleado === null;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (nombre.trim().length < 2) return setError('Ingresá el nombre del empleado.');
    if (esAlta || pin) {
      if (!pinValido(pin)) return setError('El PIN debe tener entre 4 y 6 dígitos.');
      if (pin !== pin2) return setError('Los PIN no coinciden.');
      if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) {
        return setError('Elegí un PIN menos predecible (no repetido ni secuencial).');
      }
    }
    void run(async () => {
      setError(null);
      try {
        await guardarEmpleado({ id: empleado?.id ?? null, nombre, puesto, telefono, activo, pin: pin || null });
        onGuardado(esAlta ? `${nombre.trim()} dado de alta` : `${nombre.trim()} actualizado`);
      } catch (err) {
        setError(mensajeError(err));
      }
    });
  };

  return (
    <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
      <ModalHeader eyebrow="Personal" titulo={esAlta ? 'Nuevo empleado' : 'Editar empleado'} descripcion="El PIN se guarda cifrado (bcrypt) y nunca se puede leer." onClose={onClose} closeDisabled={isSubmitting} />
      <ModalBody className="space-y-4">
        <div>
          <label htmlFor="emp-nombre" className="label">Nombre *</label>
          <input id="emp-nombre" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} className="input" data-autofocus />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="emp-puesto" className="label">Puesto / turno</label>
            <input id="emp-puesto" value={puesto} maxLength={60} onChange={(e) => setPuesto(e.target.value)} className="input" />
          </div>
          <div>
            <label htmlFor="emp-tel" className="label">Teléfono</label>
            <input id="emp-tel" value={telefono} maxLength={30} inputMode="tel" onChange={(e) => setTelefono(e.target.value)} className="input num" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="emp-pin" className="label">{esAlta ? 'PIN *' : 'Nuevo PIN (opcional)'}</label>
            <input id="emp-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className="input num tracking-[0.4em]" placeholder="••••" />
          </div>
          <div>
            <label htmlFor="emp-pin2" className="label">Repetir PIN</label>
            <input id="emp-pin2" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 6))} className="input num tracking-[0.4em]" placeholder="••••" />
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={activo}
          onClick={() => setActivo(!activo)}
          className={cn('flex w-full items-center justify-between rounded-xl border p-3 text-sm', activo ? 'border-emerald-500/30 bg-emerald-500/[0.05]' : 'border-slate-200 dark:border-white/10')}
        >
          <span className="font-semibold text-slate-900 dark:text-white">{activo ? 'Activo — puede abrir turnos' : 'Inactivo'}</span>
          <span className={cn('relative h-5 w-9 rounded-full transition-colors', activo ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-white/15')}>
            <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200', activo ? 'translate-x-[18px]' : 'translate-x-0.5')} />
          </span>
        </button>
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs font-medium text-red-700 dark:text-red-300">
            <Icon name="alert" size={14} className="mt-px shrink-0" /> {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={isSubmitting} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? <Spinner /> : <Icon name="check" size={16} />} Guardar
        </button>
      </ModalFooter>
    </form>
  );
}
