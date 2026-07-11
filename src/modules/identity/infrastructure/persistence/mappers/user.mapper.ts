import { type PersistedUserProps, User } from "../../../domain/entities/user";

// Fila escalar de la tabla User (subconjunto del cliente Prisma). Se declara aquí para
// desacoplar el mapper de los genéricos del cliente generado, igual que `NoteRow`.
export type UserRow = PersistedUserProps;

export const toDomain = (row: UserRow): User => User.fromPersistence(row);

// Extrae la fila escalar del agregado: el email normalizado (VO) y el hash en claro para
// persistencia (`.value`). El hash NUNCA sale por otra vía que no sea la persistencia.
export const toPersistence = (user: User): UserRow => ({
  id: user.id,
  email: user.email.value,
  name: user.name,
  image: user.image,
  passwordHash: user.passwordHash?.value ?? null,
  emailVerified: user.emailVerified,
  createdAt: user.createdAt,
});
