import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { describe, expect, it } from "vitest";

import {
  asMembershipId,
  Membership,
} from "@/modules/tenancy/domain/entities/membership";
import { createTenantClaims } from "@/modules/tenancy/infrastructure/auth/populate-tenant-claims";
import { InMemoryMembershipRepository } from "@/modules/tenancy/infrastructure/persistence/in-memory-membership.repository";
import { asTenantId } from "@/shared/domain/tenant-id";

const tenantA = asTenantId("11111111-1111-1111-1111-111111111111");

const repoWithOwner = async (userId: string): Promise<InMemoryMembershipRepository> => {
  const repo = new InMemoryMembershipRepository();
  await repo.create(
    Membership.create({
      id: asMembershipId(crypto.randomUUID()),
      tenantId: tenantA,
      userId,
      role: "OWNER",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    }),
  );
  return repo;
};

// El extensor es propiedad de tenancy y se compone en app/. Aquí se prueba aislado con el fake.
describe("createTenantClaims", () => {
  it("populateToken puebla activeTenantId/role desde la membresía activa", async () => {
    const claims = createTenantClaims(await repoWithOwner("user-1"));

    const token = await claims.populateToken({ sub: "user-1" } as JWT);

    expect(token.activeTenantId).toBe(tenantA);
    expect(token.role).toBe("OWNER");
  });

  it("populateToken deja el token intacto si el usuario no tiene membresía activa", async () => {
    const claims = createTenantClaims(new InMemoryMembershipRepository());

    const token = await claims.populateToken({ sub: "sin-membresia" } as JWT);

    expect(token.activeTenantId).toBeUndefined();
    expect(token.role).toBeUndefined();
  });

  it("populateToken no consulta ni puebla si el token no trae sub", async () => {
    const claims = createTenantClaims(await repoWithOwner("user-1"));

    const token = await claims.populateToken({} as JWT);

    expect(token.activeTenantId).toBeUndefined();
    expect(token.role).toBeUndefined();
  });

  it("applyToSession refleja los claims del token en la sesión", () => {
    const claims = createTenantClaims(new InMemoryMembershipRepository());
    const baseSession = {
      user: { id: "user-1", emailVerified: null },
      expires: "2099-01-01T00:00:00Z",
    } as unknown as Session;

    const session = claims.applyToSession(baseSession, {
      sub: "user-1",
      activeTenantId: tenantA,
      role: "OWNER",
    } as JWT);

    expect(session.activeTenantId).toBe(tenantA);
    expect(session.role).toBe("OWNER");
  });
});
