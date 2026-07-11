import type { EventBus } from "@/shared/application/event-bus";
import type { DomainError } from "@/shared/domain/domain-error";
import { err, isErr, type Result } from "@/shared/domain/result";

import { asUserId, User } from "../../domain/entities/user";
import { EmailAlreadyRegisteredError } from "../../domain/errors/email-already-registered.error";
import { UserRegistered } from "../../domain/events/user-registered.event";
import type { UserRepository } from "../../domain/ports/user.repository";
import { Email } from "../../domain/value-objects/email";
import { Password } from "../../domain/value-objects/password";
import { PasswordHash } from "../../domain/value-objects/password-hash";
import type { PasswordHasher } from "../ports/password-hasher";

export interface RegisterUserInput {
  readonly email: string;
  readonly password: string;
  readonly name?: string | null;
}

// Registro por credenciales. Alcance AuthN-only (ADR-007): crea SOLO un `User` —nada de
// Tenant/Membership, que son de `tenancy`. Identidad y reloj se inyectan aquí para que el
// dominio siga puro. Los errores esperados vuelven como `Result.err`; el hash se calcula
// vía el puerto (bcrypt es un detalle de infraestructura).
export class RegisterUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly events: EventBus,
  ) {}

  async execute(input: RegisterUserInput): Promise<Result<User, DomainError>> {
    const email = Email.create(input.email);
    if (isErr(email)) return email;

    const password = Password.create(input.password);
    if (isErr(password)) return password;

    const existing = await this.users.findByEmail(email.value);
    if (existing !== null) {
      return err(new EmailAlreadyRegisteredError());
    }

    const hashed = await this.hasher.hash(password.value.value);

    const user = User.create({
      id: asUserId(crypto.randomUUID()),
      email: email.value.value,
      name: input.name ?? null,
      passwordHash: PasswordHash.fromHash(hashed),
      createdAt: new Date(),
    });
    if (isErr(user)) return user;

    await this.users.save(user.value);
    await this.events.publish(
      new UserRegistered(user.value.id, user.value.email.value, new Date()),
    );

    return user;
  }
}
