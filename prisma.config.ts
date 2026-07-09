import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Config de Prisma 7. `.env` no se auto-carga en Prisma 7 -> lo cargamos con dotenv.
// `datasource.url` lo usa el CLI (migrate, db pull, studio): conexión DIRECTA como owner
// para poder crear roles/policies de RLS. El cliente en runtime usa DATABASE_URL (rol
// app_user, NOBYPASSRLS) a través de @prisma/adapter-pg, no esta URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
