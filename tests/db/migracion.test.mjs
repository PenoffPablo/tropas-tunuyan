/**
 * Prueba la migración v1 → v2 (database/migraciones/20261115_*) sobre una réplica
 * del esquema v1 de producción, en PGlite. Ejecutar: npm run test:db
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';

const leer = (ruta) => readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8');

const V1 = `
create extension pg_trgm;  -- en v1 vivía en public
create type public.rol_usuario as enum ('ADMIN', 'VENDEDOR');
create table public.usuarios (id uuid primary key default gen_random_uuid(), username text, password_hash text, rol public.rol_usuario, activo boolean, created_at timestamptz default now());
create table public.productos (id uuid primary key, nombre text, categoria text, descripcion text, exige_credencial boolean, activo boolean, created_at timestamptz default now(), imagen_url text);
create table public.variantes (id uuid primary key, producto_id uuid references public.productos(id), codigo_barras text, talle text, color text, fuerza text,
  precio_costo numeric, precio_venta numeric, stock_actual int, stock_minimo int, activo boolean, updated_at timestamptz default now());
create sequence public.ventas_numero_seq;
create table public.ventas (id uuid primary key, numero bigint default nextval('public.ventas_numero_seq'));
create function public.fn_inmutable() returns trigger language plpgsql as $$ begin return null; end $$;
create trigger t before update on public.ventas for each row execute function public.fn_inmutable();
create view public.v_reposicion as select * from public.variantes;
insert into public.usuarios (username, password_hash, rol, activo) values ('admin1', 'x', 'ADMIN', true);
insert into public.productos values
  ('43b5376d-1d2e-4e57-977e-09d1fd2a862c', 'Camisa Policial Manga Corta Ripstop', 'Uniformes', 'Camisa reglamentaria.', true, true, now(), 'data:image/svg+xml;utf8,%3Csvg%3E'),
  ('b145e057-fd09-4e78-9cac-89413e438890', 'Escudo Brazo Reglamentario con Abrojo', 'Insignias y Atributos', null, true, true, now(), null),
  ('724a7b53-dfdc-4e10-9195-cf24d8c2af0a', 'Cinturón Táctico NATO', 'Categoría Nueva', null, false, true, now(), null);
insert into public.variantes values
  ('88e23f2c-b162-40c3-ade8-c0e410546c54', '43b5376d-1d2e-4e57-977e-09d1fd2a862c', '7798401001011', 'M',  'Azul Noche', 'Policía de Mendoza', 22000, 38500, 14, 5, true, now()),
  ('21bb7d74-3ee2-458b-b5f5-4cdf98c2d9e8', '43b5376d-1d2e-4e57-977e-09d1fd2a862c', '7798401001035', 'XL', 'Azul Noche', 'Policía de Mendoza', 23500, 41000, 3, 4, true, now()),
  ('a3cad002-0f82-4a89-8411-d303730c61ce', 'b145e057-fd09-4e78-9cac-89413e438890', '7798402002017', 'Único', 'Verde Oliva', 'Gendarmería Nacional', 3200, 6500, 20, 8, true, now()),
  ('0197472f-04d8-46b0-88b8-cfc741c4b5c0', 'b145e057-fd09-4e78-9cac-89413e438890', '7798402002031', 'Único', 'Negro', 'Seguridad Privada', 2800, 5500, 3, 8, true, now()),
  ('4076d0e3-dbb5-4ff2-8a18-a39d569d324d', '724a7b53-dfdc-4e10-9195-cf24d8c2af0a', '7798403003013', 'L', 'Negro', null, 11000, 19500, 16, 5, true, now());
`;

test('migración v1 → v2: respalda, crea el esquema y conserva el catálogo', async () => {
  const db = new PGlite({ extensions: { pgcrypto, pg_trgm, unaccent } });
  await db.exec(leer('tests/db/supabase_stub.sql'));
  await db.exec(V1);

  // Misma secuencia (y en una sola transacción) que en producción.
  await db.transaction(async (tx) => {
    await tx.exec(leer('database/migraciones/20261115_01_respaldo_v1.sql'));
    await tx.exec(leer('database/schema.sql'));
    await tx.exec(leer('database/migraciones/20261115_03_datos_desde_v1.sql'));
  });
  const q = async (sql) => (await db.query(sql)).rows;

  // Respaldo intacto y fuera de public.
  assert.equal((await q(`select count(*)::int n from respaldo_v1.productos`))[0].n, 3);
  assert.equal((await q(`select count(*)::int n from respaldo_v1.usuarios`))[0].n, 1);
  assert.equal((await q(`select to_regclass('public.usuarios') r`))[0].r, null);
  assert.equal((await q(`select extnamespace::regnamespace::text s from pg_extension where extname = 'pg_trgm'`))[0].s, 'extensions');

  // Catálogo.
  const cats = await q(`select nombre, orden from categorias order by orden, nombre`);
  assert.deepEqual(cats.map((c) => c.nombre), ['Uniformes', 'Insignias y Atributos', 'Categoría Nueva']);

  const camisa = (await q(`select * from productos where id = '43b5376d-1d2e-4e57-977e-09d1fd2a862c'`))[0];
  assert.deepEqual([Number(camisa.precio), Number(camisa.costo), Number(camisa.porcentaje_ganancia)], [38500, 22000, 75]);
  assert.equal(camisa.slug, 'camisa-policial-manga-corta-ripstop');
  assert.equal(camisa.imagen_url, 'data:image/svg+xml;utf8,%3Csvg%3E');
  assert.deepEqual(camisa.etiquetas, ['Policía de Mendoza']);

  const vs = await q(`select talle, precio, costo, stock, codigo_barras from variantes where producto_id = '43b5376d-1d2e-4e57-977e-09d1fd2a862c' order by talle`);
  assert.deepEqual(vs.map((v) => [v.talle, v.precio && Number(v.precio), v.costo && Number(v.costo), v.stock, v.codigo_barras]), [
    ['M', null, null, 14, '7798401001011'],
    ['XL', 41000, 23500, 3, '7798401001035'],
  ]);

  const escudo = (await q(`select etiquetas, precio from productos where id = 'b145e057-fd09-4e78-9cac-89413e438890'`))[0];
  assert.deepEqual(escudo.etiquetas, ['Gendarmería Nacional', 'Seguridad Privada']);
  assert.equal(Number(escudo.precio), 5500);

  // Libro de inventario con el stock inicial.
  const libro = await q(`select sum(delta)::int total, min(motivo) motivo, min(nota) nota from movimientos_stock`);
  assert.deepEqual([libro[0].total, libro[0].motivo, libro[0].nota], [14 + 3 + 20 + 3 + 16, 'alta', 'Migración desde esquema v1']);
});
