import type { DomainError } from "@/shared/domain/domain-error";
import { isErr, ok, type Result } from "@/shared/domain/result";

import { VerificationToken } from "../../domain/entities/verification-token";
import type { UserRepository } from "../../domain/ports/user.repository";
import type { VerificationTokenRepository } from "../../domain/ports/verification-token.repository";
import { Email } from "../../domain/value-objects/email";
import type { EmailSender } from "../ports/email-sender";

// TTL del token: 24h. No está fijado en el spec (decisión de fase); `VerifyEmail` rechaza
// cualquier token cuyo `expires` haya vencido al consumirlo.
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Solicita la verificación de email. SIN enumeración (NFR-007): para un email desconocido
// devuelve la MISMA respuesta (`ok`) que para uno conocido, sin crear token ni enviar nada.
// El valor del token y la expiración se inyectan aquí (dominio puro).
export class RequestEmailVerification {
  constructor(
    private readonly users: UserRepository,
    private readonly tokens: VerificationTokenRepository,
    private readonly emailSender: EmailSender,
  ) {}

  async execute(rawEmail: string): Promise<Result<void, DomainError>> {
    const email = Email.create(rawEmail);
    if (isErr(email)) return email;

    const user = await this.users.findByEmail(email.value);
    if (user === null) {
      // Email desconocido: misma respuesta, sin señal de existencia.
      return ok(undefined);
    }

    const identifier = email.value.value;
    const token = VerificationToken.issue({
      identifier,
      token: crypto.randomUUID(),
      expires: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
    });

    await this.tokens.create(token);
    await this.emailSender.sendVerification({ to: identifier, token: token.token });

    return ok(undefined);
  }
}
