import { DomainError } from "@/shared/domain/domain-error";

import type { Permission } from "../authorization/permission-matrix";

// Error ESPERADO de autorización (viaja como `Result.err`, no como excepción). NFR-009: no
// distingue "no tienes permiso" de "no existe" — la ausencia de `Membership` resuelve 404 fuera
// del guard; este error solo indica que la acción está denegada, sin revelar recurso alguno.
export class PermissionDeniedError extends DomainError {
  readonly code = "tenancy.authorization.denied";

  constructor(readonly permission: Permission) {
    super(`Permiso denegado para la acción '${permission}'.`);
  }
}
