import { z } from "zod";

// Single source of truth for environment variables. No `server-only` here so it
// can also be imported from next.config.ts to fail-fast at build time.
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET es obligatorio"),
  DATABASE_URL: z.url("DATABASE_URL debe ser una URL de conexión válida"),
  DIRECT_URL: z.url("DIRECT_URL debe ser una URL de conexión válida"),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Variables de entorno inválidas o ausentes. El proceso se detiene (fail-fast):\n${details}`,
    );
  }
  return result.data;
}
