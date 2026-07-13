import {
  Membership,
  type PersistedMembershipProps,
} from "../../../domain/entities/membership";

// Fila escalar de la tabla memberships (subconjunto del cliente Prisma). Se declara aquí para
// desacoplar el mapper de los genéricos del cliente generado.
export type MembershipRow = PersistedMembershipProps;

export const toDomain = (row: MembershipRow): Membership =>
  Membership.fromPersistence(row);
