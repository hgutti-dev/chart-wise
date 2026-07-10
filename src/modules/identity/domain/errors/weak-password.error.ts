import { DomainError } from "@/shared/domain/domain-error";

export class WeakPasswordError extends DomainError {
  readonly code = "identity.password.weak";

  constructor(reason: string) {
    super(`La contraseña ${reason}.`);
  }
}
