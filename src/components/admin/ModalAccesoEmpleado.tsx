'use client';

/**
 * "Crear acceso" para un empleado ya cargado sin usuario, y "Resetear
 * contraseña" para uno que ya tiene acceso. Ambos terminan mostrando las
 * credenciales una sola vez.
 */
import { useEffect, useState } from 'react';
import type { Empleado } from '@/types/database';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import { emailValido, usuarioBase, usuarioValido } from '@/lib/acceso';
import {
  crearAccesoEmpleado,
  resetearPasswordEmpleado,
  sugerirUsuario,
  type CredencialesEntregadas,
} from '@/lib/personal-acciones';
import {
  CamposCuenta,
  CamposPassword,
  VistaCredenciales,
  problemaEstadoPassword,
  type EstadoPassword,
} from './AccesoCampos';

type Props = {
  empleado: Empleado;
  modo: 'crear' | 'resetear';
  onClose: () => void;
  onListo: (mensaje: string) => void;
};

export default function ModalAccesoEmpleado(props: Props) {
  const { isSubmitting, run } = useSubmitLock();
  return (
    <Modal open onClose={props.onClose} closeDisabled={isSubmitting} size="sm">
      <Contenido {...props} isSubmitting={isSubmitting} run={run} />
    </Modal>
  );
}

function Contenido({
  empleado,
  modo,
  onClose,
  onListo,
  isSubmitting,
  run,
}: Props & { isSubmitting: boolean; run: ReturnType<typeof useSubmitLock>['run'] }) {
  const [usuario, setUsuario] = useState(() => usuarioBase(empleado.nombre));
  const [usuarioEditado, setUsuarioEditado] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState<EstadoPassword>({ generar: true, valor: '' });
  const [error, setError] = useState<string | null>(null);
  const [credenciales, setCredenciales] = useState<CredencialesEntregadas | null>(null);
  const crear = modo === 'crear';
  const mensajeFinal = crear ? `Acceso creado para ${empleado.nombre}` : `Contraseña de ${empleado.nombre} reseteada`;

  useEffect(() => {
    if (!crear) return;
    let vigente = true;
    sugerirUsuario(empleado.nombre)
      .then((s) => {
        if (vigente && s && !usuarioEditado) setUsuario(s);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
    // Solo al abrir: después manda lo que escriba el admin.
  }, []);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (crear) {
      if (!usuarioValido(usuario)) return setError('Usuario inválido: de 3 a 40 caracteres, solo minúsculas, números y . _ -');
      if (email.trim() && !emailValido(email.trim())) return setError('El correo real no es válido.');
    }
    const pw = problemaEstadoPassword(password);
    if (pw) return setError(pw);
    const valor = password.generar ? null : password.valor;
    void run(async () => {
      setError(null);
      try {
        const r = crear
          ? await crearAccesoEmpleado(empleado.id, { usuario, email: email.trim() || null, password: valor })
          : await resetearPasswordEmpleado(empleado.id, valor);
        if (!r.ok) return setError(r.error);
        setCredenciales(r.datos);
      } catch {
        setError('No se pudo conectar con el servidor. Reintentá.');
      }
    });
  };

  if (credenciales) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ModalHeader eyebrow="Acceso" titulo={crear ? 'Acceso creado' : 'Contraseña reseteada'} onClose={() => onListo(mensajeFinal)} />
        <ModalBody>
          <VistaCredenciales nombre={empleado.nombre} credenciales={credenciales} />
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => onListo(mensajeFinal)} className="btn-primary">
            <Icon name="check" size={16} /> Listo
          </button>
        </ModalFooter>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
      <ModalHeader
        eyebrow="Acceso"
        titulo={crear ? 'Crear acceso' : 'Resetear contraseña'}
        descripcion={
          crear
            ? `${empleado.nombre} podrá iniciar sesión como vendedor y abrir su turno.`
            : `${empleado.nombre} (${empleado.usuario ?? '—'}) deberá elegir una contraseña nueva al ingresar.`
        }
        onClose={onClose}
        closeDisabled={isSubmitting}
      />
      <ModalBody className="space-y-4">
        {crear && (
          <CamposCuenta
            idPrefijo="acc"
            usuario={usuario}
            onUsuario={(v) => {
              setUsuarioEditado(true);
              setUsuario(v);
            }}
            email={email}
            onEmail={setEmail}
          />
        )}
        <CamposPassword idPrefijo="acc" estado={password} onChange={setPassword} />
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs font-medium text-red-700 dark:text-red-300">
            <Icon name="alert" size={14} className="mt-px shrink-0" /> {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={isSubmitting} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? <Spinner /> : <Icon name={crear ? 'shieldCheck' : 'refresh'} size={16} />} {crear ? 'Crear acceso' : 'Resetear'}
        </button>
      </ModalFooter>
    </form>
  );
}
