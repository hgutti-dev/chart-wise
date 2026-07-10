import { DomainError } from "@/shared/domain/domain-error";

// Mismo error para email inexistente y contraseña incorrecta (NFR-005: sin enumeración).
export class InvalidCredentialsError extends DomainError {
  readonly code = "identity.credentials.invalid";

  constructor() {
    super("Email o contraseña incorrectos.");
  }
}
