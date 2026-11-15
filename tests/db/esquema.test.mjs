/**
 * Pruebas del esquema v2 contra PostgreSQL real (PGlite, en memoria).
 * No tocan producción. Ejecutar:  npm run test:db
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';

const raiz = new URL('../../', import.meta.url);
const leer = (ruta) => readFileSync(new URL(ruta, raiz), 'utf8');

const ADMIN = { sub: '11111111-1111-1111-1111-111111111111', app_metadata: { rol: 'admin' } };
const VEND = { sub: '22222222-2222-2222-2222-222222222222', app_metadata: { rol: 'vendedor' } };
const SIN_ROL = { sub: '33333333-3333-3333-3333-333333333333' };

let db;

/** Ejecuta `fn` como el rol indicado (anon o authenticated con claims). */
async function como(claims, fn) {
  const rol = claims ? 'authenticated' : 'anon';
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims ? JSON.stringify(claims) : '']);
  await db.exec(`set role ${rol}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
const q = async (sql, params) => (await db.query(sql, params)).rows;
const uno = async (sql, params) => (await q(sql, params))[0];
async function falla(promesa, patron) {
  await assert.rejects(promesa, (e) => (patron ? patron.test(e.message) : true));
}

let catId, prodId, varM, varXL, prodCred, varCred, kevin, turno;

before(async () => {
  db = new PGlite({ extensions: { pgcrypto, pg_trgm, unaccent } });
  await db.exec(leer('tests/db/supabase_stub.sql'));
  await db.exec(leer('database/schema.sql'));
});

test('admin: categorías con slug automático y único', async () => {
  await como(ADMIN, async () => {
    catId = (await uno(`insert into categorias (nombre, orden) values ('Uniformes Tácticos', 1) returning id, slug`)).id;
    const otra = await uno(`insert into categorias (nombre, slug) values ('Calzado', null) returning slug`);
    assert.equal(otra.slug, 'calzado');
    const s = await uno(`select slug from categorias where id = $1`, [catId]);
    assert.equal(s.slug, 'uniformes-tacticos');
    await falla(q(`insert into categorias (nombre) values ('uniformes tácticos')`), /duplicate|unique/i);
  });
});

test('admin: crear_producto con precio por variante, slug y stock inicial en el libro', async () => {
  await como(ADMIN, async () => {
    prodId = (await uno(
      `select crear_producto($1::jsonb, $2::jsonb) as id`,
      [
        JSON.stringify({ nombre: 'Pantalón Táctico BDU', precio: 40000, costo: 20000, porcentaje_ganancia: 100, categoria_id: catId, etiquetas: ['Gendarmería'] }),
        JSON.stringify([
          { talle: 'M', color: 'Verde', stock: 10, stock_minimo: 2, codigo_barras: '779000000001' },
          { talle: 'XL', color: 'Verde', stock: 3, stock_minimo: 2, precio: 45000, costo: 22000 },
        ]),
      ]
    )).id;
    const p = await uno(`select slug from productos where id = $1`, [prodId]);
    assert.equal(p.slug, 'pantalon-tactico-bdu');
    const vs = await q(`select id, talle, precio from variantes where producto_id = $1 order by talle`, [prodId]);
    varM = vs.find((v) => v.talle === 'M').id;
    varXL = vs.find((v) => v.talle === 'XL').id;
    assert.equal(vs.find((v) => v.talle === 'M').precio, null);
    assert.equal(Number(vs.find((v) => v.talle === 'XL').precio), 45000);
    const altas = await q(`select motivo, delta from movimientos_stock where producto_id = $1 order by delta`, [prodId]);
    assert.deepEqual(altas.map((a) => [a.motivo, a.delta]), [['alta', 3], ['alta', 10]]);

    prodCred = (await uno(`select crear_producto($1::jsonb, $2::jsonb) as id`, [
      JSON.stringify({ nombre: 'Chaleco Balístico', precio: 100000, costo: 60000, exige_credencial: true }),
      JSON.stringify([{ talle: 'L', color: 'Negro', stock: 2, stock_minimo: 1 }]),
    ])).id;
    varCred = (await uno(`select id from variantes where producto_id = $1`, [prodCred])).id;

    await falla(q(`select crear_producto('{"nombre":"Dup"}'::jsonb, '[{"talle":"M","stock":1,"stock_minimo":1,"codigo_barras":"779000000001"}]'::jsonb)`), /SKU|repetidas/);
  });
});

test('búsqueda full-text en español ignora acentos y plurales', async () => {
  const r = await q(`select nombre from productos where busqueda @@ websearch_to_tsquery('spanish', 'pantalones tacticos')`);
  assert.equal(r.length, 1);
});

test('anon: ve el catálogo pero no costos, caja, libro ni auditoría; no escribe', async () => {
  await como(null, async () => {
    const n = await uno(`select count(*)::int as n from productos`);
    assert.equal(n.n, 2);
    await uno(`select id, nombre, precio, slug, etiquetas from productos limit 1`);
    await falla(q(`select costo from productos`), /permission denied/);
    await falla(q(`select costo from variantes`), /permission denied/);
    await uno(`select id, talle, precio, stock from variantes limit 1`);
    await falla(q(`select * from movimientos_caja`), /permission denied/);
    await falla(q(`select * from movimientos_stock`), /permission denied/);
    await falla(q(`select * from auditoria`), /permission denied/);
    await falla(q(`insert into categorias (nombre) values ('hack')`), /permission denied/);
    await falla(q(`select verificar_credencial_empleado(gen_random_uuid(), '1234')`), /permission denied/);
  });
});

test('usuario sin rol: no modifica ni gestiona personal', async () => {
  await como(SIN_ROL, async () => {
    // Rechazo por permisos o 0 filas afectadas: en ambos casos no modifica nada.
    const r = await db.query(`update productos set precio = 1`).catch((e) => e);
    assert.ok(r instanceof Error ? /permission denied/.test(r.message) : r.affectedRows === 0);
    // Una cuenta auto-registrada (sin rol) no debe ver costos ni márgenes.
    await falla(q(`select costo, porcentaje_ganancia from productos`), /permission denied/);
    await falla(q(`select costo from variantes`), /permission denied/);
    assert.equal((await q(`select id, nombre, precio from productos`)).length, 0);
    await falla(q(`select guardar_empleado(null, 'Intruso', 'x', null, true, '1234')`), /administrador/);
    await falla(q(`select ajustar_stock($1, 5)`, [varM]), /administrador/);
  });
});

test('empleados: PIN bcrypt invisible, bloqueo tras 5 intentos', async () => {
  await como(ADMIN, async () => {
    kevin = (await uno(`select guardar_empleado(null, 'Kevin', 'Líder', null, true, '1234') as id`)).id;
    await falla(q(`select guardar_empleado(null, 'Juan', 'x', null, true, '12')`), /PIN/);
    await falla(q(`select pin_hash from empleados`), /permission denied/);
  });
  const aud = await uno(`select despues from auditoria where tabla = 'empleados' and registro_id = $1`, [kevin]);
  assert.equal('pin_hash' in aud.despues, false);
  await como(VEND, async () => {
    assert.equal((await q(`select * from verificar_credencial_empleado($1, '1234')`, [kevin])).length, 1);
    for (let i = 0; i < 5; i++) await q(`select * from verificar_credencial_empleado($1, '9999')`, [kevin]);
    await falla(q(`select * from verificar_credencial_empleado($1, '1234')`, [kevin]), /bloqueado/);
  });
  await q(`update empleados set pin_bloqueado_hasta = null, pin_intentos_fallidos = 0`);
});

test('ajuste de stock: atómico, nunca negativo, queda en el libro con nota', async () => {
  await como(ADMIN, async () => {
    assert.equal((await uno(`select ajustar_stock($1, 5, 'Ingreso proveedor') as s`, [varM])).s, 15);
    await falla(q(`select ajustar_stock($1, -100)`, [varM]), /negativo/);
    const m = await uno(`select motivo, delta, stock_resultante, nota, created_by from movimientos_stock where variante_id = $1 order by id desc limit 1`, [varM]);
    assert.deepEqual([m.motivo, m.delta, m.stock_resultante, m.nota, m.created_by], ['ajuste', 5, 15, 'Ingreso proveedor', ADMIN.sub]);
  });
});

test('auditoría: modificar un producto guarda antes y después', async () => {
  await como(ADMIN, async () => {
    await q(`update productos set precio = 41000 where id = $1`, [prodId]);
    const a = await uno(`select accion, antes->>'precio' as antes, despues->>'precio' as despues, actor from auditoria where tabla = 'productos' and registro_id = $1 order by id desc limit 1`, [prodId]);
    assert.deepEqual([a.accion, Number(a.antes), Number(a.despues), a.actor], ['modificacion', 40000, 41000, ADMIN.sub]);
    await q(`update productos set precio = 40000 where id = $1`, [prodId]);
  });
});

test('turnos: uno abierto por caja y PIN obligatorio', async () => {
  await como(VEND, async () => {
    turno = (await uno(`select id from abrir_turno($1, '1234', 10000)`, [kevin])).id;
    await falla(q(`select abrir_turno($1, '1234', 100)`, [kevin]), /turno abierto/);
    await falla(q(`select abrir_turno($1, '0000', 100, 'caja2')`, [kevin]), /PIN incorrecto/);
  });
});

const venta = (items, extra = {}) => {
  const p = {
    turno: turno, items: JSON.stringify(items), metodo: 'efectivo', ef: null, dig: null, recibido: null,
    comp: null, cred: null, total: null, key: crypto.randomUUID(), ...extra,
  };
  return q(
    `select procesar_venta_pos($1, $2::jsonb, $3, $4, $5, $6, $7, null, null, $8::jsonb, $9, $10) as v`,
    [p.turno, p.items, p.metodo, p.ef, p.dig, p.recibido, p.comp, p.cred, p.total, p.key]
  ).then((r) => r[0].v);
};

test('venta: usa el precio de la variante, es idempotente y descuenta stock una sola vez', async () => {
  await como(VEND, async () => {
    const key = crypto.randomUUID();
    // 1×M (precio del producto 40000) + 1×XL (precio propio 45000) = 85000
    await falla(venta([{ variante_id: varM, cantidad: 1 }, { variante_id: varXL, cantidad: 1 }], { total: 80000 }), /precios cambiaron/);
    const v = await venta([{ variante_id: varM, cantidad: 1 }, { variante_id: varXL, cantidad: 1 }], { total: 85000, recibido: 90000, key });
    assert.equal(Number(v.total), 85000);
    assert.equal(Number(v.vuelto), 5000);
    const xl = v.detalles.find((d) => d.talle === 'XL');
    assert.equal(Number(xl.precio_unitario), 45000);
    assert.equal('costo_unitario' in xl, false, 'la respuesta del POS no debe exponer costos');
    const otra = await venta([{ variante_id: varM, cantidad: 1 }, { variante_id: varXL, cantidad: 1 }], { total: 85000, key });
    assert.equal(otra.reintento, true);
  });
  const costoXL = await uno(`select costo_unitario from venta_detalles where talle = 'XL'`);
  assert.equal(Number(costoXL.costo_unitario), 22000);
  const s = await q(`select talle, stock from variantes where producto_id = $1 order by talle`, [prodId]);
  assert.deepEqual(s.map((x) => x.stock), [14, 2]);
  const libro = await q(`select delta, venta_id from movimientos_stock where motivo = 'venta'`);
  assert.equal(libro.length, 2);
  assert.ok(libro.every((l) => l.venta_id && l.delta === -1));
});

test('venta: rechaza stock insuficiente, cantidades inválidas y exige credencial firmada', async () => {
  await como(VEND, async () => {
    await falla(venta([{ variante_id: varXL, cantidad: 50 }]), /Stock insuficiente/);
    await falla(venta([{ variante_id: varM, cantidad: 0 }]), /Cantidades/);
    await falla(venta([{ variante_id: varM, cantidad: 1.5 }]), /Cantidades/);
    await falla(venta([{ variante_id: varCred, cantidad: 1 }]), /fuerza/);
    const cred = { fuerza_institucion: 'Policía', legajo: 'A1', declaracion_jurada: true, pin_operador: '0000' };
    await falla(venta([{ variante_id: varCred, cantidad: 1 }], { cred: JSON.stringify(cred) }), /PIN del operador/);
    const ok = await venta([{ variante_id: varCred, cantidad: 1 }], {
      metodo: 'combinado', ef: 40000, dig: 60000, comp: 'OP-1',
      cred: JSON.stringify({ ...cred, pin_operador: '1234' }),
    });
    assert.equal(ok.credencial_verificada, true);
    assert.equal(ok.credencial_verificada_por, kevin);
    await falla(venta([{ variante_id: varM, cantidad: 1 }], { metodo: 'combinado', ef: 1, dig: 1 }), /no coincide/);
  });
});

test('arqueo ciego: efectivo esperado incluye egresos y el turno cerrado no vende', async () => {
  await como(ADMIN, async () => {
    await q(`insert into movimientos_caja (tipo, monto, concepto, metodo_pago, turno_id, created_by) values ('egreso', 5000, 'Flete', 'efectivo', $1, $2)`, [turno, ADMIN.sub]);
  });
  await como(VEND, async () => {
    // 10000 apertura + 85000 venta efectivo + 40000 parte efectivo − 5000 egreso = 130000
    const t = await uno(`select * from cerrar_turno_ciego($1, 129000, 'faltante')`, [turno]);
    assert.deepEqual([Number(t.monto_cierre_esperado), Number(t.diferencia), t.cantidad_ventas], [130000, -1000, 2]);
    await falla(venta([{ variante_id: varM, cantidad: 1 }]), /no está abierto/);
  });
});

test('ranking: ingresos y ganancia por producto con costo por variante', async () => {
  await como(ADMIN, async () => {
    const r = await q(`select * from ranking_productos()`);
    const pant = r.find((x) => x.producto_id === prodId);
    assert.deepEqual([Number(pant.unidades), Number(pant.ingresos), Number(pant.ganancia)], [2, 85000, 43000]);
  });
});

test('vendedor: no ve costos ni márgenes por ninguna vía; el admin sí, vía costos_catalogo()', async () => {
  await como(VEND, async () => {
    await uno(`select id, nombre, precio from productos limit 1`);
    await uno(`select id, talle, precio, stock, codigo_barras from variantes limit 1`);
    await falla(q(`select costo from productos`), /permission denied/);
    await falla(q(`select porcentaje_ganancia from productos`), /permission denied/);
    await falla(q(`select costo from variantes`), /permission denied/);
    await falla(q(`select costo_unitario from venta_detalles`), /permission denied/);
    await uno(`select precio_unitario, cantidad from venta_detalles limit 1`);
    await falla(q(`select * from costos_catalogo()`), /administrador/);
    await falla(q(`select * from ranking_productos()`), /administrador/);
  });
  await como(ADMIN, async () => {
    const c = await q(`select * from costos_catalogo()`);
    const pant = c.find((x) => x.producto_id === prodId);
    assert.equal(Number(pant.costo), 20000);
    assert.equal(Number(pant.costos_variantes[varXL]), 22000);
    assert.equal(varM in pant.costos_variantes, false);
    // El admin edita costos sin necesitar leerlos directo.
    const r = await db.query(`update productos set costo = 20500 where id = $1`, [prodId]);
    assert.equal(r.affectedRows, 1);
  });
});
