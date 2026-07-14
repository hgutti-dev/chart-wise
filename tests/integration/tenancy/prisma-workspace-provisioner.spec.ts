import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import {
  asMembershipId,
  Membership,
} from "@/modules/tenancy/domain/entities/membership";
import { Tenant } from "@/modules/tenancy/domain/entities/tenant";
import { PrismaMembershipRepository } from "@/modules/tenancy/infrastructure/persistence/prisma-membership.repository";
import { PrismaWorkspaceProvisioner } from "@/modules/tenancy/infrastructure/persistence/prisma-workspace-provisioner";
import { asTenantId } from "@/shared/domain/tenant-id";

// Integración: la provisión real como app_user crea Tenant + Membership(OWNER) en una transacción
// (prueba el GRANT INSERT sobre Tenant y el WITH CHECK de la policy de memberships).
const appUrl = process.env.DATABASE_URL;
const ownerUrl = process.env.DIRECT_URL;
if (!appUrl || !ownerUrl) {
  throw new Error(
    "DATABASE_URL/DIRECT_URL no definidas. Levanta la DB (pnpm db:up && pnpm db:migrate) y revisa .env.",
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: appUrl }) });
// Cliente owner solo para limpiar: app_user no tiene DELETE en Tenant (borrar el Tenant hace
// cascada sobre su Membership).
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: ownerUrl }) });

const provisioner = new PrismaWorkspaceProvisioner(prisma);
const memberships = new PrismaMembershipRepository(prisma);

const tenantId = asTenantId(crypto.randomUUID());
const userId = crypto.randomUUID();

describe("PrismaWorkspaceProvisioner como app_user", () => {
  afterAll(async () => {
    await owner.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
    await owner.$disconnect();
  });

  it("aprovisiona Tenant + Membership(OWNER) atómicamente", async () => {
    const tenant = Tenant.create({
      id: tenantId,
      slug: `ws-${crypto.randomUUID().slice(0, 12)}`,
      name: "Workspace de prueba",
      createdAt: new Date(),
    });
    const ownerMembership = Membership.create({
      id: asMembershipId(crypto.randomUUID()),
      tenantId,
      userId,
      role: "OWNER",
      createdAt: new Date(),
    });

    await provisioner.provision(tenant, ownerMembership);

    // El Tenant existe (app_user tiene SELECT sobre Tenant, sin RLS).
    const persistedTenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    expect(persistedTenant?.slug).toBe(tenant.slug);

    // La Membership existe con rol OWNER en el nuevo tenant (ruta scoped).
    expect(await memberships.findRole(userId, tenantId)).toBe("OWNER");
  });
});
