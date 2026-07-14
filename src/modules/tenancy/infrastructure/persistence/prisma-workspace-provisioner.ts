import type { PrismaClient } from "@/generated/prisma/client";

import type { Membership } from "../../domain/entities/membership";
import type { Tenant } from "../../domain/entities/tenant";
import type { WorkspaceProvisioner } from "../../domain/ports/workspace-provisioner";

// Provisión atómica: `Tenant` + `Membership(OWNER)` en UNA transacción. El `Tenant` es la raíz
// (no está bajo RLS) y `app_user` tiene GRANT INSERT; el `Membership` sí exige fijar
// `app.current_tenant` al nuevo tenant (WITH CHECK de la policy scoped) antes de insertarlo. Si
// cualquier paso falla, la transacción entera revierte -> ni Tenant ni Membership persisten.
export class PrismaWorkspaceProvisioner implements WorkspaceProvisioner {
  constructor(private readonly prisma: PrismaClient) {}

  async provision(tenant: Tenant, ownerMembership: Membership): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.create({
        data: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          createdAt: tenant.createdAt,
        },
      });
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${ownerMembership.tenantId}, true)`;
      await tx.membership.create({
        data: {
          id: ownerMembership.id,
          tenantId: ownerMembership.tenantId,
          userId: ownerMembership.userId,
          role: ownerMembership.role,
          createdAt: ownerMembership.createdAt,
        },
      });
    });
  }
}
