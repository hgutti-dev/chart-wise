import { DomainError } from "@/shared/domain/domain-error";

export class EmailAlreadyRegisteredError extends DomainError {
  readonly code = "identity.email.already-registered";

  constructor() {
    super("Ese email ya está registrado.");
  }
}
