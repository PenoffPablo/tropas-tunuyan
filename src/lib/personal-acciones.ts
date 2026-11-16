'use server';

/**
 * Server Actions de gestión del personal y sus cuentas de acceso.
 *
 * · Cada acción verifica primero, en el servidor, que quien llama tenga sesión
 *   válida (getUser() contra Supabase Auth) y rol admin en app_metadata.
 * · Las cuentas se crean/bloquean con la service role (auth.admin.*); los datos
 *   de empleados se escriben con el JWT del admin vía RPC (RLS + auditoría).
 * · Consistencia: si falla el alta/vínculo del empleado después de crear la
 *   cuenta de Auth, la cuenta se borra (no quedan usuarios huérfanos).
 * · Devuelven { ok, error } en vez de lanzar: en producción Next oculta el
 *   mensaje de las excepciones de las Server Actions.
 */
import { randomInt } from 'node:crypto';
import { createSupabaseServer } from './supabase-server';
import { createSupabaseAdmin } from './supabase-admin';
import {
  emailInterno,
  emailValido,
  etiquetaCuenta,
  problemaPassword,
  usuarioBase,
  usuarioDisponible,
  usuarioValido,
} from './acceso';
import type { TypedSupabase } from './supabase';

export type ResultadoAccion<T> = { ok: true; datos: T } | { ok: false; error: string };

/** Lo que el admin le entrega al empleado. `password` solo si la generó el sistema. */
export type CredencialesEntregadas = { login: string; password: string | null };

export type DatosAcceso = {
  usuario: string;
  /** Email real opcional: si se carga, el empleado entra con él en vez del usuario. */
  email: string | null;
  /** null → se genera una contraseña aleatoria. */
  password: string | null;
};

export type DatosAltaEmpleado = DatosAcceso & {
  nombre: string;
  puesto: string;
  telefono: string;
  pin: string;
};

const ROL_EMPLEADO = 'vendedor';
const BLOQUEO_INDEFINIDO = '876000h'; // ~100 años

const falla = (error: string) => ({ ok: false, error }) as const;

async function exigirAdmin(): Promise<TypedSupabase | null> {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && user.app_metadata?.rol === 'admin' ? supabase : null;
}

function adminAuth() {
  try {
    return { ok: true as const, admin: createSupabaseAdmin() };
  } catch {
    return falla('El servidor no tiene configurada la clave de servicio de Supabase (SUPABASE_SERVICE_ROLE_KEY).');
  }
}

/** 12 caracteres sin ambiguos (0/O, 1/l/I) generados con CSPRNG. */
function generarPassword(): string {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += alfabeto[randomInt(alfabeto.length)];
  return s;
}

function mensajeAuth(err: { message: string; code?: string }): string {
  if (err.code === 'email_exists' || /already (been )?registered|already exists/i.test(err.message)) {
    return 'Ya existe una cuenta con ese usuario o correo.';
  }
  if (err.code === 'weak_password' || /password/i.test(err.message)) {
    return 'La contraseña no cumple los requisitos de seguridad configurados en Supabase.';
  }
  if (err.code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(err.message)) {
    return 'Supabase rechazó el correo de la cuenta. Revisá el usuario o el correo real.';
  }
  return `No se pudo gestionar la cuenta: ${err.message}`;
}

function mensajeRpc(err: { message: string; code?: string | null }): string {
  return err.code === '42501' ? 'No tenés permisos para esta operación.' : err.message || 'Error inesperado';
}

type AccesoValidado = { usuario: string; emailCuenta: string; login: string; password: string; generada: boolean };

function validarAcceso(d: DatosAcceso): ResultadoAccion<AccesoValidado> {
  const usuario = d.usuario.trim().toLowerCase();
  if (!usuarioValido(usuario)) {
    return falla('Usuario inválido: de 3 a 40 caracteres, solo letras minúsculas, números y . _ - (ej. juan.perez).');
  }
  const emailReal = d.email?.trim().toLowerCase() || null;
  if (emailReal && !emailValido(emailReal)) return falla('El correo real no es válido.');
  if (d.password !== null) {
    const p = problemaPassword(d.password);
    if (p) return falla(p);
  }
  const password = d.password ?? generarPassword();
  return {
    ok: true,
    datos: {
      usuario,
      emailCuenta: emailReal ?? emailInterno(usuario),
      login: emailReal ?? usuario,
      password,
      generada: d.password === null,
    },
  };
}

async function usuarioLibre(supabase: TypedSupabase, usuario: string): Promise<boolean> {
  const { data } = await supabase.from('empleados').select('id').eq('usuario', usuario).maybeSingle();
  return !data;
}

/** Bloquea (o desbloquea) el login. Devuelve un aviso si no se pudo. */
async function sincronizarBloqueo(userId: string, activo: boolean): Promise<string | null> {
  const a = adminAuth();
  if (!a.ok) return `${a.error} El empleado no puede operar, pero su cuenta no quedó bloqueada en Auth.`;
  const { error } = await a.admin.auth.admin.updateUserById(userId, { ban_duration: activo ? 'none' : BLOQUEO_INDEFINIDO });
  if (!error) return null;
  return activo
    ? 'El empleado quedó activo pero no se pudo desbloquear su cuenta. Reintentá guardando de nuevo.'
    : 'El empleado quedó inactivo (ya no puede operar), pero no se pudo bloquear su cuenta en Auth. Reintentá.';
}

/* ───────────────────────────── Acciones ───────────────────────────── */

export async function sugerirUsuario(nombre: string): Promise<string> {
  const supabase = await exigirAdmin();
  if (!supabase) return '';
  const base = usuarioBase(nombre);
  if (!base) return '';
  const { data } = await supabase.from('empleados').select('usuario').like('usuario', `${base}%`);
  return usuarioDisponible(base, (data ?? []).map((e) => e.usuario ?? ''));
}

export async function crearEmpleadoConAcceso(d: DatosAltaEmpleado): Promise<ResultadoAccion<CredencialesEntregadas>> {
  const supabase = await exigirAdmin();
  if (!supabase) return falla('Solo el administrador puede dar de alta personal.');
  const nombre = d.nombre.trim();
  if (nombre.length < 2 || nombre.length > 80) return falla('El nombre debe tener entre 2 y 80 caracteres.');
  if (!/^\d{4,6}$/.test(d.pin)) return falla('El PIN debe tener entre 4 y 6 dígitos.');
  const v = validarAcceso(d);
  if (!v.ok) return v;
  const { usuario, emailCuenta, login, password, generada } = v.datos;
  if (!(await usuarioLibre(supabase, usuario))) return falla(`El usuario "${usuario}" ya está en uso.`);

  const a = adminAuth();
  if (!a.ok) return a;
  const creado = await a.admin.auth.admin.createUser({
    email: emailCuenta,
    password,
    email_confirm: true,
    app_metadata: { rol: ROL_EMPLEADO, debe_cambiar_password: true },
  });
  if (creado.error || !creado.data.user) return falla(mensajeAuth(creado.error ?? { message: 'sin datos' }));
  const userId = creado.data.user.id;

  const { error } = await supabase.rpc('alta_empleado_con_acceso', {
    p_nombre: nombre,
    p_puesto: d.puesto.trim(),
    p_telefono: d.telefono.trim() || null,
    p_pin: d.pin,
    p_user_id: userId,
    p_usuario: usuario,
  });
  if (error) {
    const borrado = await a.admin.auth.admin.deleteUser(userId);
    return falla(
      mensajeRpc(error) +
        (borrado.error ? ` (Además no se pudo borrar la cuenta creada ${emailCuenta}: eliminala desde Supabase → Authentication.)` : '')
    );
  }
  return { ok: true, datos: { login, password: generada ? password : null } };
}

export async function crearAccesoEmpleado(
  empleadoId: string,
  d: DatosAcceso
): Promise<ResultadoAccion<CredencialesEntregadas>> {
  const supabase = await exigirAdmin();
  if (!supabase) return falla('Solo el administrador puede crear accesos.');
  const { data: emp } = await supabase.from('empleados').select('id, activo, user_id').eq('id', empleadoId).maybeSingle();
  if (!emp) return falla('Empleado inexistente.');
  if (emp.user_id) return falla('Este empleado ya tiene acceso.');
  if (!emp.activo) return falla('El empleado está inactivo: reactivalo antes de crearle acceso.');
  const v = validarAcceso(d);
  if (!v.ok) return v;
  const { usuario, emailCuenta, login, password, generada } = v.datos;
  if (!(await usuarioLibre(supabase, usuario))) return falla(`El usuario "${usuario}" ya está en uso.`);

  const a = adminAuth();
  if (!a.ok) return a;
  const creado = await a.admin.auth.admin.createUser({
    email: emailCuenta,
    password,
    email_confirm: true,
    app_metadata: { rol: ROL_EMPLEADO, debe_cambiar_password: true },
  });
  if (creado.error || !creado.data.user) return falla(mensajeAuth(creado.error ?? { message: 'sin datos' }));
  const userId = creado.data.user.id;

  const { error } = await supabase.rpc('vincular_acceso_empleado', {
    p_empleado_id: empleadoId,
    p_user_id: userId,
    p_usuario: usuario,
  });
  if (error) {
    const borrado = await a.admin.auth.admin.deleteUser(userId);
    return falla(
      mensajeRpc(error) +
        (borrado.error ? ` (Además no se pudo borrar la cuenta creada ${emailCuenta}: eliminala desde Supabase → Authentication.)` : '')
    );
  }
  return { ok: true, datos: { login, password: generada ? password : null } };
}

export async function resetearPasswordEmpleado(
  empleadoId: string,
  passwordNueva: string | null
): Promise<ResultadoAccion<CredencialesEntregadas>> {
  const supabase = await exigirAdmin();
  if (!supabase) return falla('Solo el administrador puede resetear contraseñas.');
  if (passwordNueva !== null) {
    const p = problemaPassword(passwordNueva);
    if (p) return falla(p);
  }
  const { data: emp } = await supabase.from('empleados').select('user_id').eq('id', empleadoId).maybeSingle();
  if (!emp?.user_id) return falla('Este empleado no tiene acceso creado.');

  const a = adminAuth();
  if (!a.ok) return a;
  const actual = await a.admin.auth.admin.getUserById(emp.user_id);
  if (actual.error || !actual.data.user) return falla(mensajeAuth(actual.error ?? { message: 'cuenta inexistente' }));
  if (actual.data.user.app_metadata?.rol !== ROL_EMPLEADO) {
    return falla('Solo se pueden resetear desde acá las contraseñas de vendedores.');
  }
  const password = passwordNueva ?? generarPassword();
  const { error } = await a.admin.auth.admin.updateUserById(emp.user_id, {
    password,
    app_metadata: { ...actual.data.user.app_metadata, debe_cambiar_password: true },
  });
  if (error) return falla(mensajeAuth(error));
  return {
    ok: true,
    datos: { login: etiquetaCuenta(actual.data.user.email ?? ''), password: passwordNueva === null ? password : null },
  };
}

export async function actualizarEmpleado(datos: {
  id: string;
  nombre: string;
  puesto: string;
  telefono: string;
  activo: boolean;
  pin: string | null;
}): Promise<ResultadoAccion<{ aviso: string | null }>> {
  const supabase = await exigirAdmin();
  if (!supabase) return falla('Solo el administrador puede gestionar personal.');
  const { error } = await supabase.rpc('guardar_empleado', {
    p_id: datos.id,
    p_nombre: datos.nombre.trim(),
    p_puesto: datos.puesto.trim(),
    p_telefono: datos.telefono.trim() || null,
    p_activo: datos.activo,
    p_pin: datos.pin,
  });
  if (error) return falla(mensajeRpc(error));
  const { data: emp } = await supabase.from('empleados').select('user_id, activo').eq('id', datos.id).maybeSingle();
  const aviso = emp?.user_id ? await sincronizarBloqueo(emp.user_id, emp.activo) : null;
  return { ok: true, datos: { aviso } };
}

export async function darDeBajaEmpleado(
  id: string
): Promise<ResultadoAccion<{ resultado: 'eliminado' | 'desactivado'; aviso: string | null }>> {
  const supabase = await exigirAdmin();
  if (!supabase) return falla('Solo el administrador puede gestionar personal.');
  const { data: emp } = await supabase.from('empleados').select('user_id').eq('id', id).maybeSingle();
  const { data, error } = await supabase.rpc('eliminar_empleado', { p_id: id });
  if (error) return falla(mensajeRpc(error));
  const resultado = data === 'eliminado' ? 'eliminado' : 'desactivado';
  // Nunca se borra la cuenta: se bloquea, para conservar el historial de turnos y ventas.
  const aviso = emp?.user_id ? await sincronizarBloqueo(emp.user_id, false) : null;
  return { ok: true, datos: { resultado, aviso } };
}
