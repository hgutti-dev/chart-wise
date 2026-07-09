# chart-wise — Modelo de datos conceptual (define ahora, usa después)

- **Estado:** Normativo (parte de la constitución). Complementa [spec.md](spec.md).
- **Fecha:** 2026-07-09
- **Decisiones asociadas:** [spec.md §8 · ADR-006](spec.md).
- **Naturaleza:** este documento **define** el modelo completo del producto y **cierra las decisiones** que condicionan el schema. **No implementa**: cada entidad se **materializa** (tabla + migración + RLS + tests) cuando llega el spec numerado de su módulo. La única parte materializada hoy es la de Fase 1 (`Tenant` + `Note`), descrita en [specs/001-foundation/data-model.md](specs/001-foundation/data-model.md).

> **Por qué "define ahora, usa después".** Añadir una columna es trivial; retro-interpretar datos ya guardados (fechas sin zona, un `user.tenantId` que debía ser una membresía N‑a‑N) es una migración con datos reales de clientes. Las decisiones de forma del dato se toman **antes** de escribir la primera consulta, aunque la feature que las usa llegue fases después.

---

## 1. Mapa de entidades por contexto

```
--- identity (AuthN — Auth.js exige estas cuatro) ---
User             id, email, name, image, passwordHash?, emailVerified
Account          proveedores OAuth vinculados al User
Session          solo si se usan sesiones en DB (Fase 2)
VerificationToken magic links / verificación de email

--- tenancy ---
Tenant           id, name, slug (único), plan, createdAt
                 + previousSlugs[], timezone, currency, locale, deletedAt   (ver §4)
Membership       id, userId, tenantId, role, createdAt
                 UNIQUE(userId, tenantId)     ← un usuario, un rol por tenant
Invitation       id, tenantId, email, role, token, expiresAt, acceptedAt, status

--- negocio (todo lleva tenantId) ---
Dataset          id, tenantId, uploadedByUserId, fileName, storageKey,
                 sizeBytes, rowCount?, columnsMeta?, createdAt
Analysis         id, tenantId, datasetId, requestedByUserId, status,
                 engineVersion, resultJson?, schemaVersion?, error?
Dashboard        id, tenantId, analysisId, title, layoutJson,
                 createdByUserId, shareToken?, isPublic, deletedAt
```

**Mapeo a bounded contexts** (ver [spec.md §5](spec.md)): `User`/`Account`/`Session`/`VerificationToken` → `identity`; `Tenant`/`Membership`/`Invitation` (+ `Role`) → `tenancy`; `Dataset` → `datasets`; `Analysis`/`Dashboard` (+ `Insight`) → `analytics`.

## 2. Convención de identidad y tenant-safety (obligatoria)

- **IDs = `uuid`** (nunca autoincremental: no revela volumen de clientes). Es una **decisión cerrada**, no una opción abierta: la policy RLS castea `current_setting('app.current_tenant')::uuid`, así que cambiar a `cuid` rompería el aislamiento ya implementado.
- **Toda tabla de negocio** (las que llevan `tenantId`) declara **los dos índices**:
  - `@@index([tenantId])` — filtrado por tenant.
  - `@@unique([tenantId, id])` — habilita **claves foráneas tenant-safe**: una relación entre tablas de negocio referencia `(tenantId, parentId) → (tenantId, id)`, de modo que una FK **no puede** cruzar tenants por construcción.
- **El `slug` JAMÁS es la clave de una consulta.** El identificador real es `tenantId`. El `slug` se resuelve a `tenantId` en el borde (`app/org/[tenantSlug]`) y se descarta. Si un repositorio recibe un `slug`, es un bug.

## 3. Relaciones (conceptual)

```
User 1 ──N Membership N── 1 Tenant          (N-a-N vía Membership; UNIQUE(userId, tenantId))
Tenant 1 ──N Invitation
Tenant 1 ──N Dataset ──N Analysis ──N Dashboard   (todas discriminadas por tenantId)
User 1 ──N Dataset (uploadedByUserId) / Analysis (requestedByUserId) / Dashboard (createdByUserId)
```

## 4. Decisiones cerradas (ADR-006)

### D1 — `slug` **editable**, con redirección
El `slug` es cosmético; nada en la DB apunta a él (§2). Hacerlo inmutable no compra seguridad, solo atrapa al usuario que se equivocó en el onboarding.
- `Tenant.slug` (unique) + `Tenant.previousSlugs String[]` (**array de Postgres, no tabla**).
- Al cambiar: `push` del slug viejo a `previousSlugs`.
- Solo **OWNER** puede cambiarlo. Rate limit: **1 cambio / 30 días**.
- **Slugs reservados** (no asignables): `api`, `admin`, `login`, `new`, `settings`, `org`, `share`.
- Redirección: si el slug de la URL está en `previousSlugs` → **301** al actual (middleware, ~10 líneas). *(Se implementa en su fase; ver §6.)*

### D2 — Borrado **selectivo**, no universal
El soft delete tiene el mismo modo de fallo que `tenantId`: una consulta que olvida `deletedAt: null` filtra datos borrados. No se aplica "por si acaso".

| Estrategia | Entidades | Racional |
|---|---|---|
| **Soft** (`deletedAt`) | `Tenant`, `Dashboard` | El usuario borra por error; recuperar tiene valor real. |
| **Hard** (cascada) | `Dataset`, `Analysis`, `Invitation`, `Membership` | Nadie pide recuperar un CSV borrado. |

- **Divergencia consciente respecto al modelo original:** `Dataset` pasa a **hard delete** (el borrador conceptual lo ponía como lógico).
- **Trampa soft delete + `unique(slug)`:** al soft-borrar un `Tenant`, liberar el slug renombrándolo a `${slug}__deleted_${id}`; si no, el nombre queda quemado para siempre.
- `Tenant` borrado = soft delete + **purga física a los 30 días** (job programado, fase futura).

### D3 — i18n y moneda en `Tenant` desde el día 1
Añadir la columna es trivial; retro-interpretar fechas ya guardadas sin zona es imposible.

| Campo | Tipo | Default | Uso |
|---|---|---|---|
| `timezone` | `text` (IANA, p. ej. `America/El_Salvador`) | `"UTC"` | Formateo de fechas del tenant. |
| `currency` | `text` (ISO 4217, p. ej. `USD`) | `"USD"` | Narrativa de importes (Fase 7). |
| `locale` | `text` (p. ej. `es-SV`) | `"es"` | Formateo con `Intl.NumberFormat(locale, { currency })`. |

Reglas: **todo timestamp en DB es `timestamptz` UTC**, sin excepciones; nunca se guarda una fecha local ni se formatea sin la `tz` del tenant. En Fase 7 el motor devuelve `12400` y el LLM narra según `currency` + `locale` (`$12,400` vs `12.400 €`); el formateo ocurre en el cliente.

### D4 — Un usuario pertenece a **N** tenants (modelado día 1, UI de uno en MVP)
`User 1 ──N Membership N── 1 Tenant`, `UNIQUE(userId, tenantId)`, `role: OWNER | ADMIN | MEMBER | VIEWER`. Es el caso base (Ana es OWNER en su consultora y VIEWER en la empresa de un cliente), no un "futuro si aplica". En MVP la UI muestra una sola organización y el selector de tenant no se despliega si hay una; el modelo ya lo soporta. Coincide con US-04 y ADR-002.

## 5. Verificación asociada por fase

Cada `SC` se cierra cuando su entidad se materializa. Ejemplos: `@@unique([tenantId, id])` debe existir **antes** de la primera consulta del repositorio de cada tabla de negocio (es lo que hace posible las FKs tenant-safe); `UNIQUE(userId, tenantId)` se prueba al crear `Membership`; el redirect 301 y la purga a 30 días tienen su test cuando se implementan (§6).

## 6. Qué queda diferido (con su propio ADR)

Estas piezas son **enforcement/UX**, no modelado, y llegan en la fase de su módulo — **no** se adelantan:

- **RLS por tabla de negocio** (ENABLE/FORCE + policy `current_setting('app.current_tenant')`): se replica el patrón de `Note` en cada tabla scoped **cuando se crea**. Fase de aislamiento por módulo.
- **Prisma Client Extension** que auto-inyecta `tenantId` y `deletedAt: null`: mecanismo transversal que **complementa o sustituye** el `where` explícito del repositorio + RLS. Requiere su **propio ADR** (reconciliar con los puertos que reciben `TenantId` branded) y se prueba con repositorios reales, no antes.
- **Middleware de redirección 301** de `previousSlugs` (D1) y **job de purga a 30 días** (D2).

## 7. Estado de materialización

| Entidad | Módulo | Estado |
|---|---|---|
| `Tenant` | tenancy | **Parcial (Fase 1):** raíz + i18n + `previousSlugs` + `deletedAt` (retrofit ADR-006). `plan`, `Membership`, `Invitation` llegan con `tenancy`/billing. |
| `Note` | example | **Materializada (Fase 1):** placeholder; `@@unique([tenantId, id])` añadido por ADR-006. Se sustituye por los módulos reales. |
| `User`, `Account`, `Session`, `VerificationToken` | identity | Definidas, **no materializadas**. |
| `Membership`, `Invitation` | tenancy | Definidas, **no materializadas**. |
| `Dataset` | datasets | Definida, **no materializada**. |
| `Analysis`, `Dashboard` | analytics | Definidas, **no materializadas**. |
