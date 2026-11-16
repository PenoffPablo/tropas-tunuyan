'use client';

/**
 * Piezas compartidas por el alta de empleado, "Crear acceso" y "Resetear
 * contraseña": elección de la contraseña inicial y la vista que entrega las
 * credenciales al admin (una sola vez).
 */
import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import { copiarAlPortapapeles } from '@/lib/finanzas';
import { LARGO_MINIMO_PASSWORD, emailValido, problemaPassword, usuarioValido } from '@/lib/acceso';
import type { CredencialesEntregadas } from '@/lib/personal-acciones';
import { cn } from '@/lib/utils';

export type EstadoPassword = { generar: boolean; valor: string };

/** null si es válida; si no, el motivo. */
export function problemaEstadoPassword(p: EstadoPassword): string | null {
  return p.generar ? null : problemaPassword(p.valor);
}

export function CamposPassword({
  estado,
  onChange,
  idPrefijo,
}: {
  estado: EstadoPassword;
  onChange: (e: EstadoPassword) => void;
  idPrefijo: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="label">Contraseña inicial</legend>
      <div className="flex gap-1.5" role="radiogroup">
        {(
          [
            [true, 'Generar automáticamente'],
            [false, 'Definirla yo'],
          ] as const
        ).map(([generar, txt]) => (
          <button
            key={txt}
            type="button"
            role="radio"
            aria-checked={estado.generar === generar}
            onClick={() => onChange({ ...estado, generar })}
            className={cn('chip', estado.generar === generar && 'chip-active')}
          >
            {txt}
          </button>
        ))}
      </div>
      {!estado.generar && (
        <input
          id={`${idPrefijo}-password`}
          aria-label="Contraseña inicial"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={estado.valor}
          onChange={(e) => onChange({ ...estado, valor: e.target.value })}
          className="input num"
          placeholder={`Mínimo ${LARGO_MINIMO_PASSWORD} caracteres`}
        />
      )}
      <p className="text-[11px] text-slate-500">En el primer ingreso se le pedirá elegir una propia.</p>
    </fieldset>
  );
}

export function CamposCuenta({
  usuario,
  onUsuario,
  email,
  onEmail,
  idPrefijo,
}: {
  usuario: string;
  onUsuario: (v: string) => void;
  email: string;
  onEmail: (v: string) => void;
  idPrefijo: string;
}) {
  const usuarioMal = usuario !== '' && !usuarioValido(usuario);
  const emailMal = email.trim() !== '' && !emailValido(email.trim());
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor={`${idPrefijo}-usuario`} className="label">Usuario *</label>
        <input
          id={`${idPrefijo}-usuario`}
          value={usuario}
          maxLength={40}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => onUsuario(e.target.value.toLowerCase().replace(/\s+/g, ''))}
          className={cn('input font-mono', usuarioMal && 'input-error')}
          placeholder="juan.perez"
        />
        {usuarioMal && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">Solo minúsculas, números y . _ - (mín. 3)</p>}
      </div>
      <div>
        <label htmlFor={`${idPrefijo}-email`} className="label">Correo real (opcional)</label>
        <input
          id={`${idPrefijo}-email`}
          type="email"
          inputMode="email"
          value={email}
          maxLength={254}
          onChange={(e) => onEmail(e.target.value)}
          className={cn('input', emailMal && 'input-error')}
          placeholder="—"
        />
        <p className="mt-1 text-[11px] text-slate-500">Si lo cargás, entra con el correo en vez del usuario.</p>
      </div>
    </div>
  );
}

export function VistaCredenciales({ nombre, credenciales }: { nombre: string; credenciales: CredencialesEntregadas }) {
  const [copiado, setCopiado] = useState(false);
  const texto = `Usuario: ${credenciales.login}${credenciales.password ? `\nContraseña: ${credenciales.password}` : ''}`;
  const copiar = async () => setCopiado(await copiarAlPortapapeles(texto));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
        <Icon name="shieldCheck" size={15} className="mt-px shrink-0" />
        <span>
          Acceso listo para <strong>{nombre}</strong>. Pasale estos datos: en el primer ingreso va a tener que elegir su propia contraseña.
        </span>
      </div>
      <dl className="surface divide-y divide-slate-200/70 dark:divide-white/[0.06]">
        <div className="flex items-center justify-between gap-3 p-3">
          <dt className="text-xs text-slate-500">Usuario</dt>
          <dd className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{credenciales.login}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 p-3">
          <dt className="text-xs text-slate-500">Contraseña</dt>
          <dd className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
            {credenciales.password ?? <span className="font-sans font-normal text-slate-500">la que definiste</span>}
          </dd>
        </div>
      </dl>
      {credenciales.password && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
          <Icon name="alert" size={14} className="mt-px shrink-0" />
          Anotala ahora: no se vuelve a mostrar. Si se pierde, usá «Resetear contraseña».
        </p>
      )}
      <button type="button" onClick={copiar} className="btn-secondary btn-sm w-full">
        <Icon name={copiado ? 'check' : 'copy'} size={14} /> {copiado ? 'Copiado' : 'Copiar datos'}
      </button>
    </div>
  );
}
