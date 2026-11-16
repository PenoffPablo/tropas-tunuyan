'use client';

import { useEffect, useRef, useState } from 'react';
import type { Empleado } from '@/types/database';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import { pinValido } from '@/lib/empleados';
import { emailValido, usuarioBase, usuarioValido } from '@/lib/acceso';
import {
  actualizarEmpleado,
  crearEmpleadoConAcceso,
  sugerirUsuario,
  type CredencialesEntregadas,
} from '@/lib/personal-acciones';
import { cn } from '@/lib/utils';
import {
  CamposCuenta,
  CamposPassword,
  VistaCredenciales,
  problemaEstadoPassword,
  type EstadoPassword,
} from './AccesoCampos';

type Props = {
  abierto: boolean;
  empleado: Empleado | null;
  onClose: () => void;
  /** Cambio guardado: el padre refresca datos y muestra el mensaje. */
  onGuardado: (mensaje: string, tono?: 'exito' | 'alerta') => void;
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
  const [usuario, setUsuario] = useState('');
  const [usuarioEditado, setUsuarioEditado] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState<EstadoPassword>({ generar: true, valor: '' });
  const [error, setError] = useState<string | null>(null);
  const [credenciales, setCredenciales] = useState<CredencialesEntregadas | null>(null);
  const esAlta = empleado === null;

  /* Sugerencia de usuario (nombre.apellido, sin repetir) mientras el admin no lo edite a mano. */
  const pedido = useRef(0);
  useEffect(() => {
    if (!esAlta || usuarioEditado) return;
    const base = usuarioBase(nombre);
    setUsuario(base);
    if (!base) return;
    const id = ++pedido.current;
    const t = setTimeout(() => {
      sugerirUsuario(nombre)
        .then((s) => {
          if (id === pedido.current && s) setUsuario(s);
        })
        .catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [nombre, esAlta, usuarioEditado]);

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
    if (esAlta) {
      if (!usuarioValido(usuario)) return setError('Usuario inválido: de 3 a 40 caracteres, solo minúsculas, números y . _ -');
      if (email.trim() && !emailValido(email.trim())) return setError('El correo real no es válido.');
      const pw = problemaEstadoPassword(password);
      if (pw) return setError(pw);
    }
    void run(async () => {
      setError(null);
      try {
        if (esAlta) {
          const r = await crearEmpleadoConAcceso({
            nombre,
            puesto,
            telefono,
            pin,
            usuario,
            email: email.trim() || null,
            password: password.generar ? null : password.valor,
          });
          if (!r.ok) return setError(r.error);
          setCredenciales(r.datos);
          return;
        }
        const r = await actualizarEmpleado({ id: empleado.id, nombre, puesto, telefono, activo, pin: pin || null });
        if (!r.ok) return setError(r.error);
        if (r.datos.aviso) onGuardado(r.datos.aviso, 'alerta');
        else onGuardado(`${nombre.trim()} actualizado`);
      } catch {
        setError('No se pudo conectar con el servidor. Reintentá.');
      }
    });
  };

  if (credenciales) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ModalHeader eyebrow="Personal" titulo="Empleado dado de alta" onClose={() => onGuardado(`${nombre.trim()} dado de alta`)} />
        <ModalBody>
          <VistaCredenciales nombre={nombre.trim()} credenciales={credenciales} />
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => onGuardado(`${nombre.trim()} dado de alta`)} className="btn-primary">
            <Icon name="check" size={16} /> Listo
          </button>
        </ModalFooter>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
      <ModalHeader
        eyebrow="Personal"
        titulo={esAlta ? 'Nuevo empleado' : 'Editar empleado'}
        descripcion={esAlta ? 'Se crea también su usuario para iniciar sesión como vendedor.' : 'El PIN se guarda cifrado (bcrypt) y nunca se puede leer.'}
        onClose={onClose}
        closeDisabled={isSubmitting}
      />
      <ModalBody className="space-y-4">
        <div>
          <label htmlFor="emp-nombre" className="label">Nombre y apellido *</label>
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

        {esAlta ? (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
            <div className="eyebrow">Acceso al sistema · rol vendedor</div>
            <CamposCuenta
              idPrefijo="emp"
              usuario={usuario}
              onUsuario={(v) => {
                setUsuarioEditado(true);
                setUsuario(v);
              }}
              email={email}
              onEmail={setEmail}
            />
            <CamposPassword idPrefijo="emp" estado={password} onChange={setPassword} />
          </div>
        ) : (
          empleado.usuario && (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm dark:border-white/10">
              <span className="text-xs text-slate-500">Usuario de acceso</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">{empleado.usuario}</span>
            </div>
          )
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="emp-pin" className="label">{esAlta ? 'PIN de firma *' : 'Nuevo PIN (opcional)'}</label>
            <input id="emp-pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className="input num tracking-[0.4em]" placeholder="••••" />
          </div>
          <div>
            <label htmlFor="emp-pin2" className="label">Repetir PIN</label>
            <input id="emp-pin2" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 6))} className="input num tracking-[0.4em]" placeholder="••••" />
          </div>
        </div>
        {esAlta && <p className="-mt-2 text-[11px] text-slate-500">El PIN firma las ventas que exigen credencial.</p>}

        {!esAlta && (
          <button
            type="button"
            role="switch"
            aria-checked={activo}
            onClick={() => setActivo(!activo)}
            className={cn('flex w-full items-center justify-between rounded-xl border p-3 text-sm', activo ? 'border-emerald-500/30 bg-emerald-500/[0.05]' : 'border-slate-200 dark:border-white/10')}
          >
            <span className="text-left">
              <span className="block font-semibold text-slate-900 dark:text-white">{activo ? 'Activo — puede abrir turnos' : 'Inactivo'}</span>
              {empleado.user_id && <span className="block text-[11px] text-slate-500">{activo ? 'Puede iniciar sesión' : 'Su usuario queda bloqueado'}</span>}
            </span>
            <span className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', activo ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-white/15')}>
              <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200', activo ? 'translate-x-[18px]' : 'translate-x-0.5')} />
            </span>
          </button>
        )}
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs font-medium text-red-700 dark:text-red-300">
            <Icon name="alert" size={14} className="mt-px shrink-0" /> {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={isSubmitting} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? <Spinner /> : <Icon name="check" size={16} />} {esAlta ? 'Crear empleado y acceso' : 'Guardar'}
        </button>
      </ModalFooter>
    </form>
  );
}
