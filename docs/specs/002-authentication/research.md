# Fase 2 — Research y decisiones

- **Feature:** `002-authentication`
- **Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md)

> Cada decisión lista: contexto, opción elegida, alternativas descartadas y racional. Las que quedaron abiertas en el [spec.md](spec.md) §11 se cierran aquí. Los snippets de Auth.js/adapter/hasher son ilustrativos: confirmar con Context7 en implementación.

---

## R1 — Proveedor de autenticación: Auth.js v5 *(FR-003)*
- **Contexto:** el modelo de tenancy (roles/membresías) es el núcleo del producto y debe estar **en nuestro schema**; no se puede delegar la identidad a un tercero que se lleve la tenancy.
- **Decisión:** **Auth.js v5** (`next-auth`), self-hosted, con adapter de Prisma. Confinado en `identity/infrastructure/auth/` (R7).
- **Alternativas:**
  - **Clerk / WorkOS:** traen orgs/invitaciones/roles listos, pero el modelo de tenancy viviría en un tercero (vendor lock-in, coste por usuario activo, migración dolorosa). **Descartado**: la tenancy es nuestra ventaja, no un detalle a alquilar.
  - **Better Auth:** self-hosted con plugin de organización/RBAC. **Descartado por ahora**: menos material de referencia y adelantaría autorización, que es de `tenancy`.
  - **Auth propia** (sesiones, CSRF, OAuth, rotación): **descartado**. No es donde está la ventaja competitiva; reimplementar auth es fabricar vulnerabilidades.
- **Racional:** control total del schema (requisito para multitenancy propia) sin vendor lock-in; integra con App Router + Prisma.
- **Versión:** `next-auth@5.0.0-beta.x` **fijada**. La beta introduce *breaking changes*; el confinamiento (R7) reduce el radio de impacto a un directorio.

## R2 — Estrategia de sesión: JWT (no DB) *(FR-003, NFR-011)*
- **Contexto:** el `middleware.ts` corre en Edge (sin Prisma), y el proveedor Credentials de Auth.js **exige** `strategy:"jwt"`.
- **Decisión:** sesión **JWT** con `maxAge` explícito. **No** se crea tabla `Session`. El adapter sigue persistiendo `User`/`Account`/`VerificationToken`.
- **Alternativas:**
  - **Sesiones en DB** (tabla `Session`, revocación inmediata): **descartado** para el MVP — no funciona con Credentials, no se puede leer en Edge sin Prisma, y añade una lectura de DB por request. Se reconsidera "cuando haya clientes enterprise".
  - **JWT con TTL largo, sin refresh:** **descartado** — cambios de permisos tardarían horas; se elige `maxAge` acotado.
- **Racional:** JWT es la única estrategia compatible con Credentials + Edge middleware; el `activeTenantId`/`role` (cuando `tenancy` los pueble) se derivan en callbacks.
- **Nota (trampa):** con un adapter presente, Auth.js usa `database` **por defecto**; hay que fijar `session.strategy:"jwt"` **explícitamente** o el login OAuth rompería al no existir `Session` (SC-015). El JWT **no es revocable** antes de expirar; el blocklist se difiere.

## R3 — Librería de hashing bcrypt *(FR-005, cierra Q1)*
- **Contexto:** la constitución §6 nombra `crypto/bcrypt-hasher.ts`. El hashing corre **solo en Node** (nunca Edge/middleware). El host de desarrollo es **Windows** (win32).
- **Decisión:** implementar el puerto `PasswordHasher` con **bcrypt**. Preferencia: **`bcryptjs`** (JS puro, cero *build*, portable a Linux/Vercel) por defecto; **`@node-rs/bcrypt`** (napi con binarios prebuilt, más rápido) si el rendimiento lo pide. Confirmar API con Context7.
- **Alternativas:** `bcrypt` nativo (node-gyp/MSVC en Windows → alta fricción) **descartado**; `argon2` (más moderno) **descartado por ahora** para ser fiel al `bcrypt-hasher.ts` de la constitución y evitar toolchain nativo.
- **Racional:** un puerto tras interfaz permite cambiar de librería sin tocar el dominio; `bcryptjs` evita fallos de instalación en Windows/CI.
- **Seguridad:** bcrypt **trunca a 72 bytes** → el VO `Password` rechaza entradas más largas (SC-005) en vez de aceptar un truncado silencioso. Coste (rounds) ≥ 10–12.

## R4 — Proveedores y vinculación de cuentas *(FR-004, FR-006)*
- **Contexto:** el MVP (§18 de la guía) pide email+contraseña **y** Google. Un usuario podría registrarse con contraseña y luego entrar con Google con el mismo email.
- **Decisión:** **Credentials** (email+password, bcrypt) + **Google OAuth** (modelo `Account`). Vinculación **sin auto-link** (`allowDangerousEmailAccountLinking: false`, el default seguro): mismo-email/distinto-proveedor sigue el camino `OAuthAccountNotLinked`.
- **Alternativas:**
  - **Magic links:** **descartado** — los usuarios objetivo no son técnicos; no asumir que quieren enlaces mágicos.
  - **Auto-link por email** (`allowDangerousEmailAccountLinking: true`): **descartado** — riesgoso si el proveedor no verifica el email; permite *account takeover*.
- **Racional:** cubrir el MVP sin abrir un vector de secuestro de cuentas; la vinculación explícita/segura se puede añadir después.
- **Nota:** Google marca `emailVerified` desde el email verificado del proveedor; los usuarios de Credentials arrancan **no** verificados (R5).

## R5 — Verificación de email: puerto + adaptador *fake* *(FR-007, cierra parte de Q2)*
- **Contexto:** el MVP incluye verificación de email, pero no hay infraestructura de correo instalada.
- **Decisión:** puerto **`EmailSender`** (en `application/ports`) con adaptador **`FakeEmailSender`** (consola/in-memory); modelar `VerificationToken` + `emailVerified`; flujo completo request/confirm. El enlace se construye con `APP_URL`.
- **Alternativas:** implementar **Resend** ya **descartado** (sin infra/coste aún; se difiere); **sin verificación** **descartado** (el MVP la incluye).
- **Racional:** permite probar el flujo end-to-end sin proveedor real y cambiarlo por Resend enchufando un adaptador. Gating: se **permite** iniciar sesión sin verificar; `emailVerified` queda en la sesión; la regla "no verificado no invita" es de `tenancy`.
- **Seguridad:** el token es de un solo uso, con expiración, ligado al `identifier` (email); un token de otro identifier se rechaza (SC-008).

## R6 — IDs `uuid` vía Prisma, sin *override* del adapter *(FR-002)*
- **Contexto:** ADR-006 cierra **IDs `uuid`** (la RLS castea `::uuid`). El adapter de Auth.js por defecto usa `cuid`/`text`.
- **Decisión:** declarar `id String @id @default(uuid()) @db.Uuid` en `User`/`Account`/`VerificationToken`; el adapter **hereda** ese `@default` (no hay método que sobrescribir). `RegisterUser` (camino credenciales) genera el id con `crypto.randomUUID()`, coherente con `@db.Uuid`.
- **Alternativas:** dejar `cuid` en identidad **descartado** — rompería la convención de proyecto y la coherencia con las tablas *scoped*.
- **Racional:** una sola convención de id en todo el schema; sin sorpresas al relacionar con futuras tablas de `tenancy`.
- **Nota (interplay):** `PrismaAdapter(prisma)` está tipado contra `@prisma/client`; el cliente generado (`src/generated/prisma`) no tiene delegate `session` (no hay `Session`). En modo JWT esos métodos **no se llaman**; si el tipo se queja en el wiring, usar un cast acotado. Confirmar con Context7.

## R7 — Confinamiento de Auth.js + enforcement *(FR-003, NFR-002)*
- **Contexto:** la beta de v5 cambia firmas; la constitución exige que "Auth.js viva AQUÍ" (`infrastructure/auth/`) y que cambiar de proveedor sea cambiar un adaptador.
- **Decisión:** `@auth/*`/`next-auth` solo bajo `**/infrastructure/auth/**`. Enforcement **nuevo**: (a) override de `no-restricted-imports` por **glob** en `eslint.config.mjs` (aplica a `src/**` e `ignores: ["src/modules/*/infrastructure/auth/**"]`, lo que también cubre `middleware.ts` no clasificado por `boundaries/elements`); (b) aserción en `tests/architecture/dependency-rule.spec.ts` que replica la regla.
- **Alternativas:**
  - Nuevo `boundaries/element` `auth-infra` + `boundaries/external`: válido, pero más ceremonia; el override por glob es más directo y cubre archivos sin elemento (middleware). **Reservado** si crecen los casos.
  - Confiar solo en el linter: **descartado** — la constitución (ADR-005) pide linter **y** test.
- **Racional:** el radio de un *breaking change* de la beta queda en un directorio; el handler de `app/api/auth` importa `handlers` vía `@/modules/identity`, y la augmentación de tipos vive en `infrastructure/auth/`, así que **ningún** otro archivo referencia `next-auth` directamente.
- **Nota:** el test de arquitectura existente ya cubre "dominio sin Auth.js" y "sin deep-imports" para módulos nuevos; el confinamiento fuera de `domain/` es la parte **nueva**.

## R8 — `EventBus` in-memory para `UserRegistered` *(FR-010)*
- **Contexto:** `identity` no conoce `tenancy` (ADR-002/003), pero `tenancy` necesitará reaccionar al registro (aprovisionar workspace en B2C). El repo aún no tiene `EventBus`.
- **Decisión:** materializar `DomainEvent` (`shared/domain`), puerto `EventBus` (`shared/application`) y bus in-memory síncrono (`shared/infrastructure`) según ADR-004; `RegisterUser` publica `UserRegistered` (sin consumidor todavía).
- **Alternativas:** **diferir el bus** hasta que haya consumidor **descartado** — se perdería la costura y `RegisterUser` habría que reabrirlo; **acoplar `identity → tenancy`** directamente **descartado** — viola la regla de dirección (ADR-003).
- **Racional:** establece el patrón ADR-004 en el primer emisor real, como Fase 1 estableció patrones con el módulo `example`; la costura permite a `tenancy` enchufarse sin refactor de AuthN.

## R9 — Alcance AuthN-only y trabajo diferido a `tenancy` *(cierra el conflicto con la guía §11)*
- **Contexto:** el §11 de la guía ("Fase 2 — Autenticación") mezcla AuthN con la transacción registro→Tenant→Membership, `role`/`activeTenantId` en el JWT, onboarding/select-org y SwitchActiveTenant.
- **Decisión:** Fase 2 = **solo AuthN** (`identity`). El registro crea **solo** un `User`; los claims de tenant/rol se **reservan** en la sesión pero no se pueblan; onboarding/select-org/switch y el registro→Tenant→Membership se difieren a `tenancy`.
- **Alternativas:** seguir la guía literalmente (crear Tenant/Membership en Fase 2, poblar rol en el JWT) **descartado** — contradice ADR-002 (rol por-membresía en `tenancy`), ADR-003 (`identity` = solo AuthN) y el orden de fases del propio documento (§9: *modelar* en Fase 1, *aplicar* roles en Fase 3, aislamiento en Fase 4).
- **Racional:** mantener `identity` honesto respecto a su responsabilidad; separar *modelar* de *aplicar* abarata el cambio y evita reharcer el JWT cuando llegue `tenancy`.
- **Nota:** se registra **ADR-007** en la constitución para dejar el alcance y los diferidos por escrito (como Fase 1 registró ADR-006).

## R10 — Colocación de Server Actions bajo las boundaries actuales *(FR-008)*
- **Contexto:** el árbol §6 muestra `identity/presentation/actions/`, pero la policy de `eslint-plugin-boundaries` del repo **prohíbe** `presentation → module|infrastructure`; una acción que compone necesita `di` (capa `module`).
- **Decisión:** los Server Actions que **componen** casos de uso viven en `app/` (`app → module` vía `index.ts`). `identity/presentation/` = **schemas Zod** + **componentes de formulario** cliente que **reciben la acción por props**. El `index.ts` reexporta schemas, errores y una API server-callable.
- **Alternativas:** **aflojar `eslint.config.mjs`** (permitir `presentation → module`) **descartado** — se decidió en Fase F no tocar las boundaries para hacer que algo importe; un puerto/costura se compone hacia adentro, no se afloja la regla. **Poner acciones en la raíz del módulo** (`module`) válido pero menos convencional; **reservado**.
- **Racional:** respeta el enforcement sin excepciones; `app/` es el "adaptador de entrada tonto" que compone vía `di`, exactamente como pide §4.3. Es una divergencia consciente del árbol literal.

## R11 — CSRF y enumeración en el registro *(FR-004, NFR-005)*
- **Contexto:** los Server Actions de Next y `signIn()` de Auth.js traen protección CSRF; hacer un endpoint POST a mano la perdería. El registro, además, revela existencia si responde `EmailAlreadyRegistered`.
- **Decisión:** usar `signIn()`/Server Actions (protección CSRF integrada), **no** endpoints POST propios. En el registro se **acepta** devolver `EmailAlreadyRegisteredError` (UX estándar) como trade-off consciente; el **login** sí es no-enumerable (NFR-005/006).
- **Alternativas:** registro silencioso + email "ya tienes cuenta" **descartado por ahora** (más infra de correo; se puede añadir con Resend); endpoint POST manual **descartado** (reinventa CSRF).
- **Racional:** el vector real de enumeración masiva es el login (se protege); el registro con UX clara es aceptable para el MVP y se documenta.

---

## Decisiones cerradas del spec
- **Q1** → R3 (bcrypt: `bcryptjs` por defecto; `@node-rs/bcrypt` si hace falta rendimiento).
- **Q2** → R5/R10 (verificación por puerto + *fake*; secretos de Google requeridos con *placeholders* en `.env.example`).
- **Q3** → R11 (el registro acepta `EmailAlreadyRegistered`; el login es no-enumerable).

## Recordatorio de implementación
Antes de escribir código contra Auth.js v5, `@auth/prisma-adapter`, el hasher o Prisma 7, **consultar Context7** para la API vigente de cada versión (guía global). Los snippets de este SDD son ilustrativos.
