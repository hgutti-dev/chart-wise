import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";

// Integración (requiere Postgres con RLS + tenants A y B sembrados): prueba SC-009.
// La app conecta como app_user (NOBYPASSRLS) vía adapter -> DATABASE_URL, nunca el owner.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL no está definida. Levanta la DB (pnpm db:up && pnpm db:migrate && pnpm db:seed) y revisa .env.",
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Inserta una Membership bajo el contexto (set_config) de un tenant. El WITH CHECK de la policy
// scoped exige tenantId = app.current_tenant, así que el insert solo pasa para su propio tenant.
const insertMembershipAs = (tenantId: string, id: string, userId: string) =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    await tx.$executeRaw`
      INSERT INTO "memberships" ("id", "tenantId", "userId", "role", "createdAt")
      VALUES (${id}::uuid, ${tenantId}::uuid, ${userId}::uuid, 'OWNER', now())
    `;
  });

// Lee memberships por id SIN filtrar por tenantId, bajo el contexto de un tenant dado. Prueba
// dura de RLS: si el aislamiento fuese cosmético (un simple `where`), esto vería la fila.
const readByIdOnlyAs = (tenantId: string, id: string) =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    return tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM "memberships" WHERE id = ${id}::uuid`;
  });

// Lee memberships por id fijando app.current_user (ruta "mis membresías", R3), sin tenant.
const readByIdAsUser = (userId: string, id: string) =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user', ${userId}, true)`;
    return tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM "memberships" WHERE id = ${id}::uuid`;
  });

let tenantAId: string;
let tenantBId: string;
const membershipId = crypto.randomUUID();
const userId = crypto.randomUUID();

describe("aislamiento por tenant (RLS): tenant B no ve la Membership del tenant A (SC-009)", () => {
  beforeAll(async () => {
    // app_user tiene SELECT sobre Tenant (no está bajo RLS); los ids salen del seed.
    tenantAId = (
      await prisma.tenant.findUniqueOrThrow({ where: { slug: "tenant-a" } })
    ).id;
    tenantBId = (
      await prisma.tenant.findUniqueOrThrow({ where: { slug: "tenant-b" } })
    ).id;
    await insertMembershipAs(tenantAId, membershipId, userId);
  }, 30_000);

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantAId}, true)`;
      await tx.$executeRaw`DELETE FROM "memberships" WHERE id = ${membershipId}::uuid`;
    });
    await prisma.$disconnect();
  });

  it("con el tenant B activo, leer la Membership del tenant A (solo por id) devuelve cero filas", async () => {
    const rows = await readByIdOnlyAs(tenantBId, membershipId);
    expect(rows).toHaveLength(0);
  });

  it("control positivo: el tenant A dueño sí ve su Membership (el 0 no es un falso verde)", async () => {
    const rows = await readByIdOnlyAs(tenantAId, membershipId);
    expect(rows).toHaveLength(1);
  });

  it("ruta 'mis membresías': con app.current_user propio, la membresía es visible sin fijar tenant", async () => {
    const rows = await readByIdAsUser(userId, membershipId);
    expect(rows).toHaveLength(1);
  });

  it("ruta 'mis membresías' no filtra: otro usuario no ve la membresía ajena", async () => {
    const rows = await readByIdAsUser(crypto.randomUUID(), membershipId);
    expect(rows).toHaveLength(0);
  });
});
