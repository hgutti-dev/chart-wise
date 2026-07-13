import { PERMISSION_MATRIX, type Permission } from "../authorization/permission-matrix";
import type { Role } from "../value-objects/role";

// `can()` es dominio puro (NFR-002): sin DB, sin `async`. Por eso NO toma el `AuthContext` de la
// capa `application` (que extiende `TenantContext` de `shared/application`): la regla de
// dependencias lo prohíbe (domain → domain/shared-domain/config). Toma este contrato mínimo;
// el `AuthContext` de Fase C lo satisface estructuralmente (tiene `role` y `userId`).
export interface AuthorizationContext {
  readonly role: Role;
  readonly userId?: string;
}

// Resuelve la matriz tri-estado: `all`→true; `own`→true solo si el recurso es del propio
// usuario; `false`→false. El código pregunta por permiso, nunca por rol (regla de oro §10).
export function can(
  permission: Permission,
  ctx: AuthorizationContext,
  resourceOwnerId?: string,
): boolean {
  const grant = PERMISSION_MATRIX[ctx.role][permission];
  if (grant === "all") return true;
  if (grant === "own") {
    return resourceOwnerId !== undefined && ctx.userId === resourceOwnerId;
  }
  return false;
}
