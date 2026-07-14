import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import {
  asMembershipId,
  Membership,
} from "@/modules/tenancy/domain/entities/membership";
import { PrismaMembershipRepository } from "@/modules/tenancy/infrastructure/persistence/prisma-membership.repository";
import { asTenantId } from "@/shared/domain/tenant-id";

// Integración como app_user (NOBYPASSRLS): prueba SC-008. Que create + findRole + listByUser +
// findActive funcionen prueba que los GRANT existen y que las policies scoped/por-usuario dejan
// pasar sus rutas. Requiere Postgres con la migración aplicada + tenant-a sembrado.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL no está definida. Levanta la DB (pnpm db:up && pnpm db:migrate && pnpm db:seed) y revisa .env.",
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const repo = new PrismaMembershipRepository(prisma);

let tenantAId: string;
const userId = crypto.randomUUID();
const membershipId = crypto.randomUUID();

describe("PrismaMembershipRepository como app_user (SC-008)", () => {
  beforeAll(async () => {
    tenantAId = (
      await prisma.tenant.findUniqueOrThrow({ where: { slug: "tenant-a" } })
    ).id;
    await repo.create(
      Membership.create({
        id: asMembershipId(membershipId),
        tenantId: asTenantId(tenantAId),
        userId,
        role: "OWNER",
        createdAt: new Date(),
      }),
    );
  }, 30_000);

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantAId}, true)`;
      await tx.$executeRaw`DELETE FROM "memberships" WHERE id = ${membershipId}::uuid`;
    });
    await prisma.$disconnect();
  });

  it("findRole resuelve el rol por (userId, tenantId)", async () => {
    expect(await repo.findRole(userId, asTenantId(tenantAId))).toBe("OWNER");
  });

  it("findRole devuelve null para un usuario sin membresía en el tenant", async () => {
    expect(await repo.findRole(crypto.randomUUID(), asTenantId(tenantAId))).toBeNull();
  });

  it("listByUser devuelve las membresías del usuario", async () => {
    const list = await repo.listByUser(userId);
    expect(list).toHaveLength(1);
    expect(list[0]?.role).toBe("OWNER");
    expect(list[0]?.tenantId).toBe(tenantAId);
  });

  it("findActive devuelve la membresía activa del usuario", async () => {
    const active = await repo.findActive(userId);
    expect(active?.tenantId).toBe(tenantAId);
    expect(active?.role).toBe("OWNER");
  });
});
