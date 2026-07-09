-- Retrofit ADR-006 (define ahora, usa después). Migración ADITIVA:
--   Tenant  -> i18n (timezone/currency/locale), previousSlugs[], deletedAt (soft delete).
--   Note    -> índice único (tenantId, id) para FKs tenant-safe.
-- No toca RLS: la policy/grants del init aplican solo a Note y siguen intactos.
-- Tenant no está bajo RLS; las columnas traen DEFAULT -> las filas existentes no rompen.
-- El GRANT SELECT ON "Tenant" y GRANT ... ON "Note" son a nivel de tabla: cubren
-- automáticamente las columnas nuevas y el índice nuevo (no requieren grants extra).

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "deletedAt" TIMESTAMPTZ(6),
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'es',
ADD COLUMN     "previousSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- CreateIndex
CREATE UNIQUE INDEX "Note_tenantId_id_key" ON "Note"("tenantId", "id");
