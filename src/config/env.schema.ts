import { z } from "zod";

// Single source of truth for environment variables. No `server-only` here so it
// can also be imported from next.config.ts to fail-fast at build time.
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET es obligatorio"),
  // Google OAuth. Auth.js v5 infiere el provider desde estos nombres exactos.
  // Requeridos: si faltan, parseEnv aborta el arranque (fail-fast, SC-010).
  AUTH_GOOGLE_ID: z.string().min(1, "AUTH_GOOGLE_ID es obligatorio"),
  AUTH_GOOGLE_SECRET: z.string().min(1, "AUTH_GOOGLE_SECRET es obligatorio"),
  // Base para construir el enlace de verificación de email (FR-007). NO es la
  // AUTH_URL de Auth.js. Con default para no bloquear el desarrollo local.
  APP_URL: z
    .url("APP_URL debe ser una URL válida")
    .default("http://localhost:3000"),
  DATABASE_URL: z.url("DATABASE_URL debe ser una URL de conexión válida"),
  DIRECT_URL: z.url("DIRECT_URL debe ser una URL de conexión válida"),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`,
      )
      .join("\n");
    throw new Error(
      `Variables de entorno inválidas o ausentes. El proceso se detiene (fail-fast):\n${details}`,
    );
  }
  return result.data;
}
