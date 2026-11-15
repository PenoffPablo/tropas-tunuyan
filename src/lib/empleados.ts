/**
 * Personal del mostrador. Los PIN se hashean con bcrypt en PostgreSQL
 * (guardar_empleado) y se validan con verificar_credencial_empleado
 * (SECURITY DEFINER): ningún PIN ni hash viaja jamás hacia el navegador.
 */
import { getSupabaseBrowser } from './supabase';
import { errorDesdePostgrest } from './errores';

export type OperadorVerificado = { id: string; nombre: string; puesto: string };

export function pinValido(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export async function verificarCredencialEmpleado(empleadoId: string, pin: string): Promise<OperadorVerificado | null> {
  if (!pinValido(pin)) return null;
  const { data, error } = await getSupabaseBrowser().rpc('verificar_credencial_empleado', {
    p_empleado_id: empleadoId,
    p_pin: pin,
  });
  if (error) throw errorDesdePostgrest(error);
  const fila = Array.isArray(data) ? data[0] : null;
  return fila ?? null;
}

export async function guardarEmpleado(datos: {
  id: string | null;
  nombre: string;
  puesto: string;
  telefono: string;
  activo: boolean;
  pin: string | null;
}): Promise<string> {
  const { data, error } = await getSupabaseBrowser().rpc('guardar_empleado', {
    p_id: datos.id,
    p_nombre: datos.nombre.trim(),
    p_puesto: datos.puesto.trim(),
    p_telefono: datos.telefono.trim() || null,
    p_activo: datos.activo,
    p_pin: datos.pin,
  });
  if (error) throw errorDesdePostgrest(error);
  return data;
}

export async function eliminarEmpleado(id: string): Promise<'eliminado' | 'desactivado'> {
  const { data, error } = await getSupabaseBrowser().rpc('eliminar_empleado', { p_id: id });
  if (error) throw errorDesdePostgrest(error);
  return data === 'eliminado' ? 'eliminado' : 'desactivado';
}
