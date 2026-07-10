import { DomainError } from "@/shared/domain/domain-error";

// Token expirado, usado o de otro identifier (SC-008).
export class InvalidVerificationTokenError extends DomainError {
  readonly code = "identity.verification-token.invalid";

  constructor() {
    super("El token de verificación no es válido o ha expirado.");
  }
}
