import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { asUserId, User } from "@/modules/identity/domain/entities/user";
import { VerificationToken } from "@/modules/identity/domain/entities/verification-token";
import { Email } from "@/modules/identity/domain/value-objects/email";
import { PasswordHash } from "@/modules/identity/domain/value-objects/password-hash";
import { PrismaUserRepository } from "@/modules/identity/infrastructure/persistence/prisma-user.repository";
import { PrismaVerificationTokenRepository } from "@/modules/identity/infrastructure/persistence/prisma-verification-token.repository";
import { isOk, unwrap } from "@/shared/domain/result";

// Integración de los repositorios de identidad contra Postgres, conectando como app_user
// (NOBYPASSRLS) vía adapter -> DATABASE_URL. Prueba que los GRANT de la migración existen
// (SC-013) y que la semántica de persistencia (upsert idempotente por id, consumo atómico
// del token) es correcta. Identidad NO es tenant-scoped: sin set_config('app.current_tenant').
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL no está definida. Levanta la DB (pnpm db:up && pnpm db:migrate) y revisa .env.",
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const users = new PrismaUserRepository(prisma);
const tokens = new PrismaVerificationTokenRepository(prisma);

const HASH = `$2b$10$${"x".repeat(53)}`;

afterAll(async () => {
  await prisma.$disconnect();
});

describe("PrismaUserRepository (como app_user)", () => {
  const email = `user-${crypto.randomUUID()}@test.com`;
  const userId = crypto.randomUUID();

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("save persiste y findByEmail / findById recuperan la identidad", async () => {
    const created = User.create({
      id: asUserId(userId),
      email,
      name: "Ana",
      passwordHash: PasswordHash.fromHash(HASH),
      createdAt: new Date(),
    });
    if (!isOk(created)) throw new Error("fixture inválido");
    await users.save(created.value);

    const byEmail = await users.findByEmail(unwrap(Email.create(email)));
    expect(byEmail?.id).toBe(userId);
    expect(byEmail?.passwordHash?.value).toBe(HASH);

    const byId = await users.findById(asUserId(userId));
    expect(byId?.email.value).toBe(email);
  });

  it("save es idempotente por id: markEmailVerified actualiza la MISMA fila", async () => {
    const before = await users.findById(asUserId(userId));
    if (before === null) throw new Error("precondición: el usuario debe existir");
    expect(before.emailVerified).toBeNull();

    await users.save(before.markEmailVerified(new Date()));

    const after = await users.findById(asUserId(userId));
    expect(after?.emailVerified).not.toBeNull();
  });

  it("findByEmail devuelve null para un email inexistente", async () => {
    const missing = unwrap(Email.create(`missing-${crypto.randomUUID()}@test.com`));
    expect(await users.findByEmail(missing)).toBeNull();
  });
});

describe("PrismaVerificationTokenRepository (como app_user)", () => {
  const identifier = `verify-${crypto.randomUUID()}@test.com`;

  afterAll(async () => {
    await prisma.verificationToken.deleteMany({ where: { identifier } });
  });

  it("create + use consume el token una sola vez (segundo uso -> null)", async () => {
    const token = crypto.randomUUID();
    await tokens.create(
      VerificationToken.issue({
        identifier,
        token,
        expires: new Date(Date.now() + 60_000),
      }),
    );

    const used = await tokens.use(identifier, token);
    expect(used?.token).toBe(token);
    expect(used?.identifier).toBe(identifier);

    expect(await tokens.use(identifier, token)).toBeNull();
  });

  it("use con un token de OTRO identifier no matchea la clave compuesta (SC-008)", async () => {
    const token = crypto.randomUUID();
    await tokens.create(
      VerificationToken.issue({
        identifier,
        token,
        expires: new Date(Date.now() + 60_000),
      }),
    );

    expect(await tokens.use(`other-${crypto.randomUUID()}@test.com`, token)).toBeNull();
  });
});
