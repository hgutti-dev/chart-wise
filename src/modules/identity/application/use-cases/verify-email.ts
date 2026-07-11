import { err, isErr, ok, type Result } from "@/shared/domain/result";

import type { UserRepository } from "../../domain/ports/user.repository";
import type { VerificationTokenRepository } from "../../domain/ports/verification-token.repository";
import { InvalidVerificationTokenError } from "../../domain/errors/invalid-verification-token.error";
import { Email } from "../../domain/value-objects/email";

export interface VerifyEmailInput {
  readonly identifier: string;
  readonly token: string;
}

// Confirma la verificación de email consumiendo el token. `use` es atómico: encuentra por
// (identifier, token) y borra en una sola operación, así que un token inexistente, de OTRO
// identifier o ya usado devuelve null → error. Un token vencido se rechaza tras consumirlo.
// Todos los fallos usan el MISMO error controlado (SC-008); no se filtra la causa.
export class VerifyEmail {
  constructor(
    private readonly users: UserRepository,
    private readonly tokens: VerificationTokenRepository,
  ) {}

  async execute(
    input: VerifyEmailInput,
  ): Promise<Result<void, InvalidVerificationTokenError>> {
    // Normaliza el identifier igual que al emitir el token (se guardó con el email
    // normalizado): un casing/espaciado distinto en el enlace no debe dar un falso inválido.
    // Un identifier sin forma de email no puede tener token → inválido.
    const email = Email.create(input.identifier);
    if (isErr(email)) {
      return err(new InvalidVerificationTokenError());
    }

    const record = await this.tokens.use(email.value.value, input.token);
    if (record === null) {
      return err(new InvalidVerificationTokenError());
    }
    if (record.isExpired(new Date())) {
      return err(new InvalidVerificationTokenError());
    }

    const user = await this.users.findByEmail(email.value);
    if (user === null) {
      return err(new InvalidVerificationTokenError());
    }

    await this.users.save(user.markEmailVerified(new Date()));
    return ok(undefined);
  }
}
