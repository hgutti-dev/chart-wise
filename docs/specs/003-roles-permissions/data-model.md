# Fase 3 — Modelo de datos

- **Feature:** `003-roles-permissions`
- **Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md)
- **Referencia:** [../../spec.md](../../spec.md) §8 (ADR-002, ADR-006) · [../../data-model.md](../../data-model.md) §1, §4 (D4) (formas conceptuales de `tenancy`).

> **Contraste con las fases previas:** la Fase 1 materializó `Tenant` (raíz, sin `Membership`) + `Note`; la Fase 2 materializó `User`/`Account`/`VerificationToken` (identidad global, sin `tenantId`). La Fase 3 materializa la **relación** usuario↔tenant (`Membership`) — la primera tabla que enlaza ambos mundos — y añade el **dominio de autorización** (roles, permisos, matriz), que es TypeScript puro sin tabla.

---

## 1. Entidades de dominio (sin tabla)

### 1.1 `Role` (value object)
El rol **por membresía** (ADR-002): la misma persona puede ser `OWNER` en un tenant y `VIEWER` en otro. Conjunto **cerrado**.

| Elemento | Valor | Reglas |
|---|---|---|
| Valores | `OWNER`, `ADMIN`, `MEMBER`, `VIEWER` | Cerrado; añadir uno es fácil, quitarlo con clientes usándolo no (PDF §12.1). |
| `Role.create(raw)` | `Result<Role, InvalidRoleError>` | Normaliza (trim, mayúsculas), valida contra el conjunto; inválido → `Result.err`, **no lanza**. |
| Error | `InvalidRoleError extends DomainError` | `code = "tenancy.role.invalid"`. |

Reglas especiales de cada rol (invariantes que **enforcan sus casos de uso**, la mayoría en Fase 5): `OWNER` siempre ≥ 1 por tenant y no puede autoeliminarse si es el último; `ADMIN` no toca facturación ni degrada a un `OWNER`; `MEMBER` solo borra lo que creó; `VIEWER` es solo lectura.

### 1.2 `Permission` (tipo) y la matriz
`Permission` es la **unidad real** de autorización; el código pregunta por permiso, no por rol. Los 13 permisos y su matriz (§12.2 del PDF):

| Permiso | OWNER | ADMIN | MEMBER | VIEWER |
|---|---|---|---|---|
| `dataset:upload` | `all` | `all` | `all` | `false` |
| `analysis:run` | `all` | `all` | `all` | `false` |
| `dashboard:read` | `all` | `all` | `all` | `all` |
| `dashboard:create` | `all` | `all` | `all` | `false` |
| `dashboard:update` | `all` | `all` | `own` | `false` |
| `dashboard:delete` | `all` | `all` | `own` | `false` |
| `dashboard:share` | `all` | `all` | `false` | `false` |
| `member:invite` | `all` | `all` | `false` | `false` |
| `member:remove` | `all` | `all` | `false` | `false` |
| `member:change_role` | `all` | `all` † | `false` | `false` |
| `tenant:update` | `all` | `all` | `false` | `false` |
| `tenant:delete` | `all` | `false` | `false` | `false` |
| `billing:manage` | `all` | `false` | `false` | `false` |

† `member:change_role` de `ADMIN` es `"all"` en la matriz; el invariante **"no a OWNER"** (un `ADMIN` no puede afectar a un `OWNER`) se enforca en el caso de uso `ChangeMemberRole` (**Fase 5**), no en la matriz (R5).

**Forma (ilustrativa):**
```ts
// tenancy/domain/authorization/permission-matrix.ts  (dominio, NO config)
export type Permission =
  | "dataset:upload" | "analysis:run"
  | "dashboard:read" | "dashboard:create" | "dashboard:update"
  | "dashboard:delete" | "dashboard:share"
  | "member:invite" | "member:remove" | "member:change_role"
  | "tenant:update" | "tenant:delete" | "billing:manage";

type Grant = "all" | "own" | false;
export const PERMISSION_MATRIX: Record<Role, Record<Permission, Grant>> = { /* … tabla ↑ … */ };
```

### 1.3 `permission-checker` — `can()` (dominio puro)
```ts
// tenancy/domain/services/permission-checker.ts
export function can(permission: Permission, ctx: AuthContext, resourceOwnerId?: string): boolean {
  const grant = PERMISSION_MATRIX[ctx.role][permission];
  if (grant === "all") return true;
  if (grant === "own") return resourceOwnerId !== undefined && ctx.userId === resourceOwnerId;
  return false; // grant === false
}
```
**Pura y síncrona** (NFR-002): sin DB, sin `async`. Retorno `boolean`, no `Promise`.

### 1.4 `requirePermission` — el guard (aplicación)
```ts
// tenancy/application/authorization/require-permission.ts (o domain/services)
export function requirePermission(
  ctx: AuthContext, permission: Permission, resourceOwnerId?: string,
): Result<void, PermissionDeniedError> {
  return can(permission, ctx, resourceOwnerId) ? ok(undefined) : err(new PermissionDeniedError(permission));
}
```
Se invoca **al inicio** del caso de uso protegido. `PermissionDeniedError extends DomainError` (`code = "tenancy.authorization.denied"`); no revela si el recurso existe (NFR-009).

### 1.5 `AuthContext` (aplicación de `tenancy`)
```ts
// tenancy/application/auth-context.ts
import type { TenantContext } from "@/shared/application/tenant-context";
export interface AuthContext extends TenantContext { readonly role: Role; } // userId pasa a requerido en la práctica
```
Se construye **tras verificar** `Membership(userId, tenantId)`; si no hay membresía, no se construye (→ 404, NFR-009). Los permisos **no** se almacenan: se derivan con `can()` (R2).

## 2. `Membership` (entidad + tabla)

Una persona pertenece a **N** tenants; `UNIQUE(userId, tenantId)` ⇒ un usuario, **un** rol por tenant (ADR-006 D4). Referencia a `User` de `identity` **por id** (no FK a través de módulos en el dominio).

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` (PK) | `@default(uuid()) @db.Uuid`. |
| `tenantId` | `uuid` | Discriminador de aislamiento; `@db.Uuid`. FK tenant-safe a `Tenant`. |
| `userId` | `uuid` | Id del `User` de `identity` (referencia por id, `@db.Uuid`). |
| `role` | `Role` (enum) | `OWNER \| ADMIN \| MEMBER \| VIEWER`. |
| `createdAt` | `timestamptz` | `@default(now())`, UTC. |

**Índices/constraints:** `@@unique([userId, tenantId])` (un rol por tenant) · `@@index([tenantId])` · `@@unique([tenantId, id])` (FK tenant-safe, ADR-006). **Borrado:** *hard* en cascada (D2) — al borrar el `Tenant`, sus `Membership` se borran; no soft delete.

## 3. `schema.prisma` (ilustrativo)
```prisma
enum Role { OWNER ADMIN MEMBER VIEWER }

model Membership {
  id        String   @id @default(uuid()) @db.Uuid
  tenantId  String   @db.Uuid
  userId    String   @db.Uuid
  role      Role
  createdAt DateTime @default(now()) @db.Timestamptz(6)

  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([userId, tenantId])
  @@unique([tenantId, id])
  @@index([tenantId])
  @@map("memberships")
}
// Tenant gana: memberships Membership[]   (relación inversa)
```
> Confirmar con **Context7** la sintaxis de enum + relación + `onDelete` en Prisma 7 antes de escribirlo.

## 4. Privilegios + RLS: GRANT a `app_user` (patrón de `Note`)
`Membership` es *tenant-scoped* ⇒ replica el patrón RLS de `Note`, con la salvedad de la ruta "mis membresías" (R3). SQL **ilustrativo**, editado a mano en la migración `--create-only`:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON "memberships" TO app_user;
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;

-- Ruta scoped normal (por tenant activo):
CREATE POLICY membership_tenant_isolation ON "memberships"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid);

-- Ruta "mis membresías" (por usuario) — forma exacta se cierra en ADR-008:
CREATE POLICY membership_by_user ON "memberships"
  USING ("userId" = current_setting('app.current_user', true)::uuid);
```
> La conjunción/forma exacta de ambas policies (una con `OR` vs. dos con `set_config` distinto) es la decisión de **ADR-008** (R3).

## 5. Contrato de sesión (poblado del claim)
La augmentación de Fase 2 (`identity/infrastructure/auth/next-auth.d.ts`) declara `role?: string` / `activeTenantId?: string` **reservados**. La Fase 3 los **puebla** (R1) y estrecha `role` a la unión literal de `Role`:
```ts
// tenancy/infrastructure/auth/populate-tenant-claims.ts (ilustrativo)
// Recibe MembershipRepository inyectado desde el composition root de app/.
async function populateTenantClaims(token: JWT, membershipRepo: MembershipRepository): Promise<JWT> {
  const active = await membershipRepo.findActive(token.sub); // membresía activa del usuario
  return active ? { ...token, activeTenantId: active.tenantId, role: active.role } : token;
}
```
`identity` **no** importa `tenancy`: la composición ocurre en `app/` (R1). El tipo de `role` en la sesión pasa a `"OWNER" | "ADMIN" | "MEMBER" | "VIEWER"`.

## 6. Puerto `MembershipRepository` (ilustrativo)
```ts
// tenancy/domain/ports/membership.repository.ts
export interface MembershipRepository {
  create(m: Membership): Promise<void>;
  findRole(userId: string, tenantId: TenantId): Promise<Role | null>; // ruta scoped
  listByUser(userId: string): Promise<Membership[]>;                   // ruta "mis membresías"
}
```
Adapter Prisma (`infrastructure/persistence`) con `set_config('app.current_tenant', …)`/`app.current_user`; *fake* en memoria para unit. El repo **no** conoce autenticación: solo el discriminador de aislamiento (patrón de `note.repository`).

## 7. Verificación asociada

| Elemento | Cómo se verifica | SC |
|---|---|---|
| `Role.create` valida el conjunto cerrado | unit | SC-002 |
| Matriz = §12.2 exacta (4×13) | unit (snapshot) | SC-003 |
| `can()` plano (`all`/`false`) | unit | SC-004 |
| `can()` con propiedad (`own`) | unit | SC-005 |
| `requirePermission` → `Result` | unit | SC-006 |
| `Role` enum + `Membership` (unique/índice/RLS/GRANT) | `db:migrate` + `typecheck` + `grep` | SC-007 |
| `MembershipRepository` como `app_user` | integración | SC-008 |
| `Membership` cross-tenant → cero filas | aislamiento | SC-009 |
| `session.role`/`activeTenantId` poblados | `typecheck` | SC-010 |
| Provisión `Tenant`+`Membership(OWNER)` atómica | unit (fakes) | SC-011 |
| Matriz/`can()` constantes y síncronas | unit (assertion) | SC-014 |
