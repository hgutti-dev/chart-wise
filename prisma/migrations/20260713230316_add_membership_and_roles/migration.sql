-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memberships_tenantId_idx" ON "memberships"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_tenantId_key" ON "memberships"("userId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenantId_id_key" ON "memberships"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS multitenant de `memberships` (editado a mano: Prisma no modela RLS). Ver data-model §4 / R3.
-- La forma exacta de las policies (dos policies vs. una con OR) se documenta en ADR-008 (Fase H).
-- ─────────────────────────────────────────────────────────────────────────────

-- app_user (creado en la migración init, NOBYPASSRLS) recibe DML sobre la tabla.
GRANT SELECT, INSERT, UPDATE, DELETE ON "memberships" TO app_user;

-- RLS habilitada Y forzada (aplica también al owner de la tabla).
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;

-- Ruta scoped (por tenant activo): lecturas Y escrituras acotadas al tenant de la sesión.
-- NULLIF(...,'') porque un GUC fijado con set_config(...,true) y deshecho al cerrar la
-- transacción queda como cadena vacía '' (no NULL) en la conexión reusada del pool; sin el
-- NULLIF, ''::uuid rompería (22P02) la ruta "mis membresías" que no fija app.current_tenant.
-- Con NULLIF: '' o ausente -> NULL -> no matchea -> 0 filas (fail-closed).
CREATE POLICY membership_tenant_isolation ON "memberships"
  USING ("tenantId" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK ("tenantId" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- Ruta "mis membresías" (por usuario): SOLO lectura cross-tenant de las membresías propias
-- (base del futuro select-org, Fase 5). FOR SELECT a propósito: no habilita escrituras que
-- puedan saltar el aislamiento por tenant. Requiere fijar app.current_user en esa ruta (Fase E).
CREATE POLICY membership_by_user ON "memberships"
  FOR SELECT
  USING ("userId" = NULLIF(current_setting('app.current_user', true), '')::uuid);
