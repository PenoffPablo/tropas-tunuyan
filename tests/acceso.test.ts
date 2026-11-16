/**
 * Nombres de usuario del personal y login por usuario: `npm test`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emailDeLogin,
  etiquetaCuenta,
  problemaPassword,
  usuarioBase,
  usuarioDisponible,
  usuarioValido,
} from '../src/lib/acceso.ts';

test('usuarioBase: nombre.apellido en minúsculas, sin tildes ni espacios', () => {
  assert.equal(usuarioBase('Juan Pérez'), 'juan.perez');
  assert.equal(usuarioBase('  José María   Núñez  '), 'jose.nunez');
  assert.equal(usuarioBase('Iñaki Ibáñez'), 'inaki.ibanez');
  assert.equal(usuarioBase("María O'Connor"), 'maria.oconnor');
  assert.equal(usuarioBase('Kevin'), 'kevin');
  assert.equal(usuarioBase('  '), '');
});

test('usuarioDisponible: agrega un número si ya existe', () => {
  assert.equal(usuarioDisponible('juan.perez', []), 'juan.perez');
  assert.equal(usuarioDisponible('juan.perez', ['juan.perez']), 'juan.perez2');
  assert.equal(usuarioDisponible('juan.perez', ['juan.perez', 'juan.perez2', 'juan.perezz']), 'juan.perez3');
});

test('usuarioValido', () => {
  for (const u of ['juan.perez', 'juan.perez2', 'ana_g', 'kev']) assert.ok(usuarioValido(u), u);
  for (const u of ['ju', 'Juan', 'juan perez', '.juan', 'juan.', 'juan..perez', 'juan@x', 'a'.repeat(41)]) {
    assert.ok(!usuarioValido(u), u);
  }
});

test('emailDeLogin: sin "@" usa el dominio interno; con "@" respeta el email real', () => {
  assert.equal(emailDeLogin(' Juan.Perez '), 'juan.perez@tropastunuyan.local');
  assert.equal(emailDeLogin('Admin@Dominio.com'), 'admin@dominio.com');
  assert.equal(etiquetaCuenta('juan.perez@tropastunuyan.local'), 'juan.perez');
  assert.equal(etiquetaCuenta('admin@dominio.com'), 'admin@dominio.com');
});

test('problemaPassword', () => {
  assert.equal(problemaPassword('abcd1234'), null);
  assert.match(problemaPassword('corta') ?? '', /al menos 8/);
  assert.match(problemaPassword('aaaaaaaaaa') ?? '', /predecible/);
});
