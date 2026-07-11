import { PrismaAdapter } from "@auth/prisma-adapter";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";

// SC-013: recorre el CAMINO DEL ADAPTER de Auth.js (createUser → linkAccount → getUserByAccount
// y createVerificationToken → useVerificationToken) conectando como app_user (NOBYPASSRLS) vía
// DATABASE_URL. Prueba que los GRANT de la migración existen sobre User/Account/VerificationToken:
// sin ellos, el adapter fallaría con `permission denied`. Estas tablas NO son tenant-scoped
// (sin RLS, sin set_config). El `@auth/*` se importa aquí porque el confinamiento (NFR-002) solo
// aplica a `src/**`, no a los tests.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL no está definida. Levanta la DB (pnpm db:up && pnpm db:migrate) y revisa .env.",
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const adapter = PrismaAdapter(
  prisma as unknown as Parameters<typeof PrismaAdapter>[0],
);

describe("PrismaAdapter de Auth.js como app_user: GRANTs sobre las 3 tablas (SC-013)", () => {
  const email = `adapter-${crypto.randomUUID()}@test.com`;
  const providerAccountId = crypto.randomUUID();
  const identifier = `verify-${crypto.randomUUID()}@test.com`;
  const token = crypto.randomUUID();
  let userId: string;

  afterAll(async () => {
    // Borrar el User cascada-borra su Account; el token se consume, pero limpiamos por si acaso.
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.verificationToken.deleteMany({ where: { identifier } });
    await prisma.$disconnect();
  });

  it("createUser → linkAccount → getUserByAccount opera sobre User y Account", async () => {
    const user = await adapter.createUser!({
      // El adapter descarta este `id` y deja que Prisma lo genere (@default(uuid())).
      id: crypto.randomUUID(),
      email,
      emailVerified: null,
      name: null,
      image: null,
    });
    userId = user.id;
    expect(user.email).toBe(email);

    await adapter.linkAccount!({
      userId: user.id,
      type: "oauth",
      provider: "google",
      providerAccountId,
    });

    const byAccount = await adapter.getUserByAccount!({
      provider: "google",
      providerAccountId,
    });
    expect(byAccount?.id).toBe(userId);
    expect(byAccount?.email).toBe(email);
  });

  it("createVerificationToken → useVerificationToken opera sobre VerificationToken", async () => {
    await adapter.createVerificationToken!({
      identifier,
      token,
      expires: new Date(Date.now() + 60_000),
    });

    const used = await adapter.useVerificationToken!({ identifier, token });
    expect(used?.token).toBe(token);

    // Un solo uso: el token ya fue consumido -> null.
    expect(await adapter.useVerificationToken!({ identifier, token })).toBeNull();
  });
});
