import { describe, expect, it } from "vitest";

import { asUserId, User } from "@/modules/identity/domain/entities/user";
import { InvalidEmailError } from "@/modules/identity/domain/errors";
import { PasswordHash } from "@/modules/identity/domain/value-objects/password-hash";
import { DomainError } from "@/shared/domain/domain-error";
import { isErr, isOk } from "@/shared/domain/result";

const BCRYPT_HASH = `$2b$10$${"a".repeat(53)}`;

// Identidad y reloj se inyectan -> User.create es puro. No es tenant-scoped (sin tenantId).
const baseProps = () => ({
  id: asUserId(crypto.randomUUID()),
  createdAt: new Date(),
});

describe("User.create", () => {
  it("crea un usuario con el email normalizado por el VO Email", () => {
    const result = User.create({ ...baseProps(), email: "  Ana@Example.COM " });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.email.value).toBe("ana@example.com");
  });

  it("por defecto es una cuenta sin credenciales ni verificar (nulos)", () => {
    const result = User.create({ ...baseProps(), email: "a@b.com" });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.passwordHash).toBeNull();
    expect(result.value.emailVerified).toBeNull();
    expect(result.value.name).toBeNull();
    expect(result.value.image).toBeNull();
  });

  it("rechaza un email inválido con un DomainError", () => {
    const result = User.create({ ...baseProps(), email: "no-es-email" });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(InvalidEmailError);
    expect(result.error).toBeInstanceOf(DomainError);
  });

  it("conserva el passwordHash y emailVerified provistos", () => {
    const hash = PasswordHash.fromHash(BCRYPT_HASH);
    const verifiedAt = new Date("2026-01-01T00:00:00.000Z");

    const result = User.create({
      ...baseProps(),
      email: "a@b.com",
      passwordHash: hash,
      emailVerified: verifiedAt,
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.passwordHash).toBe(hash);
    expect(result.value.emailVerified).toBe(verifiedAt);
  });
});
