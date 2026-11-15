'use client';

/**
 * Control de venta regulada: el operador del turno declara haber constatado
 * la credencial del comprador y FIRMA con su PIN. El PIN se valida en la base
 * (verificar_credencial_empleado, SECURITY DEFINER) y vuelve a validarse dentro
 * de la transacción de venta: no hay forma de saltear el control desde el cliente.
 */
import { useState } from 'react';
import type { CredencialVenta, VentaItemCarrito } from '@/types/database';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import { pinValido, verificarCredencialEmpleado } from '@/lib/empleados';
import { mensajeError } from '@/lib/utils';

export const INSTITUCIONES_OFICIALES = [
  'Policía de Mendoza',
  'Gendarmería Nacional Argentina (GNA)',
  'Ejército Argentino (EA)',
  'Fuerza Aérea Argentina (FAA)',
  'Armada Argentina (ARA)',
  'Servicio Penitenciario de Mendoza',
  'Prefectura Naval Argentina (PNA)',
  'Policía Federal Argentina (PFA)',
  'Policía de Seguridad Aeroportuaria (PSA)',
  'Seguridad Privada Habilitada',
  'Otra fuerza / repartición oficial',
] as const;

type Props = {
  abierto: boolean;
  onClose: () => void;
  itemsRestringidos: VentaItemCarrito[];
  operador: { id: string; nombre: string } | null;
  credencialPrevia: CredencialVenta | null;
  onConfirmar: (credencial: CredencialVenta) => void;
};

export default function ModalVerificacionCredencial(props: Props) {
  return (
    <Modal open={props.abierto} onClose={props.onClose} size="md">
      <Contenido {...props} />
    </Modal>
  );
}

function Contenido({ onClose, itemsRestringidos, operador, credencialPrevia, onConfirmar }: Props) {
  const { isSubmitting, run } = useSubmitLock();
  const [fuerza, setFuerza] = useState<string>(credencialPrevia?.fuerza_institucion ?? INSTITUCIONES_OFICIALES[0]);
  const [legajo, setLegajo] = useState(credencialPrevia?.legajo ?? '');
  const [declaro, setDeclaro] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      setError(null);
      if (!operador) return setError('No hay un operador identificado en el turno. Reabrí el turno con PIN.');
      if (!declaro) return setError('Confirmá la verificación visual de la credencial oficial.');
      if (!pinValido(pin)) return setError('Ingresá tu PIN de 4 a 6 dígitos.');
      try {
        const ok = await verificarCredencialEmpleado(operador.id, pin);
        if (!ok) {
          setPin('');
          return setError('PIN incorrecto. Tras 5 intentos fallidos el operador se bloquea 5 minutos.');
        }
        onConfirmar({ fuerza_institucion: fuerza, legajo: legajo.trim().slice(0, 40), declaracion_jurada: true, pin_operador: pin });
      } catch (err) {
        setError(mensajeError(err));
      }
    });
  };

  return (
    <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
      <ModalHeader
        tono="peligro"
        eyebrow={<span className="text-red-600 dark:text-red-400">Protocolo obligatorio</span>}
        titulo="Credencial habilitante"
        descripcion="Venta restringida: constatá la credencial oficial vigente del comprador."
        onClose={onClose}
        closeDisabled={isSubmitting}
      />
      <ModalBody className="space-y-5">
        <div className="surface-muted space-y-1.5 border-red-200/60 p-3 dark:border-red-500/15">
          {itemsRestringidos.map((it) => (
            <div key={it.variante_id} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
                <Icon name="shield" size={13} className="text-red-500" />
                {it.nombre} <span className="text-slate-500">· T. {it.talle} / {it.color}</span>
              </span>
              <span className="num font-semibold text-slate-600 dark:text-slate-400">×{it.cantidad}</span>
            </div>
          ))}
        </div>

        <div>
          <label htmlFor="cred-fuerza" className="label">Fuerza / institución del comprador</label>
          <select id="cred-fuerza" value={fuerza} onChange={(e) => setFuerza(e.target.value)} className="input">
            {INSTITUCIONES_OFICIALES.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="cred-legajo" className="label">N.º de credencial / legajo (opcional)</label>
          <input
            id="cred-legajo"
            value={legajo}
            maxLength={40}
            onChange={(e) => setLegajo(e.target.value)}
            className="input font-mono"
            placeholder="Ej.: LP-44820"
            autoComplete="off"
          />
          <p className="field-hint">Minimización de datos (Ley 25.326): no se almacenan fotos ni documentos.</p>
        </div>

        <label className="surface-muted flex cursor-pointer items-start gap-3 p-3.5">
          <input
            type="checkbox"
            checked={declaro}
            onChange={(e) => setDeclaro(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-red-600"
          />
          <span className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            <strong className="text-slate-900 dark:text-white">Declaro bajo responsabilidad</strong> haber verificado la credencial
            oficial vigente (física o digital) del comprador.
          </span>
        </label>

        <div>
          <label htmlFor="cred-pin" className="label">
            PIN del operador {operador && <span className="normal-case tracking-normal text-slate-700 dark:text-slate-300">· {operador.nombre}</span>}
          </label>
          <input
            id="cred-pin"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{4,6}"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="input num h-11 text-center text-lg tracking-[0.5em]"
            placeholder="••••"
            data-autofocus
          />
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs font-medium text-red-700 dark:text-red-300">
            <Icon name="alert" size={14} className="mt-px shrink-0" /> {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={isSubmitting} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="btn-danger">
          {isSubmitting ? <Spinner /> : <Icon name="shieldCheck" size={16} />}
          Acreditar y continuar
        </button>
      </ModalFooter>
    </form>
  );
}
