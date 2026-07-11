# Fase 2 — Tareas

- **Feature:** `002-authentication`
- **Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md) · **Data model:** [data-model.md](data-model.md)
- **Estado:** Pendiente de implementación

Convenciones: `[ ]` pendiente · `[x]` hecho. `[P]` = paralelizable (sin dependencia con las tareas [P] hermanas del mismo grupo). Cada tarea nombra el/los archivo(s) y el requisito que satisface. Antes de tocar Auth.js/adapter/hasher/Prisma, **consultar Context7**.

---

## Fase 0 — Preparación

- [ ] **T001** Instalar `next-auth@5` (beta, **versión fijada**), `@auth/prisma-adapter` y el hasher bcrypt (`bcryptjs` por defecto; `@node-rs/bcrypt` si hace falta rendimiento). *(FR-003, R1, R3)*
- [ ] **T002** Extender `src/config/env.schema.ts`: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (requeridos), `APP_URL` (con default). Actualizar `.env.example` con *placeholders* (sin secretos reales). *(FR-011, SC-010)*
- [ ] **T003** Consultar **Context7** para la API vigente de Auth.js v5, `@auth/prisma-adapter`, el hasher y Prisma 7 antes de fijar firmas. *(disciplina global)*

## Fase A — Costura de eventos en `shared` *(FR-010)*

- [x] **T010 [P]** `src/shared/domain/domain-event.ts`: base `DomainEvent` (nombre/tipo + `occurredAt` inyectado, no generado en el dominio). Sin imports de framework/infra.
- [x] **T011 [P]** `src/shared/application/event-bus.ts`: puerto `EventBus` (`publish`, `subscribe`). Interfaz pura.
- [x] **T012** `src/shared/infrastructure/in-memory-event-bus.ts`: implementación síncrona in-memory del puerto.
- [x] **T013** `tests/unit/shared/event-bus.spec.ts`: publicar un evento → los handlers suscritos lo reciben (en verde).

## Fase B — Data model de identidad *(FR-002 → SC-003, SC-013)*

- [ ] **T020** `prisma/schema.prisma`: modelos `User`/`Account`/`VerificationToken` (uuid `@db.Uuid`, **sin `tenantId`, sin `Session`**) según [data-model.md](data-model.md). Confirmar los nombres de columna de `Account` con Context7 (`@auth/prisma-adapter`).
- [ ] **T021** Generar migración `prisma migrate dev --create-only` y **editar el SQL**: `GRANT SELECT, INSERT, UPDATE, DELETE` a `app_user` en `User`/`Account`/`VerificationToken` (**sin** RLS: no son *tenant-scoped*). Aplicar con `migrate dev`; regenerar el cliente.
- [ ] **T022** **Verificar SC-003**: `prisma migrate status` ≥ 2 migraciones; `grep -R "model Session" prisma/schema.prisma` sin coincidencias; `pnpm typecheck` en verde con el cliente regenerado.

## Fase C — Dominio de `identity` *(FR-001, FR-004, FR-005 → SC-004, SC-005)*

- [ ] **T030 [P]** `modules/identity/domain/value-objects/email.ts`: `create(raw): Result<Email, InvalidEmailError>` — normaliza a minúsculas + `trim`, valida forma.
- [ ] **T031 [P]** `modules/identity/domain/value-objects/password.ts`: `create(plain): Result<Password, WeakPasswordError>` — mínimo 8, **≤ 72 bytes** (límite bcrypt).
- [ ] **T032 [P]** `modules/identity/domain/value-objects/password-hash.ts`: envuelve un hash `$2*`; nunca serializa al cliente.
- [ ] **T033 [P]** `modules/identity/domain/errors/*`: `InvalidEmailError`, `WeakPasswordError`, `InvalidCredentialsError`, `EmailAlreadyRegisteredError`, `InvalidVerificationTokenError` (extends `DomainError`, `code` namespaced `identity.*`).
- [ ] **T034** `modules/identity/domain/entities/user.ts`: entidad `User` (id `UserId` branded) con factory `create(...): Result<User, DomainError>`.
- [ ] **T035** `modules/identity/domain/ports/user.repository.ts`: interfaz (`findByEmail`, `findById`, `save`). Recibe tipos de dominio, no `TenantContext` (identidad no es *tenant-scoped*).
- [ ] **T036** `modules/identity/domain/events/user-registered.event.ts`: `UserRegistered extends DomainEvent`.
- [ ] **T037** `tests/unit/identity/{email,password}.spec.ts`. **Verificar SC-004, SC-005.**

## Fase D — Casos de uso *(FR-004, FR-007, FR-012 → SC-006, SC-007, SC-008, SC-009)*

- [x] **T040 [P]** `modules/identity/application/ports/password-hasher.ts` (`hash`, `compare`) y `email-sender.ts` (`sendVerification`). Puertos de servicio (aplicación). *(+ puerto de dominio `verification-token.repository.ts` (`create`/`use`) y entidad `verification-token.ts`, según decisión de fase.)*
- [x] **T041** `modules/identity/application/use-cases/register-user.ts`: normaliza email, rechaza duplicado (`EmailAlreadyRegisteredError`), hashea vía `PasswordHasher`, persiste `User`, publica `UserRegistered`. **Crea solo `User`** (nada de Tenant/Membership).
- [x] **T042** `modules/identity/application/use-cases/authenticate-credentials.ts`: busca por email; ejecuta `compare` bcrypt **siempre** (contra hash *dummy* si el email no existe → tiempo constante); mismo `InvalidCredentialsError` para email inexistente y contraseña incorrecta.
- [x] **T043 [P]** `request-email-verification.ts` (crea `VerificationToken` + `EmailSender`, misma respuesta conocido/desconocido, TTL 24h) y `verify-email.ts` (consume token atómicamente vía `use(identifier, token)`, fija `emailVerified`; rechaza expirado/usado/de otro identifier).
- [x] **T044 [P]** `modules/identity/application/use-cases/get-current-user.ts`: resuelve el `User` autenticado (`CurrentUserDto` plano, sin `passwordHash`).
- [x] **T045 [P]** `modules/identity/application/redirect/resolve-internal-redirect.ts`: helper **puro** — acepta solo rutas relativas *same-origin*, descarta absolutas/externas a un default seguro (`/profile`).
- [x] **T046** `modules/identity/infrastructure/persistence/in-memory-user.repository.ts` + `in-memory-verification-token.repository.ts` (fakes para unit) + fakes de `PasswordHasher`/`EmailSender` en `tests/unit/identity/fakes/` (el `EventBus` usa el `InMemoryEventBus` real).
- [x] **T047** `tests/unit/identity/{register-user,authenticate-credentials,verify-email,resolve-internal-redirect,get-current-user}.spec.ts`. **SC-006, SC-007, SC-008, SC-009 verificados** (54 unit tests en verde, `typecheck` y `lint` limpios).

## Fase E — Infraestructura + Auth.js *(FR-003, FR-006, FR-009, FR-013 → SC-002, SC-011, SC-013, SC-015)*

- [x] **T050** `modules/identity/infrastructure/persistence/prisma-user.repository.ts` + `mappers/user.mapper.ts`: implementa `UserRepository` con el cliente generado. **Sin** `set_config('app.current_tenant')` (no *tenant-scoped*). *(+ `prisma-verification-token.repository.ts`, necesario para cablear `VerifyEmail`/`RequestEmailVerification` en el di.)*
- [x] **T051** `modules/identity/infrastructure/crypto/bcrypt-hasher.ts`: implementa `PasswordHasher` (rounds = 12, bcryptjs).
- [x] **T052** `modules/identity/infrastructure/email/fake-email-sender.ts`: implementa `EmailSender` (consola/in-memory; registra los envíos y construye el enlace con la base URL inyectada).
- [x] **T053** `modules/identity/infrastructure/auth/auth.config.ts`: `buildAuthConfig` (puro, testeable) + `authorizeCredentials` extraído; providers (Credentials → `AuthenticateCredentials`; Google `allowDangerousEmailAccountLinking: false`), `session.strategy:"jwt"` + `maxAge`, callbacks `jwt`/`session` (exponen `user.id`/`emailVerified`; **reservan** `activeTenantId?`/`role?`). El `PrismaAdapter` + `NextAuth()` viven en `create-auth.ts` (cast acotado).
- [x] **T054** `modules/identity/infrastructure/auth/next-auth.d.ts`: augmentación de tipos (`session.user.id`, `emailVerified`, reservados) — **dentro** de `infrastructure/auth/` (confinamiento).
- [x] **T055** `modules/identity/di.ts` + `index.ts`: composition root e **API pública** (exporta `handlers`/`auth`/`signIn`/`signOut`, casos de uso wired, errores, tipo de sesión `AppSession`). *(Los schemas Zod de presentation son de Fase F.)*
- [x] **T056** `app/api/auth/[...nextauth]/route.ts`: `export const { GET, POST } = handlers` importando `handlers` desde `@/modules/identity` (no `next-auth` directo).
- [x] **T057** **Confinamiento (enforcement nuevo)**: override `no-restricted-imports` por glob en `eslint.config.mjs` (prohíbe `next-auth`/`@auth/*` en `src/**` salvo `**/infrastructure/auth/**`) + aserción en `tests/architecture/dependency-rule.spec.ts`. **SC-002 verificado** con import-trampa (lint + test fallan) y revertido.
- [x] **T058** `tests/integration/identity/adapter-grants.spec.ts`: como `app_user`, ejercita `createUser → linkAccount → getUserByAccount` y `createVerificationToken → useVerificationToken`. **SC-013 verificado.**
- [x] **T059** `tests/unit/identity/auth-config.spec.ts`: config assertion (`session.strategy === "jwt"`, `maxAge` fijado, Google `allowDangerousEmailAccountLinking: false`) — **SC-015**; acceso a `session.user.id`/reservados compila en `pnpm typecheck` — **SC-011**.

## Fase F — Presentation + `app/` *(FR-007, FR-008, FR-012)*

- [x] **T060 [P]** `modules/identity/presentation/schemas/{register,login}.schema.ts` (+ `fields.ts` con el email compartido): schemas Zod (frontera de validación) que reflejan el VO `Email`/`Password`. TDD (12 casos).
- [x] **T061 [P]** `modules/identity/presentation/components/{register-form,login-form}.tsx`: componentes cliente (shadcn `Field`/`Input`/`Button`, `useActionState`) que **reciben la acción por props** (no importan `next-auth` ni `di`). Contrato `AuthFormState` en `presentation/action-state.ts`.
- [x] **T062** `app/(public)/actions/{register,login,logout}.action.ts`: Server Actions (`"use server"`) que componen vía `@/modules/identity` (`RegisterUser`+`RequestEmailVerification` / `signInWithCredentials` / `signOut`), validan con el schema Zod y traducen `Result`. El `AuthError` de Auth.js se traduce en el wrapper confinado `infrastructure/auth/credentials-sign-in.ts` (app/ no importa `next-auth`).
- [x] **T063** `app/(public)/{login,register,verify-email}/page.tsx` (+ `(public)/layout.tsx` centrado): renderizan los forms y les pasan la acción; `verify-email` invoca `VerifyEmail` con el token de la URL. **Vistas, no endpoints.**
- [x] **T064** `app/(private)/layout.tsx`: gate — `auth()`; sin sesión, `redirect("/login")`. `app/(private)/profile/page.tsx`: muestra el `CurrentUserDto` + `<form>` de logout. Verificado en vivo: `/profile` sin sesión → 307 a `/login`.
- [x] **T065** `src/config/routes.ts`: listas de rutas públicas/privadas + helpers `isPublicRoute`/`isProtectedRoute` (consumidas por el middleware, Fase G). TDD.

> **Fix de seguridad (revisión de Fase E, NFR-006):** `TIMING_SAFE_DUMMY_HASH` en `authenticate-credentials.ts` estaba a coste bcrypt 10 mientras `BcryptHasher` usa 12 → `compare` tardaba distinto según existiera la cuenta (canal lateral de enumeración). Alineado a coste 12 con test de paridad de regresión.

## Fase G — Middleware + env final *(FR-008, FR-011 → SC-010, SC-012)*

- [x] **T070** `src/proxy.ts` (convención `proxy` de Next 16, antes `middleware`): redirección por **presencia de la cookie** de sesión (`authjs.session-token` / `__Secure-…`) usando `config/routes.ts`; `matcher` excluyendo API/estáticos. **Sin** importar Prisma ni Auth.js. TDD (4 tests con `NextRequest` reales). NOTA: el `proxy` corre en runtime **Node** por defecto (el `middleware` era Edge), pero se mantiene deliberadamente sin acceso a DB (gate barato); la NFR-003 del spec dice "Edge" y quedaría por actualizar a "runtime del proxy (Node)".
- [x] **T071** **SC-012 verificado**: `grep -R "prisma\|next-auth\|@auth" src/proxy.ts` sin coincidencias; en vivo, `/profile` sin cookie → 307 a `/login?callbackUrl=%2Fprofile` (proxy) y con cookie inválida → el layout `auth()` la rebota a `/login`.
- [x] **T072** **SC-010 verificado**: `AUTH_GOOGLE_ID= pnpm build` aborta con `AUTH_GOOGLE_ID es obligatorio` (fail-fast en `next.config.ts` → `parseEnv`).

## Fase H — Arquitectura + cierre

- [x] **T080** **SC-001/SC-002/SC-014 verificados** con imports-trampa: `domain` importando `@auth/*` → lint + arch test fallan (SC-001); `next-auth` en `app/` → fallan (SC-002); deep-import `@/modules/identity/domain/...` → fallan (SC-014, y además boundaries `app→domain`). Revertido; lint + arch test en verde.
- [x] **T081** **ADR-007** registrado en la constitución [../../spec.md](../../spec.md) §8: alcance AuthN-only de `identity`, confinamiento de Auth.js (`proxy.ts` incluido) y trabajo diferido a `tenancy`/*hardening*.
- [x] **T082** [quickstart.md](quickstart.md) recorrido (mapa comando→SC confirmado); [checklists/requirements.md](checklists/requirements.md) al 100% (B–G marcados con evidencia); `Estado` de [spec.md](spec.md) → "Implementado".

---

### Trazabilidad requisito → tareas

| Requisito | Tareas |
|---|---|
| FR-001 | T030–T037, T057 (dominio + API pública) |
| FR-002 | T020–T022, T058 |
| FR-003 | T001, T053, T055, T056, T057, T059 |
| FR-004 | T041, T042, T046, T047 |
| FR-005 | T030–T032, T037 |
| FR-006 | T053, T058 |
| FR-007 | T043, T052, T063 |
| FR-008 | T064, T065, T070, T071 |
| FR-009 | T053, T054, T059 |
| FR-010 | T010–T013, T041 |
| FR-011 | T002, T072 |
| FR-012 | T045, T047, T064 |
| FR-013 | T037, T047, T057, T058, T059 |
| NFR-002 (confinamiento) | T053, T054, T056, T057, T080 |
| NFR-005/006 (no enumeración) | T042, T047 |
| SC-013 (grants adapter) | T021, T050, T058 |
