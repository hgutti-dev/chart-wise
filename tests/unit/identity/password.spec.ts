import { describe, expect, it } from "vitest";

import { WeakPasswordError } from "@/modules/identity/domain/errors";
import { Password } from "@/modules/identity/domain/value-objects/password";
import { DomainError } from "@/shared/domain/domain-error";
import { isErr, isOk } from "@/shared/domain/result";

// Dominio puro. Cubre SC-005: mínimo 8 chars y máximo 72 BYTES (límite de bcrypt).
describe("Password.create", () => {
  it("rechaza una contraseña de menos de 8 caracteres", () => {
    const result = Password.create("short"); // 5 caracteres

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(WeakPasswordError);
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe("identity.password.weak");
  });

  it("rechaza una contraseña de más de 72 bytes", () => {
    const result = Password.create("a".repeat(73));

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(WeakPasswordError);
  });

  it("mide bytes UTF-8, no code points, para el límite de 72", () => {
    // '😀' ocupa 4 bytes: 19 emojis = 76 bytes (>72) pero solo 19 caracteres.
    const result = Password.create("😀".repeat(19));

    expect(isErr(result)).toBe(true);
  });

  it("acepta una contraseña válida (>= 8 caracteres, <= 72 bytes)", () => {
    const result = Password.create("correcthorse");

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.value).toBe("correcthorse");
  });

  it("acepta exactamente el límite de 72 bytes", () => {
    const result = Password.create("a".repeat(72));

    expect(isOk(result)).toBe(true);
  });
});
