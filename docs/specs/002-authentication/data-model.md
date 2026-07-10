# Fase 2 — Modelo de datos

- **Feature:** `002-authentication`
- **Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md)
- **Referencia:** ADR-006 de la [constitución](../../spec.md) (IDs `uuid`) + [../../data-model.md](../../data-model.md) §1 (entidades de `identity`).

> **Contraste con la Fase 1.** `Note` es *tenant-scoped* (lleva `tenantId` + RLS). Las tablas de identidad **no** lo son: un `User` es una **identidad global** que existe entre tenants (Ana es la misma persona en dos organizaciones). Por eso `User`/`Account`/`VerificationToken` **no** llevan `tenantId`, **no** tienen RLS ni `set_config('app.current_tenant')`, y **no** declaran el par `@@index([tenantId])` + `@@unique([tenantId, id])`. Solo necesitan `GRANT` para que `app_user` opere.

---

## 1. Entidades

### 1.1 `User` (identidad global)
Una persona. Existe aunque no pertenezca a ninguna organización (la membresía es de `tenancy`). Es lo que Auth.js exige como raíz de identidad.

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` (PK) | `@default(uuid())`; el adapter y `RegisterUser` (`crypto.randomUUID()`) lo generan |
| `email` | `text` UNIQUE | **normalizado** (minúsculas + `trim`) por el VO `Email`; único global |
| `name` | `text?` | opcional (Google lo rellena; credenciales puede omitirlo) |
| `image` | `text?` | opcional (avatar de OAuth) |
| `passwordHash` | `text?` | bcrypt `$2*`; **`null`** en cuentas solo-OAuth (sin credenciales) |
| `emailVerified` | `timestamptz?` | `null` = no verificado; Google lo fija al crear; credenciales lo fija en `VerifyEmail` |
| `createdAt` | `timestamptz` | default `now()` |

**Índices:** `@unique` en `email`. **Sin** `tenantId`, **sin** RLS.

### 1.2 `Account` (proveedor OAuth vinculado)
Forma estándar del adapter de Auth.js. Vincula un proveedor externo (Google) a un `User`. Un usuario solo-credenciales no tiene filas aquí.

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` (PK) | `@default(uuid())` |
| `userId` | `uuid` (FK → `User.id`) | `onDelete: Cascade` |
| `provider` · `providerAccountId` | `text` | identifican la cuenta externa |
| `type`, `access_token`, `refresh_token`, `expires_at`, `token_type`, `scope`, `id_token`, `session_state` | según adapter | campos OAuth estándar (nombres tal cual los espera Auth.js) |

**Índices:** `@@unique([provider, providerAccountId])` (una cuenta externa → un `User`). **Sin** `tenantId`, **sin** RLS.

### 1.3 `VerificationToken` (verificación de email)
Forma estándar del adapter (clave compuesta, **sin** `id` propio: es lo que el adapter espera).

| Campo | Tipo | Reglas |
|---|---|---|
| `identifier` | `text` | el email a verificar |
| `token` | `text` | secreto de un solo uso |
| `expires` | `timestamptz` | expiración; un token vencido se rechaza |

**Índices:** `@@unique([identifier, token])`. Un token de **otro** `identifier` no verifica al usuario objetivo (SC-008). **Sin** `tenantId`, **sin** RLS.

> **No hay `Session`.** La estrategia es JWT (R2/D1); el adapter no usa la tabla `Session`. Crearla sería modelar algo que nunca se lee.

## 2. `schema.prisma` (ilustrativo)

> **Prisma 7 + Auth.js v5.** Las URLs de conexión no van en el schema (ver Fase 1). Los nombres de columna de `Account` son los que **exige** el adapter; confirmar la forma exacta con Context7 (`@auth/prisma-adapter`).

```prisma
model User {
  id            String    @id @default(uuid()) @db.Uuid
  email         String    @unique
  name          String?
  image         String?
  passwordHash  String?                                  // null = cuenta solo-OAuth
  emailVerified DateTime? @db.Timestamptz(6)
  createdAt     DateTime  @default(now()) @db.Timestamptz(6)
  accounts      Account[]
}

model Account {
  id                String   @id @default(uuid()) @db.Uuid
  userId            String   @db.Uuid
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime @db.Timestamptz(6)

  @@unique([identifier, token])
}
// NB: sin `model Session` (estrategia JWT).
```

**Wiring del adapter (infraestructura, confinado en `identity/infrastructure/auth/`).** El `PrismaAdapter` recibe el cliente generado; en modo JWT no se invocan sus métodos de sesión (puede requerir un cast acotado si el tipo espera un delegate `session`):

```ts
// src/modules/identity/infrastructure/auth/auth.config.ts (ilustrativo — confirmar con Context7)
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
// ...cliente Prisma generado + providers Credentials/Google

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),          // persiste User/Account/VerificationToken
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },  // JWT explícito + maxAge
  pages: { signIn: "/login" },
  providers: [/* Credentials → AuthenticateCredentials; Google (allowDangerousEmailAccountLinking:false) */],
  callbacks: { /* jwt/session: exponen user.id/emailVerified; reservan activeTenantId?/role? */ },
});
```

## 3. Privilegios (en vez de RLS): `GRANT` a `app_user`

Las tablas de identidad **no** están bajo RLS (no son *tenant-scoped*). Pero la migración `init` de Fase 1 otorgó privilegios **tabla por tabla** y **no** usó `ALTER DEFAULT PRIVILEGES`, así que una tabla nueva nace **sin** privilegios para `app_user`. La migración de identidad DEBE otorgarlos explícitamente:

```sql
-- Identidad: NO tenant-scoped → SIN RLS. Solo privilegios para el rol de app (NOBYPASSRLS).
GRANT SELECT, INSERT, UPDATE, DELETE ON "User" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Account" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "VerificationToken" TO app_user;
```

- `Account`/`VerificationToken` necesitan `DELETE` (desvincular cuenta, consumir token).
- Como los `id` los genera el **motor de Prisma** (`@default(uuid())`, no `serial`), **no** hacen falta `GRANT` sobre secuencias.
- Verificación: el camino del adapter (`createUser`/`linkAccount`/`getUserByAccount`, `createVerificationToken`/`useVerificationToken`) corre como `app_user` y **funciona** (SC-013); sin los `GRANT`, falla con `permission denied`.

## 4. Contrato de sesión y augmentación de tipos (`next-auth`)

La sesión JWT expone la identidad y **reserva** los claims de tenant/rol (costura para `tenancy`, sin poblar en Fase 2). La augmentación vive **dentro** de `infrastructure/auth/` (confinamiento, NFR-002) y es global una vez incluida en la compilación.

```ts
// src/modules/identity/infrastructure/auth/next-auth.d.ts (ilustrativo)
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; emailVerified: Date | null } & DefaultSession["user"];
    activeTenantId?: string;   // RESERVADO (lo poblará tenancy)
    role?: string;             // RESERVADO (lo poblará tenancy)
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    emailVerified?: number | null;
    activeTenantId?: string;   // RESERVADO
    role?: string;             // RESERVADO
  }
}
```

`session.user.id` y los reservados compilan en cualquier `page.tsx`/caso de uso (SC-011); `@/modules/identity` reexporta el tipo de sesión para uso explícito.

## 5. Value objects, entidad y evento (dominio puro)

Formas mínimas (implementación en [tasks.md](tasks.md)). Devuelven `Result`, nunca lanzan para errores esperados.

```ts
// src/modules/identity/domain/value-objects/email.ts
export class Email { /* create(raw): Result<Email, InvalidEmailError>  — normaliza a lowercase+trim */ }

// src/modules/identity/domain/value-objects/password.ts
export class Password { /* create(plain): Result<Password, WeakPasswordError> — min 8, <= 72 bytes (bcrypt) */ }

// src/modules/identity/domain/value-objects/password-hash.ts
export class PasswordHash { /* envuelve un hash `$2*`; nunca serializa al cliente */ }

// src/modules/identity/domain/events/user-registered.event.ts
export class UserRegistered /* extends DomainEvent */ { /* { userId, email, occurredAt } */ }
```

`User.create(...)` devuelve `Result<User, DomainError>`; `RegisterUser` compone `Email` + `PasswordHash` (vía `PasswordHasher`), persiste y publica `UserRegistered`.

## 6. Relaciones y ciclo de vida

- `User 1 — N Account` (borrado en cascada de `Account` al borrar `User`).
- `VerificationToken` es efímero: se crea en *request*, se consume (borra) en *verify*, o expira.
- **Fuera de esta fase:** `User 1 — N Membership N — 1 Tenant` (relación de `tenancy`); aquí `User` no referencia `Tenant`. El `TenantContext.userId` (Fase 1) pasa a estar respaldado por un `User` real, pero el `tenantId` sigue viniendo de `tenancy` en fases posteriores.

## 7. Verificación asociada

| Elemento | Cómo se verifica | SC |
|---|---|---|
| Tablas `User`/`Account`/`VerificationToken` sin `Session` | migración aplicada + `grep "model Session"` vacío | SC-003 |
| `GRANT` a `app_user` en las 3 tablas | camino del adapter como `app_user` funciona (createUser/linkAccount/verifyToken) | SC-013 |
| `Email` normaliza y valida | unit: `"  A@B.com "` → `a@b.com`; inválido → `DomainError` | SC-004 |
| `Password` rechaza `> 72 bytes` | unit: contraseña larga → `WeakPasswordError` | SC-005 |
| Hash nunca en claro | unit: `RegisterUser` persiste `$2*`, no el texto | SC-006 |
| Contrato de sesión + reservados | `typecheck` accede a `session.user.id`/`activeTenantId?`/`role?` | SC-011 |
