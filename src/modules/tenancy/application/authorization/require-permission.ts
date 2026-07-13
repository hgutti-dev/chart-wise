import { err, ok, type Result } from "@/shared/domain/result";

import type { Permission } from "../../domain/authorization/permission-matrix";
import { PermissionDeniedError } from "../../domain/errors";
import { can } from "../../domain/services/permission-checker";
import type { AuthContext } from "../auth-context";

// Guard del caso de uso: se invoca AL INICIO de cada caso de uso protegido y devuelve un Result
// (error esperado), nunca lanza. La UI (`shared/presentation`) y `proxy.ts` son cosméticos;
// borrarlos no compromete la seguridad — este guard es el que prohíbe de verdad (NFR-005).
export function requirePermission(
  ctx: AuthContext,
  permission: Permission,
  resourceOwnerId?: string,
): Result<void, PermissionDeniedError> {
  return can(permission, ctx, resourceOwnerId)
    ? ok(undefined)
    : err(new PermissionDeniedError(permission));
}
