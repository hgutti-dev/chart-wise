import { describe, expect, it } from "vitest";

import { loginSchema } from "@/modules/identity/presentation/schemas/login.schema";
import { registerSchema } from "@/modules/identity/presentation/schemas/register.schema";

// Schemas Zod de la frontera de validación (presentation). Reflejan las reglas del dominio
// (Email normalizado, Password >= 8 y <= 72 bytes) para dar errores tempranos; el dominio
// sigue siendo la autoridad. No importan next-auth ni di.
describe("registerSchema", () => {
  it("acepta un registro válido y normaliza el email (lowercase + trim)", () => {
    const parsed = registerSchema.safeParse({
      email: "  Ana@Example.COM ",
      password: "supersecret",
      name: "Ana",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("ana@example.com");
  });

  it("rechaza un email inválido", () => {
    const parsed = registerSchema.safeParse({ email: "no-es-email", password: "supersecret" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.email).toBeDefined();
    }
  });

  it("rechaza una contraseña de menos de 8 caracteres", () => {
    const parsed = registerSchema.safeParse({ email: "ana@test.com", password: "short" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.flatten().fieldErrors.password).toBeDefined();
  });

  it("rechaza una contraseña de más de 72 bytes (límite bcrypt)", () => {
    const parsed = registerSchema.safeParse({
      email: "ana@test.com",
      password: "a".repeat(73),
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.flatten().fieldErrors.password).toBeDefined();
  });
});

describe("loginSchema", () => {
  it("acepta credenciales con email normalizado y contraseña no vacía", () => {
    const parsed = loginSchema.safeParse({ email: "ANA@test.com", password: "x" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("ana@test.com");
  });

  it("rechaza una contraseña vacía sin filtrar la política (login no enumera)", () => {
    const parsed = loginSchema.safeParse({ email: "ana@test.com", password: "" });
    expect(parsed.success).toBe(false);
  });

  it("rechaza un email inválido", () => {
    const parsed = loginSchema.safeParse({ email: "nope", password: "x" });
    expect(parsed.success).toBe(false);
  });
});
