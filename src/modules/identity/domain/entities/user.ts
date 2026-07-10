import type { DomainError } from "@/shared/domain/domain-error";
import { Entity } from "@/shared/domain/entity";
import { isErr, ok, type Result } from "@/shared/domain/result";

import { Email } from "../value-objects/email";
import { PasswordHash } from "../value-objects/password-hash";

// Identidad global: NO es tenant-scoped (sin tenantId). El id se genera fuera del dominio
// (el adapter o RegisterUser vía crypto.randomUUID) y se inyecta, igual que createdAt.
export type UserId = string & { readonly __brand: "UserId" };

export const asUserId = (value: string): UserId => value as UserId;

interface UserProps {
  readonly id: UserId;
  readonly email: Email;
  readonly name: string | null;
  readonly image: string | null;
  readonly passwordHash: PasswordHash | null;
  readonly emailVerified: Date | null;
  readonly createdAt: Date;
}

export interface CreateUserProps {
  readonly id: UserId;
  readonly email: string;
  readonly name?: string | null;
  readonly image?: string | null;
  readonly passwordHash?: PasswordHash | null; // null = cuenta solo-OAuth
  readonly emailVerified?: Date | null; // null = no verificado
  readonly createdAt: Date;
}

export interface PersistedUserProps {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly image: string | null;
  readonly passwordHash: string | null;
  readonly emailVerified: Date | null;
  readonly createdAt: Date;
}

export class User extends Entity<UserId> {
  private constructor(private readonly props: UserProps) {
    super(props.id);
  }

  static create(props: CreateUserProps): Result<User, DomainError> {
    const email = Email.create(props.email);
    if (isErr(email)) return email;
    return ok(
      new User({
        id: props.id,
        email: email.value,
        name: props.name ?? null,
        image: props.image ?? null,
        passwordHash: props.passwordHash ?? null,
        emailVerified: props.emailVerified ?? null,
        createdAt: props.createdAt,
      }),
    );
  }

  // Rehidratación desde persistencia: la fila almacenada ya es válida, así que no
  // devolvemos Result. Un email o hash inválido en la DB es corrupción (error inesperado).
  static fromPersistence(props: PersistedUserProps): User {
    const email = Email.create(props.email);
    if (isErr(email)) {
      throw new Error(`Fila User corrupta '${props.id}': ${email.error.message}`);
    }
    return new User({
      id: asUserId(props.id),
      email: email.value,
      name: props.name,
      image: props.image,
      passwordHash:
        props.passwordHash === null
          ? null
          : PasswordHash.fromHash(props.passwordHash),
      emailVerified: props.emailVerified,
      createdAt: props.createdAt,
    });
  }

  markEmailVerified(verifiedAt: Date): User {
    return new User({ ...this.props, emailVerified: verifiedAt });
  }

  get email(): Email {
    return this.props.email;
  }

  get name(): string | null {
    return this.props.name;
  }

  get image(): string | null {
    return this.props.image;
  }

  get passwordHash(): PasswordHash | null {
    return this.props.passwordHash;
  }

  get emailVerified(): Date | null {
    return this.props.emailVerified;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
