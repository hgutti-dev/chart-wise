import type { Membership } from "../entities/membership";
import type { Tenant } from "../entities/tenant";

// Provisión ATÓMICA del workspace personal: crea el `Tenant` y su `Membership(OWNER)` en una sola
// unidad de trabajo (una transacción en el adapter Prisma). Es un puerto propio —en vez de un
// `TenantRepository` + `MembershipRepository` por separado— porque la atomicidad cross-entidad no
// se puede garantizar con transacciones por-método; o persiste ambos, o ninguno (R4 / SC-011).
export interface WorkspaceProvisioner {
  provision(tenant: Tenant, ownerMembership: Membership): Promise<void>;
}
