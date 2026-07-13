import { describe, expect, it } from "vitest";

import type { AuthContext } from "@/modules/tenancy/application/auth-context";
import { requirePermission } from "@/modules/tenancy/application/authorization/require-permission";
import { PermissionDeniedError } from "@/modules/tenancy/domain/errors";
import type { Role } from "@/modules/tenancy/domain/value-objects/role";
import { DomainError } from "@/shared/domain/domain-error";
import { isErr, isOk } from "@/shared/domain/result";
import { asTenantId } from "@/shared/domain/tenant-id";

const ctx = (role: Role, userId: string): AuthContext => ({
  tenantId: asTenantId("11111111-1111-1111-1111-111111111111"),
  userId,
  role,
});

// SC-006: el guard corre en el servidor y devuelve Result (error esperado, no excepción).
describe("requirePermission", () => {
  it("deniega a un VIEWER subir un dataset con PermissionDeniedError", () => {
    const result = requirePermission(ctx("VIEWER", "u-viewer"), "dataset:upload");

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(PermissionDeniedError);
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe("tenancy.authorization.denied");
  });

  it("permite a un OWNER subir un dataset (Result.ok con void)", () => {
    const result = requirePermission(ctx("OWNER", "u-owner"), "dataset:upload");

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toBeUndefined();
  });

  it("permite a un MEMBER editar su propio dashboard (celda 'own')", () => {
    const member = ctx("MEMBER", "u-member");

    const result = requirePermission(member, "dashboard:update", member.userId);

    expect(isOk(result)).toBe(true);
  });

  it("deniega a un MEMBER editar el dashboard de otro (celda 'own')", () => {
    const result = requirePermission(
      ctx("MEMBER", "u-member"),
      "dashboard:update",
      "otro-user",
    );

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(PermissionDeniedError);
  });
});
