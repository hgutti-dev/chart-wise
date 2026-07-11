import { describe, expect, it, vi } from "vitest";

import { RegisterUser } from "@/modules/identity/application/use-cases/register-user";
import {
  EmailAlreadyRegisteredError,
  InvalidEmailError,
  WeakPasswordError,
} from "@/modules/identity/domain/errors";
import { UserRegistered } from "@/modules/identity/domain/events/user-registered.event";
import { InMemoryUserRepository } from "@/modules/identity/infrastructure/persistence/in-memory-user.repository";
import { DomainError } from "@/shared/domain/domain-error";
import { InMemoryEventBus } from "@/shared/infrastructure/in-memory-event-bus";
import { isErr, isOk } from "@/shared/domain/result";

import { FakePasswordHasher } from "./fakes/password-hasher.fake";

const makeSut = () => {
  const users = new InMemoryUserRepository();
  const hasher = new FakePasswordHasher();
  const events = new InMemoryEventBus();
  const published: UserRegistered[] = [];
  events.subscribe<UserRegistered>(UserRegistered.eventName, (event) => {
    published.push(event);
  });
  const registerUser = new RegisterUser(users, hasher, events);
  return { registerUser, users, hasher, events, published };
};

const validInput = {
  email: "  Ana@Example.COM ",
  password: "correct-horse-battery",
  name: "Ana",
};

describe("RegisterUser", () => {
  it("registra un usuario nuevo, lo persiste y publica UserRegistered", async () => {
    const { registerUser, users, published } = makeSut();

    const result = await registerUser.execute(validInput);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    // El VO Email normaliza (minúsculas + trim).
    expect(result.value.email.value).toBe("ana@example.com");

    const persisted = await users.findByEmail(result.value.email);
    expect(persisted).not.toBeNull();

    expect(published).toHaveLength(1);
    expect(published[0]).toBeInstanceOf(UserRegistered);
    expect(published[0]?.userId).toBe(result.value.id);
    expect(published[0]?.email).toBe("ana@example.com");
  });

  it("persiste la contraseña como hash bcrypt ($2*), nunca en texto plano (SC-006, NFR-004)", async () => {
    const { registerUser, hasher } = makeSut();
    const hashSpy = vi.spyOn(hasher, "hash");

    const result = await registerUser.execute(validInput);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const stored = result.value.passwordHash;
    expect(stored).not.toBeNull();
    expect(stored?.value).toMatch(/^\$2[aby]?\$/);
    expect(stored?.value).not.toBe(validInput.password);
    // El hashing pasa por el puerto con el texto plano.
    expect(hashSpy).toHaveBeenCalledWith(validInput.password);
  });

  it("rechaza un email ya registrado con EmailAlreadyRegisteredError y no republica (SC-006)", async () => {
    const { registerUser, published } = makeSut();

    const first = await registerUser.execute(validInput);
    expect(isOk(first)).toBe(true);

    // Mismo email con distinto casing/espaciado: sigue siendo duplicado tras normalizar.
    const second = await registerUser.execute({
      ...validInput,
      email: "ana@example.com",
    });

    expect(isErr(second)).toBe(true);
    if (!isErr(second)) return;
    expect(second.error).toBeInstanceOf(EmailAlreadyRegisteredError);
    expect(published).toHaveLength(1); // no se publicó un segundo evento
  });

  it("rechaza un email inválido con un DomainError", async () => {
    const { registerUser } = makeSut();

    const result = await registerUser.execute({ ...validInput, email: "no-es-email" });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(InvalidEmailError);
    expect(result.error).toBeInstanceOf(DomainError);
  });

  it("rechaza una contraseña débil con WeakPasswordError", async () => {
    const { registerUser } = makeSut();

    const result = await registerUser.execute({ ...validInput, password: "short" });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(WeakPasswordError);
  });
});
