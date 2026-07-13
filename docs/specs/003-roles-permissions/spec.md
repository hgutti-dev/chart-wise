# Fase 3 — Roles y permisos: autorización por membresía en `tenancy`

- **Feature:** `003-roles-permissions`
- **Estado:** Draft para revisión
- **Fecha:** 2026-07-13
- **Constitución:** [../../spec.md](../../spec.md) — este spec **hereda** sus principios y no los repite.
- **Modelo conceptual:** [../../data-model.md](../../data-model.md) (entidades de `tenancy`).
- **Artefactos hermanos:** [plan.md](plan.md) · [tasks.md](tasks.md) · [data-model.md](data-model.md) · [research.md](research.md) · [quickstart.md](quickstart.md) · [checklists/requirements.md](checklists/requirements.md)

> **Regla de oro de la fase:** la **autorización es dominio** y vive en `tenancy`. La matriz rol→permisos y `can()` son **funciones puras** (sin DB, sin `async`), verificables en microsegundos. El código **nunca** pregunta «¿es admin?»; pregunta «¿puede `member:invite`?». El guard real corre **en el servidor, dentro del caso de uso**: la UI y el middleware son **cosméticos** (ocultan, no prohíben). Al terminar, un usuario registrado es OWNER de su workspace, su rol viaja en la sesión, y un `VIEWER` que fuerza la URL **no puede** escribir aunque el botón exista.

---

## 1. Objetivo

Estrenar el módulo `tenancy` con su capa de **autorización**, de forma que:

1. **Los roles y permisos existan como dominio puro.** Enum/VO `Role` (`OWNER|ADMIN|MEMBER|VIEWER`), un tipo `Permission`, una **matriz tipada** rol→permisos (constante en `tenancy/domain`, **nunca** en `config/`), y una función pura `can(permission, ctx, resourceOwnerId?)` que resuelve incluso la frontera *ownership* (`dashboard:update → propio`).
2. **La autorización se haga cumplir en el servidor.** Un guard `requirePermission(ctx, permission, resourceOwnerId?)` que devuelve `Result<void, PermissionDeniedError>` y se invoca al **inicio de cada caso de uso protegido**. Los guards de UI (`shared/presentation`) y el gate de navegación (`proxy.ts`) siguen siendo cosméticos.
3. **El rol sea real y verificable.** Se materializa `Membership` (`UNIQUE(userId, tenantId)`, RLS, GRANT), un `MembershipRepository` que resuelve el rol, y al **registrarse** se aprovisiona su **workspace personal** (`Tenant` + `Membership(OWNER)` atómico) **consumiendo el evento `UserRegistered`** que la Fase 2 dejó publicado sin consumidor. Los callbacks de sesión **pueblan** `role`/`activeTenantId` (rellenando la costura de Fase 2) **sin** que `identity` conozca `tenancy`.

Esta fase **no** implementa invitaciones, onboarding UI, `select-org`, `SwitchActiveTenant` ni el CRUD de miembros: entrega el **motor de autorización** y el **sustrato mínimo** que lo hace real. Ver §9.

## 2. Alcance

**Incluye:**

1. Módulo `tenancy` con las cuatro capas + `di.ts` + `index.ts`, espejando `modules/identity`, introduciendo la carpeta `domain/authorization/`.
2. Dominio de roles: VO/enum `Role`, tipo `Permission`, matriz `permission-matrix.ts` (13 permisos del §12.2 del PDF, celda **tri-estado** `all | own | false`), y `permission-checker.ts` con `can()` puro + resolución de *ownership*.
3. Guard de aplicación `requirePermission(...)` que devuelve `Result<void, PermissionDeniedError>`; `PermissionDeniedError extends DomainError` (`code = "tenancy.authorization.denied"`).
4. Tabla `Membership` + enum `Role` en Prisma (`uuid`, `UNIQUE(userId, tenantId)`, `@@index([tenantId])`, `@@unique([tenantId, id])`, **RLS + FORCE + GRANT** a `app_user`, borrado *hard*-cascada por D2), vía `migrate dev`.
5. `MembershipRepository` (puerto en `domain/ports` + adapter Prisma en `infrastructure` + *fake*) que resuelve el rol por `(userId, tenantId)` y lista membresías por `userId`.
6. Contexto de autorización enriquecido `AuthContext { ...TenantContext, role }` (en `tenancy`), construido tras verificar `Membership`.
7. **Poblado de claims:** los callbacks `jwt`/`session` exponen `activeTenantId`/`role` poblados, mediante un extensor **propiedad de `tenancy`** (`tenancy/infrastructure/auth/`) **compuesto en el composition root de `app/`** — `identity` **no** importa `tenancy`.
8. **Provisión de workspace:** handler `ProvisionWorkspaceOnUserRegistered` (consume `UserRegistered`) que crea `Tenant` + `Membership(OWNER)` en transacción atómica.
9. **Tests** unit (dominio + guard + provisión con *fakes*), de **arquitectura** (pureza de `tenancy/domain`, matriz no importable por *deep-import*, permisos fuera de `config/`, `identity ↛ tenancy`), de **integración** y de **aislamiento** (`Membership` cross-tenant → cero filas).

**No incluye (fuera de alcance):** ver §9.

## 3. Usuarios y escenarios

- **US-01** — Como **usuario recién registrado**, quiero **quedar como OWNER de mi propio espacio** automáticamente, para poder trabajar sin configurar nada. *(→ FR-010)*
- **US-02** — Como **VIEWER** de una organización, quiero que el sistema **rechace en el servidor** cualquier intento de subir un archivo, aunque manipule la URL o el HTML, para que "solo lectura" signifique algo. *(→ FR-004, FR-005, NFR-005)*
- **US-03** — Como **MEMBER**, quiero **editar y borrar solo los dashboards que yo creé**, no los de otros, para que la propiedad del recurso se respete. *(→ FR-004)*
- **US-04** — Como **usuario**, quiero que mi **rol viaje en la sesión** tras iniciar sesión, para que la app sepa qué puedo hacer en el tenant activo. *(→ FR-008, FR-009)*
- **DEV-01** — Como **desarrollador**, quiero que la matriz rol→permisos y `can()` sean **dominio puro** (sin DB, sin `async`), para testear la autorización en microsegundos y sin levantar Next. *(→ FR-003, FR-004, NFR-002)*
- **DEV-02** — Como **equipo**, quiero que `identity` **no conozca** `tenancy` aunque el JWT lleve el rol, para que la dirección de dependencias (ADR-002/ADR-003) siga intacta. *(→ FR-009, NFR-004)*

## 4. Requisitos funcionales

- **FR-001 — Módulo `tenancy` con las 4 capas.** DEBE existir `src/modules/tenancy` con `domain/`, `application/`, `infrastructure/`, `presentation/`, `di.ts` e `index.ts` (única API pública), espejando `modules/identity` e introduciendo `domain/authorization/`. Las importaciones internas son relativas; nada externo importa una capa interna.
- **FR-002 — Value object `Role`.** DEBE existir el VO/enum `Role` con exactamente `OWNER`, `ADMIN`, `MEMBER`, `VIEWER` en `tenancy/domain/value-objects/role.ts`. `Role.create(raw)` DEBE devolver `Result<Role, InvalidRoleError>` (normaliza, valida contra el conjunto cerrado); un valor fuera del conjunto **no lanza**, devuelve `Result.err`.
- **FR-003 — Tipo `Permission` y matriz de permisos.** DEBE existir el tipo `Permission` (los 13 permisos del PDF §12.2: `dataset:upload`, `analysis:run`, `dashboard:read`, `dashboard:create`, `dashboard:update`, `dashboard:delete`, `dashboard:share`, `member:invite`, `member:remove`, `member:change_role`, `tenant:update`, `tenant:delete`, `billing:manage`) y una **matriz tipada** `permission-matrix.ts` en `tenancy/domain/authorization/`, con celda **tri-estado** `"all" | "own" | false`. La matriz DEBE ser una **constante de dominio**, **nunca** un archivo en `config/` (constitución §7.1).
- **FR-004 — `can()` puro con resolución de propiedad.** DEBE existir `can(permission, ctx, resourceOwnerId?): boolean` en `tenancy/domain/services/permission-checker.ts`, **pura y síncrona** (sin DB, sin `async`). Para una celda `"all"` devuelve `true`; para `"own"` devuelve `true` **solo** si `ctx.userId === resourceOwnerId`; para `false` devuelve `false`. `dashboard:update`/`dashboard:delete` de un `MEMBER` son `"own"`.
- **FR-005 — Guard en el caso de uso.** DEBE existir `requirePermission(ctx, permission, resourceOwnerId?): Result<void, PermissionDeniedError>` (aplicación/dominio de `tenancy`), pensado para invocarse **al inicio** de un caso de uso protegido. `PermissionDeniedError` DEBE extender `DomainError` con `code = "tenancy.authorization.denied"` y **no** revelar si el recurso existe.
- **FR-006 — Tabla `Membership` materializada.** La migración DEBE crear el enum `Role` y el modelo `Membership` (`id uuid`, `userId`, `tenantId`, `role Role`, `createdAt`) con `UNIQUE(userId, tenantId)`, `@@index([tenantId])`, `@@unique([tenantId, id])`, **RLS `ENABLE`+`FORCE`** y **`GRANT SELECT, INSERT, UPDATE, DELETE`** a `app_user`, replicando el patrón de `Note`. Borrado *hard* en cascada (D2). El cambio va por `migrate dev` (nunca `db push`).
- **FR-007 — `MembershipRepository`.** DEBE existir el puerto `MembershipRepository` (en `domain/ports`) con un adapter Prisma (`infrastructure/persistence`, patrón `set_config('app.current_tenant', …)`) y un *fake* en memoria. DEBE resolver el rol por `(userId, tenantId)` (`findRole`) y listar las membresías de un usuario (`listByUser`, ruta multi-tenant necesaria para el futuro `select-org`).
- **FR-008 — Contexto de autorización enriquecido.** DEBE existir `AuthContext` (en `tenancy`) que extiende `TenantContext` con `role: Role`, construido **tras verificar** que existe `Membership(userId, tenantId)`. Los casos de uso protegidos reciben `AuthContext`; si no hay membresía, no se construye (→ 404, nunca 403).
- **FR-009 — Poblado de claims sin acoplar `identity`→`tenancy`.** Los callbacks `jwt`/`session` DEBEN **poblar** `activeTenantId` y `role` (que la Fase 2 dejó reservados), leyendo la membresía activa. El wiring DEBE vivir en `tenancy/infrastructure/auth/` y **componerse** en el composition root de `app/` con los callbacks base de `identity`; `identity` **no** DEBE importar `tenancy`. El tipo de `role` en la sesión pasa de `string` a `Role`.
- **FR-010 — Provisión de workspace (consume `UserRegistered`).** DEBE existir `ProvisionWorkspaceOnUserRegistered` en `tenancy/application` que, al recibir `UserRegistered` del `EventBus`, crea en **transacción atómica** un `Tenant` (workspace personal por defecto) y un `Membership(role = OWNER)`. Si falla cualquier paso, **nada** se persiste.
- **FR-011 — ADR de fase.** DEBE registrarse **ADR-008** en la constitución `../../spec.md §8`: autorización en `tenancy` (matriz + `can()` dominio), poblado de claims compuesto en `app/`, y la policy RLS de `Membership`. (Se registra al **cerrar** la implementación, ver [tasks.md](tasks.md).)
- **FR-012 — Tests.** DEBEN existir: **unit** de `Role`, matriz, `can()` (incluida propiedad), `requirePermission` y `ProvisionWorkspaceOnUserRegistered` (con repos/bus *fakes*); un test de **arquitectura** que falle ante `tenancy/domain` importando infra, *deep-import* de `authorization/`, una matriz de permisos en `config/`, o `identity` importando `tenancy`; **integración** del `MembershipRepository` como `app_user`; y **aislamiento** (`Membership` del tenant B ilegible como tenant A → cero filas).

## 5. Requisitos no funcionales

- **NFR-001** — `tenancy/domain/**` NO DEBE importar Next.js, Prisma, `@auth/*`/`next-auth` ni infraestructura (verificado por lint **y** por el test de arquitectura existente, que cubre módulos nuevos automáticamente).
- **NFR-002** — La matriz y `can()` DEBEN ser **puras y síncronas** (sin `async`, sin lecturas de DB): la autorización se testea sin levantar servidor ni base de datos.
- **NFR-003** — La matriz rol→permisos DEBE vivir en `tenancy/domain/authorization`, **NUNCA** en `config/` (la constitución §7.1 y `config/routes.ts` lo prohíben explícitamente).
- **NFR-004** — `identity/**` NO DEBE importar `@/modules/tenancy` (dirección de dependencias §5: las flechas van hacia `identity`/`tenancy`, no entre ellos en ese sentido). El poblado de claims se compone en `app/`.
- **NFR-005** — La autorización real DEBE ejecutarse en el servidor dentro del caso de uso. Los guards de UI (`shared/presentation`) y `proxy.ts` son **cosméticos**: borrarlos no compromete la seguridad; borrar el guard del caso de uso sí. **La UI oculta; el servidor prohíbe.**
- **NFR-006** — `tenancy` DEBE exponer una única API pública (`index.ts`); el *deep-import* entre módulos DEBE fallar (lint + test).
- **NFR-007** — `Membership` es *tenant-scoped*: RLS `ENABLE`+`FORCE` activa y `GRANT` a `app_user` (rol **sin** `BYPASSRLS`). La policy DEBE permitir la ruta "mis membresías" (por `userId`) sin abrir fugas cross-tenant (definición exacta en ADR-008).
- **NFR-008** — El `role` del JWT es una **foto, no un espejo**: se hereda el `maxAge` corto de la Fase 2 y se **revalida `Membership`** en operaciones de escritura sensibles (cambio de rol, invitación, facturación). El *staleness* se documenta; la revocación inmediata se difiere.
- **NFR-009** — `PermissionDeniedError` es un **error esperado** (`Result.err`), no una excepción; y NO DEBE distinguir "no tienes permiso" de "no existe": la ausencia de `Membership` en el tenant de la URL resuelve **404**, no 403 (un 403 confirmaría que la organización existe).
- **NFR-010** — IDs `uuid`; toda restricción de unicidad de negocio es **compuesta con `tenantId`**; `Membership` usa borrado *hard*-cascada (D2, no soft delete).

## 6. Criterios de éxito (medibles)

- **SC-001** — `pnpm lint` **falla** si un archivo bajo `src/modules/tenancy/domain/**` importa `next`/`@prisma/client`/`next-auth`/`@auth/*`. *(FR-001 / NFR-001)*
- **SC-002** — Unit: `Role.create("OWNER")` → `ok`; `Role.create("root")` y `Role.create("")` → `InvalidRoleError` (`DomainError`, `code = "tenancy.role.invalid"`). *(FR-002)*
- **SC-003** — Unit: la matriz cubre las **4 roles × 13 permisos** y coincide **exactamente** con el §12.2 del PDF — p.ej. `VIEWER` solo tiene `dashboard:read`; `billing:manage`/`tenant:delete` solo `OWNER`; `dashboard:update`/`dashboard:delete` de `MEMBER` son `"own"`. *(FR-003)*
- **SC-004** — Unit: `can("dataset:upload", viewerCtx)` → `false`; `can("dataset:upload", ownerCtx)` → `true`; `can("dashboard:read", viewerCtx)` → `true`. *(FR-004 / NFR-002)*
- **SC-005** — Unit (propiedad): `can("dashboard:update", memberCtx, memberCtx.userId)` → `true`; `can("dashboard:update", memberCtx, otroUserId)` → `false`; `can("dashboard:update", adminCtx, otroUserId)` → `true` (celda `"all"`). *(FR-004)*
- **SC-006** — Unit (guard): `requirePermission(viewerCtx, "dataset:upload")` → `Result.err(PermissionDeniedError)` (`DomainError`, `code = "tenancy.authorization.denied"`); `requirePermission(ownerCtx, "dataset:upload")` → `ok`. *(FR-005 / NFR-009)*
- **SC-007** — `pnpm db:migrate` + `pnpm typecheck` crean el enum `Role` y `Membership` con `UNIQUE(userId, tenantId)` y `@@index([tenantId])`; `grep -R "ENABLE ROW LEVEL SECURITY\|GRANT" prisma/migrations` muestra RLS+GRANT en la tabla `Membership`. *(FR-006 / NFR-007, NFR-010)*
- **SC-008** — Integración (como `app_user`): `MembershipRepository.create` + `findRole(userId, tenantId)` + `listByUser(userId)` funcionan sobre la tabla (prueba que los `GRANT` existen). *(FR-007)*
- **SC-009** — Aislamiento: autenticado como tenant A, leer la `Membership` del tenant B por el repositorio scoped devuelve **cero filas** (patrón de `note-tenant-isolation.spec.ts`). *(FR-006, FR-012 / NFR-007)*
- **SC-010** — `pnpm typecheck` compila accediendo a `session.role` (tipado como `Role`) y `session.activeTenantId` **poblados**; el tipo se expone desde `@/modules/tenancy` (o la augmentación). *(FR-009)*
- **SC-011** — Unit: `ProvisionWorkspaceOnUserRegistered`, al recibir `UserRegistered` en el `EventBus` *fake*, crea `Tenant` + `Membership(OWNER)` (repos *fakes*); si la creación del `Membership` falla, el `Tenant` **no** queda persistido. *(FR-010)*
- **SC-012** — `pnpm test` (arquitectura) **falla** ante un *deep-import* `@/modules/tenancy/domain/authorization/...` desde `app`/tests, y ante cualquier importación de una matriz de permisos desde `src/config/**`. *(FR-001, FR-012 / NFR-003, NFR-006)*
- **SC-013** — El test de arquitectura **falla** si `src/modules/identity/**` importa `@/modules/tenancy`; el wiring de poblado de claims vive bajo `tenancy/infrastructure/auth/**` y se compone en `app/`. *(FR-009 / NFR-004)*
- **SC-014** — Assertion unit: la matriz es una constante tipada `Record<Role, Record<Permission, "all" | "own" | false>>` sin lecturas `async`, y `can()` **no** es `async` (su tipo de retorno es `boolean`, no `Promise`). *(FR-003 / NFR-002)*

## 7. Entidades clave (resumen)

Detalle completo en [data-model.md](data-model.md). Formas conceptuales en [../../data-model.md](../../data-model.md) §1 (`tenancy`).

| Entidad | Rol en la Fase 3 | Notas |
|---|---|---|
| `Role` | VO/enum del rol por membresía. | Conjunto cerrado `OWNER\|ADMIN\|MEMBER\|VIEWER`; `create()` devuelve `Result`. Vive en `tenancy` (ADR-002). |
| `Permission` | Unidad real de autorización. | 13 permisos (§12.2); el código pregunta por permiso, no por rol. |
| `permission-matrix` | Constante tipada rol→permiso. | Celda `"all" \| "own" \| false`. **Dominio**, no `config/`. |
| `Membership` | Relación usuario↔tenant; **aquí vive el rol**. | `uuid`, `UNIQUE(userId, tenantId)`, RLS+GRANT, *hard*-cascada. |
| `AuthContext` | `TenantContext` + `role`. | Construido tras verificar `Membership`; entra al caso de uso. |
| `PermissionDeniedError` | Error esperado de autorización. | `extends DomainError`, `code = "tenancy.authorization.denied"`. |
| `TenantContext` | Ya existe (`shared/application`). | `{ tenantId, userId? }`; no se modifica — se **extiende** en `tenancy`. |

## 8. Edge cases

- **`VIEWER` fuerza la subida por URL/HTML** → el caso de uso rechaza con `PermissionDeniedError` aunque la UI ocultara el botón. *(SC-006 / NFR-005)*
- **`MEMBER` edita/borra un dashboard ajeno** → denegado (celda `"own"`); su propio recurso → permitido. *(SC-005)*
- **Usuario sin `Membership` en el tenant de la URL** → no se construye `AuthContext` → **404** (nunca 403; regla de oro de multitenancy). *(NFR-009)*
- **Registro nuevo** → `Tenant` + `Membership(OWNER)` atómicos; si falla el `Membership`, se revierte el `Tenant`. *(SC-011)*
- **El rol cambió pero el JWT viejo dice `OWNER`** → el JWT es una foto; se revalida `Membership` en escrituras sensibles. *(NFR-008)*
- **`ADMIN` intenta cambiar el rol de un `OWNER`** → invariante "no a OWNER": la matriz lo marca, pero su **enforcement** (el caso de uso `ChangeMemberRole`) se **difiere a Fase 5**. *(§9)*

## 9. Fuera de alcance (Fase 3)

Difiere a **Fase 5** (`tenancy` — usuarios y organizaciones) o a la fase indicada. La separación es deliberada: Fase 3 entrega el **motor** de autorización y el sustrato que lo hace real, no la gestión de miembros.

- **`Invitation` (entidad) + `InviteMember` / `AcceptInvitation`** → Fase 5.
- **`ChangeMemberRole` / `RemoveMember` / `LeaveTenant`** y sus invariantes (≥ 1 `OWNER`, "no a OWNER", nadie se auto-promueve, transferir propiedad antes de salir) → Fase 5. La matriz **define** las celdas; el enforcement de los invariantes vive en esos casos de uso.
- **Onboarding UI ("¿cómo se llama tu organización?") / `select-org` / `SwitchActiveTenant`** y el ruteo login 0/1/N membresías → Fase 5. Aquí se aprovisiona un **workspace personal por defecto** (B2C), sin UI de onboarding.
- **Casos de uso protegidos de negocio** (`dataset:upload`, `analysis:run`, `dashboard:*`) → sus módulos (`datasets`/`analytics`, Fases posteriores). Aquí solo se entrega el guard y su patrón de uso.
- **Roles personalizados / matriz en base de datos** → cuando un cliente lo pague (la matriz es una constante tipada).
- **Prisma Client Extension** (auto-inyección de `tenantId`) → su propio ADR ([../../data-model.md](../../data-model.md) §6).
- **Revocación / blocklist del JWT / *staleness* con revocación inmediata** → *hardening* (aquí: `maxAge` corto + revalidación en escrituras).
- **E2E (Playwright)** → fase E2E; aquí la lógica se verifica con funciones puras + aserciones de config/integración (el repo no tiene runner E2E).

## 10. Supuestos y dependencias

- **Fase 1 y Fase 2 completas:** TS estricto, boundaries ESLint (con captura por módulo), `env` fail-fast, Postgres+Prisma 7 (cliente en `src/generated/prisma`, rol `app_user` `NOBYPASSRLS`), primitivas `Result`/`DomainError`/`TenantContext`/`TenantId` branded, `Entity`, patrón del módulo `example`/`identity`, patrón RLS de `Note`, Vitest (proyectos `unit` + `integration`).
- **Costuras de Fase 2 que esta fase consume/rellena:** el evento `UserRegistered` (publicado sin consumidor), los claims `activeTenantId?`/`role?` (reservados, sin poblar), el `EventBus` in-memory (`shared`).
- **Context7** se consulta antes de fijar firmas de Prisma 7 (enum + relaciones + `set_config`) y de los callbacks `jwt`/`session` de Auth.js v5 (los snippets del SDD son ilustrativos).

## 11. Preguntas abiertas (no bloqueantes)

- **Q1** — ¿`role`/`activeTenantId` se pueblan en el JWT al login, o se resuelven por request desde `Membership`? → [research.md](research.md) R1 (por defecto: poblar en el JWT + revalidar en escrituras).
- **Q2** — ¿`role` vive en `TenantContext` (shared) o en un `AuthContext` propio de `tenancy`? → [research.md](research.md) R2 (por defecto: `AuthContext` en `tenancy`, `shared` intacto).
- **Q3** — ¿La policy RLS de `Membership` permite la ruta "mis membresías" cross-tenant sin abrir fugas? → [research.md](research.md) R3 / ADR-008.
- **Q4** — ¿La provisión al registrarse usa un `slug`/nombre por defecto (B2C) o exige onboarding? → [research.md](research.md) R4 (por defecto: workspace personal por defecto; onboarding UI en Fase 5).
- **Q5** — ¿Cómo se modelan `"own"` y `"no a OWNER"` sin caer en ABAC? → [research.md](research.md) R5 (matriz tri-estado + `resourceOwnerId` en `can()`; "no a OWNER" como invariante de caso de uso diferido).
