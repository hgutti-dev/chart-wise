# Fase 2 — Autenticación: identidad con Auth.js v5

- **Feature:** `002-authentication`
- **Estado:** Implementado (2026-07-10) — Fases A–H completas; SC-001..SC-015 verdes y reproducibles.
- **Fecha:** 2026-07-09
- **Constitución:** [../../spec.md](../../spec.md) — este spec **hereda** sus principios y no los repite.
- **Modelo conceptual:** [../../data-model.md](../../data-model.md) (entidades de `identity`).
- **Artefactos hermanos:** [plan.md](plan.md) · [tasks.md](tasks.md) · [data-model.md](data-model.md) · [research.md](research.md) · [quickstart.md](quickstart.md) · [checklists/requirements.md](checklists/requirements.md)

> **Regla de oro de la fase:** `identity` es **solo AuthN** (quién eres), nunca autorización. Al terminar, un usuario puede registrarse, verificar su email, iniciar y cerrar sesión (credenciales o Google), y el servidor sabe **quién** es en cada request — pero el módulo **no** sabe qué es un tenant, un rol ni un permiso. Todo lo que huela a organización/rol se **difiere** a `tenancy` (ADR-002/ADR-003); aquí solo se dejan **costuras** tipadas para esa fase.

---

## 1. Objetivo

Entregar el **primer módulo real** del producto (`identity`) y el cableado de **Auth.js v5**, de forma que:

1. **La identidad exista y sea verificable en el servidor.** Registro con email+contraseña (hash bcrypt) y con Google (OAuth), verificación de email, login/logout, y una sesión **JWT** que transporta `userId`/email/`emailVerified` hasta cada caso de uso — sin filtrar el hash ni permitir enumerar usuarios.
2. **AuthN quede aislada de tenancy.** Se materializan `User`, `Account` y `VerificationToken`; el registro crea **solo** un `User`. La creación de organización, la membresía, el rol y el ruteo multi-org se difieren a `tenancy`. Los callbacks de sesión **reservan** `activeTenantId?`/`role?` (tipados, sin poblar) como única costura.
3. **Auth.js sea un detalle enchufable.** Todo el acoplamiento a `@auth/*`/`next-auth` queda **confinado** en `identity/infrastructure/auth/`, verificado por el linter y un test de arquitectura. Cambiar de proveedor (o de versión beta) es cambiar un adaptador, no 30 archivos.

Esta fase **no** implementa organizaciones, roles ni permisos. Entrega identidad + las costuras para que `tenancy` los añada sin refactor.

## 2. Alcance

**Incluye:**

1. Módulo `identity` con las cuatro capas + `di.ts` + `index.ts`, espejando `modules/example` e introduciendo la **primera capa `presentation/`** del repo.
2. Tablas de identidad `User`, `Account`, `VerificationToken` (PK `uuid`, **sin `tenantId`, sin RLS**) vía migración `migrate dev`, con `GRANT` explícito a `app_user`. **Sin** tabla `Session` (estrategia JWT).
3. Auth.js v5 **confinado** en `identity/infrastructure/auth/`, expuesto por `app/api/auth/[...nextauth]/route.ts`; sesión **JWT** con `maxAge` explícito.
4. Proveedor **Credentials** (email+contraseña): `RegisterUserUseCase` + `AuthenticateCredentialsUseCase`, con hash bcrypt, email único normalizado y **sin enumeración**.
5. Proveedor **Google OAuth** con modelo `Account` y política de vinculación de cuentas (**sin auto-link**).
6. **Verificación de email**: puerto `EmailSender` + adaptador *fake*/consola, `emailVerified`, flujo request/confirm.
7. **Gate de sesión**: `(private)/layout.tsx` (exige sesión), `profile/page.tsx` + logout, y `middleware.ts` (Edge, **sin Prisma ni Auth.js**) de redirección barata usando `config/routes.ts`.
8. **Costuras**: base `DomainEvent` + puerto `EventBus` + bus in-memory en `shared` (ADR-004); `UserRegistered` publicado; claims JWT reservados para `tenancy`.
9. **Tests** unit (dominio/casos de uso), de **arquitectura** (confinamiento de Auth.js) e integración (camino del adapter como `app_user`).

**No incluye (fuera de alcance):** ver §9.

## 3. Usuarios y escenarios

- **US-01** — Como **visitante**, quiero **registrarme con email y contraseña**, para tener una cuenta; y que el sistema **rechace** un email ya registrado. *(→ FR-004, FR-005)*
- **US-02** — Como **visitante**, quiero **registrarme/entrar con Google**, para no crear otra contraseña. *(→ FR-006)*
- **US-03** — Como **usuario**, quiero **verificar mi email** desde un enlace, para confirmar mi identidad; puedo iniciar sesión antes de verificar, pero el estado `emailVerified` queda visible. *(→ FR-007)*
- **US-04** — Como **usuario**, quiero **iniciar y cerrar sesión**, y que al volver al día siguiente **siga logueado** (JWT con `maxAge`). *(→ FR-003, FR-008, FR-009)*
- **US-05** — Como **usuario**, quiero que **nadie pueda deducir si un email tiene cuenta** probando el login, y que mi contraseña **nunca** se guarde en claro ni salga al cliente. *(→ FR-004, NFR-004, NFR-005, NFR-006)*
- **DEV-01** — Como **desarrollador**, quiero que Auth.js quede **confinado** a `infrastructure/auth/`, para que actualizar la beta de v5 sea cambiar un adaptador y no romper el dominio. *(→ FR-003, NFR-002)*
- **DEV-02** — Como **equipo**, quiero que `identity` deje **costuras tipadas** (`activeTenantId?`/`role?` en la sesión, evento `UserRegistered`) para que `tenancy` se enchufe **sin** refactor de AuthN. *(→ FR-009, FR-010)*

## 4. Requisitos funcionales

- **FR-001 — Módulo `identity` con las 4 capas.** DEBE existir `src/modules/identity` con `domain/`, `application/`, `infrastructure/`, `presentation/`, `di.ts` e `index.ts` (única API pública), espejando el patrón de `modules/example`. Las importaciones **internas** del módulo son relativas; nada externo importa una capa interna.
- **FR-002 — Tablas de identidad materializadas.** La migración DEBE crear `User`, `Account` y `VerificationToken` con PK `uuid` (`@default(uuid()) @db.Uuid`), **sin `tenantId` y sin RLS** (no son *tenant-scoped*), y DEBE otorgar `GRANT SELECT, INSERT, UPDATE, DELETE` a `app_user` en las tres tablas. **No** DEBE crear `model Session`. El cambio va por `migrate dev` (nunca `db push`).
- **FR-003 — Auth.js v5 confinado, sesión JWT.** El wiring de Auth.js DEBE vivir en `identity/infrastructure/auth/` (config + augmentación de tipos) y exponerse por `app/api/auth/[...nextauth]/route.ts` importando `handlers` desde `@/modules/identity`. La estrategia de sesión DEBE fijarse **explícitamente** a `jwt` (con `maxAge`), porque con un adapter presente Auth.js usaría `database` por defecto y Credentials exige `jwt`.
- **FR-004 — Registro y autenticación por credenciales.** `RegisterUserUseCase` DEBE: normalizar el email, rechazar un email ya registrado (`EmailAlreadyRegisteredError`), hashear la contraseña con bcrypt vía el puerto `PasswordHasher`, persistir el `User` y publicar `UserRegistered`. `AuthenticateCredentialsUseCase` (invocado desde `authorize()`) DEBE verificar la contraseña **sin revelar** si el email existe.
- **FR-005 — Value objects de credenciales.** DEBEN existir los VOs `Email` (normaliza a minúsculas + `trim`, valida forma), `Password` (texto plano: mínimo 8, **≤ 72 bytes** por el límite de bcrypt) y `PasswordHash` (envuelve el hash almacenado). Los inválidos devuelven `Result.err(DomainError)`, no lanzan.
- **FR-006 — Google OAuth + vinculación de cuentas.** DEBE registrarse el proveedor Google usando el modelo `Account`. La política de vinculación DEBE ser **sin auto-link** (`allowDangerousEmailAccountLinking: false`): un Google con un email ya registrado por credenciales sigue el camino `OAuthAccountNotLinked`, no fusiona cuentas en silencio. Google marca `emailVerified` desde el email verificado del proveedor.
- **FR-007 — Verificación de email.** DEBE existir el puerto `EmailSender` con un adaptador **fake**/consola; `RequestEmailVerificationUseCase` crea un `VerificationToken` y envía el enlace (base `APP_URL`); `VerifyEmailUseCase` consume el token y fija `emailVerified`. Un token expirado, usado o **de otro identifier** DEBE rechazarse. El usuario PUEDE iniciar sesión sin verificar; `emailVerified` se expone en la sesión (la regla "no verificado no invita" se difiere a `tenancy`).
- **FR-008 — Gate de sesión y middleware.** `app/(private)/layout.tsx` DEBE exigir sesión llamando `auth()` desde `@/modules/identity` (verificación autoritativa en runtime Node); DEBE existir `profile/page.tsx` con logout. `middleware.ts` (Edge) DEBE hacer **solo** redirección barata por presencia de la cookie de sesión, usando `config/routes.ts`, **sin importar Prisma ni Auth.js**.
- **FR-009 — Contrato de sesión/JWT + costura de tenancy.** Los callbacks `jwt`/`session` DEBEN exponer `session.user.id`, email, name, image y `emailVerified`; y DEBEN **reservar** `activeTenantId?` y `role?` (tipados, opcionales, **sin poblar** en esta fase) como costura para `tenancy`. La augmentación de tipos de `next-auth` DEBE vivir dentro de `identity/infrastructure/auth/`.
- **FR-010 — Eventos de dominio (costura) y ADR de fase.** DEBEN introducirse en `shared` la base `DomainEvent` (`shared/domain`), el puerto `EventBus` (`shared/application`) y un bus in-memory síncrono (`shared/infrastructure`) según ADR-004; `RegisterUserUseCase` publica `UserRegistered` (sin consumidor aún). DEBE registrarse **ADR-007** (alcance AuthN-only + confinamiento de Auth.js + diferidos de tenancy) en la constitución `../../spec.md §8`.
- **FR-011 — Variables de entorno.** `src/config/env.schema.ts` DEBE validar `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (fail-fast) y `APP_URL` (con default) para construir el enlace de verificación (`AUTH_SECRET` ya existe de la Fase 1).
- **FR-012 — Redirección interna segura.** DEBE existir un helper **puro** `resolveInternalRedirect(callbackUrl)` que acepte solo rutas relativas *same-origin* y descarte URLs absolutas/externas hacia un default seguro (anti *open-redirect*).
- **FR-013 — Tests.** DEBEN existir: tests **unit** de dominio/casos de uso (con repos/adapters en memoria); un test de **arquitectura** que falle si `@auth/*`/`next-auth` se importa fuera de `**/infrastructure/auth/**`; y un test de **integración** que ejercite el camino del adapter (`createUser`/`linkAccount`/`getUserByAccount` y `createVerificationToken`/`useVerificationToken`) como `app_user`.

## 5. Requisitos no funcionales

- **NFR-001** — `identity/domain/**` NO DEBE importar Next.js, Prisma, `@auth/*`/`next-auth` ni infraestructura (verificado por lint **y** por el test de arquitectura existente, que cubre módulos nuevos automáticamente).
- **NFR-002** — `@auth/*`/`next-auth` SOLO DEBEN importarse bajo `src/modules/*/infrastructure/auth/**`; cualquier otro import (incluido `middleware.ts`) DEBE fallar (enforcement **nuevo**: override de ESLint por glob + aserción en el test de arquitectura). Mitiga los *breaking changes* de la beta de v5.
- **NFR-003** — `middleware.ts` NO DEBE importar Prisma, Auth.js ni ejecutar acceso a base de datos; corre en Edge y solo lee la cookie de sesión.
- **NFR-004** — Las contraseñas se almacenan **solo** como hash bcrypt (`$2*`); nunca en claro, y el hash **nunca** viaja al cliente (sesión/DTO) ni a logs.
- **NFR-005** — **Sin enumeración de usuarios**: un email inexistente y una contraseña incorrecta DEBEN devolver el **mismo** `InvalidCredentialsError`.
- **NFR-006** — La verificación de credenciales DEBE ejecutarse en **tiempo constante**: se hace un `compare` bcrypt contra un hash *dummy* aunque el email no exista, para no filtrar existencia por temporización.
- **NFR-007** — El flujo de *request* de verificación NO DEBE enumerar: misma respuesta para email conocido y desconocido.
- **NFR-008** — `AUTH_SECRET` y los secretos de OAuth NO DEBEN acabar en el bundle del cliente (`server-only`) ni prefijarse con `NEXT_PUBLIC_`; se validan fail-fast.
- **NFR-009** — El dominio de `identity` DEBE ser puro y testeable sin DB ni Next (casos de uso invocables con repos/adapters en memoria).
- **NFR-010** — `identity` DEBE exponer una única API pública (`index.ts`); el *deep-import* entre módulos DEBE fallar (lint + test).
- **NFR-011** — La sesión JWT DEBE fijar `maxAge` explícito; se documenta que el JWT **no es revocable** antes de expirar (blocklist diferido).

## 6. Criterios de éxito (medibles)

- **SC-001** — `pnpm lint` **falla** si un archivo bajo `src/modules/identity/domain/**` importa `next-auth`/`@auth/*`/`@prisma/client`. *(FR-001 / NFR-001, NFR-009)*
- **SC-002** — `pnpm test` (arquitectura) **falla** si `@auth/*`/`next-auth` se importa fuera de `**/infrastructure/auth/**`. *(FR-003, FR-013 / NFR-002)*
- **SC-003** — `pnpm db:migrate` + `pnpm typecheck` crean `User`/`Account`/`VerificationToken` (uuid); `grep -R "model Session" prisma/schema.prisma` **sin coincidencias**. *(FR-002)*
- **SC-004** — Unit: `Email.create("no-es-email")` → `DomainError`; `Email.create("  A@B.com ")` → `ok` con valor `a@b.com` (normalizado). *(FR-005)*
- **SC-005** — Unit: `Password.create("short")` y una contraseña de **> 72 bytes** → `DomainError`; una válida → `ok`. *(FR-005 / NFR-004)*
- **SC-006** — Unit: `RegisterUser` con email ya registrado → `EmailAlreadyRegisteredError`; en éxito, el valor persistido es un hash `$2*` (no el texto) y el `EventBus` *fake* recibe `UserRegistered`. *(FR-004, FR-010 / NFR-004)*
- **SC-007** — Unit: `AuthenticateCredentials` con email inexistente y con contraseña incorrecta devuelven el **mismo** `InvalidCredentialsError`, y **ambos** ejecutan un `compare` bcrypt (spy sobre el `PasswordHasher`). *(FR-004 / NFR-005, NFR-006)*
- **SC-008** — Unit: `VerifyEmail` con token válido → `emailVerified` fijado; token expirado, usado o de **otro identifier** → error; `RequestEmailVerification` devuelve la misma respuesta para email conocido/desconocido y el `FakeEmailSender` registra el envío. *(FR-007 / NFR-007)*
- **SC-009** — Unit: `resolveInternalRedirect("https://evil.com")` → ruta segura por defecto; `resolveInternalRedirect("/app/x")` → `/app/x`. *(FR-012)*
- **SC-010** — `AUTH_GOOGLE_ID= pnpm build` (o un test de `parseEnv`) **aborta** nombrando la variable ausente. *(FR-011 / NFR-008)*
- **SC-011** — `pnpm typecheck` compila accediendo a `session.user.id` y a los campos reservados `activeTenantId?`/`role?`; el tipo de sesión se exporta desde `@/modules/identity`. *(FR-009)*
- **SC-012** — `grep -R "prisma\|next-auth\|@auth" src/middleware.ts` **sin coincidencias** (Edge sin Prisma ni Auth.js); el `(private)/layout.tsx` verifica con `auth()`. *(FR-008 / NFR-003)*
- **SC-013** — Integración (como `app_user`): el camino del adapter `createUser → linkAccount → getUserByAccount` y `createVerificationToken → useVerificationToken` funciona sobre las tres tablas (prueba que los `GRANT` existen). *(FR-002, FR-006, FR-013)*
- **SC-014** — `pnpm lint`/test **falla** ante un *deep-import* `@/modules/identity/domain/...` desde `app` o un test. *(FR-001 / NFR-010)*
- **SC-015** — Config assertion (test puro sobre las `authOptions`): `session.strategy === "jwt"`, `session.maxAge` fijado, y el proveedor Google con `allowDangerousEmailAccountLinking: false`. *(FR-003, FR-006 / NFR-011)*

## 7. Entidades clave (resumen)

Detalle completo en [data-model.md](data-model.md). Formas conceptuales en [../../data-model.md](../../data-model.md) §1 (`identity`).

| Entidad | Rol en la Fase 2 | Notas |
|---|---|---|
| `User` | Identidad global de una persona. | `uuid`, `email` único normalizado, `passwordHash?` (nulo para cuentas solo-OAuth), `emailVerified?`. **No** *tenant-scoped*. |
| `Account` | Proveedor OAuth (Google) vinculado a un `User`. | Forma estándar del adapter de Auth.js; `@@unique([provider, providerAccountId])`. |
| `VerificationToken` | Token de verificación de email. | Forma estándar del adapter; `@@unique([identifier, token])`. |
| `Email` · `Password` · `PasswordHash` | Value objects de dominio. | `Email` normaliza; `Password` valida (≤72 bytes); `PasswordHash` envuelve el hash. |
| `UserRegistered` | Evento de dominio (costura). | Publicado en el registro; sin consumidor hasta `tenancy`. |
| `TenantContext` | Ya existe (`shared/application`). | Su `userId?` pasa a estar respaldado por un `User` real. |

## 8. Edge cases

- **Login con email inexistente vs. contraseña incorrecta** → mismo `InvalidCredentialsError`, tiempo constante (no enumeración). *(SC-007)*
- **Usuario solo-OAuth (sin `passwordHash`) intenta login por credenciales** → `InvalidCredentialsError` (sin revelar que la cuenta existe). *(SC-007)*
- **Google con un email ya registrado por credenciales** → `OAuthAccountNotLinked` (no auto-link). *(FR-006 / SC-015)*
- **Token de verificación expirado / usado / de otro identifier** → error controlado; no fija `emailVerified`. *(SC-008)*
- **`callbackUrl` externo (`https://evil.com`)** → se descarta; redirect al default seguro. *(SC-009)*
- **Falta `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`** → el build aborta nombrando la variable. *(SC-010)*
- **Ruta privada sin cookie de sesión** → el middleware redirige a `/login`; la verificación real la hace el layout con `auth()`. *(SC-012)*
- **Adapter presente sin fijar la estrategia** → Auth.js usaría sesiones `database` y, sin tabla `Session`, rompería en runtime; por eso se fija `strategy:"jwt"` explícito. *(SC-015)*

## 9. Fuera de alcance (Fase 2)

Difiere a **`tenancy`** (o a la fase indicada). Esta separación es deliberada: el §11 de la guía mezcla estas piezas en "Fase 2", pero ADR-002/ADR-003 y el orden de fases las sacan de `identity`.

- **Registro → `Tenant` + `Membership(OWNER)`** (transacción atómica) → `tenancy`.
- **Poblar `role`/`activeTenantId` en el JWT** → `tenancy` (aquí los claims solo se **reservan**).
- **Onboarding / `select-org` / `SwitchActiveTenant`** y el ruteo login 0/1/N membresías → `tenancy`.
- **Regla "usuario no verificado no puede invitar"** → `tenancy` (invitaciones/autorización).
- **Rate limiting / lockout de fuerza bruta** en login/registro → fase de *hardening* (requiere un store; solo se documenta el riesgo — el **tiempo constante** sí entra aquí).
- **Recuperación de contraseña (forgot/reset)** → incremento posterior de `identity`.
- **Proveedor de email real (p. ej. Resend)** → incremento posterior (ahora, adaptador *fake*).
- **Revocación de JWT / blocklist / *staleness* de claims tras cambio de rol** → *hardening*/`tenancy`.
- **Sesiones en base de datos (tabla `Session`)** → descartado (estrategia JWT).
- **E2E de login/OAuth/redirect (Playwright)** → fase E2E; aquí la lógica se verifica con funciones puras + aserciones de config (el repo no tiene runner E2E).
- **Magic links, 2FA, SSO, vinculación automática de cuentas** → fuera del MVP.

## 10. Supuestos y dependencias

- Fase 1 completa: TS estricto, boundaries ESLint, `env` fail-fast (con `AUTH_SECRET`), Postgres+Prisma 7 (cliente en `src/generated/prisma`, rol `app_user` `NOBYPASSRLS`), primitivas `Result`/`DomainError`/`TenantContext`, patrón del módulo `example`, Vitest (proyectos `unit` + `integration`).
- Se instalarán `next-auth` v5 (beta), `@auth/prisma-adapter` y un hasher bcrypt (elección en [research.md](research.md) R3).
- Credenciales de Google Cloud (OAuth client) para el flujo real; los tests no dependen de un login vivo de Google.
- **Context7** se consulta antes de fijar firmas de Auth.js v5 / `@auth/prisma-adapter` / hasher / Prisma 7 (los snippets del SDD son ilustrativos).

## 11. Preguntas abiertas (no bloqueantes)

- **Q1** — ¿`bcryptjs` (puro JS, portable) o `@node-rs/bcrypt` (napi prebuilt) para Windows? → decisión en [research.md](research.md) R3.
- **Q2** — ¿Los secretos de Google son requeridos siempre o solo en producción? → [research.md](research.md) R5/R10 (por defecto: requeridos, con *placeholders* en `.env.example`).
- **Q3** — ¿El registro con email ya existente revela existencia (`EmailAlreadyRegistered`) o responde en silencio? → [research.md](research.md) R11 (por defecto: se acepta `EmailAlreadyRegistered`, UX estándar; el login sí es no-enumerable).
