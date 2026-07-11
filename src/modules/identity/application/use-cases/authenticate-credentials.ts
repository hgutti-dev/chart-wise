import { err, isOk, ok, type Result } from "@/shared/domain/result";

import { InvalidCredentialsError } from "../../domain/errors/invalid-credentials.error";
import type { UserRepository } from "../../domain/ports/user.repository";
import { Email } from "../../domain/value-objects/email";
import type { PasswordHasher } from "../ports/password-hasher";

// Hash bcrypt ficticio con el que se compara cuando el email no existe o la cuenta no tiene
// credenciales. Sirve para gastar el MISMO tiempo (un `compare` bcrypt) en todos los caminos
// y no filtrar por temporización si el usuario existe (NFR-006).
const DUMMY_HASH = `$2b$10$${"x".repeat(53)}`;

export interface AuthenticateCredentialsInput {
  readonly email: string;
  readonly password: string;
}

// DTO seguro para el `authorize()` de Auth.js: identidad mínima, SIN `passwordHash` (NFR-004).
export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly image: string | null;
  readonly emailVerified: Date | null;
}

// Verificación de credenciales sin enumeración (NFR-005) y en tiempo constante (NFR-006):
// se ejecuta SIEMPRE un `compare` bcrypt —contra el hash real o el dummy— y todos los fallos
// (email inexistente, cuenta solo-OAuth, contraseña incorrecta) devuelven el mismo error.
export class AuthenticateCredentials {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(
    input: AuthenticateCredentialsInput,
  ): Promise<Result<AuthenticatedUser, InvalidCredentialsError>> {
    const email = Email.create(input.email);
    const user = isOk(email) ? await this.users.findByEmail(email.value) : null;

    const hashToCompare = user?.passwordHash?.value ?? DUMMY_HASH;
    const passwordMatches = await this.hasher.compare(input.password, hashToCompare);

    if (user === null || user.passwordHash === null || !passwordMatches) {
      return err(new InvalidCredentialsError());
    }

    return ok({
      id: user.id,
      email: user.email.value,
      name: user.name,
      image: user.image,
      emailVerified: user.emailVerified,
    });
  }
}
