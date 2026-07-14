import { describe, expect, it } from "vitest";

import {
  can,
  type AuthorizationContext,
} from "@/modules/tenancy/domain/services/permission-checker";

const ownerCtx: AuthorizationContext = { role: "OWNER", userId: "user-owner" };
const viewerCtx: AuthorizationContext = { role: "VIEWER", userId: "user-viewer" };
const memberCtx: AuthorizationContext = { role: "MEMBER", userId: "user-member" };
const adminCtx: AuthorizationContext = { role: "ADMIN", userId: "user-admin" };

// SC-004: resolución plana (celdas 'all' / false), sin propiedad.
describe("can (plano)", () => {
  it("VIEWER no puede subir datasets", () => {
    expect(can("dataset:upload", viewerCtx)).toBe(false);
  });

  it("OWNER sí puede subir datasets", () => {
    expect(can("dataset:upload", ownerCtx)).toBe(true);
  });

  it("VIEWER puede leer dashboards", () => {
    expect(can("dashboard:read", viewerCtx)).toBe(true);
  });
});

// SC-005: resolución de propiedad (celda 'own' de MEMBER en dashboard:update).
describe("can (propiedad 'own')", () => {
  it("MEMBER puede actualizar su propio dashboard", () => {
    expect(can("dashboard:update", memberCtx, memberCtx.userId)).toBe(true);
  });

  it("MEMBER no puede actualizar el dashboard de otro", () => {
    expect(can("dashboard:update", memberCtx, "otro-user")).toBe(false);
  });

  it("ADMIN puede actualizar el dashboard de otro (celda 'all')", () => {
    expect(can("dashboard:update", adminCtx, "otro-user")).toBe(true);
  });

  it("'own' sin resourceOwnerId es false", () => {
    expect(can("dashboard:update", memberCtx)).toBe(false);
  });
});

// SC-014 (parte can): pura y síncrona — devuelve boolean, no Promise.
describe("can (pureza)", () => {
  it("es síncrona: su retorno es boolean, no una Promise", () => {
    const result = can("dashboard:read", viewerCtx);

    expect(typeof result).toBe("boolean");
    expect(result).not.toBeInstanceOf(Promise);
  });
});
