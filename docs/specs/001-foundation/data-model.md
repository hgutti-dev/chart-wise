# Fase 1 — Modelo de datos

- **Feature:** `001-foundation`
- **Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md)
- **Referencia:** ADR-001 de la [constitución](../../spec.md) (shared DB + `tenantId` + RLS).

> El modelo de la Fase 1 es **mínimo a propósito**: solo lo necesario para que la multitenancy exista y esté probada desde la primera migración. `Tenant` es la raíz del aislamiento; `Note` (del módulo `example`) es el agregado *scoped* que demuestra el patrón.

---

## 1. Entidades

### 1.1 `Tenant` (raíz de tenancy)
Ancla del aislamiento. No tiene `tenantId` (es el tenant). En Fase 1 se **siembra** para las pruebas; el módulo `tenancy` real (organizaciones, membresías, invitaciones) llega en una fase posterior.

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` (PK) | generado por la DB |
| `slug` | `text` UNIQUE | identificador legible en URLs |
| `name` | `text` | no vacío |
| `createdAt` | `timestamptz` | default `now()` |

### 1.2 `Note` (módulo `example`, tenant-scoped)
Agregado de referencia. **Placeholder**: se elimina o sustituye cuando lleguen los módulos reales.

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` (PK) | generado por la DB |
| `tenantId` | `uuid` (FK → `Tenant.id`) | **discriminador multitenant**; obligatorio |
| `title` | `text` | no vacío, longitud acotada (validado por el VO `NoteTitle`) |
| `body` | `text` | opcional |
| `createdAt` | `timestamptz` | default `now()` |

**Índices:** `Note(tenantId)` para el filtrado por tenant.
**RLS:** habilitada y forzada sobre `Note` (ver §3).

## 2. `schema.prisma` (ilustrativo)

> Confirmar sintaxis con Context7 (Prisma 6) en implementación.

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled (Neon)
  directUrl = env("DIRECT_URL")     // directa, para migraciones
}

generator client {
  provider = "prisma-client-js"
}

model Tenant {
  id        String   @id @default(uuid()) @db.Uuid
  slug      String   @unique
  name      String
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  notes     Note[]
}

model Note {
  id        String   @id @default(uuid()) @db.Uuid
  tenantId  String   @db.Uuid
  title     String
  body      String?
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
}
```

## 3. RLS: aislamiento desde la primera migración (SQL editado a mano)

Prisma **no** modela RLS: se genera la migración con `prisma migrate dev --create-only` y se **edita el SQL** para añadir estas sentencias. Esta es la parte que hace que la multitenancy sea real y no un `where` opcional.

```sql
-- Rol de la aplicación: SIN privilegios de bypass de RLS.
-- (La conexión de la app usa este rol, no el owner/superusuario.)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN NOBYPASSRLS;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "Note" TO app_user;
GRANT SELECT ON "Tenant" TO app_user;

-- RLS habilitada Y forzada (aplica también al owner de la tabla).
ALTER TABLE "Note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Note" FORCE ROW LEVEL SECURITY;

-- Policy: cada sesión solo ve/escribe filas de su tenant activo.
CREATE POLICY tenant_isolation ON "Note"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);
```

**Contrato de sesión:** antes de tocar tablas *scoped*, el repositorio ejecuta, dentro de la transacción:

```sql
SET LOCAL app.current_tenant = '<tenantId-del-TenantContext>';
```

Si nadie fija `app.current_tenant`, `current_setting(..., true)` devuelve `NULL`, el `USING` no matchea y la policy **niega todo** (ninguna fila) — el fallo seguro es "no ver nada", nunca "ver de más".

## 4. `TenantContext` (shared/application)

Transporta el tenant activo desde el borde (resuelto por `app/`) hasta el repositorio.

```ts
// src/shared/application/tenant-context.ts  (sin framework, sin infra)
export interface TenantContext {
  readonly tenantId: string;
  readonly userId?: string;
}
```

## 5. Primitivas de dominio implicadas

Formas mínimas (detalle de implementación en [tasks.md](tasks.md) T050–T052):

```ts
// src/shared/domain/result.ts
export type Result<T, E> =
  | { readonly ok: true;  readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok  = <T>(value: T): Result<T, never> => ({ ok: true,  value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// src/shared/domain/domain-error.ts
export abstract class DomainError extends Error {
  abstract readonly code: string;
}
```

`Note.create()` devuelve `Result<Note, DomainError>` (p. ej. `EmptyNoteTitleError`) — nunca lanza para el caso de título inválido (error esperado).

## 6. Relaciones y ciclo de vida

- `Tenant 1 — N Note` (borrado en cascada de `Note` al borrar `Tenant`).
- No hay migraciones de datos en Fase 1 más allá del `seed` de tenants A y B para el test de aislamiento (SC-006).

## 7. Verificación asociada

| Elemento | Cómo se verifica | SC |
|---|---|---|
| `tenantId` + RLS en 1ª migración | SQL de la migración contiene `ENABLE`/`FORCE`/`CREATE POLICY` | SC-005 |
| Aislamiento efectivo | Tenant B no ve la `Note` del tenant A → 0 filas | SC-006 |
| RLS forzada al owner | Rol `app_user` `NOBYPASSRLS` + `FORCE ROW LEVEL SECURITY` | NFR-007 |
