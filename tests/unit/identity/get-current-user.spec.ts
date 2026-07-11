import { describe, expect, it } from "vitest";

import { GetCurrentUser } from "@/modules/identity/application/use-cases/get-current-user";
import { asUserId, User } from "@/modules/identity/domain/entities/user";
import { PasswordHash } from "@/modules/identity/domain/value-objects/password-hash";
import { InMemoryUserRepository } from "@/modules/identity/infrastructure/persistence/in-memory-user.repository";
import { unwrap } from "@/shared/domain/result";

const BCRYPT_HASH = `$2b$10$${"a".repeat(53)}`;

const makeSut = () => {
  const users = new InMemoryUserRepository();
  const getCurrentUser = new GetCurrentUser(users);
  return { users, getCurrentUser };
};

describe("GetCurrentUser", () => {
  it("devuelve un DTO plano con la identidad y SIN passwordHash", async () => {
    const { users, getCurrentUser } = makeSut();
    const verifiedAt = new Date("2026-01-01T00:00:00.000Z");
    const user = unwrap(
      User.create({
        id: asUserId(crypto.randomUUID()),
        email: "ana@example.com",
        name: "Ana",
        image: "https://cdn.example.com/ana.png",
        passwordHash: PasswordHash.fromHash(BCRYPT_HASH),
        emailVerified: verifiedAt,
        createdAt: new Date(),
      }),
    );
    await users.save(user);

    const dto = await getCurrentUser.execute(user.id);

    expect(dto).toEqual({
      id: user.id,
      email: "ana@example.com",
      name: "Ana",
      image: "https://cdn.example.com/ana.png",
      emailVerified: verifiedAt,
    });
    expect(dto).not.toHaveProperty("passwordHash");
  });

  it("devuelve null cuando el usuario no existe", async () => {
    const { getCurrentUser } = makeSut();

    const dto = await getCurrentUser.execute(crypto.randomUUID());

    expect(dto).toBeNull();
  });
});
