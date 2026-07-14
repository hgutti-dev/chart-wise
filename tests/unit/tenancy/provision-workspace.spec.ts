import { describe, expect, it } from "vitest";

import {
  asMembershipId,
  Membership,
} from "@/modules/tenancy/domain/entities/membership";
import { ProvisionWorkspaceOnUserRegistered } from "@/modules/tenancy/application/provision-workspace-on-user-registered";
import { InMemoryMembershipRepository } from "@/modules/tenancy/infrastructure/persistence/in-memory-membership.repository";
import { InMemoryWorkspaceProvisioner } from "@/modules/tenancy/infrastructure/persistence/in-memory-workspace-provisioner";
import { asTenantId } from "@/shared/domain/tenant-id";

const event = (userId: string, email = "ana@acme.com") => ({ userId, email });

// SC-011: al recibir UserRegistered, provisiona Tenant + Membership(OWNER) de forma atómica e
// idempotente. Repos/provisioner fakes; sin DB.
describe("ProvisionWorkspaceOnUserRegistered", () => {
  it("crea un Tenant y una Membership(OWNER) para el usuario recién registrado", async () => {
    const memberships = new InMemoryMembershipRepository();
    const provisioner = new InMemoryWorkspaceProvisioner();
    const handler = new ProvisionWorkspaceOnUserRegistered(memberships, provisioner);

    await handler.handle(event("user-1"));

    expect(provisioner.tenants).toHaveLength(1);
    expect(provisioner.memberships).toHaveLength(1);
    const membership = provisioner.memberships[0];
    expect(membership?.userId).toBe("user-1");
    expect(membership?.role).toBe("OWNER");
    // La membresía pertenece al tenant recién creado (mismo tenantId).
    expect(membership?.tenantId).toBe(provisioner.tenants[0]?.id);
  });

  it("si la persistencia falla (p. ej. el Membership), no persiste el Tenant (atómico)", async () => {
    const memberships = new InMemoryMembershipRepository();
    const provisioner = new InMemoryWorkspaceProvisioner({ failOnProvision: true });
    const handler = new ProvisionWorkspaceOnUserRegistered(memberships, provisioner);

    await expect(handler.handle(event("user-1"))).rejects.toThrow();

    expect(provisioner.tenants).toHaveLength(0);
    expect(provisioner.memberships).toHaveLength(0);
  });

  it("es idempotente: si el usuario ya tiene una membresía activa, no provisiona de nuevo", async () => {
    const memberships = new InMemoryMembershipRepository();
    await memberships.create(
      Membership.create({
        id: asMembershipId(crypto.randomUUID()),
        tenantId: asTenantId(crypto.randomUUID()),
        userId: "user-1",
        role: "OWNER",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );
    const provisioner = new InMemoryWorkspaceProvisioner();
    const handler = new ProvisionWorkspaceOnUserRegistered(memberships, provisioner);

    await handler.handle(event("user-1"));

    expect(provisioner.tenants).toHaveLength(0);
  });
});
