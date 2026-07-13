import type { TenantContext } from "@/shared/application/tenant-context";

import type { Role } from "../domain/value-objects/role";

// Contexto de autorización: el `TenantContext` (tenantId + userId) enriquecido con el `role` de
// la membresía verificada. Se construye TRAS comprobar `Membership(userId, tenantId)`; si no hay
// membresía, no se construye → 404, nunca 403 (NFR-009). Los permisos no se almacenan: se
// derivan con `can()` (R2).
export interface AuthContext extends TenantContext {
  readonly role: Role;
}
