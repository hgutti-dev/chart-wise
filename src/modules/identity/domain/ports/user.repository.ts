import type { User, UserId } from "../entities/user";
import type { Email } from "../value-objects/email";

// Identidad NO es tenant-scoped: a diferencia de NoteRepository, este puerto no recibe
// TenantContext ni TenantId. `findByEmail` toma el VO Email (ya normalizado) para la
// búsqueda por email único global. El repositorio no conoce autenticación ni tenancy.
export interface UserRepository {
  findByEmail(email: Email): Promise<User | null>;
  findById(id: UserId): Promise<User | null>;
  save(user: User): Promise<void>;
}
