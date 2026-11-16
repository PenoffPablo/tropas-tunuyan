/**
 * Migraciones 05 + 06 sobre una base con los permisos que tenía producción antes
 * (lectura de tabla completa para authenticated): al aplicarlas, el vendedor y
 * el usuario sin rol dejan de ver costos y el admin los obtiene por RPC.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';

const leer = (ruta) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');

test('migraciones 05 + 06: costos solo para el admin en una base ya desplegada', async () => {
  const db = new PGlite({ extensions: { pgcrypto, pg_trgm, unaccent } });
  await db.exec(leer('tests/db/supabase_stub.sql'));
  await db.exec(leer('database/schema.sql'));
  await db.exec(leer('database/seed.sql'));
  // Estado previo de producción: lectura de tabla completa y políticas abiertas.
  await db.exec(`
    grant select on public.productos, public.variantes, public.venta_detalles to authenticated;
    drop policy productos_lectura_panel on public.productos;
    create policy productos_lectura_panel on public.productos for select to authenticated using (activo or (select private.es_staff()));
  `);
  await db.transaction(async (tx) => {
    await tx.exec(leer('database/migraciones/20261115_05_sin_rol_no_lee_catalogo.sql'));
    await tx.exec(leer('database/migraciones/20261115_06_costos_solo_admin.sql'));
  });

  const como = async (claims, sql) => {
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)]);
    await db.exec('set role authenticated');
    try {
      return (await db.query(sql)).rows;
    } finally {
      await db.exec('reset role');
    }
  };
  const VEND = { sub: '22222222-2222-2222-2222-222222222222', app_metadata: { rol: 'vendedor' } };
  const ADMIN = { sub: '11111111-1111-1111-1111-111111111111', app_metadata: { rol: 'admin' } };
  const SIN_ROL = { sub: '33333333-3333-3333-3333-333333333333' };
  // Desde la migración 07 el vendedor necesita un empleado activo vinculado.
  await db.query(`insert into auth.users (id) values ($1)`, [VEND.sub]);
  await db.query(`insert into empleados (nombre, pin_hash, user_id, usuario) values ('Vend', 'x', $1, 'vend')`, [VEND.sub]);

  assert.equal((await como(VEND, `select id, precio from productos`)).length, 6);
  await assert.rejects(como(VEND, `select costo from productos`), /permission denied/);
  await assert.rejects(como(VEND, `select costo from variantes`), /permission denied/);
  await assert.rejects(como(VEND, `select costo_unitario from venta_detalles`), /permission denied/);
  await assert.rejects(como(VEND, `select * from costos_catalogo()`), /administrador/);
  await assert.rejects(como(SIN_ROL, `select costo from productos`), /permission denied/);
  assert.equal((await como(SIN_ROL, `select id from productos`)).length, 0);
  const costos = await como(ADMIN, `select * from costos_catalogo()`);
  assert.equal(costos.length, 6);
  assert.ok(costos.every((c) => Number(c.costo) > 0));
});
