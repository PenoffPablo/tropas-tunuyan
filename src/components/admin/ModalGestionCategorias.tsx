'use client';

import { useState } from 'react';
import type { Categoria } from '@/types/database';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import Spinner from '@/components/ui/Spinner';
import { useSubmitLock } from '@/hooks/useSubmitLock';
import { getSupabaseBrowser } from '@/lib/supabase';
import { errorDesdePostgrest } from '@/lib/errores';
import { comoFila } from '@/lib/datos';
import { mensajeError, parseEnteroNoNegativo } from '@/lib/utils';

type Props = {
  abierto: boolean;
  onClose: () => void;
  categorias: Categoria[];
  productosPorCategoria: Map<string, number>;
  onCambio: (categorias: Categoria[], mensaje: string) => void;
};

export default function ModalGestionCategorias(props: Props) {
  const { isSubmitting, run } = useSubmitLock();
  return (
    <Modal open={props.abierto} onClose={props.onClose} closeDisabled={isSubmitting} size="lg">
      <Contenido {...props} isSubmitting={isSubmitting} run={run} />
    </Modal>
  );
}

function Contenido({
  onClose,
  categorias,
  productosPorCategoria,
  onCambio,
  isSubmitting,
  run,
}: Props & { isSubmitting: boolean; run: ReturnType<typeof useSubmitLock>['run'] }) {
  const [lista, setLista] = useState(categorias);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [orden, setOrden] = useState(String(categorias.length + 1));
  const [editando, setEditando] = useState<{ id: string; nombre: string; descripcion: string; orden: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ordenar = (cs: Categoria[]) => [...cs].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'));
  const aplicar = (cs: Categoria[], msg: string) => {
    const ord = ordenar(cs);
    setLista(ord);
    onCambio(ord, msg);
  };

  const validar = (n: string, o: string, idActual?: string): string | null => {
    if (n.trim().length < 2 || n.trim().length > 60) return 'El nombre debe tener entre 2 y 60 caracteres.';
    if (parseEnteroNoNegativo(o, 999) === null) return 'El orden debe ser un entero entre 0 y 999.';
    if (lista.some((c) => c.id !== idActual && c.nombre.trim().toLowerCase() === n.trim().toLowerCase())) return 'Ya existe una categoría con ese nombre.';
    return null;
  };

  const crear = (e: React.FormEvent) => {
    e.preventDefault();
    const problema = validar(nombre, orden);
    if (problema) return setError(problema);
    void run(async () => {
      setError(null);
      try {
        const { data, error: err } = await getSupabaseBrowser()
          .from('categorias')
          .insert({ nombre: nombre.trim(), descripcion: descripcion.trim() || null, orden: parseEnteroNoNegativo(orden, 999) ?? 0 })
          .select('*')
          .single();
        if (err) throw errorDesdePostgrest(err);
        const nueva = comoFila<Categoria>(data);
        if (!nueva) return;
        aplicar([...lista, nueva], `Categoría «${nueva.nombre}» creada`);
        setNombre('');
        setDescripcion('');
        setOrden(String(lista.length + 2));
      } catch (err) {
        setError(mensajeError(err));
      }
    });
  };

  const guardarEdicion = () => {
    if (!editando) return;
    const problema = validar(editando.nombre, editando.orden, editando.id);
    if (problema) return setError(problema);
    void run(async () => {
      setError(null);
      try {
        const { data, error: err } = await getSupabaseBrowser()
          .from('categorias')
          .update({ nombre: editando.nombre.trim(), descripcion: editando.descripcion.trim() || null, orden: parseEnteroNoNegativo(editando.orden, 999) ?? 0 })
          .eq('id', editando.id)
          .select('*')
          .single();
        if (err) throw errorDesdePostgrest(err);
        const act = comoFila<Categoria>(data);
        if (!act) return;
        aplicar(lista.map((c) => (c.id === act.id ? act : c)), `Categoría «${act.nombre}» actualizada`);
        setEditando(null);
      } catch (err) {
        setError(mensajeError(err));
      }
    });
  };

  const eliminar = (c: Categoria) => {
    const cant = productosPorCategoria.get(c.id) ?? 0;
    const aviso = cant > 0 ? `\n\n${cant} producto(s) quedarán sin categoría.` : '';
    if (!window.confirm(`¿Eliminar la categoría «${c.nombre}»?${aviso}`)) return;
    void run(async () => {
      setError(null);
      try {
        const { error: err } = await getSupabaseBrowser().from('categorias').delete().eq('id', c.id);
        if (err) throw errorDesdePostgrest(err);
        aplicar(lista.filter((x) => x.id !== c.id), `Categoría «${c.nombre}» eliminada`);
      } catch (err) {
        setError(mensajeError(err));
      }
    });
  };

  return (
    <>
      <ModalHeader eyebrow="Catálogo" titulo="Categorías" descripcion="Organizá las secciones del catálogo público y del POS." onClose={onClose} closeDisabled={isSubmitting} />
      <ModalBody className="space-y-5">
        <form onSubmit={crear} className="surface-muted space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_96px]">
            <div>
              <label htmlFor="cat-nombre" className="label">Nueva categoría</label>
              <input id="cat-nombre" value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} className="input" placeholder="Ej.: Mochilas tácticas" data-autofocus />
            </div>
            <div>
              <label htmlFor="cat-orden" className="label">Orden</label>
              <input id="cat-orden" inputMode="numeric" value={orden} onChange={(e) => setOrden(e.target.value.replace(/\D/g, '').slice(0, 3))} className="input num" />
            </div>
          </div>
          <input value={descripcion} maxLength={200} onChange={(e) => setDescripcion(e.target.value)} className="input" placeholder="Descripción (opcional)" aria-label="Descripción" />
          <div className="flex justify-end">
            <button type="submit" disabled={isSubmitting || !nombre.trim()} className="btn-primary btn-sm">
              {isSubmitting ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="plus" size={14} />} Crear
            </button>
          </div>
        </form>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs font-medium text-red-700 dark:text-red-300">
            <Icon name="alert" size={14} className="mt-px shrink-0" /> {error}
          </p>
        )}

        <ul className="divide-y divide-slate-200/70 overflow-hidden rounded-xl border border-slate-200/80 dark:divide-white/[0.05] dark:border-white/[0.06]">
          {lista.map((c) =>
            editando?.id === c.id ? (
              <li key={c.id} className="space-y-2 bg-slate-50/70 p-3 dark:bg-white/[0.02]">
                <div className="grid gap-2 sm:grid-cols-[1fr_80px]">
                  <input value={editando.nombre} maxLength={60} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} className="input h-9" aria-label="Nombre" />
                  <input value={editando.orden} inputMode="numeric" onChange={(e) => setEditando({ ...editando, orden: e.target.value.replace(/\D/g, '').slice(0, 3) })} className="input num h-9" aria-label="Orden" />
                </div>
                <input value={editando.descripcion} maxLength={200} onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })} className="input h-9" placeholder="Descripción" aria-label="Descripción" />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditando(null)} className="btn-ghost btn-sm">Cancelar</button>
                  <button type="button" onClick={guardarEdicion} disabled={isSubmitting} className="btn-primary btn-sm">
                    {isSubmitting && <Spinner className="h-3.5 w-3.5" />} Guardar
                  </button>
                </div>
              </li>
            ) : (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="num w-8 shrink-0 text-center text-xs text-slate-400">#{c.orden}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{c.nombre}</span>
                  {c.descripcion && <span className="block truncate text-xs text-slate-500">{c.descripcion}</span>}
                </span>
                <span className="num shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-white/[0.05] dark:text-slate-400">
                  {productosPorCategoria.get(c.id) ?? 0} prod.
                </span>
                <button
                  type="button"
                  onClick={() => setEditando({ id: c.id, nombre: c.nombre, descripcion: c.descripcion ?? '', orden: String(c.orden) })}
                  disabled={isSubmitting}
                  className="btn-ghost btn-icon h-8 w-8"
                  aria-label={`Editar ${c.nombre}`}
                >
                  <Icon name="edit" size={14} />
                </button>
                <button type="button" onClick={() => eliminar(c)} disabled={isSubmitting} className="btn-ghost btn-icon h-8 w-8 text-red-500" aria-label={`Eliminar ${c.nombre}`}>
                  <Icon name="trash" size={14} />
                </button>
              </li>
            )
          )}
          {lista.length === 0 && <li className="p-6 text-center text-sm text-slate-500">Todavía no hay categorías.</li>}
        </ul>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={isSubmitting} className="btn-secondary">Listo</button>
      </ModalFooter>
    </>
  );
}
