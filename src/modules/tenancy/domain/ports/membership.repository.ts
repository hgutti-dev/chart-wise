import type { TenantId } from "@/shared/domain/tenant-id";

import type { Membership } from "../entities/membership";
import type { Role } from "../value-objects/role";

// El repositorio no conoce autenticación (no valida sesión): solo los discriminadores de
// aislamiento. `findRole` es la ruta scoped (por tenant activo); `listByUser`/`findActive` son
// la ruta "mis membresías" (por usuario, cross-tenant). El adapter fija `app.current_tenant` o
// `app.current_user` según la ruta (R3); RLS es la red de seguridad.
export interface MembershipRepository {
  create(membership: Membership): Promise<void>;
  findRole(userId: string, tenantId: TenantId): Promise<Role | null>;
  listByUser(userId: string): Promise<Membership[]>;
  findActive(userId: string): Promise<Membership | null>;
}
