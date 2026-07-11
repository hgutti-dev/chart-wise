import { describe, expect, it } from "vitest";

import { RequestEmailVerification } from "@/modules/identity/application/use-cases/request-email-verification";
import { VerifyEmail } from "@/modules/identity/application/use-cases/verify-email";
import { asUserId, User } from "@/modules/identity/domain/entities/user";
import { VerificationToken } from "@/modules/identity/domain/entities/verification-token";
import { InvalidVerificationTokenError } from "@/modules/identity/domain/errors";
import { Email } from "@/modules/identity/domain/value-objects/email";
import { InMemoryUserRepository } from "@/modules/identity/infrastructure/persistence/in-memory-user.repository";
import { InMemoryVerificationTokenRepository } from "@/modules/identity/infrastructure/persistence/in-memory-verification-token.repository";
import { isErr, isOk, unwrap } from "@/shared/domain/result";

import { FakeEmailSender } from "./fakes/email-sender.fake";

const EMAIL = "ana@example.com";

const makeSut = () => {
  const users = new InMemoryUserRepository();
  const tokens = new InMemoryVerificationTokenRepository();
  const emailSender = new FakeEmailSender();
  const requestVerification = new RequestEmailVerification(users, tokens, emailSender);
  const verifyEmail = new VerifyEmail(users, tokens);
  return { users, tokens, emailSender, requestVerification, verifyEmail };
};

const seedUser = async (users: InMemoryUserRepository, email = EMAIL) => {
  const user = unwrap(
    User.create({
      id: asUserId(crypto.randomUUID()),
      email,
      createdAt: new Date(),
    }),
  );
  await users.save(user);
  return user;
};

const emailVerifiedOf = async (users: InMemoryUserRepository, email = EMAIL) => {
  const found = await users.findByEmail(unwrap(Email.create(email)));
  return found?.emailVerified ?? null;
};

describe("RequestEmailVerification", () => {
  it("email conocido: persiste un token, lo envía y devuelve ok", async () => {
    const { users, tokens, emailSender, requestVerification } = makeSut();
    await seedUser(users);

    const result = await requestVerification.execute(EMAIL);

    expect(isOk(result)).toBe(true);
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]?.to).toBe(EMAIL);
    expect(emailSender.sent[0]?.token).toBeTruthy();
    // El token quedó persistido (consumirlo lo demuestra).
    const consumed = await tokens.use(EMAIL, emailSender.sent[0]!.token);
    expect(consumed).not.toBeNull();
  });

  it("email desconocido: misma respuesta (ok) y NO envía nada (no enumeración, NFR-007)", async () => {
    const { emailSender, requestVerification } = makeSut();

    const result = await requestVerification.execute("nadie@example.com");

    expect(isOk(result)).toBe(true); // misma respuesta que el caso conocido
    expect(emailSender.sent).toHaveLength(0);
  });

  it("normaliza el email antes de buscar (casing/espaciado no evita el envío)", async () => {
    const { users, emailSender, requestVerification } = makeSut();
    await seedUser(users);

    const result = await requestVerification.execute("  Ana@Example.COM ");

    expect(isOk(result)).toBe(true);
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]?.to).toBe(EMAIL);
  });
});

describe("VerifyEmail", () => {
  const seedToken = async (
    tokens: InMemoryVerificationTokenRepository,
    overrides: { identifier?: string; token?: string; expires?: Date } = {},
  ) => {
    const {
      identifier = EMAIL,
      token = "tok-123",
      expires = new Date(Date.now() + 60 * 60 * 1000),
    } = overrides;
    await tokens.create(VerificationToken.issue({ identifier, token, expires }));
    return token;
  };

  it("token válido: fija emailVerified en el usuario (SC-008)", async () => {
    const { users, tokens, verifyEmail } = makeSut();
    await seedUser(users);
    const token = await seedToken(tokens);

    const result = await verifyEmail.execute({ identifier: EMAIL, token });

    expect(isOk(result)).toBe(true);
    expect(await emailVerifiedOf(users)).toBeInstanceOf(Date);
  });

  it("normaliza el identifier: un email con distinto casing/espaciado verifica igual", async () => {
    const { users, tokens, verifyEmail } = makeSut();
    await seedUser(users); // EMAIL normalizado
    const token = await seedToken(tokens); // token emitido para EMAIL normalizado

    const result = await verifyEmail.execute({
      identifier: "  Ana@Example.COM ",
      token,
    });

    expect(isOk(result)).toBe(true);
    expect(await emailVerifiedOf(users)).toBeInstanceOf(Date);
  });

  it("token de OTRO identifier: rechaza y no verifica (SC-008)", async () => {
    const { users, tokens, verifyEmail } = makeSut();
    await seedUser(users);
    const token = await seedToken(tokens); // token emitido para EMAIL

    const result = await verifyEmail.execute({
      identifier: "otro@example.com",
      token,
    });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(InvalidVerificationTokenError);
    expect(await emailVerifiedOf(users)).toBeNull();
  });

  it("token ya usado: un segundo consumo falla (SC-008)", async () => {
    const { users, tokens, verifyEmail } = makeSut();
    await seedUser(users);
    const token = await seedToken(tokens);

    const first = await verifyEmail.execute({ identifier: EMAIL, token });
    const second = await verifyEmail.execute({ identifier: EMAIL, token });

    expect(isOk(first)).toBe(true);
    expect(isErr(second)).toBe(true);
    if (!isErr(second)) return;
    expect(second.error).toBeInstanceOf(InvalidVerificationTokenError);
  });

  it("token expirado: rechaza y no verifica (SC-008)", async () => {
    const { users, tokens, verifyEmail } = makeSut();
    await seedUser(users);
    const token = await seedToken(tokens, {
      expires: new Date(Date.now() - 1000), // ya vencido
    });

    const result = await verifyEmail.execute({ identifier: EMAIL, token });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(InvalidVerificationTokenError);
    expect(await emailVerifiedOf(users)).toBeNull();
  });

  it("token inexistente: rechaza con InvalidVerificationTokenError", async () => {
    const { users, verifyEmail } = makeSut();
    await seedUser(users);

    const result = await verifyEmail.execute({ identifier: EMAIL, token: "no-existe" });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(InvalidVerificationTokenError);
  });
});
