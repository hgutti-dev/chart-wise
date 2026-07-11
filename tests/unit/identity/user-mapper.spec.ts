import { describe, expect, it } from "vitest";

import { asUserId, User } from "@/modules/identity/domain/entities/user";
import { PasswordHash } from "@/modules/identity/domain/value-objects/password-hash";
import {
  toDomain,
  toPersistence,
} from "@/modules/identity/infrastructure/persistence/mappers/user.mapper";
import { isOk } from "@/shared/domain/result";

const HASH = `$2b$10$${"x".repeat(53)}`;
const ID = "11111111-1111-1111-1111-111111111111";
const CREATED = new Date("2026-01-01T00:00:00.000Z");

describe("user.mapper", () => {
  it("toPersistence extrae la fila escalar con el hash en claro y el email normalizado", () => {
    const created = User.create({
      id: asUserId(ID),
      email: "  A@B.com ",
      passwordHash: PasswordHash.fromHash(HASH),
      createdAt: CREATED,
    });
    if (!isOk(created)) throw new Error("fixture inválido");

    expect(toPersistence(created.value)).toEqual({
      id: ID,
      email: "a@b.com",
      name: null,
      image: null,
      passwordHash: HASH,
      emailVerified: null,
      createdAt: CREATED,
    });
  });

  it("toDomain rehidrata un User desde una fila persistida", () => {
    const user = toDomain({
      id: ID,
      email: "a@b.com",
      name: "Ana",
      image: null,
      passwordHash: HASH,
      emailVerified: CREATED,
      createdAt: CREATED,
    });

    expect(user.id).toBe(ID);
    expect(user.email.value).toBe("a@b.com");
    expect(user.name).toBe("Ana");
    expect(user.passwordHash?.value).toBe(HASH);
    expect(user.emailVerified).toEqual(CREATED);
  });

  it("round-trip de una cuenta solo-OAuth (hash null)", () => {
    const created = User.create({
      id: asUserId(ID),
      email: "oauth@test.com",
      passwordHash: null,
      emailVerified: CREATED,
      createdAt: CREATED,
    });
    if (!isOk(created)) throw new Error("fixture inválido");

    const back = toDomain(toPersistence(created.value));
    expect(back.passwordHash).toBeNull();
    expect(back.email.value).toBe("oauth@test.com");
  });
});
