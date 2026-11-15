import { redirect } from 'next/navigation';
import AdminShell from '@/components/admin/AdminShell';
import { ToastProvider } from '@/components/ui/Toast';
import { leerSesionPanel } from '@/lib/auth';

/**
 * Layout protegido del panel (Server Component). El middleware ya validó la
 * sesión en el Edge; si por algún motivo falta el contexto, se corta acá.
 */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const sesion = leerSesionPanel();
  if (!sesion) redirect('/admin/login');

  return (
    <ToastProvider>
      <AdminShell rol={sesion.rol} email={sesion.email}>
        {children}
      </AdminShell>
    </ToastProvider>
  );
}
