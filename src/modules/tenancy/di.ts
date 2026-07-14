import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "@/config/env";
import { PrismaClient } from "@/generated/prisma/client";

import { ProvisionWorkspaceOnUserRegistered } from "./application/provision-workspace-on-user-registered";
import type { MembershipRepository } from "./domain/ports/membership.repository";
import {
  createTenantClaims,
  type TenantClaims,
} from "./infrastructure/auth/populate-tenant-claims";
import { PrismaMembershipRepository } from "./infrastructure/persistence/prisma-membership.repository";
import { PrismaWorkspaceProvisioner } from "./infrastructure/persistence/prisma-workspace-provisioner";

// Composition root del módulo `tenancy`. Cliente Prisma como singleton de módulo (pool); cada
// consulta del repositorio fija su contexto de aislamiento (app.current_tenant/app.current_user)
// por operación, así que memoizar el cliente no filtra datos entre tenants.
let prismaSingleton: PrismaClient | undefined;

const getPrisma = (): PrismaClient => {
  if (prismaSingleton === undefined) {
    const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
    prismaSingleton = new PrismaClient({ adapter });
  }
  return prismaSingleton;
};

const memberships: MembershipRepository = new PrismaMembershipRepository(getPrisma());

// Extensor de claims listo para componerse con los callbacks base de `identity` en el
// composition root de app/ (FR-009): puebla activeTenantId/role leyendo la membresía activa.
export const tenantClaims: TenantClaims = createTenantClaims(memberships);

// Handler de provisión: app/ (instrumentation) lo suscribe al `UserRegistered` del `eventBus` de
// `identity` (FR-010). Crea Tenant + Membership(OWNER) atómico e idempotente por usuario.
export const provisionWorkspaceOnUserRegistered = new ProvisionWorkspaceOnUserRegistered(
  memberships,
  new PrismaWorkspaceProvisioner(getPrisma()),
);
