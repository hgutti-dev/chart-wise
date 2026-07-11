import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

// El proxy (convención `proxy`, antes `middleware`) solo mira la PRESENCIA de la cookie de
// sesión (gate barato); la verificación autoritativa la hace `auth()` en el layout privado.
// Aquí se prueba la decisión de redirección con `NextRequest` reales (sin DB, sin Auth.js).
const request = (path: string, cookie?: string): NextRequest =>
  new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: cookie ? { cookie } : undefined,
  });

describe("proxy (gate por cookie de sesión)", () => {
  it("ruta protegida SIN cookie -> 307 a /login conservando la ruta en callbackUrl", () => {
    const res = proxy(request("/profile"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    const url = new URL(location as string);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("callbackUrl")).toBe("/profile");
  });

  it("ruta protegida con cookie de sesión (authjs) -> continúa", () => {
    const res = proxy(request("/profile/settings", "authjs.session-token=abc"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("ruta protegida con cookie __Secure- (HTTPS) -> continúa", () => {
    const res = proxy(request("/profile", "__Secure-authjs.session-token=abc"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("ruta pública sin cookie -> continúa (no redirige el login)", () => {
    expect(proxy(request("/login")).headers.get("location")).toBeNull();
    expect(proxy(request("/register")).headers.get("location")).toBeNull();
  });
});
