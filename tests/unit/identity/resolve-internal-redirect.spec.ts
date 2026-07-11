import { describe, expect, it } from "vitest";

import { resolveInternalRedirect } from "@/modules/identity/application/redirect/resolve-internal-redirect";

// SC-009 (FR-012): helper puro anti open-redirect. Solo acepta rutas relativas same-origin;
// cualquier URL absoluta/externa cae al default seguro.
describe("resolveInternalRedirect", () => {
  it("acepta una ruta relativa same-origin y la devuelve tal cual (SC-009)", () => {
    expect(resolveInternalRedirect("/app/x")).toBe("/app/x");
  });

  it("descarta una URL absoluta externa hacia el default seguro (SC-009)", () => {
    expect(resolveInternalRedirect("https://evil.com")).toBe("/profile");
  });

  it("descarta http:// externo", () => {
    expect(resolveInternalRedirect("http://evil.com/app")).toBe("/profile");
  });

  it("descarta URLs protocol-relative (//host)", () => {
    expect(resolveInternalRedirect("//evil.com")).toBe("/profile");
  });

  it("descarta el truco de backslash (/\\host) que el navegador normaliza a externo", () => {
    expect(resolveInternalRedirect("/\\evil.com")).toBe("/profile");
  });

  it("descarta valores vacíos, nulos o indefinidos", () => {
    expect(resolveInternalRedirect("")).toBe("/profile");
    expect(resolveInternalRedirect(null)).toBe("/profile");
    expect(resolveInternalRedirect(undefined)).toBe("/profile");
  });

  it("preserva query string y hash de una ruta interna", () => {
    expect(resolveInternalRedirect("/app/x?tab=1#top")).toBe("/app/x?tab=1#top");
  });

  it("respeta el fallback explícito cuando el callback es externo", () => {
    expect(resolveInternalRedirect("https://evil.com", "/login")).toBe("/login");
  });
});
