/**
 * Verificación de integración y seguridad — Tropas Tunuyán.
 *
 * Uso:  npm run dev   (en otra terminal)
 *       npm run test:integration
 *
 * Variables (sin claves hardcodeadas; se leen de process.env / .env.local):
 *   TEST_BASE_URL                  URL de la app (default http://localhost:3000)
 *   NEXT_PUBLIC_SUPABASE_URL       opcional: habilita las pruebas de RLS
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  opcional: idem (es la clave PÚBLICA anon)
 */
const fs = require('node:fs');
const path = require('node:path');

// Carga mínima de .env.local sin dependencias (no pisa variables ya definidas).
const envLocal = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envLocal)) {
  for (const linea of fs.readFileSync(envLocal, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linea);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const BASE_URL = (process.env.TEST_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let passed = 0;
let failed = 0;

function ok(nombre) {
  console.log(`  ✓ ${nombre}`);
  passed++;
}
function fail(nombre, detalle) {
  console.error(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  failed++;
}

async function esperarStatus(nombre, ruta, esperado, opciones = {}) {
  try {
    const res = await fetch(`${BASE_URL}${ruta}`, { redirect: 'manual', ...opciones });
    const lista = Array.isArray(esperado) ? esperado : [esperado];
    if (lista.includes(res.status)) ok(`${nombre} (${res.status})`);
    else fail(nombre, `status ${res.status}, esperado ${lista.join('/')}`);
    return res;
  } catch (err) {
    fail(nombre, err.message);
    return null;
  }
}

async function main() {
  console.log(`\nTROPAS TUNUYÁN — verificación contra ${BASE_URL}\n`);

  console.log('1. Rutas públicas');
  await esperarStatus('Catálogo público', '/catalogo', 200);
  const raiz = await esperarStatus('La raíz redirige al catálogo', '/', [301, 308]);
  if (raiz && !(raiz.headers.get('location') || '').endsWith('/catalogo')) fail('Destino de la redirección', raiz.headers.get('location'));
  await esperarStatus('Login del personal', '/admin/login', 200);

  console.log('\n2. Protección del panel (middleware)');
  for (const ruta of ['/admin/pos', '/admin/inventario', '/admin/finanzas', '/admin/turnos']) {
    const res = await esperarStatus(`Sin sesión: ${ruta} redirige`, ruta, 307);
    const loc = res && res.headers.get('location');
    if (res && !(loc || '').includes('/admin/login')) fail(`${ruta} redirige a login`, loc);
  }
  await esperarStatus('Cabecera interna falsificada no da acceso', '/admin/pos', 307, { headers: { 'x-tt-rol': 'admin' } });

  console.log('\n3. Subida de archivos');
  const fd = new FormData();
  fd.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'x.png');
  await esperarStatus('POST /api/upload sin sesión → 401', '/api/upload', 401, { method: 'POST', body: fd });

  console.log('\n4. Cabeceras de seguridad');
  try {
    const res = await fetch(`${BASE_URL}/catalogo`);
    for (const h of ['x-frame-options', 'x-content-type-options', 'referrer-policy']) {
      res.headers.get(h) ? ok(`${h}: ${res.headers.get(h)}`) : fail(`Falta ${h}`);
    }
    if (res.headers.get('x-powered-by')) fail('x-powered-by expuesto');
    else ok('x-powered-by oculto');
  } catch (err) {
    fail('Cabeceras', err.message);
  }

  if (SUPABASE_URL && ANON_KEY) {
    console.log('\n5. Row Level Security con la clave anon (lo que puede hacer cualquiera)');
    const rest = (p, init = {}) =>
      fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
        ...init,
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      });

    const cat = await rest('productos?select=id,nombre,precio&limit=1');
    cat.ok ? ok('anon lee el catálogo') : fail('anon lee el catálogo', String(cat.status));

    const costo = await rest('productos?select=costo&limit=1');
    costo.ok ? fail('anon NO debe leer costos', 'la columna costo es legible') : ok(`anon no lee costos (${costo.status})`);

    for (const tabla of ['movimientos_caja', 'ventas', 'turnos_caja', 'empleados']) {
      const r = await rest(`${tabla}?select=id&limit=1`);
      const cuerpo = r.ok ? await r.json() : null;
      if (!r.ok || (Array.isArray(cuerpo) && cuerpo.length === 0)) ok(`anon no accede a ${tabla} (${r.status})`);
      else fail(`anon accede a ${tabla}`, `${cuerpo.length} filas visibles`);
    }

    const ins = await rest('categorias', { method: 'POST', body: JSON.stringify({ nombre: `hack-${Date.now()}` }) });
    ins.ok ? fail('anon NO debe escribir categorías') : ok(`anon no escribe (${ins.status})`);

    const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verificar_credencial_empleado`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_empleado_id: '00000000-0000-0000-0000-000000000000', p_pin: '1234' }),
    });
    rpc.ok ? fail('anon NO debe ejecutar RPC de PIN') : ok(`anon no ejecuta RPC de PIN (${rpc.status})`);
  } else {
    console.log('\n5. (omitido) Definí NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY para probar RLS.');
  }

  console.log(`\nResultado: ${passed} OK, ${failed} fallos.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
