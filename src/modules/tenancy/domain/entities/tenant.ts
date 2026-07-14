import { Entity } from "@/shared/domain/entity";
import { asTenantId, type TenantId } from "@/shared/domain/tenant-id";

interface TenantProps {
  readonly id: TenantId;
  readonly slug: string;
  readonly name: string;
  readonly createdAt: Date;
}

export interface PersistedTenantProps {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly createdAt: Date;
}

// Raíz de tenancy (ancla del aislamiento; no tiene tenantId, ES el tenant). Aquí solo se modelan
// los campos que la provisión necesita (id/slug/name/createdAt); el resto de columnas del modelo
// Prisma (i18n, previousSlugs, deletedAt) tienen defaults. El slug nunca es clave de consulta.
export class Tenant extends Entity<TenantId> {
  private constructor(private readonly props: TenantProps) {
    super(props.id);
  }

  static create(props: TenantProps): Tenant {
    return new Tenant(props);
  }

  static fromPersistence(props: PersistedTenantProps): Tenant {
    return new Tenant({
      id: asTenantId(props.id),
      slug: props.slug,
      name: props.name,
      createdAt: props.createdAt,
    });
  }

  get slug(): string {
    return this.props.slug;
  }

  get name(): string {
    return this.props.name;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
