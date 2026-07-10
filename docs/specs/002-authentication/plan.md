# Fase 2 — Plan técnico de implementación

- **Feature:** `002-authentication`
- **Spec:** [spec.md](spec.md) · **Constitución:** [../../spec.md](../../spec.md)
- **Estado:** Draft para revisión

> Este plan traduce los requisitos (FR/NFR/SC) del [spec.md](spec.md) en decisiones técnicas y una secuencia de slices. El desglose accionable vive en [tasks.md](tasks.md). El modelo de las tablas de identidad está en [data-model.md](data-model.md).

---

## 1. Enfoque

Construir `identity` **de dentro hacia afuera** (dominio puro → aplicación → infraestructura → entrada), dejando Auth.js para el final y **confinado**. Cada slice cierra con una verificación reproducible por comando. El orden respeta las dependencias: primero las costuras compartidas (`EventBus`) y el schema, luego el dominio y los casos de uso testeables sin DB, después los adaptadores + Auth.js, y por último la UI, el middleware y el cierre de arquitectura.

Antes de los slices, una **Fase 0** de preparación instala dependencias y extiende el `env` (los secretos de Google se necesitan **antes** del slice de Auth.js).

**Principio rector:** `identity` no sabe qué es un tenant. Todo lo que roce organización/rol es una **costura tipada** (claim reservado, evento publicado), no una implementación. Un slice está *hecho* solo cuando su SC asociado es reproducible con un comando (sin E2E: el repo no tiene runner de navegador, así que toda verificación es `vitest`/`grep`/`tsc`/`lint`).

## 2. Stack y versiones

| Área | Elección | Versión objetivo | Racional (detalle en [research.md](research.md)) |
|---|---|---|---|
| Autenticación | Auth.js (`next-auth`) v5 | `5.0.0-beta.x` (fijar) | Control del schema; confinado en `infrastructure/auth` (R1, R7). |
| Adapter DB | `@auth/prisma-adapter` | compatible con v5 | Persiste `User`/`Account`/`VerificationToken` (R6). |
| Hashing | bcrypt (`bcryptjs` **o** `@node-rs/bcrypt`) | — | Puerto `PasswordHasher`; solo Node (R3). |
| Estrategia de sesión | JWT | — | Forzada por Credentials + regla Edge (D1, R2). |
| Validación | Zod | ^4 (ya instalado) | Frontera de forms + `env` (FR-011). |
| ORM / DB | Prisma 7 + Postgres | ^7 (ya instalado) | `migrate dev`; cliente en `src/generated/prisma`. |
| Email (verificación) | Puerto `EmailSender` + adaptador *fake* | — | Proveedor real (Resend) diferido (R5). |
| Tests | Vitest | ^4 (ya instalado) | `unit` + `integration` (FR-013). |

> **Nota de disciplina (global CLAUDE.md):** en implementación, **antes** de escribir código contra Auth.js v5, `@auth/prisma-adapter`, el hasher o Prisma 7, consultar **Context7** (`resolve-library-id` → `get-library-docs`) para la API vigente. La beta de v5 y el adapter cambian firmas entre versiones; los snippets del SDD son **ilustrativos**.

## 3. Decisiones de diseño (resumen; racional en research.md)

- **D1 — Sesión JWT explícita, sin tabla `Session`.** Credentials exige `strategy:"jwt"` (si no, `UnsupportedStrategy`), y con un adapter presente Auth.js usaría `database` por defecto; se fija `session.strategy:"jwt"` + `maxAge`. Al no usar sesiones en DB, **no** se crea `model Session` (los métodos de sesión del adapter no se llaman). El JWT no es revocable antes de expirar (blocklist diferido). *(FR-003, NFR-011)*
- **D2 — PK `uuid` por Prisma, sin *override* del adapter.** Las tablas de identidad usan `@default(uuid()) @db.Uuid`; el adapter hereda ese id (no hay método que sobrescribir). Se verifica que `PrismaAdapter` *typa* contra el cliente generado (`src/generated/prisma`); si falta el delegate `session`, se usa un cast acotado en el punto de wiring. *(FR-002)*
- **D3 — Auth.js confinado a `infrastructure/auth/**`.** El handler `app/api/auth/[...nextauth]/route.ts` importa `handlers` desde `@/modules/identity` (no `next-auth` directo); la augmentación de tipos vive dentro de `infrastructure/auth/`. El enforcement es **nuevo**: un override de `no-restricted-imports` por **glob** (todo `src/**` excepto `**/infrastructure/auth/**`, también cubre `middleware.ts` no clasificado) + una aserción en `tests/architecture/`. *(FR-003, NFR-002)*
- **D4 — Tablas de identidad NO *tenant-scoped* → sin RLS.** Un `User` es global (existe entre tenants). No llevan `tenantId`, no se les aplica RLS ni `set_config('app.current_tenant')`; solo `GRANT` a `app_user` (que es `NOBYPASSRLS`) para que el adapter y el repositorio puedan operar. *(FR-002)*
- **D5 — Puertos por responsabilidad.** `UserRepository` (repositorio de dominio) vive en `domain/ports/`; `PasswordHasher` y `EmailSender` (servicios técnicos de orquestación) viven en `application/ports/`. Los adaptadores (`prisma-user.repository`, `bcrypt-hasher`, `fake-email-sender`) viven en `infrastructure/`. *(FR-004, FR-007)*
- **D6 — `authorize()` delega en un caso de uso.** El proveedor Credentials no mete lógica en `auth.config`: llama a `AuthenticateCredentialsUseCase`, que verifica en **tiempo constante** (compare contra hash *dummy* si el email no existe) y **sin enumeración**. *(FR-004, NFR-005, NFR-006)*
- **D7 — Vinculación de cuentas: sin auto-link.** `allowDangerousEmailAccountLinking: false`; un Google con email ya registrado por credenciales sigue el camino `OAuthAccountNotLinked`. Se documenta la UX de ese error. *(FR-006)*
- **D8 — Server Actions que componen viven en `app/`, no en `presentation`.** Las boundaries del repo prohíben `presentation → module|infrastructure`, así que una acción que necesita `di` (composition root, capa `module`) **no** puede vivir en `identity/presentation/actions/`. Los Server Actions que componen casos de uso viven en el segmento `app/` (que puede importar `@/modules/identity` = su `index.ts`); `identity/presentation/` alberga los **schemas Zod** y los **componentes de formulario** cliente, que **reciben la acción por props**. El `index.ts` reexporta schemas, errores y una API server-callable. **No se toca `eslint.config.mjs`** (consistente con la decisión de frontera de Fase F). Es una divergencia consciente del árbol literal §6 (`presentation/actions/`) para respetar el enforcement sin aflojarlo. *(FR-008)*
- **D9 — `EventBus` in-memory como costura (ADR-004).** Se materializa el trío `DomainEvent`/`EventBus`/bus in-memory síncrono en `shared`; `RegisterUser` publica `UserRegistered` aunque no haya consumidor (lo consumirá `tenancy` para aprovisionar el workspace). *(FR-010)*
- **D10 — Env fail-fast para OAuth + `APP_URL`.** `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` requeridos (con *placeholders* en `.env.example`); `APP_URL` con default para el enlace de verificación. Se extiende `env.schema.ts` (no se toca `env.ts`, que solo reexporta). *(FR-011)*

## 4. Plan por slices

> **Fase 0 (pre-slices) — Preparación.** Instalar `next-auth@5`/`@auth/prisma-adapter`/hasher; extender `env.schema.ts` + `.env.example` (Google + `APP_URL`); confirmar API con Context7. *(FR-011)*

### Slice A — Costura de eventos en `shared` *(FR-010)*
`shared/domain/domain-event.ts` (base), `shared/application/event-bus.ts` (puerto), `shared/infrastructure/in-memory-event-bus.ts` (síncrono). Sin imports de framework/infra en el puerto ni en la base.
**Verificación:** unit del bus (publica → los handlers registrados reciben el evento); el test de arquitectura confirma pureza del puerto.

### Slice B — Data model de identidad *(FR-002 → SC-003, SC-013)*
`schema.prisma`: `User`/`Account`/`VerificationToken` (uuid, sin `tenantId`, **sin `Session`**). Migración `--create-only`, **editar el SQL** para añadir `GRANT SELECT, INSERT, UPDATE, DELETE` a `app_user` en las tres tablas (**sin** RLS). Aplicar con `migrate dev`.
**Verificación:** `migrate status` ≥ 2 migraciones; `grep "model Session"` vacío; `typecheck` en verde con el cliente regenerado.

### Slice C — Dominio de `identity` *(FR-001, FR-004, FR-005 → SC-004, SC-005)*
VOs `Email` (normaliza)/`Password` (≤72 bytes)/`PasswordHash`; entidad `User` (id `UserId` branded, factory `Result`); puerto `UserRepository` (`domain/ports`); errores (`InvalidEmailError`, `WeakPasswordError`, `InvalidCredentialsError`, `EmailAlreadyRegisteredError`, `InvalidVerificationTokenError`); evento `UserRegistered`.
**Verificación:** unit de `Email`/`Password` en verde (SC-004, SC-005).

### Slice D — Casos de uso *(FR-004, FR-007, FR-012 → SC-006, SC-007, SC-008, SC-009)*
Puertos `PasswordHasher`/`EmailSender` (`application/ports`); casos de uso `RegisterUser`, `AuthenticateCredentials`, `RequestEmailVerification`, `VerifyEmail`, `GetCurrentUser`; helper puro `resolveInternalRedirect`. Tests con `InMemoryUserRepository` + `FakeHasher`/`FakeEmailSender`/`FakeEventBus`.
**Verificación:** unit en verde: duplicado→error + hash + evento (SC-006); no-enumeración + tiempo constante (SC-007); verificación (SC-008); redirect seguro (SC-009).

### Slice E — Infraestructura + Auth.js *(FR-003, FR-006, FR-009, FR-013 → SC-002, SC-011, SC-013, SC-015)*
`PrismaUserRepository` + `user.mapper.ts`, `BcryptHasher`, `FakeEmailSender`; `auth.config.ts` (Credentials → `AuthenticateCredentials`, Google, `PrismaAdapter` → cliente generado, `strategy:"jwt"` + `maxAge`, callbacks `jwt`/`session` con claims reservados, `allowDangerousEmailAccountLinking:false`); augmentación de tipos en `infrastructure/auth/`; `di.ts`; `index.ts` (exporta `handlers`/`auth`/`signIn`/`signOut`, schemas, errores, tipo de sesión); handler `app/api/auth/[...nextauth]/route.ts`; **override ESLint de confinamiento + aserción en `tests/architecture/`**; test de integración del camino del adapter.
**Verificación:** arch-test bloquea imports de Auth.js fuera de `infrastructure/auth` (SC-002); `typecheck` accede a `session.user.id`/reservados (SC-011); integración del adapter en verde (SC-013); config assertion (SC-015).

### Slice F — Presentation + `app/` *(FR-007, FR-008, FR-012)*
`presentation/schemas/` (Zod register/login); `presentation/components/` (forms cliente que reciben la acción por props); **Server Actions en `app/`** (register/login/logout, componen vía `@/modules/identity`); páginas `(public)/{login,register,verify-email}`; `(private)/layout.tsx` (gate con `auth()`) + `(private)/profile/page.tsx` (+ logout); `config/routes.ts` (públicas/privadas).
**Verificación:** manual + `typecheck`/`lint`; el gate del layout usa `auth()` (queda cubierto por SC-012 en Slice G).

### Slice G — Middleware + env final *(FR-008, FR-011 → SC-010, SC-012)*
`middleware.ts` (Edge): redirección por **presencia de la cookie** de sesión usando `config/routes.ts`, con `matcher` excluyendo estáticos; **sin** Prisma ni Auth.js. Cierre del `env` de Google.
**Verificación:** `grep` en `middleware.ts` sin Prisma/Auth.js (SC-012); `AUTH_GOOGLE_ID= pnpm build` aborta (SC-010).

### Slice H — Arquitectura + cierre *(NFR-001, NFR-002, NFR-010 → SC-001, SC-002, SC-014)*
Verificar con imports-trampa: dominio sin Auth.js/Prisma (SC-001), confinamiento (SC-002), deep-import (SC-014). Registrar **ADR-007** en `../../spec.md §8`. Marcar el checklist al 100% y el `Estado` del spec a "Implementado".

## 5. Estructura entregada (subconjunto de la constitución §6)

```
chart-wise/
├── prisma/
│   ├── schema.prisma                         # + User, Account, VerificationToken (uuid, sin Session)
│   └── migrations/<ts>_add_identity_tables/   # GRANT a app_user; sin RLS
├── src/
│   ├── middleware.ts                         # Edge: redirect por cookie (sin Prisma/Auth.js)
│   ├── config/
│   │   ├── env.schema.ts                      # + AUTH_GOOGLE_ID/SECRET, APP_URL
│   │   └── routes.ts                          # públicas / privadas
│   ├── shared/
│   │   ├── domain/domain-event.ts
│   │   ├── application/event-bus.ts           # puerto
│   │   └── infrastructure/in-memory-event-bus.ts
│   ├── app/
│   │   ├── (public)/{login,register,verify-email}/page.tsx
│   │   ├── (public)/actions/{register,login,logout}.action.ts   # "use server" (componen di)
│   │   ├── (private)/layout.tsx               # exige sesión vía auth()
│   │   ├── (private)/profile/page.tsx
│   │   └── api/auth/[...nextauth]/route.ts     # importa handlers de @/modules/identity
│   └── modules/identity/
│       ├── domain/
│       │   ├── entities/user.ts
│       │   ├── value-objects/{email.ts,password.ts,password-hash.ts}
│       │   ├── events/user-registered.event.ts
│       │   ├── errors/
│       │   └── ports/user.repository.ts
│       ├── application/
│       │   ├── ports/{password-hasher.ts,email-sender.ts}
│       │   ├── use-cases/{register-user,authenticate-credentials,request-email-verification,verify-email,get-current-user}.ts
│       │   └── redirect/resolve-internal-redirect.ts
│       ├── infrastructure/
│       │   ├── persistence/{prisma-user.repository.ts,mappers/user.mapper.ts,in-memory-user.repository.ts}
│       │   ├── auth/{auth.config.ts,next-auth.d.ts}      # Auth.js CONFINADO aquí
│       │   ├── crypto/bcrypt-hasher.ts
│       │   └── email/fake-email-sender.ts
│       ├── presentation/
│       │   ├── schemas/{register.schema.ts,login.schema.ts}
│       │   └── components/{register-form.tsx,login-form.tsx}
│       ├── di.ts
│       └── index.ts                           # API pública (handlers, auth, use-cases, schemas, errores, tipos)
└── tests/
    ├── unit/identity/                         # VOs, casos de uso, resolveInternalRedirect
    ├── architecture/                          # + aserción de confinamiento de Auth.js
    └── integration/identity/                  # camino del adapter como app_user
```

## 6. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Auth.js v5 en **beta**: firmas que cambian | El código no compila / rompe en runtime | Fijar versión; confinar en `infrastructure/auth/**` (SC-002); confirmar con Context7 |
| Adapter con estrategia por defecto `database` sin tabla `Session` | Login OAuth rompe en runtime | Fijar `session.strategy:"jwt"` explícito (SC-015) |
| `PrismaAdapter` *typa* contra `@prisma/client`, no contra el cliente generado | Error de tipos en el wiring | Cast acotado en el punto de composición; verificar en Slice E |
| `GRANT` olvidado en las tablas nuevas (no hay privilegios por defecto) | `permission denied` para `app_user` | Migración añade `GRANT` a las 3 tablas; SC-013 ejercita el camino del adapter |
| Enumeración por temporización aunque el mensaje sea el mismo | Un atacante deduce cuentas | `compare` contra hash *dummy* en tiempo constante (SC-007) |
| `bcrypt` nativo requiere *build tools* en Windows | `pnpm install` falla | Preferir `bcryptjs` (puro JS) o `@node-rs/bcrypt` (napi prebuilt) (R3) |
| Server Action que compone metida en `presentation` | Rompe boundaries o tienta a aflojar ESLint | Acciones que componen en `app/`; `presentation` solo schemas + forms (D8) |
| Secreto OAuth con `NEXT_PUBLIC_` o fuera de `server-only` | Fuga al bundle | `env.schema` + `server-only`; nunca `NEXT_PUBLIC_` (NFR-008) |

## 7. Definición de "hecho" (fase)

La Fase 2 está completa cuando **todos** los SC-001..SC-015 son verdes de forma reproducible, [checklists/requirements.md](checklists/requirements.md) está íntegramente marcado, **ADR-007** está registrado en la constitución, y el `Estado` de [spec.md](spec.md) es "Implementado". Verificación end-to-end en [quickstart.md](quickstart.md).
