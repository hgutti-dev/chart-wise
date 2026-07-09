import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

// El seed corre como OWNER (DIRECT_URL): insertar en Tenant requiere privilegios
// que app_user no tiene (solo SELECT en Tenant). Tenant no está bajo RLS.
const connectionString = process.env.DIRECT_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL no está definida (revisa .env).");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Tenants A y B: base para el test de aislamiento (SC-006).
const TENANTS = [
  { slug: "tenant-a", name: "Tenant A" },
  { slug: "tenant-b", name: "Tenant B" },
] as const;

async function main() {
  for (const tenant of TENANTS) {
    await prisma.tenant.upsert({
      where: { slug: tenant.slug },
      update: { name: tenant.name },
      create: { slug: tenant.slug, name: tenant.name },
    });
  }

  const count = await prisma.tenant.count();
  console.log(`Seed OK: ${count} tenants (${TENANTS.map((t) => t.slug).join(", ")}).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
