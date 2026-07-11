import { describe, expect, it, vi } from "vitest";

import { AuthenticateCredentials } from "@/modules/identity/application/use-cases/authenticate-credentials";
import { asUserId, User } from "@/modules/identity/domain/entities/user";
import { InvalidCredentialsError } from "@/modules/identity/domain/errors";
import { PasswordHash } from "@/modules/identity/domain/value-objects/password-hash";
import { InMemoryUserRepository } from "@/modules/identity/infrastructure/persistence/in-memory-user.repository";
import { isErr, isOk, unwrap } from "@/shared/domain/result";

import { FakePasswordHasher } from "./fakes/password-hasher.fake";

const EMAIL = "ana@example.com";
const PASSWORD = "correct-horse-battery";

const makeSut = () => {
  const users = new InMemoryUserRepository();
  const hasher = new FakePasswordHasher();
  const authenticate = new AuthenticateCredentials(users, hasher);
  return { users, hasher, authenticate };
};

const seedUser = async (
  users: InMemoryUserRepository,
  hasher: FakePasswordHasher,
  options: { password?: string | null; emailVerified?: Date | null } = {},
) => {
  const { password = PASSWORD, emailVerified = null } = options;
  const passwordHash =
    password === null
      ? null
      : PasswordHash.fromHash(await hasher.hash(password));
  const user = unwrap(
    User.create({
      id: asUserId(crypto.randomUUID()),
      email: EMAIL,
      name: "Ana",
      passwordHash,
      emailVerified,
      createdAt: new Date(),
    }),
  );
  await users.save(user);
  return user;
};

describe("AuthenticateCredentials", () => {
  it("autentica credenciales correctas y devuelve un DTO sin passwordHash", async () => {
    const { users, hasher, authenticate } = makeSut();
    const verifiedAt = new Date("2026-01-01T00:00:00.000Z");
    const user = await seedUser(users, hasher, { emailVerified: verifiedAt });

    const result = await authenticate.execute({ email: EMAIL, password: PASSWORD });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.id).toBe(user.id);
    expect(result.value.email).toBe(EMAIL);
    expect(result.value.emailVerified).toEqual(verifiedAt);
    expect(result.value).not.toHaveProperty("passwordHash");
  });

  it("email inexistente → InvalidCredentialsError y ejecuta compare igualmente (SC-007, NFR-006)", async () => {
    const { hasher, authenticate } = makeSut();
    const compareSpy = vi.spyOn(hasher, "compare");

    const result = await authenticate.execute({
      email: "nadie@example.com",
      password: PASSWORD,
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(InvalidCredentialsError);
    // Tiempo constante: compara contra un hash dummy aunque el email no exista.
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });

  it("contraseña incorrecta → InvalidCredentialsError y ejecuta compare (SC-007)", async () => {
    const { users, hasher, authenticate } = makeSut();
    await seedUser(users, hasher);
    const compareSpy = vi.spyOn(hasher, "compare");

    const result = await authenticate.execute({ email: EMAIL, password: "wrong-password" });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(InvalidCredentialsError);
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });

  it("devuelve el MISMO error (no enumeración) para email inexistente y contraseña incorrecta (NFR-005)", async () => {
    const { users, hasher, authenticate } = makeSut();
    await seedUser(users, hasher);

    const unknownEmail = await authenticate.execute({
      email: "nadie@example.com",
      password: PASSWORD,
    });
    const wrongPassword = await authenticate.execute({
      email: EMAIL,
      password: "wrong-password",
    });

    expect(isErr(unknownEmail)).toBe(true);
    expect(isErr(wrongPassword)).toBe(true);
    if (!isErr(unknownEmail) || !isErr(wrongPassword)) return;
    expect(unknownEmail.error.code).toBe(wrongPassword.error.code);
    expect(unknownEmail.error).toBeInstanceOf(InvalidCredentialsError);
    expect(wrongPassword.error).toBeInstanceOf(InvalidCredentialsError);
  });

  it("usuario solo-OAuth (sin passwordHash) → InvalidCredentialsError y ejecuta compare (§8)", async () => {
    const { users, hasher, authenticate } = makeSut();
    await seedUser(users, hasher, { password: null }); // cuenta solo-OAuth
    const compareSpy = vi.spyOn(hasher, "compare");

    const result = await authenticate.execute({ email: EMAIL, password: PASSWORD });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(InvalidCredentialsError);
    // Tiempo constante también cuando la cuenta existe pero no tiene credenciales.
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });
});
