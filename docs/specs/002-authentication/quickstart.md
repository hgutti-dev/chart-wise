# Fase 2 — Quickstart

- **Feature:** `002-authentication`
- **Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md) · **Data model:** [data-model.md](data-model.md)

> Recorrido reproducible para levantar la autenticación y **verificar cada Criterio de Éxito** con un comando. Parte de la Fase 1 ya funcionando. No hay runner E2E: toda verificación es `vitest`/`grep`/`tsc`/`lint`.

---

## 0. Requisitos previos
- Fase 1 completa (Postgres arriba, `migrate` aplicado, `.env` con `AUTH_SECRET`/`DATABASE_URL`/`DIRECT_URL`).
- Node ≥ 20 · `pnpm` · Docker Desktop.
- (Para el flujo real de Google) un **OAuth client** en Google Cloud Console.

## 1. Instalar dependencias
```bash
pnpm add next-auth@beta @auth/prisma-adapter bcryptjs
pnpm add -D @types/bcryptjs
```
> Fijar la versión beta de `next-auth` (evita *breaking changes* sorpresa). Si el rendimiento del hash lo pide, cambiar `bcryptjs` por `@node-rs/bcrypt` (napi prebuilt) — el puerto `PasswordHasher` aísla la elección. Confirmar APIs con **Context7**.

## 2. Variables de entorno
Añadir a `.env` (y *placeholders* a `.env.example`):
```dotenv
# --- ya de la Fase 1 ---
AUTH_SECRET=<openssl rand -base64 32>
DATABASE_URL=postgresql://app_user:app_pw@localhost:5432/chartwise
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/chartwise
# --- nuevas en Fase 2 ---
APP_URL=http://localhost:3000
AUTH_GOOGLE_ID=<client-id de Google Cloud>
AUTH_GOOGLE_SECRET=<client-secret de Google Cloud>
```
> **No** commitees `.env`. Solo `.env.example` (con *placeholders*, sin secretos) va al repo. `AUTH_GOOGLE_*` se validan fail-fast (SC-010); para trabajo local sin OAuth real, sirven valores *placeholder* (los tests no dependen de un login vivo de Google).

**Google OAuth (para el flujo real):** en Google Cloud Console → *Credentials* → *OAuth client ID* (Web), añadir el *redirect URI*:
```
http://localhost:3000/api/auth/callback/google
```

## 3. Migración de identidad (User / Account / VerificationToken)
```bash
pnpm db:migrate   # prisma migrate dev  → crea las 3 tablas (uuid), sin Session
```
> La migración añade `GRANT SELECT, INSERT, UPDATE, DELETE` a `app_user` en las tres tablas (sin RLS: no son *tenant-scoped*). Si el adapter da `permission denied`, falta un `GRANT` (ver data-model §3). ⛔ **Nunca** `prisma db push`.

## 4. Verificaciones (mapa comando → Criterio de Éxito)

| # | Comando | Resultado esperado | SC |
|---|---|---|---|
| 1 | `pnpm typecheck` | Verde; compila accediendo a `session.user.id` y a `activeTenantId?`/`role?` | SC-011 |
| 2 | `pnpm lint` | **Falla** si `identity/domain/**` importa `@auth/*`/`next-auth`/`@prisma/client` | SC-001 |
| 3 | `pnpm lint` (o `pnpm test`) | **Falla** si `@auth/*`/`next-auth` se importa fuera de `**/infrastructure/auth/**` | SC-002 |
| 4 | `pnpm lint` | **Falla** ante un *deep-import* `@/modules/identity/domain/...` | SC-014 |
| 5 | `pnpm db:migrate` | Crea `User`/`Account`/`VerificationToken` (uuid) | SC-003 |
| 6 | `grep -R "model Session" prisma/schema.prisma` | **Sin coincidencias** | SC-003 |
| 7 | `AUTH_GOOGLE_ID= pnpm build` | **Aborta** nombrando `AUTH_GOOGLE_ID` | SC-010 |
| 8 | `grep -R "prisma\|next-auth\|@auth" src/middleware.ts` | **Sin coincidencias** | SC-012 |
| 9 | `pnpm test` | Unit: `Email`/`Password`/`RegisterUser`/`AuthenticateCredentials`/`VerifyEmail`/`resolveInternalRedirect` en verde | SC-004, SC-005, SC-006, SC-007, SC-008, SC-009 |
| 10 | `pnpm test` | Integración: camino del adapter como `app_user` (createUser/linkAccount/verifyToken) | SC-013 |
| 11 | `pnpm test` | Config assertion: `strategy:"jwt"` + `maxAge` + `allowDangerousEmailAccountLinking:false` | SC-015 |

## 5. Prueba manual del flujo (opcional, no verifica SC)
```bash
pnpm dev
# 1. /register  → crea User (email+contraseña); revisa la consola: el FakeEmailSender "envía" el enlace de verificación.
# 2. Abre el enlace /verify-email?token=...&email=... → emailVerified queda fijado.
#    (el email/identifier va en el enlace: el token se consume por la clave compuesta (identifier, token), SC-008).
# 3. /login (credenciales o Google) → redirige a /profile (área privada).
# 4. Logout desde /profile → vuelve a público; /profile sin sesión redirige a /login.
```

## 6. Comandos de referencia (scripts de `package.json`)
Fase 2 **no** añade scripts nuevos; reutiliza los de la Fase 1:
```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed"
  }
}
```

## 7. Definición de "hecho" (Fase 2)
La fase está completa cuando:
- [ ] `pnpm typecheck` verde con el contrato de sesión (SC-011).
- [ ] `pnpm lint` verde y SC-001/SC-002/SC-014 demostrados con imports-trampa.
- [ ] `pnpm db:migrate` crea las 3 tablas sin `Session` (SC-003).
- [ ] `AUTH_GOOGLE_ID= pnpm build` aborta (SC-010) y `middleware.ts` sin Prisma/Auth.js (SC-012).
- [ ] `pnpm test` verde: unit (SC-004, SC-005, SC-006, SC-007, SC-008, SC-009), integración del adapter (SC-013), config (SC-015).
- [ ] **ADR-007** registrado en [../../spec.md](../../spec.md) §8.
- [ ] [checklists/requirements.md](checklists/requirements.md) al 100%.

## 8. Troubleshooting
- **`UnsupportedStrategy` / login OAuth rompe** → falta fijar `session.strategy:"jwt"`. Con un adapter presente Auth.js usa `database` por defecto, y no existe tabla `Session`. Fíjalo explícito (SC-015).
- **`permission denied for table "User"` (o Account/VerificationToken)** → falta el `GRANT` a `app_user` en la migración (no hay privilegios por defecto para tablas nuevas). Ver [data-model.md](data-model.md) §3.
- **Error de tipos al pasar el cliente generado a `PrismaAdapter`** → el adapter *typa* contra `@prisma/client`; usa un cast acotado en el wiring (en modo JWT los métodos de `Session` no se llaman). Confirmar con Context7.
- **`bcrypt` no instala en Windows** → usa `bcryptjs` (JS puro, sin *build*) o `@node-rs/bcrypt` (binarios prebuilt); nunca el `bcrypt` nativo (node-gyp).
- **Google devuelve `redirect_uri_mismatch`** → el *redirect URI* de Google Cloud debe ser exactamente `http://localhost:3000/api/auth/callback/google`.
- **`@auth/*` importado fuera de `infrastructure/auth` rompe el lint** → es lo esperado (confinamiento NFR-002). Importa `handlers`/`auth`/`signIn` desde `@/modules/identity`.
