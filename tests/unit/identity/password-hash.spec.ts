import { describe, expect, it } from "vitest";

import { PasswordHash } from "@/modules/identity/domain/value-objects/password-hash";

// Un hash bcrypt real tiene 60 chars con prefijo $2b$<cost>$. Fixture de forma válida.
const BCRYPT_HASH = `$2b$10$${"a".repeat(53)}`;

describe("PasswordHash.fromHash", () => {
  it("envuelve un hash bcrypt válido ($2*)", () => {
    const hash = PasswordHash.fromHash(BCRYPT_HASH);

    expect(hash.value).toBe(BCRYPT_HASH);
  });

  it("lanza si el valor no es un hash bcrypt (corrupción, error inesperado)", () => {
    expect(() => PasswordHash.fromHash("plaintext")).toThrow();
  });

  it("NUNCA expone el hash al serializar a JSON (NFR-004)", () => {
    const hash = PasswordHash.fromHash(BCRYPT_HASH);

    const serialized = JSON.stringify({ passwordHash: hash });

    expect(serialized).not.toContain(BCRYPT_HASH);
  });
});
