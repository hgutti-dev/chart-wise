# Fase 3 — Checklist de requisitos

- **Feature:** `003-roles-permissions`
- **Spec:** [../spec.md](../spec.md) · **Research:** [../research.md](../research.md) · **Constitución:** [../../../spec.md](../../../spec.md)
- **Propósito:** verificar que la especificación es **completa, testeable y sin ambigüedad** antes de implementar (grupo A), y servir de **gate de aceptación** al cerrar la fase (grupos B–G).

Marca `[x]` solo con evidencia (comando + salida), no por impresión. El grupo A se valida por inspección del SDD; los grupos B–G se marcan durante/al cerrar la implementación (T082).

## A. Calidad de la especificación
- [x] Cada Requisito Funcional (FR-001..FR-012) tiene **≥ 1 Criterio de Éxito** que lo verifica.
- [x] Cada Criterio de Éxito (SC-001..SC-014) es **medible con un comando** (`vitest`/`grep`/`tsc`/`lint`/`prisma`; **sin** E2E).
- [x] Las preguntas abiertas (Q1..Q5) están **cerradas** en `research.md` (R1..R6) con alternativas descartadas.
- [x] Los *non-goals* son explícitos (§9) y difieren invitaciones/onboarding/`select-org`/`SwitchActiveTenant`/CRUD de miembros a **Fase 5**.
- [x] No hay contradicción con la constitución: autorización en `tenancy` (ADR-002), matriz **no** en `config/` (§7.1), `identity ↛ tenancy` (§5/ADR-003), IDs `uuid` + unicidad compuesta con `tenantId` (ADR-006).

## B. Objetivo 1 — autorización como dominio puro
- [x] `Role` es un conjunto cerrado `OWNER|ADMIN|MEMBER|VIEWER` con `create()` que devuelve `Result`, no lanza. *(SC-002)*
- [x] La matriz coincide **exactamente** con el §12.2 (4 roles × 13 permisos), con celda tri-estado `"all"|"own"|false`. *(SC-003)*
- [x] `can()` es **pura y síncrona** (sin DB, sin `async`) y resuelve `"own"` con `resourceOwnerId`. *(SC-004, SC-005, SC-014)*
- [x] La matriz vive en `tenancy/domain/authorization`, **nunca** en `config/`. *(SC-012 / NFR-003)*

## C. Objetivo 2 — el guard se hace cumplir en el servidor
- [x] `requirePermission` devuelve `Result<void, PermissionDeniedError>` y se invoca al inicio del caso de uso. *(SC-006)*
- [x] `PermissionDeniedError extends DomainError` (`code = "tenancy.authorization.denied"`) y **no** revela existencia del recurso (404, no 403). *(SC-006 / NFR-009)*
- [x] La UI y `proxy.ts` son cosméticos: borrarlos no compromete la seguridad; borrar el guard sí. *(NFR-005)*

## D. Objetivo 3 — sustrato real (`Membership`) + costuras
- [x] `Membership` migrado con `UNIQUE(userId, tenantId)`, `@@unique([tenantId, id])`, `@@index([tenantId])`, RLS `ENABLE`+`FORCE` y `GRANT` a `app_user`. *(SC-007)*
- [x] `MembershipRepository` funciona como `app_user` (`create`/`findRole`/`listByUser`). *(SC-008)*
- [x] `session.role` (tipado `Role`) y `session.activeTenantId` quedan **poblados**. *(SC-010)*
- [x] El poblado del claim se compone en `app/` y `identity` **no** importa `tenancy`. *(SC-013 / NFR-004)*
- [x] Registro → `Tenant` + `Membership(OWNER)` atómico e idempotente, consumiendo `UserRegistered`. *(SC-011)*

## E. Aislamiento y seguridad
- [x] Test de aislamiento: tenant A no lee la `Membership` del tenant B → **cero filas**. *(SC-009)*
- [x] La policy RLS admite la ruta "mis membresías" (por `userId`) sin abrir fugas cross-tenant (ADR-008). *(R3)*
- [x] El *staleness* del rol en el JWT está documentado (maxAge corto + revalidación en escrituras). *(NFR-008)*

## F. Testing
- [x] Unit: `Role`, matriz, `can()` (plano + propiedad), `requirePermission`, provisión (con *fakes*). *(SC-002..SC-006, SC-011, SC-014)*
- [x] Arquitectura: `tenancy/domain` puro; no-deep-import de `authorization/`; matriz fuera de `config/`; `identity ↛ tenancy`. *(SC-001, SC-012, SC-013)*
- [x] Integración/aislamiento: `MembershipRepository` como `app_user` y `Membership` cross-tenant → cero filas. *(SC-008, SC-009)*

## G. Cierre
- [x] **ADR-008** registrado en `../../../spec.md §8` (autorización materializada + poblado de claims + policy RLS de `Membership`). *(FR-011)*
- [x] Todos los SC verdes y reproducibles ([../quickstart.md](../quickstart.md) §3).
- [x] `Estado` de [../spec.md](../spec.md) = "Implementado".
