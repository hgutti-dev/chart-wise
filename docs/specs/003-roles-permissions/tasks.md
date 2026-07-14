# Fase 3 — Tareas

- **Feature:** `003-roles-permissions`
- **Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md) · **Data model:** [data-model.md](data-model.md)
- **Estado:** Pendiente de implementación

Convenciones: `[ ]` pendiente · `[x]` hecho. `[P]` = paralelizable (sin dependencia con las tareas `[P]` hermanas del mismo grupo). Cada tarea nombra el/los archivo(s) y el requisito que satisface. Antes de tocar Prisma (enum/relación/`set_config`) o los callbacks de Auth.js, **consultar Context7**.

## Fase 0 — Preparación
- [x] **T001** `src/modules/tenancy/{domain,application,infrastructure,presentation}/` + `di.ts` + `index.ts` (esqueleto vacío, espejando `modules/identity`).
- [x] **T002 [P]** Verificar que las reglas de `eslint.config.mjs` capturan el módulo `tenancy` por glob (mismas que `identity`); no editar la config salvo por los overrides nuevos de la Fase H.
- [x] **T003** Consultar **Context7**: enum + relación `Membership` en Prisma 7, `set_config`/policy RLS, y callbacks `jwt`/`session` + augmentación de Auth.js v5.

## Fase A — Value object `Role` *(FR-002)*
- [x] **T010 [P]** `tenancy/domain/errors/invalid-role.error.ts`: `InvalidRoleError extends DomainError` (`code = "tenancy.role.invalid"`).
- [x] **T011** `tenancy/domain/value-objects/role.ts`: enum de valores `OWNER|ADMIN|MEMBER|VIEWER` + `Role.create(raw): Result<Role, InvalidRoleError>` (normaliza, valida conjunto cerrado; **no lanza**).
- [x] **T012 [P]** `tests/unit/tenancy/role.spec.ts`: **Verificar SC-002**.

## Fase B — Matriz + `can()` *(FR-003, FR-004)*
- [x] **T020** `tenancy/domain/authorization/permission-matrix.ts`: tipo `Permission` (13) + `PERMISSION_MATRIX: Record<Role, Record<Permission, "all"|"own"|false>>` (4×13 del §12.2). **Dominio, no `config/`.**
- [x] **T021** `tenancy/domain/services/permission-checker.ts`: `can(permission, ctx, resourceOwnerId?): boolean` puro/síncrono (`all`→true; `own`→`ctx.userId === resourceOwnerId`; `false`→false).
- [x] **T022 [P]** `tests/unit/tenancy/permission-matrix.spec.ts`: **Verificar SC-003** (matriz = §12.2 exacta) y **SC-014** (constante tipada, no `async`).
- [x] **T023 [P]** `tests/unit/tenancy/can.spec.ts`: **Verificar SC-004** (plano) y **SC-005** (propiedad `own`).

## Fase C — Guard + `AuthContext` *(FR-005, FR-008)*
- [x] **T030 [P]** `tenancy/domain/errors/permission-denied.error.ts`: `PermissionDeniedError extends DomainError` (`code = "tenancy.authorization.denied"`; no revela existencia).
- [x] **T031** `tenancy/application/auth-context.ts`: `AuthContext = TenantContext & { role: Role }`.
- [x] **T032** `tenancy/application/authorization/require-permission.ts`: `requirePermission(ctx, permission, resourceOwnerId?): Result<void, PermissionDeniedError>`.
- [x] **T033 [P]** `tests/unit/tenancy/require-permission.spec.ts`: **Verificar SC-006**.

## Fase D — Data model de `Membership` *(FR-006)*
- [x] **T040** `prisma/schema.prisma`: `enum Role` + `model Membership` (`@@unique([userId, tenantId])`, `@@unique([tenantId, id])`, `@@index([tenantId])`, `onDelete: Cascade`) + relación inversa en `Tenant`.
- [x] **T041** `prisma migrate dev --create-only`; **editar el SQL**: `GRANT SELECT, INSERT, UPDATE, DELETE ON "memberships" TO app_user`; `ENABLE`/`FORCE` RLS; policy scoped (`tenantId`) + policy por usuario (`userId`) (R3). Policies con `NULLIF(current_setting(...),'')` (fix del bug de GUC vacío en conexión reusada).
- [x] **T042** Aplicar con `migrate dev`; regenerar cliente; `typecheck`.
- [x] **T043 [P]** `tests/isolation/membership-tenant-isolation.spec.ts`: **Verificar SC-009** (tenant A no lee `Membership` del tenant B → cero filas).
- [x] **T044** **Verificar SC-007**: `migrate status` +1; `grep -R "ENABLE ROW LEVEL SECURITY\|GRANT" prisma/migrations` sobre `memberships`.

## Fase E — `MembershipRepository` *(FR-007)*
- [x] **T050** `tenancy/domain/ports/membership.repository.ts`: puerto `create`/`findRole(userId, tenantId)`/`listByUser(userId)`/`findActive(userId)`. (+ entidad `domain/entities/membership.ts`, prerequisito del puerto.)
- [x] **T051** `tenancy/infrastructure/persistence/prisma-membership.repository.ts` + `mappers/membership.mapper.ts` (patrón `set_config('app.current_tenant', …)` / `app.current_user`).
- [x] **T052 [P]** *fake* en memoria: `tenancy/infrastructure/persistence/in-memory-membership.repository.ts` (nombre alineado con `in-memory-note.repository.ts`) + unit test `tests/unit/tenancy/in-memory-membership.repository.spec.ts`.
- [x] **T053 [P]** `tests/integration/tenancy/prisma-membership.repository.spec.ts`: **Verificar SC-008** como `app_user`.

## Fase F — Poblado del claim (compuesto en `app/`) *(FR-009)*
- [x] **T060** `tenancy/infrastructure/auth/populate-tenant-claims.ts`: `createTenantClaims(repo)` → extensor (`populateToken`/`applyToSession`) que puebla `activeTenantId`/`role` desde la membresía activa. Unit-tested con el fake.
- [x] **T061** Augmentación estrechada en `identity/infrastructure/auth/next-auth.d.ts` (`role` → unión literal `SessionRole`, `activeTenantId`), sin importar el `Role` de `tenancy` (R1).
- [x] **T062** Auth.js se instancia en `src/app/auth.ts` (composition root): compone `createIdentityAuth(tenantClaims)`; los 6 consumidores de `app/` pasan a importar `auth/handlers/signIn/signOut/signInWithCredentials` de ahí. `identity` expone la costura (`SessionClaimsExtension`), no el contenido.
- [x] **T063 [P]** **SC-010** verificado (typecheck + `tests/unit/tenancy/session-claims-contract.spec.ts`) + wiring test en `auth-config.spec.ts`; `identity ↛ @/modules/tenancy` confirmado (trampa SC-013 lista para Fase H). Build de producción limpio.

## Fase G — Provisión de workspace *(FR-010)*
- [ ] **T070** `tenancy/application/provision-workspace-on-user-registered.ts`: consume `UserRegistered`; crea `Tenant`+`Membership(OWNER)` en transacción atómica; idempotente por `userId`.
- [ ] **T071** `TenantRepository` (puerto + adapter + fake) si no hay uno reutilizable de Fase 1; `slug` por defecto derivado + sufijo único (evitar reservados ADR-006).
- [ ] **T072** Registrar el handler en `tenancy/di.ts` y suscribirlo al `EventBus` en el composition root.
- [ ] **T073 [P]** `tests/unit/tenancy/provision-workspace.spec.ts`: **Verificar SC-011** (crea ambos; fallo del `Membership` → nada persistido).

## Fase H — Arquitectura + cierre *(FR-011, FR-012)*
- [ ] **T080** `tests/architecture/*`: aserciones nuevas — `tenancy/domain` no importa infra (**SC-001**); matriz no importable desde `src/config/**` y no-deep-import de `authorization/` (**SC-012**); `identity ↛ @/modules/tenancy` (**SC-013**). Añadir overrides de ESLint si hacen falta (matriz fuera de `config/`).
- [ ] **T081** Registrar **ADR-008** en `../../spec.md §8` (autorización en `tenancy` materializada, poblado de claims compuesto en `app/`, policy RLS de `Membership`).
- [ ] **T082** Marcar `checklists/requirements.md` con evidencia (comando + salida); flip de `Estado` en `spec.md` a "Implementado".

### Trazabilidad requisito → tareas

| Requisito | Tareas |
|---|---|
| FR-001 (módulo `tenancy`) | T001, T080 |
| FR-002 (`Role`) | T010, T011, T012 |
| FR-003 (matriz) | T020, T022 |
| FR-004 (`can()`) | T021, T023 |
| FR-005 (guard) | T030, T032, T033 |
| FR-006 (`Membership`) | T040, T041, T042, T043, T044 |
| FR-007 (repo) | T050, T051, T052, T053 |
| FR-008 (`AuthContext`) | T031, T032 |
| FR-009 (claims sin acoplar) | T060, T061, T062, T063, T080 |
| FR-010 (provisión) | T070, T071, T072, T073 |
| FR-011 (ADR-008) | T081 |
| FR-012 (tests) | T012, T022, T023, T033, T043, T044, T053, T073, T080 |
| SC-013 (`identity ↛ tenancy`) | T061, T062, T063, T080 |
