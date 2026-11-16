/**
 * Migración 07 (acceso propio de cada empleado) sobre una base ya desplegada:
 * se aplica dos veces (idempotente) y deja el comportamiento esperado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';

const leer = (ruta) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');

test('migración 07: aplicable sobre una base desplegada y repetible', async () => {
  const db = new PGlite({ extensions: { pgcrypto, pg_trgm, unaccent } });
  await db.exec(leer('tests/db/supabase_stub.sql'));
  await db.exec(leer('database/schema.sql'));
  await db.exec(leer('database/seed.sql'));
  for (let i = 0; i < 2; i++) {
    await db.transaction((tx) => tx.exec(leer('database/migraciones/20261116_07_acceso_empleados.sql')));
  }

  const VEND = { sub: '22222222-2222-2222-2222-222222222222', app_metadata: { rol: 'vendedor' } };
  const ADMIN = { sub: '11111111-1111-1111-1111-111111111111', app_metadata: { rol: 'admin' } };
  const como = async (claims, sql, params) => {
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims)]);
    await db.exec('set role authenticated');
    try {
      return (await db.query(sql, params)).rows;
    } finally {
      await db.exec('reset role');
    }
  };
  await db.query(`insert into auth.users (id) values ($1)`, [VEND.sub]);

  // Antes de vincularlo, el vendedor no ve nada.
  assert.equal((await como(VEND, `select id from productos`)).length, 0);
  const [{ id }] = await como(ADMIN, `select alta_empleado_con_acceso('Juan Pérez', 'Vendedor', null, '4826', $1, 'juan.perez') as id`, [VEND.sub]);
  assert.equal((await como(VEND, `select id from productos`)).length, 6);
  const [t] = await como(VEND, `select * from abrir_mi_turno(1000)`);
  assert.equal(t.empleado_id, id);
  assert.equal((await como(ADMIN, `select eliminar_empleado($1) as r`, [id]))[0].r, 'desactivado');
  assert.equal((await como(VEND, `select id from turnos_caja`)).length, 0);
});
