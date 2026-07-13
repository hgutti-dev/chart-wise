# Fase 3 — Plan técnico de implementación

- **Feature:** `003-roles-permissions`
- **Spec:** [spec.md](spec.md) · **Constitución:** [../../spec.md](../../spec.md)
- **Estado:** Draft para revisión

> Enfoque **de dentro hacia afuera**: primero el dominio puro (roles, matriz, `can()`, guard) que se testea sin DB ni Next; luego el sustrato (`Membership`, repo, RLS); al final las costuras (poblado del claim compuesto en `app/`, provisión sobre `UserRegistered`). Cada slice está *hecho* solo cuando su SC asociado es reproducible con un comando.

## 1. Enfoque

La autorización es **dominio puro**: la matriz y `can()` no dependen de nada externo, así que se construyen y verifican primero (Slices A–C) sin tocar Prisma ni Auth.js. El sustrato que las hace reales (`Membership`, repo, RLS — Slices D–E) llega después. Las dos costuras que conectan con el resto del sistema (poblar el JWT sin acoplar `identity`→`tenancy`, y consumir `UserRegistered`) son las más delicadas y van al final (Slices F–G), cuando ya existe todo lo que necesitan.

## 2. Stack y versiones

| Área | Elección | Versión objetivo | Racional (detalle en research.md) |
|---|---|---|---|
| Dominio de autorización | TypeScript puro | — | Matriz + `can()` sin deps; testeable en microsegundos (NFR-002). |
| ORM / DB | Prisma + Postgres | Prisma 7 (ya instalado) | Enum `Role` + `Membership` + RLS; `migrate dev`. Confirmar sintaxis con Context7. |
| Auth (claims) | Auth.js v5 (ya instalado) | beta | Poblar `role`/`activeTenantId`; wiring confinado en `*/infrastructure/auth/**`. |
| Eventos | `EventBus` in-memory (Fase 2) | — | Consumir `UserRegistered` (ADR-004). |
| Tests | Vitest (proyectos `unit`/`integration`) | — | unit + arquitectura + integración + aislamiento; sin E2E. |

## 3. Decisiones de diseño (resumen; racional en research.md)

- **D1 — Autorización = dominio puro en `tenancy`, nunca `config/`.** La matriz (`authorization/permission-matrix.ts`) y `can()` (`services/permission-checker.ts`) son constantes/funciones de dominio. `config/` sigue sin permisos (constitución §7.1). *(FR-003 / NFR-003)*
- **D2 — Matriz tri-estado `"all" | "own" | false`.** Resuelve `dashboard:update/delete → propio` con un parámetro `resourceOwnerId` en `can()`, sin ABAC. "no a OWNER" es invariante de caso de uso (Fase 5). *(FR-003, FR-004 / R5)*
- **D3 — Guard como `Result`, no excepción.** `requirePermission` devuelve `Result<void, PermissionDeniedError>`; se invoca al inicio del caso de uso. No revela existencia del recurso (404, no 403). *(FR-005 / NFR-009)*
- **D4 — `AuthContext` en `tenancy`, `TenantContext` intacto.** `AuthContext = TenantContext & { role }`; los permisos se **derivan**, no se almacenan. `shared` no conoce `Role`. *(FR-008 / R2)*
- **D5 — `Membership` con RLS+FORCE, dos rutas.** Ruta scoped por `tenantId` + ruta "mis membresías" por `userId`; policy exacta en ADR-008. Borrado *hard*-cascada (ADR-006 D2). *(FR-006, FR-007 / R3)*
- **D6 — Poblado del claim compuesto en `app/`.** El extensor vive en `tenancy/infrastructure/auth/`; se compone con los callbacks base de `identity` en el composition root. `identity ↛ tenancy`. *(FR-009 / R1, NFR-004)*
- **D7 — Provisión B2C sobre `UserRegistered`.** `ProvisionWorkspaceOnUserRegistered` crea `Tenant`+`Membership(OWNER)` atómico, idempotente. Onboarding UI → Fase 5. *(FR-010 / R4)*
- **D8 — *Staleness* documentado.** `maxAge` corto (Fase 2) + revalidación de `Membership` en escrituras sensibles; revocación inmediata diferida. *(NFR-008 / R6)*
- **D9 — Puertos por responsabilidad.** `MembershipRepository` (puerto de dominio) en `domain/ports`; adapter Prisma + *fake* en `infrastructure`. El extensor de claims recibe el repo por inyección. *(FR-007)*
- **D10 — Enforcement por lint Y test.** La pureza de `tenancy/domain`, el confinamiento de la matriz fuera de `config/`, el no-deep-import y `identity ↛ tenancy` se prueban con ESLint boundaries **y** `tests/architecture/` (ADR-005). *(FR-012 / NFR-001, NFR-003, NFR-004, NFR-006)*

## 4. Plan por slices

### Fase 0 — Preparación
Crear `src/modules/tenancy/` con las 4 capas + `di.ts` + `index.ts` (vacío, espejando `modules/identity`). Confirmar con **Context7** las firmas de Prisma 7 (enum + relación) y de los callbacks de Auth.js v5 antes de tocarlos.
**Verificación:** `pnpm typecheck` en verde con el módulo esqueleto; `pnpm lint` reconoce el nuevo módulo bajo las reglas de boundaries.

### Slice A — Value object `Role` *(FR-002 → SC-002)*
`tenancy/domain/value-objects/role.ts` + `errors/` (`InvalidRoleError`, `code = "tenancy.role.invalid"`). `Role.create(raw): Result<Role, InvalidRoleError>`.
**Verificación:** unit — `Role.create("OWNER")` → `ok`; `"root"`/`""` → `InvalidRoleError` (`DomainError`).

### Slice B — Matriz de permisos + `can()` *(FR-003, FR-004 → SC-003, SC-004, SC-005, SC-014)*
`tenancy/domain/authorization/permission-matrix.ts` (tipo `Permission` + `PERMISSION_MATRIX` tri-estado, 4×13 del §12.2) y `tenancy/domain/services/permission-checker.ts` (`can()` puro/síncrono con resolución de `own`).
**Verificación:** unit — matriz = §12.2 exacta; `can()` plano y con propiedad; assertion de que `can()` no es `async` y la matriz es constante tipada.

### Slice C — Guard `requirePermission` + `AuthContext` *(FR-005, FR-008 → SC-006)*
`tenancy/application/auth-context.ts` (`AuthContext = TenantContext & { role }`), `PermissionDeniedError` (`code = "tenancy.authorization.denied"`), y `requirePermission(ctx, permission, resourceOwnerId?): Result<void, PermissionDeniedError>`.
**Verificación:** unit — denegado → `Result.err(PermissionDeniedError)`; permitido → `ok`.

### Slice D — Data model de `Membership` *(FR-006 → SC-007, SC-009)*
`schema.prisma`: enum `Role` + `Membership` (`UNIQUE(userId, tenantId)`, `@@unique([tenantId, id])`, `@@index([tenantId])`, cascada). Migración `--create-only`, **editar el SQL** para `GRANT` a `app_user` + `ENABLE`/`FORCE` RLS + las dos policies (R3). Aplicar con `migrate dev`.
**Verificación:** `migrate status` +1 migración; `typecheck` en verde; `grep` de `ENABLE ROW LEVEL SECURITY`/`GRANT` sobre `memberships`; test de aislamiento rojo→verde.

### Slice E — `MembershipRepository` *(FR-007 → SC-008)*
Puerto `domain/ports/membership.repository.ts`; adapter Prisma (`infrastructure/persistence/prisma-membership.repository.ts` con `set_config`) + mapper; *fake* en memoria. Métodos `create`/`findRole`/`listByUser` (+ `findActive` para el claim).
**Verificación:** integración como `app_user`: `create` + `findRole` + `listByUser` sobre la tabla.

### Slice F — Poblado del claim compuesto en `app/` *(FR-009 → SC-010, SC-013)*
`tenancy/infrastructure/auth/populate-tenant-claims.ts` (recibe `MembershipRepository`); actualizar la augmentación de tipos para `role: Role`-literal / `activeTenantId`. Componer en el composition root de `app/` (donde se instancia Auth.js) con los callbacks base de `identity`, **sin** que `identity` importe `tenancy`.
**Verificación:** `typecheck` accede a `session.role`/`activeTenantId` poblados; test de arquitectura rojo si `identity` importa `tenancy`.

### Slice G — Provisión de workspace sobre `UserRegistered` *(FR-010 → SC-011)*
`tenancy/application/provision-workspace-on-user-registered.ts` (consume `UserRegistered` del `EventBus`), crea `Tenant`+`Membership(OWNER)` atómico e idempotente; `TenantRepository` (puerto + adapter + fake) si aún no existe uno reutilizable de Fase 1. Registrar el handler en el `di.ts` del módulo y suscribirlo en el composition root.
**Verificación:** unit — `UserRegistered` en el bus *fake* → `Tenant`+`Membership(OWNER)`; fallo del `Membership` → nada persistido.

### Slice H — Arquitectura + cierre *(FR-011, FR-012 → SC-001, SC-012, SC-013)*
Overrides de ESLint / aserciones en `tests/architecture/`: pureza de `tenancy/domain`, matriz fuera de `config/`, no-deep-import de `authorization/`, `identity ↛ tenancy`. Registrar **ADR-008** en `../../spec.md §8`. Marcar `checklists/requirements.md`. Flip de `Estado` en `spec.md` a "Implementado".
**Verificación:** `pnpm lint` + `pnpm test` (arquitectura) fallan ante las trampas correspondientes (import de infra en `domain`, matriz en `config`, deep-import, `identity`→`tenancy`); ADR-008 presente.

## 5. Estructura entregada (subconjunto de la constitución §6)

```
src/modules/tenancy/
├── domain/
│   ├── entities/membership.ts
│   ├── value-objects/role.ts
│   ├── authorization/permission-matrix.ts     # matriz rol→permiso (dominio)
│   ├── services/permission-checker.ts          # can() puro
│   ├── errors/{invalid-role.error.ts,permission-denied.error.ts}
│   └── ports/membership.repository.ts
├── application/
│   ├── auth-context.ts                          # AuthContext = TenantContext & { role }
│   ├── authorization/require-permission.ts      # guard → Result
│   └── provision-workspace-on-user-registered.ts
├── infrastructure/
│   ├── persistence/{prisma-membership.repository.ts,mappers/membership.mapper.ts}
│   └── auth/populate-tenant-claims.ts           # extensor de claims (compuesto en app/)
├── presentation/                                # (vacío o guards de UI cosméticos)
├── di.ts                                         # composition root del módulo
└── index.ts                                      # API pública (can, requirePermission, tipos, repo factory)
prisma/schema.prisma                              # + enum Role + model Membership
prisma/migrations/<ts>_add_membership_and_roles/ # SQL editado: GRANT + RLS + policies
```

## 6. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| `identity` acaba importando `tenancy` al poblar el claim | Alto (rompe capas) | Extensor en `tenancy/infrastructure/auth/`, compuesto en `app/`; test de arquitectura (SC-013). |
| Policy RLS de `Membership` bloquea "mis membresías" o abre fuga | Alto | Dos rutas (R3), cerradas en ADR-008; test de aislamiento (SC-009). |
| Rol obsoleto en el JWT tras cambio de rol | Alto | `maxAge` corto + revalidar `Membership` en escrituras (D8/R6); documentado. |
| Sobre-ingeniería de la autorización (ABAC) | Medio | Matriz tri-estado + un parámetro; "no a OWNER" diferido (D2/R5). |
| Provisión no idempotente (doble `Tenant`) | Medio | Handler idempotente por `userId`; test (SC-011). |
| Colisión de `slug` del workspace por defecto | Bajo | `slug` derivado + sufijo único; evitar reservados (ADR-006). |

## 7. Definición de "hecho" (fase)

La Fase 3 está completa cuando **todos** los SC-001..SC-014 son verdes de forma reproducible, [checklists/requirements.md](checklists/requirements.md) está íntegramente marcado, **ADR-008** está registrado en la constitución, y el `Estado` de [spec.md](spec.md) es "Implementado". Verificación end-to-end en [quickstart.md](quickstart.md).
