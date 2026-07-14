import { describe, expect, it } from "vitest";

import {
  asMembershipId,
  Membership,
} from "@/modules/tenancy/domain/entities/membership";
import type { Role } from "@/modules/tenancy/domain/value-objects/role";
import { InMemoryMembershipRepository } from "@/modules/tenancy/infrastructure/persistence/in-memory-membership.repository";
import { asTenantId } from "@/shared/domain/tenant-id";

const tenantA = asTenantId("11111111-1111-1111-1111-111111111111");
const tenantB = asTenantId("22222222-2222-2222-2222-222222222222");

const build = (
  userId: string,
  tenantId = tenantA,
  role: Role = "OWNER",
  createdAt = new Date("2026-01-01T00:00:00Z"),
): Membership =>
  Membership.create({
    id: asMembershipId(crypto.randomUUID()),
    tenantId,
    userId,
    role,
    createdAt,
  });

// El fake replica el contrato de RLS: findRole es scoped por (userId, tenantId); listByUser y
// findActive son la ruta "mis membresías" (cross-tenant, por usuario).
describe("InMemoryMembershipRepository", () => {
  it("findRole devuelve el rol de la membresía (userId, tenantId)", async () => {
    const repo = new InMemoryMembershipRepository();
    await repo.create(build("u1", tenantA, "ADMIN"));

    expect(await repo.findRole("u1", tenantA)).toBe("ADMIN");
  });

  it("findRole devuelve null si el usuario no es miembro de ese tenant", async () => {
    const repo = new InMemoryMembershipRepository();
    await repo.create(build("u1", tenantA, "ADMIN"));

    expect(await repo.findRole("u1", tenantB)).toBeNull();
    expect(await repo.findRole("u2", tenantA)).toBeNull();
  });

  it("listByUser devuelve todas las membresías del usuario, cruzando tenants", async () => {
    const repo = new InMemoryMembershipRepository();
    await repo.create(build("u1", tenantA, "OWNER"));
    await repo.create(build("u1", tenantB, "VIEWER"));
    await repo.create(build("u2", tenantA, "MEMBER"));

    const list = await repo.listByUser("u1");
    expect(list).toHaveLength(2);
    expect(list.map((m) => m.tenantId).sort()).toEqual([tenantA, tenantB].sort());
  });

  it("findActive devuelve la membresía más antigua (workspace por defecto)", async () => {
    const repo = new InMemoryMembershipRepository();
    await repo.create(build("u1", tenantB, "VIEWER", new Date("2026-03-01T00:00:00Z")));
    await repo.create(build("u1", tenantA, "OWNER", new Date("2026-01-01T00:00:00Z")));

    const active = await repo.findActive("u1");
    expect(active?.tenantId).toBe(tenantA);
    expect(active?.role).toBe("OWNER");
  });

  it("findActive devuelve null si el usuario no tiene membresías", async () => {
    const repo = new InMemoryMembershipRepository();
    expect(await repo.findActive("nadie")).toBeNull();
  });
});
