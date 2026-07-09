import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { asNoteId, Note } from "@/modules/example/domain/entities/note";
import { PrismaNoteRepository } from "@/modules/example/infrastructure/persistence/prisma-note.repository";
import { isOk } from "@/shared/domain/result";
import { asTenantId } from "@/shared/domain/tenant-id";

// Integración (requiere Postgres con RLS + tenants A y B sembrados): prueba SC-006.
// La app conecta como app_user (NOBYPASSRLS) vía adapter -> DATABASE_URL, nunca el owner.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL no está definida. Levanta la DB (pnpm db:up && pnpm db:migrate && pnpm db:seed) y revisa .env.",
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const repo = new PrismaNoteRepository(prisma);

// Lee filas de Note por id SIN filtrar por tenantId, bajo el contexto de un tenant dado.
// Es la prueba dura de RLS: si el aislamiento fuese cosmético (un simple `where`), esto
// vería la fila; con RLS forzada, solo la ve el tenant dueño.
const readByIdOnlyAs = (tenantId: string, id: string) =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    return tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Note" WHERE id = ${id}::uuid`;
  });

let tenantAId: string;
let tenantBId: string;
let noteId: string;

describe("aislamiento por tenant (RLS): tenant B no ve la Note del tenant A (SC-006)", () => {
  beforeAll(async () => {
    // app_user tiene SELECT sobre Tenant (no está bajo RLS); los ids salen del seed.
    tenantAId = (await prisma.tenant.findUniqueOrThrow({ where: { slug: "tenant-a" } })).id;
    tenantBId = (await prisma.tenant.findUniqueOrThrow({ where: { slug: "tenant-b" } })).id;

    const created = Note.create({
      id: asNoteId(crypto.randomUUID()),
      tenantId: asTenantId(tenantAId),
      title: "Secreto del tenant A",
      createdAt: new Date(),
    });
    if (!isOk(created)) throw new Error("fixture inválido: Note.create devolvió error");
    noteId = created.value.id;

    await repo.save(created.value);
  }, 30_000);

  afterAll(async () => {
    if (noteId) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantAId}, true)`;
        await tx.note.deleteMany({ where: { id: noteId } });
      });
    }
    await prisma.$disconnect();
  });

  it("con el tenant B activo, leer la Note del tenant A (solo por id) devuelve cero filas", async () => {
    const rows = await readByIdOnlyAs(tenantBId, noteId);
    expect(rows).toHaveLength(0);
  });

  it("control positivo: el tenant A dueño sí ve su Note (la fila existe; el 0 no es un falso verde)", async () => {
    const rows = await readByIdOnlyAs(tenantAId, noteId);
    expect(rows).toHaveLength(1);
  });

  it("el repositorio respeta el aislamiento: findById cruzando tenants devuelve null", async () => {
    expect(await repo.findById(asTenantId(tenantBId), asNoteId(noteId))).toBeNull();

    const found = await repo.findById(asTenantId(tenantAId), asNoteId(noteId));
    expect(found?.tenantId).toBe(tenantAId);
  });
});
