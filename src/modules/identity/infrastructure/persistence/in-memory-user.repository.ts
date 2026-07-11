import type { User, UserId } from "../../domain/entities/user";
import type { UserRepository } from "../../domain/ports/user.repository";
import type { Email } from "../../domain/value-objects/email";

// Fake para desarrollo/tests sin base de datos. Identidad NO es tenant-scoped: a diferencia
// de `InMemoryNoteRepository`, no filtra por tenant. `save` sobrescribe por id (una entidad
// re-emitida —p. ej. tras `markEmailVerified`— conserva su id y reemplaza la fila anterior).
export class InMemoryUserRepository implements UserRepository {
  private readonly usersById = new Map<UserId, User>();

  async save(user: User): Promise<void> {
    this.usersById.set(user.id, user);
  }

  async findById(id: UserId): Promise<User | null> {
    return this.usersById.get(id) ?? null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    for (const user of this.usersById.values()) {
      if (user.email.equals(email)) return user;
    }
    return null;
  }
}
