-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Note_tenantId_idx" ON "Note"("tenantId");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS multitenant (editado a mano: Prisma no modela RLS). Ver data-model.md §3.
-- ─────────────────────────────────────────────────────────────────────────────

-- Rol de la app: SIN bypass de RLS. La app conecta con este rol (DATABASE_URL),
-- nunca con el owner. La password 'app_pw' es un fixture LOCAL de desarrollo;
-- en producción/Neon el rol y su credencial se provisionan fuera de la migración.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_pw' NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Note" TO app_user;
GRANT SELECT ON "Tenant" TO app_user;

-- RLS habilitada Y forzada (aplica también al owner de la tabla).
ALTER TABLE "Note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Note" FORCE ROW LEVEL SECURITY;

-- Policy: cada sesión solo ve/escribe filas de su tenant activo (SET LOCAL app.current_tenant).
-- Sin fijarlo, current_setting(...,true) = NULL -> no matchea -> niega todo (0 filas).
CREATE POLICY tenant_isolation ON "Note"
  USING ("tenantId" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid);
