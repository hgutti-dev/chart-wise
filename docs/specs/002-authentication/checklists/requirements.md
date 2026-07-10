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
- [ ] Módulo `identity` con las 4 capas + `di.ts` + `index.ts` (única API pública). *(SC-001, SC-014)*
- [ ] El linter/test **falla** si `identity/domain/**` importa `next`/`@prisma/client`/`@auth/*`/`next-auth`. *(SC-001)*
- [ ] `@auth/*`/`next-auth` **confinados** a `**/infrastructure/auth/**`; import fuera → falla. *(SC-002)*
- [ ] `middleware.ts` **sin** Prisma ni Auth.js (solo cookie en Edge). *(SC-012)*
- [ ] Los Server Actions que **componen** viven en `app/`; `presentation/` solo schemas + forms. **No** se tocó `eslint.config.mjs`.
- [ ] El registro crea **solo** un `User` (nada de `Tenant`/`Membership`).

## C. Objetivo 2 — modelo de datos de identidad
- [ ] La migración crea `User`/`Account`/`VerificationToken` con PK `uuid`. *(SC-003)*
- [ ] **No** existe `model Session` (estrategia JWT). *(SC-003)*
- [ ] Las tablas de identidad **no** llevan `tenantId` ni RLS (no son *tenant-scoped*).
- [ ] `GRANT SELECT/INSERT/UPDATE/DELETE` a `app_user` en las 3 tablas; el camino del adapter funciona. *(SC-013)*
- [ ] `passwordHash` es *nullable* (cuentas solo-OAuth) y **nunca** viaja al cliente.

## D. Contrato de sesión / JWT + costuras de tenancy
- [ ] `session.strategy === "jwt"` con `maxAge` fijado. *(SC-015)*
- [ ] La sesión expone `user.id`/`emailVerified` y **reserva** `activeTenantId?`/`role?` (sin poblar). *(SC-011)*
- [ ] `EventBus` (ADR-004) materializado en `shared`; `RegisterUser` publica `UserRegistered`. *(SC-006)*
- [ ] **ADR-007** (alcance AuthN-only + confinamiento + diferidos) registrado en [../../../spec.md](../../../spec.md) §8.

## E. Seguridad
- [ ] La contraseña se guarda **solo** como hash bcrypt (`$2*`); nunca en claro/cliente/logs. *(SC-006)*
- [ ] Login **sin enumeración**: email inexistente y contraseña incorrecta → mismo `InvalidCredentialsError`, en **tiempo constante**. *(SC-007)*
- [ ] `resolveInternalRedirect` descarta `callbackUrl` externos a un default seguro. *(SC-009)*
- [ ] `AUTH_SECRET`/secretos OAuth con `server-only`, sin `NEXT_PUBLIC_`, fail-fast. *(SC-010)*
- [ ] Vinculación de cuentas **sin auto-link** (`allowDangerousEmailAccountLinking: false`). *(SC-015)*

## F. Testing
- [ ] Unit de dominio/casos de uso en verde: `Email`, `Password`, `RegisterUser`, `AuthenticateCredentials`, `VerifyEmail`, `resolveInternalRedirect`. *(SC-004, SC-005, SC-006, SC-007, SC-008, SC-009)*
- [ ] Test de **arquitectura** de confinamiento de Auth.js. *(SC-002)*
- [ ] Test de **integración** del camino del adapter como `app_user`. *(SC-013)*

## G. Cierre
- [ ] [../quickstart.md](../quickstart.md) recorrido end-to-end en limpio, cada comando confirmado.
- [ ] SC-001..SC-015 verdes y reproducibles.
- [ ] **ADR-007** en la constitución; `Estado` del [../spec.md](../spec.md) actualizado a "Implementado".
