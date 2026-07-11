import { asUserId } from "../../domain/entities/user";
import type { UserRepository } from "../../domain/ports/user.repository";

// DTO plano de la identidad autenticada. SIN `passwordHash` (NFR-004): nunca viaja al
// cliente. Es lo que consume el perfil / la sesión.
export interface CurrentUserDto {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly image: string | null;
  readonly emailVerified: Date | null;
}

// Resuelve el `User` autenticado a partir del `userId` de la sesión. Devuelve `null` si no
// existe (p. ej. sesión con un usuario ya borrado).
export class GetCurrentUser {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<CurrentUserDto | null> {
    const user = await this.users.findById(asUserId(userId));
    if (user === null) return null;

    return {
      id: user.id,
      email: user.email.value,
      name: user.name,
      image: user.image,
      emailVerified: user.emailVerified,
    };
  }
}
