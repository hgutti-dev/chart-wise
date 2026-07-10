import { DomainError } from "@/shared/domain/domain-error";

export class InvalidEmailError extends DomainError {
  readonly code = "identity.email.invalid";

  constructor() {
    super("El email no tiene un formato válido.");
  }
}
