import { Entity } from "@/shared/domain/entity";
import { isErr } from "@/shared/domain/result";
import { asTenantId, type TenantId } from "@/shared/domain/tenant-id";

import { Role } from "../value-objects/role";

export type MembershipId = string & { readonly __brand: "MembershipId" };

export const asMembershipId = (value: string): MembershipId => value as MembershipId;

interface MembershipProps {
  readonly id: MembershipId;
  readonly tenantId: TenantId;
  readonly userId: string;
  readonly role: Role;
  readonly createdAt: Date;
}

export interface PersistedMembershipProps {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
  readonly createdAt: Date;
}

// Relación usuario↔tenant: aquí vive el rol (ADR-002). `userId` referencia al `User` de
// `identity` por id (sin FK entre módulos en el dominio). Los invariantes de negocio (≥1 OWNER,
// "no a OWNER", etc.) se enforcan en los casos de uso de Fase 5, no en la entidad.
export class Membership extends Entity<MembershipId> {
  private constructor(private readonly props: MembershipProps) {
    super(props.id);
  }

  // `role` ya llega tipado como `Role`; no hay validación que pueda fallar, así que devuelve
  // la entidad directamente (a diferencia de Note, cuyo título puede ser inválido).
  static create(props: MembershipProps): Membership {
    return new Membership(props);
  }

  // Rehidratación desde persistencia: la fila ya es válida; un rol fuera del conjunto es
  // corrupción (error inesperado), no un `Result`.
  static fromPersistence(props: PersistedMembershipProps): Membership {
    const role = Role.create(props.role);
    if (isErr(role)) {
      throw new Error(`Fila Membership corrupta '${props.id}': ${role.error.message}`);
    }
    return new Membership({
      id: asMembershipId(props.id),
      tenantId: asTenantId(props.tenantId),
      userId: props.userId,
      role: role.value,
      createdAt: props.createdAt,
    });
  }

  get tenantId(): TenantId {
    return this.props.tenantId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get role(): Role {
    return this.props.role;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
