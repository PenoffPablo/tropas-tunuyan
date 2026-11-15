/**
 * Concurrencia real (varias conexiones) sobre PostgreSQL embebido:
 * dos cajas cobrando a la vez la última unidad, cierre de turno durante una venta
 * y doble envío simultáneo con la misma clave. Ejecutar: npm run test:concurrencia
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

const leer = (ruta) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');
const VEND = JSON.stringify({ sub: '22222222-2222-2222-2222-222222222222', app_metadata: { rol: 'vendedor' } });
const ADMIN = JSON.stringify({ sub: '11111111-1111-1111-1111-111111111111', app_metadata: { rol: 'admin' } });

const dir = mkdtempSync(join(tmpdir(), 'tt-pg-'));
const PUERTO = 54329;
const servidor = new EmbeddedPostgres({ databaseDir: dir, port: PUERTO, user: 'postgres', password: 'test', persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});
const clientes = [];

/** Conexión nueva que actúa como el rol indicado (como lo hace PostgREST). */
async function conexion(claims) {
  const c = new pg.Client({ host: 'localhost', port: PUERTO, user: 'postgres', password: 'test', database: 'tt' });
  await c.connect();
  clientes.push(c);
  await c.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
  await c.query('set role authenticated');
  return c;
}

let raiz, empleado, turno;

before(async () => {
  await servidor.initialise();
  await servidor.start();
  await servidor.createDatabase('tt');
  raiz = new pg.Client({ host: 'localhost', port: PUERTO, user: 'postgres', password: 'test', database: 'tt' });
  await raiz.connect();
  await raiz.query(leer('tests/db/supabase_stub.sql'));
  await raiz.query(leer('database/schema.sql'));
  await raiz.query(leer('database/seed.sql'));
  const admin = await conexion(ADMIN);
  empleado = (await admin.query(`select guardar_empleado(null, 'Caja Test', 'Vendedor', null, true, '1234') as id`)).rows[0].id;
  const vend = await conexion(VEND);
  turno = (await vend.query(`select id from abrir_turno($1, '1234', 0)`, [empleado])).rows[0].id;
}, { timeout: 180_000 });

after(async () => {
  await Promise.allSettled(clientes.map((c) => c.end()));
  await raiz?.end();
  await servidor.stop();
  rmSync(dir, { recursive: true, force: true });
});

const vender = (c, varianteId, cantidad, key = crypto.randomUUID()) =>
  c.query(
    `select procesar_venta_pos($1, $2::jsonb, 'efectivo', null, null, null, null, null, null, null, null, $3) as v`,
    [turno, JSON.stringify([{ variante_id: varianteId, cantidad }]), key]
  );

async function varianteConStock(stock) {
  const { rows } = await raiz.query(
    `select v.id from variantes v join productos p on p.id = v.producto_id where not p.exige_credencial order by v.id limit 1 offset $1`,
    [Math.floor(Math.random() * 5)]
  );
  await raiz.query(`select set_config('tt.motivo_stock', 'correccion', false)`);
  await raiz.query(`update variantes set stock = $2 where id = $1`, [rows[0].id, stock]);
  await raiz.query(`select set_config('tt.motivo_stock', '', false)`);
  return rows[0].id;
}

test('dos cajas cobran a la vez la ÚLTIMA unidad: una vende, la otra recibe "Stock insuficiente"', async () => {
  const id = await varianteConStock(1);
  const [a, b] = [await conexion(VEND), await conexion(VEND)];
  const resultados = await Promise.allSettled([vender(a, id, 1), vender(b, id, 1)]);
  const ok = resultados.filter((r) => r.status === 'fulfilled');
  const ko = resultados.filter((r) => r.status === 'rejected');
  assert.equal(ok.length, 1);
  assert.equal(ko.length, 1);
  assert.match(ko[0].reason.message, /Stock insuficiente/);
  assert.equal((await raiz.query(`select stock from variantes where id = $1`, [id])).rows[0].stock, 0);
});

test('10 cajas compiten por 3 unidades: exactamente 3 ventas, stock nunca negativo', async () => {
  const id = await varianteConStock(3);
  const cajas = await Promise.all(Array.from({ length: 10 }, () => conexion(VEND)));
  const resultados = await Promise.allSettled(cajas.map((c) => vender(c, id, 1)));
  assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 3);
  assert.equal((await raiz.query(`select stock from variantes where id = $1`, [id])).rows[0].stock, 0);
  const libro = await raiz.query(`select count(*)::int n from movimientos_stock where variante_id = $1 and motivo = 'venta'`, [id]);
  assert.equal(libro.rows[0].n, 3);
});

test('doble envío simultáneo con la misma clave: una sola venta, el otro recibe el reintento', async () => {
  const id = await varianteConStock(5);
  const [a, b] = [await conexion(VEND), await conexion(VEND)];
  const key = crypto.randomUUID();
  const [r1, r2] = await Promise.all([vender(a, id, 2, key), vender(b, id, 2, key)]);
  assert.equal(r1.rows[0].v.id, r2.rows[0].v.id);
  assert.deepEqual([r1.rows[0].v.reintento, r2.rows[0].v.reintento].sort(), [false, true]);
  assert.equal((await raiz.query(`select stock from variantes where id = $1`, [id])).rows[0].stock, 3);
});

test('arqueo mientras hay una venta en curso: el cierre espera e incluye esa venta', async () => {
  const id = await varianteConStock(5);
  const precio = Number((await raiz.query(
    `select coalesce(v.precio, p.precio) p from variantes v join productos p on p.id = v.producto_id where v.id = $1`, [id]
  )).rows[0].p);
  const venta = await conexion(VEND);
  const cierre = await conexion(VEND);
  // La venta queda abierta dentro de una transacción (tomó FOR SHARE sobre el turno).
  await venta.query('begin');
  await vender(venta, id, 1);
  const cerrando = cierre.query(`select * from cerrar_turno_ciego($1, 0, null)`, [turno]);
  await new Promise((r) => setTimeout(r, 300));
  await venta.query('commit');
  const t = (await cerrando).rows[0];
  const esperado = (await raiz.query(`select coalesce(sum(monto_efectivo), 0)::numeric s from ventas where turno_id = $1`, [turno])).rows[0].s;
  assert.equal(t.estado, 'cerrado');
  assert.equal(Number(t.monto_cierre_esperado), Number(esperado));
  assert.ok(Number(esperado) >= precio);
  // Turno cerrado: ya no se puede vender.
  await assert.rejects(vender(await conexion(VEND), id, 1), /no está abierto/);
});
