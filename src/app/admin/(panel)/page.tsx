import { redirect } from 'next/navigation';
import { leerSesionPanel } from '@/lib/auth';
import { rutaInicialPorRol } from '@/lib/auth-shared';

export default function AdminIndex() {
  const sesion = leerSesionPanel();
  redirect(sesion ? rutaInicialPorRol(sesion.rol) : '/admin/login');
}
