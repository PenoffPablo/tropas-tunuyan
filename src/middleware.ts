/**
 * Middleware de seguridad (Edge).
 *
 * · Protege /admin/* (excepto /admin/login) y /api/upload ANTES de renderizar
 *   cualquier Server Component.
 * · Valida la sesión con supabase.auth.getUser() (verifica el JWT contra Supabase
 *   Auth; no confía en la cookie a ciegas) y refresca los tokens vencidos.
 * · Aplica permisos por rol: el vendedor solo opera el POS.
 * · Cuentas bloqueadas (empleado dado de baja) se tratan como sin sesión.
 * · Si app_metadata.debe_cambiar_password está activo, la única ruta
 *   disponible es /admin/cambiar-password.
 * · Reenvía rol/email a los Server Components en cabeceras internas que
 *   sobrescribe siempre (no se pueden falsificar desde el cliente).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from '@/types/database';
import {
  HEADER_EMAIL,
  HEADER_ROL,
  RUTA_CAMBIAR_PASSWORD,
  destinoSeguro,
  esRolValido,
  esRutaSoloAdmin,
  rutaInicialPorRol,
} from '@/lib/auth-shared';

type CookiePendiente = { name: string; value: string; options: CookieOptions };

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const esLogin = pathname === '/admin/login';
  const esApi = pathname.startsWith('/api/');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return esApi
      ? NextResponse.json({ error: 'Servidor sin configurar' }, { status: 500 })
      : new NextResponse('Configuración de Supabase faltante', { status: 500 });
  }

  const pendientes: CookiePendiente[] = [];
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          pendientes.push({ name, value, options });
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rol = user?.app_metadata?.rol;
  const rolValido = esRolValido(rol) ? rol : null;
  const bloqueado = !!user?.banned_until && new Date(user.banned_until).getTime() > Date.now();
  const debeCambiarPassword = user?.app_metadata?.debe_cambiar_password === true;

  const conCookies = (res: NextResponse) => {
    pendientes.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
    res.headers.set('Cache-Control', 'private, no-store');
    return res;
  };

  // ── Sin sesión válida (usuario sin rol asignado o cuenta bloqueada) ──
  if (!user || !rolValido || bloqueado) {
    if (esApi) {
      return conCookies(NextResponse.json({ error: 'No autenticado' }, { status: 401 }));
    }
    const headersLimpios = new Headers(request.headers);
    headersLimpios.delete(HEADER_ROL);
    headersLimpios.delete(HEADER_EMAIL);
    if (esLogin) {
      return conCookies(NextResponse.next({ request: { headers: headersLimpios } }));
    }
    const destino = request.nextUrl.clone();
    destino.pathname = '/admin/login';
    destino.search = '';
    destino.searchParams.set('next', pathname + search);
    if (user && bloqueado) destino.searchParams.set('error', 'bloqueado');
    else if (user && !rolValido) destino.searchParams.set('error', 'sin-rol');
    return conCookies(NextResponse.redirect(destino));
  }

  const redirigir = (ruta: string) => {
    const destino = request.nextUrl.clone();
    destino.pathname = ruta;
    destino.search = '';
    return conCookies(NextResponse.redirect(destino));
  };
  const esCambioPassword = pathname === RUTA_CAMBIAR_PASSWORD;

  // ── Contraseña inicial pendiente de cambio: no se puede usar nada más ──
  if (debeCambiarPassword && !esCambioPassword) {
    if (esApi) return conCookies(NextResponse.json({ error: 'Debés cambiar tu contraseña' }, { status: 403 }));
    return redirigir(RUTA_CAMBIAR_PASSWORD);
  }
  if (!debeCambiarPassword && esCambioPassword) return redirigir(rutaInicialPorRol(rolValido));

  // ── Con sesión ──
  if (esLogin) return redirigir(destinoSeguro(request.nextUrl.searchParams.get('next'), rolValido));

  if (esApi && rolValido !== 'admin') {
    return conCookies(NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 }));
  }

  if (rolValido === 'vendedor' && esRutaSoloAdmin(pathname)) return redirigir('/admin/pos');

  const headersPanel = new Headers(request.headers);
  headersPanel.set(HEADER_ROL, rolValido);
  headersPanel.set(HEADER_EMAIL, user.email ?? '');
  return conCookies(NextResponse.next({ request: { headers: headersPanel } }));
}

export const config = {
  matcher: ['/admin/:path*', '/api/upload'],
};
