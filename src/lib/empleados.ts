/**
 * Personal del mostrador. Los PIN se hashean con bcrypt en PostgreSQL
 * (guardar_empleado) y se validan con verificar_credencial_empleado
 * (SECURITY DEFINER): ningún PIN ni hash viaja jamás hacia el navegador.
 * El alta, la edición y la baja pasan por Server Actions (personal-acciones.ts)
 * porque también gestionan la cuenta de acceso del empleado.
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
