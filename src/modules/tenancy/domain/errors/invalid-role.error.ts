import { DomainError } from "@/shared/domain/domain-error";

export class InvalidRoleError extends DomainError {
  readonly code = "tenancy.role.invalid";

  constructor() {
    super("El rol no pertenece al conjunto permitido (OWNER, ADMIN, MEMBER, VIEWER).");
  }
}
