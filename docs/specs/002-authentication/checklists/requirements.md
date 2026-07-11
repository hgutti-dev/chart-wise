# Fase 2 — Checklist de requisitos

- **Feature:** `002-authentication`
- **Spec:** [../spec.md](../spec.md)
- **Propósito:** verificar que la especificación es **completa, testeable y sin ambigüedad** antes de implementar (grupo A), y servir de **gate de aceptación** al cerrar la fase (grupos B–G).

Marca `[x]` solo con evidencia (comando + salida), no por impresión. El grupo A se valida por inspección del SDD; los grupos B–G se marcan durante/al cerrar la implementación (T082).

---

## A. Calidad de la especificación
- [x] Cada requisito funcional (FR-001..FR-013) es **verificable** (tiene al menos un SC asociado).
- [x] Cada Criterio de Éxito (SC-001..SC-015) es **medible con un comando** (`vitest`/`grep`/`tsc`/`lint`; **sin** E2E, que el repo no tiene).
- [x] No hay requisitos vagos ("seguro", "rápido") sin métrica.
- [x] Los non-goals (spec §9) están explícitos: el trabajo de `tenancy` está **diferido**, no colado como tarea.
- [x] Las preguntas abiertas (spec §11) están cerradas en [../research.md](../research.md) (Q1→R3, Q2→R5/R10, Q3→R11).
- [x] Cada decisión de [../research.md](../research.md) (R1..R11) lista alternativa descartada + racional.
- [x] El conflicto con la guía §11 (mezcla AuthN + tenancy) está **documentado** (R9) y resuelto a favor del repo (ADR-002/ADR-003).

## B. Objetivo 1 — `identity` es solo AuthN + Auth.js confinado
- [x] Módulo `identity` con las 4 capas + `di.ts` + `index.ts` (única API pública). *(SC-001, SC-014)*
- [x] El linter/test **falla** si `identity/domain/**` importa `next`/`@prisma/client`/`@auth/*`/`next-auth`. *(SC-001, verificado con trampa en T080)*
- [x] `@auth/*`/`next-auth` **confinados** a `**/infrastructure/auth/**`; import fuera → falla. *(SC-002, verificado con trampa en T080)*
- [x] `proxy.ts` (antes `middleware.ts`) **sin** Prisma ni Auth.js (solo presencia de cookie; runtime Node). *(SC-012)*
- [x] Los Server Actions que **componen** viven en `app/`; `presentation/` solo schemas + forms + `action-state`. A `eslint.config.mjs` solo se le **añadió el confinamiento de Auth.js** (T057); **NO** se relajaron las boundaries para colocar las acciones (R10).
- [x] El registro crea **solo** un `User` (nada de `Tenant`/`Membership`).

## C. Objetivo 2 — modelo de datos de identidad
- [x] La migración crea `User`/`Account`/`VerificationToken` con PK `uuid`. *(SC-003)*
- [x] **No** existe `model Session` (estrategia JWT). *(SC-003)*
- [x] Las tablas de identidad **no** llevan `tenantId` ni RLS (no son *tenant-scoped*).
- [x] `GRANT SELECT/INSERT/UPDATE/DELETE` a `app_user` en las 3 tablas; el camino del adapter funciona. *(SC-013, `adapter-grants.spec.ts` como `app_user`)*
- [x] `passwordHash` es *nullable* (cuentas solo-OAuth) y **nunca** viaja al cliente (`PasswordHash.toJSON` lo redacta; DTOs sin hash).

## D. Contrato de sesión / JWT + costuras de tenancy
- [x] `session.strategy === "jwt"` con `maxAge` fijado. *(SC-015)*
- [x] La sesión expone `user.id`/`emailVerified` y **reserva** `activeTenantId?`/`role?` (sin poblar). *(SC-011)*
- [x] `EventBus` (ADR-004) materializado en `shared`; `RegisterUser` publica `UserRegistered`. *(SC-006)*
- [x] **ADR-007** (alcance AuthN-only + confinamiento + diferidos) registrado en [../../../spec.md](../../../spec.md) §8.

## E. Seguridad
- [x] La contraseña se guarda **solo** como hash bcrypt (`$2*`); nunca en claro/cliente/logs. *(SC-006)*
- [x] Login **sin enumeración**: email inexistente y contraseña incorrecta → mismo `InvalidCredentialsError`, en **tiempo constante** (dummy hash al mismo coste bcrypt que los reales, NFR-006). *(SC-007)*
- [x] `resolveInternalRedirect` descarta `callbackUrl` externos a un default seguro. *(SC-009)*
- [x] `AUTH_SECRET`/secretos OAuth con `server-only`, sin `NEXT_PUBLIC_`, fail-fast. *(SC-010)*
- [x] Vinculación de cuentas **sin auto-link** (`allowDangerousEmailAccountLinking: false`). *(SC-015)*

## F. Testing
- [x] Unit de dominio/casos de uso en verde: `Email`, `Password`, `RegisterUser`, `AuthenticateCredentials`, `VerifyEmail`, `resolveInternalRedirect`. *(SC-004, SC-005, SC-006, SC-007, SC-008, SC-009)*
- [x] Test de **arquitectura** de confinamiento de Auth.js. *(SC-002)*
- [x] Test de **integración** del camino del adapter como `app_user`. *(SC-013)*

## G. Cierre
- [x] [../quickstart.md](../quickstart.md) recorrido end-to-end, cada comando confirmado.
- [x] SC-001..SC-015 verdes y reproducibles.
- [x] **ADR-007** en la constitución; `Estado` del [../spec.md](../spec.md) actualizado a "Implementado".
