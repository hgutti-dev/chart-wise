import { describe, expect, it } from "vitest";

import { InvalidRoleError } from "@/modules/tenancy/domain/errors";
import { Role } from "@/modules/tenancy/domain/value-objects/role";
import { DomainError } from "@/shared/domain/domain-error";
import { isErr, isOk } from "@/shared/domain/result";

// Dominio puro: Role.create es una función pura sobre su input (sin DB, sin async). Cubre SC-002.
describe("Role.create", () => {
  it("acepta cada uno de los 4 roles del conjunto cerrado", () => {
    for (const raw of ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const) {
      const result = Role.create(raw);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toBe(raw);
    }
  });

  it("normaliza recortando espacios y pasando a mayúsculas", () => {
    const result = Role.create("  owner ");

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toBe("OWNER");
  });

  it("rechaza un valor fuera del conjunto con InvalidRoleError", () => {
    const result = Role.create("root");

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(InvalidRoleError);
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe("tenancy.role.invalid");
  });

  it("rechaza la cadena vacía con InvalidRoleError (devuelve Result, no lanza)", () => {
    const result = Role.create("");

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(InvalidRoleError);
    expect(result.error.code).toBe("tenancy.role.invalid");
  });
});
