/**
 * Tests unitarios sin dependencias: `npm test`
 * (Node ≥ 22.6 con --experimental-strip-types ejecuta TypeScript directamente).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularMargen,
  calcularPrecioDesdeMargen,
  multiplyCurrency,
  parseCantidad,
  parseEnteroNoNegativo,
  parseMonto,
  costoVariante,
  precioVariante,
  rangoPrecios,
  roundCurrency,
  sameCurrency,
  sumCurrency,
} from '../src/lib/utils.ts';
import { detectarMimePorFirma, validarArchivoImagen, MAX_UPLOAD_BYTES } from '../src/lib/storage.ts';

test('roundCurrency elimina errores de coma flotante', () => {
  assert.equal(0.1 + 0.2 === 0.3, false);
  assert.equal(roundCurrency(0.1 + 0.2), 0.3);
  assert.equal(roundCurrency(1.005), 1.01);
  assert.equal(roundCurrency(2.675), 2.68);
  assert.equal(roundCurrency(-1.005), -1);
  assert.equal(roundCurrency(Number.NaN), 0);
  assert.equal(roundCurrency(Number.POSITIVE_INFINITY), 0);
});

test('sumas y productos monetarios', () => {
  assert.equal(sumCurrency([0.1, 0.2, 0.3]), 0.6);
  assert.equal(sumCurrency(Array(10).fill(0.1)), 1);
  assert.equal(multiplyCurrency(19.99, 3), 59.97);
  assert.equal(multiplyCurrency(45500, 2), 91000);
  assert.ok(sameCurrency(0.1 + 0.2, 0.3));
  assert.ok(!sameCurrency(100, 100.01));
});

test('arqueo: desglose de billetes sin error acumulado', () => {
  const total = sumCurrency([20000 * 3, 1000 * 7, 10 * 9]);
  assert.equal(total, 67090);
  // Esperado = fondo + ventas efectivo − egresos efectivo (mismo cálculo que cerrar_turno_ciego).
  assert.equal(roundCurrency(sumCurrency([15000, 91000, 100000]) - 2000 - 204000), 0);
  // Más de 2 decimales no es un monto válido: se rechaza en la carga.
  assert.equal(parseMonto('203999.995'), null);
});

test('parseCantidad: solo enteros 1..9999', () => {
  assert.equal(parseCantidad('3'), 3);
  assert.equal(parseCantidad(1), 1);
  for (const malo of ['0', '-1', '1.5', '1e3', 'abc', '', ' ', 'NaN', '10000', '2,5']) {
    assert.equal(parseCantidad(malo), null, `debería rechazar "${malo}"`);
  }
  assert.equal(parseCantidad(Number.NaN), null);
});

test('parseEnteroNoNegativo admite 0', () => {
  assert.equal(parseEnteroNoNegativo('0'), 0);
  assert.equal(parseEnteroNoNegativo('-2'), null);
  assert.equal(parseEnteroNoNegativo('3.0'), null);
});

test('parseMonto acepta formatos es-AR y rechaza basura', () => {
  assert.equal(parseMonto('1500'), 1500);
  assert.equal(parseMonto('1.500,50'), 1500.5);
  assert.equal(parseMonto('1500.5'), 1500.5);
  assert.equal(parseMonto('$ 2000'), 2000);
  assert.equal(parseMonto('0'), 0);
  for (const malo of ['-5', 'abc', '1.2.3', '12,345', '1e5', '']) {
    assert.equal(parseMonto(malo), null, `debería rechazar "${malo}"`);
  }
  assert.equal(parseMonto('100000001'), null);
});

test('calculadora de precio / margen', () => {
  assert.equal(calcularPrecioDesdeMargen(20000, 45), 29000);
  assert.equal(calcularPrecioDesdeMargen(0.1, 200), 0.3);
  assert.equal(calcularMargen(20000, 29000), 45);
  assert.equal(calcularMargen(0, 100), 0);
});

test('detección de imágenes por firma binaria', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
  const html = new TextEncoder().encode('<script>alert(1)</script>');
  assert.equal(detectarMimePorFirma(png), 'image/png');
  assert.equal(detectarMimePorFirma(jpg), 'image/jpeg');
  assert.equal(detectarMimePorFirma(webp), 'image/webp');
  assert.equal(detectarMimePorFirma(html), null);
});

test('validación previa de archivos', () => {
  assert.equal(validarArchivoImagen({ name: 'a.png', type: 'image/png', size: 100 }), null);
  assert.ok(validarArchivoImagen({ name: 'a.svg', type: 'image/svg+xml', size: 100 }));
  assert.ok(validarArchivoImagen({ name: 'a.jpg', type: 'image/png', size: 100 }));
  assert.ok(validarArchivoImagen({ name: 'a.png', type: 'image/png', size: MAX_UPLOAD_BYTES + 1 }));
  assert.ok(validarArchivoImagen({ name: 'a.png', type: 'image/png', size: 0 }));
});

test('precioVariante / costoVariante: la variante manda; null usa el del producto', () => {
  const p = { precio: 38500, costo: 22000 };
  assert.equal(precioVariante(p, { precio: null }), 38500);
  assert.equal(precioVariante(p, { precio: 41000 }), 41000);
  assert.equal(precioVariante(p, { precio: 0 }), 0);
  assert.equal(precioVariante(p, null), 38500);
  assert.equal(costoVariante(p, { costo: null }), 22000);
  assert.equal(costoVariante(p, { costo: 23500 }), 23500);
});

test('rangoPrecios: mínimo y máximo entre variantes', () => {
  const p = { precio: 38500 };
  assert.deepEqual(rangoPrecios(p, []), { min: 38500, max: 38500 });
  assert.deepEqual(rangoPrecios(p, [{ precio: null }, { precio: null }]), { min: 38500, max: 38500 });
  assert.deepEqual(rangoPrecios(p, [{ precio: null }, { precio: 41000 }]), { min: 38500, max: 41000 });
  assert.deepEqual(rangoPrecios(p, [{ precio: 30000 }, { precio: null }]), { min: 30000, max: 38500 });
});
