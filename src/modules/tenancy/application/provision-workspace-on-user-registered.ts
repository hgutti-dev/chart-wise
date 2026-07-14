import { asTenantId } from "@/shared/domain/tenant-id";

import { asMembershipId, Membership } from "../domain/entities/membership";
import { Tenant } from "../domain/entities/tenant";
import type { MembershipRepository } from "../domain/ports/membership.repository";
import type { WorkspaceProvisioner } from "../domain/ports/workspace-provisioner";

// Payload estructural de `UserRegistered`: el handler NO importa el evento de `identity` (evita
// acoplar `tenancy`→`identity`); el composition root de app/ adapta el evento a este contrato.
export interface UserRegisteredInput {
  readonly userId: string;
  readonly email: string;
}

// Slugs reservados que no deben ser el slug base de un workspace (ADR-006). El sufijo aleatorio
// hace la colisión con estos (y con el UNIQUE) despreciable; el slug no es clave de consulta.
const RESERVED_SLUGS = new Set(["admin", "api", "app", "www", "dashboard", "settings"]);

const personalWorkspaceSlug = (email: string): string => {
  const local = email.split("@")[0] ?? "user";
  const base =
    local
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "workspace";
  const safe = RESERVED_SLUGS.has(base) ? `${base}-ws` : base;
  return `${safe}-${crypto.randomUUID().slice(0, 8)}`;
};

const personalWorkspaceName = (email: string): string =>
  `Espacio de ${email.split("@")[0] ?? "trabajo"}`;

// Consume `UserRegistered` (ADR-004 / R4): al registrarse, aprovisiona un workspace personal por
// defecto (B2C) — `Tenant` + `Membership(OWNER)` en transacción atómica. Idempotente: si el
// usuario ya tiene una membresía activa, no hace nada (reintentos del bus no duplican el Tenant).
export class ProvisionWorkspaceOnUserRegistered {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly provisioner: WorkspaceProvisioner,
  ) {}

  async handle(event: UserRegisteredInput): Promise<void> {
    const existing = await this.memberships.findActive(event.userId);
    if (existing !== null) return;

    const now = new Date();
    const tenant = Tenant.create({
      id: asTenantId(crypto.randomUUID()),
      slug: personalWorkspaceSlug(event.email),
      name: personalWorkspaceName(event.email),
      createdAt: now,
    });
    const ownerMembership = Membership.create({
      id: asMembershipId(crypto.randomUUID()),
      tenantId: tenant.id,
      userId: event.userId,
      role: "OWNER",
      createdAt: now,
    });

    await this.provisioner.provision(tenant, ownerMembership);
  }
}
