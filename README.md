# Tropas Tunuyán — Catálogo, POS y Caja

Catálogo público + panel operativo (punto de venta, inventario, caja/finanzas, turnos con arqueo ciego) para **Tropas Tunuyán**.

**Stack:** Next.js 14 (App Router) · TypeScript estricto · Tailwind CSS · Supabase (PostgreSQL, Auth, Storage) · `@supabase/ssr`.

---

## ⚠️ Antes de desplegar (seguridad)

1. **Cambiá la contraseña de la cuenta de correo de la tienda.** Una versión anterior del login la tenía escrita en el código, así que quedó expuesta. Si esa contraseña se usa en otros servicios, cambiala también ahí.
2. En Supabase → *Authentication → Providers → Email*, **desactivá "Allow new users to sign up"**: los usuarios del panel los crea el administrador.

---

## Puesta en marcha

```bash
cp .env.example .env.local     # completar URL y anon key de Supabase
npm install
npm run dev
```

### Base de datos (esquema v2)

- **Base nueva:** en *Supabase → SQL Editor* ejecutá completo `database/schema.sql` y después `database/seed.sql` (catálogo inicial con fotos).
- **Base con el esquema v1:** ejecutá en una sola transacción, en orden,
  `database/migraciones/20261115_01_respaldo_v1.sql` → `database/schema.sql` → `database/migraciones/20261115_03_datos_desde_v1.sql`.
  Las tablas viejas quedan intactas en el esquema `respaldo_v1` (fuera de la API).
- **Cambios futuros:** un archivo nuevo por cambio en `database/migraciones/` (fecha + descripción), probado con `npm run test:db`.

Modelo:

| Tabla | Para qué |
|---|---|
| `categorias` | Rubros del catálogo, con `slug` y orden. |
| `productos` | Ficha, precio y costo base, imagen, `etiquetas` (fuerza, línea…), `slug` y búsqueda full-text en español. |
| `variantes` | Talle/color con stock propio, **precio y costo opcionales** (si son `NULL` rige el del producto), `sku` y `codigo_barras` únicos (lector en el POS). |
| `movimientos_stock` | Libro de inventario: cada alta, venta y ajuste con delta, stock resultante, motivo y usuario. Lo escribe la base. |
| `empleados` | Personal con PIN bcrypt y bloqueo por intentos. |
| `turnos_caja` · `ventas` · `venta_detalles` · `movimientos_caja` | Caja, ventas con precio y costo histórico, ingresos/egresos. |
| `auditoria` | Antes/después de cada alta, cambio o baja de productos, variantes, categorías y personal (nunca guarda PIN). |

### Usuarios y roles

**Administrador** (se crea a mano, una vez):

1. *Authentication → Users → Add user* (email + contraseña).
2. Asignar rol en el SQL Editor:

```sql
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"rol":"admin"}'
 where email = 'correo@dominio.com';
```

3. El usuario vuelve a iniciar sesión (el rol viaja dentro del JWT).

**Vendedores** (desde el panel, *Turnos & personal*): al dar de alta un empleado se crea su cuenta de Supabase Auth con rol `vendedor` (en `app_metadata`, que el usuario no puede editar) y queda vinculada en `empleados.user_id`. Requiere `SUPABASE_SERVICE_ROLE_KEY` en el servidor.

- Cada empleado entra con un **usuario** (`nombre.apellido`, sin tildes; si existe se agrega un número). Internamente la cuenta usa el email `<usuario>@tropastunuyan.local`, que el empleado nunca ve. En el login, lo que no tenga `@` se completa con ese dominio; el admin sigue entrando con su email.
- Contraseña inicial definida por el admin o generada (se muestra una sola vez). En el primer ingreso se exige cambiarla (`app_metadata.debe_cambiar_password`).
- *Crear acceso* para empleados cargados antes, *Resetear contraseña* para los que ya tienen.
- Dar de baja o desactivar un empleado **bloquea su cuenta** (ban) sin borrarla: el historial de turnos y ventas se conserva. Además la base deja de considerarlo staff.

| Rol | Acceso |
|---|---|
| `admin` | Todo: inventario, categorías, finanzas, personal, POS, turnos (puede abrir un turno a nombre de un empleado con su PIN) |
| `vendedor` | POS y **sus** turnos: abre el suyo (el empleado sale de la sesión), vende y cierra solo en él; no ve turnos, ventas ni datos de otros. Debe estar vinculado a un empleado activo |
| (sin rol) | Ninguno: el middleware lo rechaza y RLS no le devuelve datos |

### Personal y PIN

Además de su usuario, cada empleado tiene un **PIN de 4–6 dígitos** (se guarda con bcrypt; nunca se puede leer). El PIN se usa para:

- **acreditar ventas reguladas** (el operador firma que constató la credencial del comprador), y
- que el **admin abra un turno a nombre de un empleado** (el vendedor abre el suyo con su sesión, sin PIN).

Tras 5 PIN incorrectos el operador queda bloqueado 5 minutos.

---

## Arquitectura de seguridad

| Capa | Qué hace |
|---|---|
| `src/middleware.ts` | Corre en el Edge antes de renderizar. Valida la sesión con `auth.getUser()` (verifica el JWT contra Supabase), refresca tokens, redirige a `/admin/login`, restringe rutas por rol y protege `/api/upload` (401/403). |
| Clientes Supabase | `supabase.ts` (navegador con cookies + cliente público para ISR) y `supabase-server.ts` (Server Components con el JWT del usuario). Nada del panel consulta como `anon`. |
| RLS | `anon` solo lee el catálogo **sin costos ni márgenes** (permisos por columna). Escrituras solo `admin`. Caja: solo `admin`. |
| RPC `SECURITY DEFINER` | Ventas, turnos, arqueo, PIN y stock se ejecutan solo en PostgreSQL, con el rol validado adentro y `search_path` fijo. |
| `/c/<token>` | Enlace público del comprobante que se envía por WhatsApp: token aleatorio de 128 bits, vence a los 90 días, el PDF A4 se genera en el servidor (sin archivos guardados) y nunca incluye costos. El vendedor solo puede crear enlaces de sus propias ventas. |
| `/api/upload` | Sesión admin, ≤ 2 MB, MIME `webp/png/jpeg`, extensión coherente, **firma binaria real**, nombre UUID. Storage sin listado público. |
| Cabeceras | `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS, `noindex` en el panel. |

### Venta atómica — `procesar_venta_pos`

Una única transacción que: verifica el turno abierto (`FOR SHARE`, el cierre no puede colarse), bloquea las variantes (`FOR UPDATE`, en orden estable para evitar deadlocks), **toma precios y stock de la base** (el cliente no puede manipular el total), valida stock, cantidades enteras, medios de pago y credencial con PIN, descuenta stock, registra venta + detalle (con costo histórico) e impacta la caja. Cualquier error ⇒ **rollback completo**. Es **idempotente**: un doble clic o un reintento de red devuelve la misma venta en lugar de duplicarla.

### Arqueo ciego — `cerrar_turno_ciego`

El cajero declara el efectivo sin ver el esperado. PostgreSQL calcula `fondo + ventas en efectivo ± movimientos manuales en efectivo del turno`, el desvío y los totales, y cierra el turno en la misma transacción.

---

## Estructura

```
database/schema.sql              Esquema v2 (tablas, índices, triggers, RLS, RPC, storage)
database/migraciones/            Migraciones versionadas (v1 → v2 y siguientes)
src/middleware.ts                Protección de rutas en el Edge
src/app/(public)/catalogo/       Catálogo público (ISR 60 s + revalidación al editar)
src/app/admin/login/             Acceso del personal
src/app/admin/(panel)/           Panel protegido: pos, inventario, finanzas, turnos
src/app/api/upload/route.ts      Subida blindada de imágenes
src/components/ui/               Sistema de diseño: Modal, Toast, Icon, Spinner, Skeleton
src/components/admin/            Modales del panel (cobro, arqueo, apertura, credencial, ticket…)
src/lib/                         Supabase, RPC (finanzas, empleados), utils monetarias, ticket/PDF
src/hooks/useSubmitLock.ts       Bloqueo síncrono anti doble clic
src/types/database.ts            Tipos sincronizados con el esquema (sin any)
tests/                           Unit tests, integración y pruebas de la base (tests/db, PGlite)
```

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` estricto |
| `npm test` | Tests unitarios (aritmética monetaria, parsers, validación de imágenes) |
| `npm run test:integration` | Con la app corriendo: rutas, middleware, upload, cabeceras y RLS vía clave anon |
| `npm run test:db` | Esquema y migración contra PostgreSQL real en memoria (PGlite): RLS, ventas, stock, auditoría, arqueo |
| `npm run test:concurrencia` | PostgreSQL embebido con varias conexiones: última unidad entre cajas, doble envío, arqueo durante una venta |

## Atajos del POS

`F2` buscar · escanear un código de barras / SKU + `Enter` agrega esa variante · `Enter` agrega si hay un único resultado · `F4` (o `Ctrl+Enter`) cobrar · `Esc` cierra modales / limpia la búsqueda.

## Variables de entorno

Ver `.env.example`. Las `NEXT_PUBLIC_*` son públicas. `SUPABASE_SERVICE_ROLE_KEY` es **solo de servidor**: la usa únicamente `src/lib/supabase-admin.ts` (marcado `server-only`, el build falla si un componente de cliente lo importa) para gestionar las cuentas del personal, siempre después de verificar que quien llama es admin. Nunca le pongas prefijo `NEXT_PUBLIC_`.
