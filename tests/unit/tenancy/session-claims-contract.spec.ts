import type { Session } from "next-auth";
import { describe, expect, it } from "vitest";

import type { Role } from "@/modules/tenancy";

// SC-010: tras poblar los claims, `session.role` está tipado como la unión literal `Role`
// (expuesta desde @/modules/tenancy), no como `string`, y `activeTenantId` como `string`. Es una
// aserción de TIPO — la valida `pnpm typecheck`; el runtime solo comprueba que la función existe.
// `import type` evita cargar `tenancy/di` (env/Prisma) en el lane unit.
const readsPopulatedClaims = (
  session: Session,
): [Role | undefined, string | undefined] => [session.role, session.activeTenantId];

describe("contrato de claims de tenancy en la sesión (SC-010)", () => {
  it("session.role es asignable a Role (unión literal) y activeTenantId a string", () => {
    expect(readsPopulatedClaims).toBeTypeOf("function");
  });
});
