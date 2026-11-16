'use server';

/**
 * Cambio de contraseña del usuario logueado (obligatorio en el primer ingreso
 * de un empleado o tras un reseteo del admin).
 *
 * El aviso `debe_cambiar_password` vive en app_metadata, que el usuario no puede
 * escribir: por eso la contraseña y el aviso se actualizan juntos con la
 * service role, siempre sobre el id de la sesión verificada (nunca uno enviado
 * por el cliente). Después se refresca la sesión para que el JWT nuevo ya no
 * lleve el aviso.
 */
import { createSupabaseServer } from './supabase-server';
import { createSupabaseAdmin } from './supabase-admin';
import { problemaPassword } from './acceso';
import { esRolValido, rutaInicialPorRol } from './auth-shared';

export async function cambiarMiPassword(
  nueva: string
): Promise<{ ok: true; destino: string } | { ok: false; error: string }> {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Tu sesión expiró. Volvé a iniciar sesión.' };
  const rol = user.app_metadata?.rol;
  if (!esRolValido(rol)) return { ok: false, error: 'Tu usuario no tiene un rol asignado.' };

  const problema = problemaPassword(nueva);
  if (problema) return { ok: false, error: problema };

  let admin;
  try {
    admin = createSupabaseAdmin();
  } catch {
    return { ok: false, error: 'El servidor no está configurado para cambiar contraseñas. Avisale al administrador.' };
  }
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: nueva,
    app_metadata: { ...user.app_metadata, debe_cambiar_password: false },
  });
  if (error) {
    return {
      ok: false,
      error: /password/i.test(error.message)
        ? 'La contraseña no cumple los requisitos de seguridad. Probá con una más larga.'
        : `No se pudo cambiar la contraseña: ${error.message}`,
    };
  }

  // JWT nuevo (sin el aviso). Si no se puede refrescar, se vuelve a iniciar sesión.
  const refresco = await supabase.auth.refreshSession();
  if (refresco.error) {
    await supabase.auth.signOut();
    return { ok: true, destino: '/admin/login' };
  }
  return { ok: true, destino: rutaInicialPorRol(rol) };
}
