# Fase 3 — Research y decisiones

- **Feature:** `003-roles-permissions`
- **Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md)
- **Constitución:** [../../spec.md](../../spec.md) (ADR-002, ADR-003, ADR-006, §7.1)

> Cada decisión cierra una pregunta abierta del spec §11 o justifica un requisito. Los snippets son **ilustrativos**: las firmas de Prisma 7 y de los callbacks de Auth.js v5 se confirman con **Context7** antes de implementarlas.

## R1 — Poblar `role`/`activeTenantId` en el JWT, sin acoplar `identity`→`tenancy` *(FR-009 / NFR-004; cierra Q1)*

- **Contexto:** la Fase 2 dejó `activeTenantId?`/`role?` **reservados** en el JWT/sesión (tipados, sin poblar). Poblarlos exige leer `Membership`, que es de `tenancy`. Pero `identity` (donde vive `auth.config.ts`) **no puede** importar `tenancy` (dirección de dependencias §5, ADR-003).
- **Decisión:** el poblado vive en un **extensor propiedad de `tenancy`** (`tenancy/infrastructure/auth/populate-tenant-claims.ts`, permitido por el confinamiento Auth.js: `src/modules/*/infrastructure/auth/**`). Los callbacks base de `identity` exponen un punto de composición; el **composition root de `app/`** (donde se crea la instancia de Auth.js) compone los callbacks base con el extensor de `tenancy`, inyectándole el `MembershipRepository`. Así `identity` sigue sin conocer `tenancy`.
- **Alternativas:**
  - **`identity` llama a `@/modules/tenancy` desde el callback:** **descartado** — viola la dirección de dependencias (`identity ↛ tenancy`) y el test de arquitectura (SC-013).
  - **Resolver el rol por request desde `Membership`, dejar el JWT solo-AuthN:** **descartado como default** (más correcto ante *staleness*, pero el spec elige poblar el claim para la costura de Fase 2). Se conserva como patrón para escrituras sensibles (ver R6).
  - **Meter `role` en `shared` para que el callback base lo ponga:** **descartado** — `Role` es de `tenancy` (ADR-002); `shared` no debe conocer roles.
- **Racional:** rellena la costura exacta que la Fase 2 documentó, mantiene `identity` AuthN-only, y localiza todo el acoplamiento a Auth.js bajo `*/infrastructure/auth/**`.
- **Nota (trampa):** la augmentación de tipos de Fase 2 declara `role?: string`. Al poblarlo, el tipo se estrecha a `Role`; hay que actualizar `next-auth.d.ts` (que hoy vive en `identity/infrastructure/auth/`) o exponer un tipo de sesión enriquecido desde `tenancy`. Se decide en implementación con Context7 (cómo augmentar sin que `identity` importe el `Role` de `tenancy`): probable solución → `role?: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER"` como *string-literal union* estructural, y `Role.create()` lo valida al reconstruir el `AuthContext`.

## R2 — `role` vive en un `AuthContext` de `tenancy`, no en `TenantContext` *(FR-008 / NFR-003; cierra Q2)*

- **Contexto:** el PDF dibuja `TenantContext { userId, tenantId, role, permissions }`. Pero `TenantContext` vive en `shared/application` y hoy es `{ tenantId, userId? }`; meterle `role` obligaría a `shared` a conocer `Role` (de `tenancy`), rompiendo capas.
- **Decisión:** `TenantContext` (shared) **no se toca**. `tenancy` define `AuthContext = TenantContext & { role: Role }`, construido tras verificar `Membership`. Los casos de uso protegidos reciben `AuthContext`; `can()`/`requirePermission` operan sobre él. La lista completa de permisos **no** se almacena: se **deriva** del rol con `can()` (regla de los ~4 KB del PDF §11.2, y evita duplicar la matriz).
- **Alternativas:**
  - **Extender `TenantContext` con `role: string` en `shared`:** **descartado** — pierde el tipo `Role` o mete `tenancy` en `shared`.
  - **Guardar `permissions: Permission[]` en el contexto:** **descartado** — se deriva del rol; almacenarla la desincroniza de la matriz.
- **Racional:** mantiene `shared` sin negocio, `Role` en `tenancy` (ADR-002), y el contexto de autorización cohesionado donde vive la política.

## R3 — Policy RLS de `Membership` que admite la ruta "mis membresías" *(FR-006, FR-007 / NFR-007; cierra Q3)*

- **Contexto:** `Membership` es *tenant-scoped* (lleva `tenantId`), así que por ADR-001/ADR-006 necesita RLS. Pero hay una ruta que **cruza tenants por diseño**: "¿a qué organizaciones pertenezco?" (`listByUser(userId)`), base del futuro `select-org`. Una policy que solo filtra por `current_setting('app.current_tenant')` bloquearía esa lectura legítima.
- **Decisión:** la tabla `Membership` lleva **RLS `ENABLE`+`FORCE`** con una policy que permite la fila cuando **`tenantId = current_setting('app.current_tenant')::uuid`** (ruta scoped normal). La ruta "mis membresías" se resuelve con una **variable de sesión distinta** (`app.current_user`) y una policy que también admite `userId = current_setting('app.current_user')::uuid`, **o** mediante un método de repositorio explícito que fija ese contexto. La forma exacta (una policy con `OR` vs. dos operaciones con `set_config` distinto) se cierra en **ADR-008**.
- **Alternativas:**
  - **Policy solo por `tenantId`:** **descartado** — impide `listByUser`, rompe `select-org` (Fase 5).
  - **`Membership` sin RLS ("es tabla de control"):** **descartado** — es *tenant-scoped* y una fuga aquí revela quién pertenece a qué organización.
- **Racional:** conserva el aislamiento por tenant para la ruta scoped y habilita la ruta por usuario sin `BYPASSRLS`.
- **Nota:** la Fase 3 solo **necesita** `findRole(userId, tenantId)` (ruta scoped) para poblar el claim; `listByUser` se materializa aquí pero su consumidor (`select-org`) es de Fase 5.

## R4 — Provisión de workspace personal al registrarse (B2C) *(FR-010; cierra Q4)*

- **Contexto:** para que `can()`/el guard tengan un rol real que verificar, un usuario recién registrado debe tener una `Membership`. La Fase 2 difirió "registro → `Tenant` + `Membership(OWNER)`" a `tenancy`, y publicó `UserRegistered` sin consumidor.
- **Decisión:** `tenancy` **consume `UserRegistered`** (handler `ProvisionWorkspaceOnUserRegistered`) y crea, en **transacción atómica**, un `Tenant` (workspace personal, `slug` derivado del email + sufijo único, dentro de los reservados de ADR-006) y un `Membership(OWNER)`. Coherente con la constitución §1 (modelo B2C: "al registrarse se le aprovisiona su espacio personal"). El **onboarding UI** ("¿cómo se llama tu organización?") es de Fase 5; aquí el nombre por defecto se puede editar después.
- **Alternativas:**
  - **No aprovisionar; sembrar memberships solo en tests:** **descartado** como default — deja al usuario sin tenant/rol tras registrarse; la fase no sería demostrable end-to-end (la elegida por el usuario incluye la provisión).
  - **Aprovisionar en el propio `RegisterUser` de `identity`:** **descartado** — `identity` no crea tenants ni conoce `Membership` (ADR-003/ADR-007).
- **Racional:** consume la costura del evento (ADR-004), respeta que la creación de tenant es de `tenancy`, y hace la fase observable: registrar → login → sesión con `role = OWNER`.
- **Nota (idempotencia):** el `EventBus` es in-memory síncrono; aun así, el handler debe ser idempotente frente a reintentos (evitar doble `Tenant` si el evento se re-despacha). Clave natural: no crear si ya existe un workspace personal para ese `userId`.

## R5 — Modelar `"own"` y `"no a OWNER"` sin caer en ABAC *(FR-003, FR-004; cierra Q5)*

- **Contexto:** el §12.2 del PDF tiene dos celdas especiales: `dashboard:update/delete` de `MEMBER` = **propio**, y `member:change_role` de `ADMIN` = **no a OWNER**. El PDF advierte: "No compliques con ABAC. Modélalo como una regla explícita del dominio".
- **Decisión:** la matriz es **tri-estado** `"all" | "own" | false`. `can(permission, ctx, resourceOwnerId?)` resuelve `"own"` comparando `ctx.userId === resourceOwnerId`. La restricción **"no a OWNER"** *no* es *ownership*: es un invariante del caso de uso `ChangeMemberRole` (un `ADMIN` no puede afectar a un `OWNER`), que se **difiere a Fase 5** junto con ese caso de uso. En Fase 3 la matriz marca `member:change_role` de `ADMIN` como `"all"` y se **documenta** el invariante pendiente.
- **Alternativas:**
  - **Motor de políticas ABAC / condiciones genéricas:** **descartado** — sobre-ingeniería; el PDF lo prohíbe explícitamente.
  - **Cuarto estado en la matriz para "no a OWNER":** **descartado** — mezcla autorización (¿puede la acción?) con un invariante de dominio (¿sobre quién?); ese invariante pertenece al caso de uso, no a la matriz.
- **Racional:** una sola frontera nueva (`"own"`) en la matriz, resuelta con un parámetro; el resto de restricciones son invariantes de sus casos de uso, testeables por separado.

## R6 — *Staleness* del rol: `maxAge` corto + revalidación en escrituras *(NFR-008)*

- **Contexto:** el `role` viaja en el JWT (R1). Si un `OWNER` degrada a alguien a `VIEWER`, su token sigue diciendo el rol viejo hasta expirar (la Fase 2 fijó JWT no revocable).
- **Decisión:** se **hereda** el `maxAge` corto de la Fase 2 para lecturas, y se **revalida `Membership` contra la DB** en las operaciones de escritura sensibles (cambio de rol, invitación, facturación) — "cuesta menos que una fuga" (PDF §11.2). La revocación inmediata / blocklist se **difiere** a *hardening*.
- **Alternativas:** **JWT TTL largo sin revalidación** (**descartado** — cambios de rol tardan horas); **sesión en DB** (**descartado** para el MVP — lectura de DB por request, es enterprise). *(coincide con la tabla del PDF §11.2: la fila recomendada es "JWT + verificación de Membership en operaciones sensibles").*
- **Nota:** la revalidación concreta se ejercita cuando existan los casos de uso de escritura (Fase 5+); en Fase 3 solo se documenta la regla y se deja el `MembershipRepository.findRole` listo para ella.

---

## Decisiones cerradas del spec

- **Q1** (poblado JWT vs. por request) → **R1** (poblar en JWT, compuesto en `app/`).
- **Q2** (`role` en `TenantContext` vs. `AuthContext`) → **R2** (`AuthContext` en `tenancy`).
- **Q3** (RLS de `Membership` y ruta "mis membresías") → **R3** (RLS `FORCE` + policy que admite `userId`; forma exacta en ADR-008).
- **Q4** (provisión B2C vs. onboarding) → **R4** (workspace personal por defecto; onboarding UI en Fase 5).
- **Q5** (`"own"` / "no a OWNER" sin ABAC) → **R5** (matriz tri-estado + invariante de caso de uso diferido).

## Recordatorio de implementación

- Consultar **Context7** antes de: el enum + la relación `Membership` en Prisma 7, el `set_config`/policy RLS, y los callbacks `jwt`/`session` + augmentación de tipos de Auth.js v5.
- Registrar **ADR-008** en `../../spec.md §8` (R1 + R3) al cerrar la fase.

## Confirmaciones Context7 (T003)

Consulta ejecutada en la Fase 0 (T003). Fuentes: Prisma `/prisma/prisma/7.6.0` y Auth.js `/websites/authjs_dev`. La sintaxis RLS/`set_config` ya está probada en el repo (migración `init` de `Note`); Context7 solo confirma la parametrización. Insumo para Fases D/F.

**A) Prisma 7 — enum + relación + `onDelete` + constraints *(Fase D, T040)*.** Sin cambios de sintaxis en Prisma 7 frente al esquema ilustrativo de [data-model.md](data-model.md) §3, que es válido tal cual:
- `enum Role { OWNER ADMIN MEMBER VIEWER }`.
- `tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)` (borrado *hard*-cascada confirmado).
- Atributos de bloque `@@unique([userId, tenantId])`, `@@unique([tenantId, id])`, `@@index([tenantId])`, `@@map("memberships")` estándar.
- El `generator client` usa `provider = "prisma-client"` (no el viejo `prisma-client-js`) y el `datasource` omite `url` (lo aporta `prisma.config.ts`) — coincide con el repo.

**B) RLS / `set_config` *(Fase D/E, T041/T051)*.** Patrón del repo confirmado:
- Policy `USING`/`WITH CHECK`: `"tenantId" = current_setting('app.current_tenant', true)::uuid`; fijada por transacción con `SELECT set_config('app.current_tenant', $1, true)` vía `$executeRaw` (parametrizable; `SET LOCAL` no admite *bind*). *Fail-closed*: sin fijar, `current_setting(...,true)` es `NULL` → 0 filas.
- Ruta "mis membresías": misma mecánica con `app.current_user`. La forma exacta (una policy con `OR` vs. dos `set_config`) se cierra en **ADR-008** (ver R3).

**C) Auth.js v5 — callbacks + augmentación *(Fase F, T060–T062)*.**
- Callbacks: `jwt({ token, user })` puebla el token en sign-in; `session({ session, token })` copia al `session` (ambos pueden ser `async`). El poblado de `tenancy` lee de `MembershipRepository` (extensor propio) y se **compone** con los callbacks base de `identity` en el composition root de `app/`.
- Augmentación: `declare module "next-auth" { interface Session extends DefaultSession {…} }` y `declare module "next-auth/jwt" { interface JWT {…} }`.
- **Trampa R1 (evitar `identity`→`tenancy`):** narrar el claim como **unión de literales string estructural** — `role?: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER"` y `activeTenantId?: string` — sin importar el `Role` de `tenancy`; se revalida con `Role.create()` al reconstruir el `AuthContext`.
