import { describe, expect, it } from "vitest";

import type {
  Grant,
  Permission,
} from "@/modules/tenancy/domain/authorization/permission-matrix";
import { PERMISSION_MATRIX } from "@/modules/tenancy/domain/authorization/permission-matrix";
import type { Role } from "@/modules/tenancy/domain/value-objects/role";
import { ROLES } from "@/modules/tenancy/domain/value-objects/role";

// Matriz esperada = §12.2 del PDF, exacta (4 roles × 13 permisos). El tipado
// `Record<Role, Record<Permission, Grant>>` obliga a que este literal esté completo (SC-003).
const EXPECTED: Record<Role, Record<Permission, Grant>> = {
  OWNER: {
    "dataset:upload": "all",
    "analysis:run": "all",
    "dashboard:read": "all",
    "dashboard:create": "all",
    "dashboard:update": "all",
    "dashboard:delete": "all",
    "dashboard:share": "all",
    "member:invite": "all",
    "member:remove": "all",
    "member:change_role": "all",
    "tenant:update": "all",
    "tenant:delete": "all",
    "billing:manage": "all",
  },
  ADMIN: {
    "dataset:upload": "all",
    "analysis:run": "all",
    "dashboard:read": "all",
    "dashboard:create": "all",
    "dashboard:update": "all",
    "dashboard:delete": "all",
    "dashboard:share": "all",
    "member:invite": "all",
    "member:remove": "all",
    "member:change_role": "all",
    "tenant:update": "all",
    "tenant:delete": false,
    "billing:manage": false,
  },
  MEMBER: {
    "dataset:upload": "all",
    "analysis:run": "all",
    "dashboard:read": "all",
    "dashboard:create": "all",
    "dashboard:update": "own",
    "dashboard:delete": "own",
    "dashboard:share": false,
    "member:invite": false,
    "member:remove": false,
    "member:change_role": false,
    "tenant:update": false,
    "tenant:delete": false,
    "billing:manage": false,
  },
  VIEWER: {
    "dataset:upload": false,
    "analysis:run": false,
    "dashboard:read": "all",
    "dashboard:create": false,
    "dashboard:update": false,
    "dashboard:delete": false,
    "dashboard:share": false,
    "member:invite": false,
    "member:remove": false,
    "member:change_role": false,
    "tenant:update": false,
    "tenant:delete": false,
    "billing:manage": false,
  },
};

describe("PERMISSION_MATRIX", () => {
  it("coincide exactamente con la matriz §12.2 (SC-003)", () => {
    expect(PERMISSION_MATRIX).toEqual(EXPECTED);
  });

  it("cubre las 4 roles del conjunto cerrado (SC-003)", () => {
    expect(Object.keys(PERMISSION_MATRIX).sort()).toEqual([...ROLES].sort());
  });

  it("cada rol declara exactamente los 13 permisos (SC-003)", () => {
    for (const role of ROLES) {
      expect(Object.keys(PERMISSION_MATRIX[role])).toHaveLength(13);
    }
  });

  it("cada celda es tri-estado 'all' | 'own' | false (SC-014)", () => {
    const allowed: Grant[] = ["all", "own", false];
    for (const role of ROLES) {
      for (const grant of Object.values(PERMISSION_MATRIX[role])) {
        expect(allowed).toContain(grant);
      }
    }
  });
});
