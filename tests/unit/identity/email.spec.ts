import { describe, expect, it } from "vitest";

import { InvalidEmailError } from "@/modules/identity/domain/errors";
import { Email } from "@/modules/identity/domain/value-objects/email";
import { DomainError } from "@/shared/domain/domain-error";
import { isErr, isOk } from "@/shared/domain/result";

// Dominio puro: Email.create es una función pura sobre su input. Cubre SC-004.
describe("Email.create", () => {
  it("rechaza una cadena sin forma de email con un DomainError", () => {
    const result = Email.create("no-es-email");

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return; // narrowing para TS
    expect(result.error).toBeInstanceOf(InvalidEmailError);
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe("identity.email.invalid");
  });

  it("normaliza a minúsculas y recorta espacios en un email válido", () => {
    const result = Email.create("  A@B.com ");

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.value).toBe("a@b.com");
  });

  it("trata una cadena solo de espacios como inválida", () => {
    const result = Email.create("   ");

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(InvalidEmailError);
  });
});
