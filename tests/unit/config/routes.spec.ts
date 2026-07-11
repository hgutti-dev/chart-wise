import { describe, expect, it } from "vitest";

import {
  DEFAULT_AUTHENTICATED_REDIRECT,
  isProtectedRoute,
  isPublicRoute,
  LOGIN_ROUTE,
} from "@/config/routes";

// Listas de rutas consumidas por el middleware (Fase G) y las acciones: qué es público
// (login/registro/verificación) y qué exige sesión (área privada). Helpers PUROS.
describe("config/routes", () => {
  it("marca las páginas de auth como públicas", () => {
    expect(isPublicRoute("/login")).toBe(true);
    expect(isPublicRoute("/register")).toBe(true);
    expect(isPublicRoute("/verify-email")).toBe(true);
  });

  it("una subruta de una pública sigue siendo pública", () => {
    expect(isPublicRoute("/verify-email/anything")).toBe(true);
  });

  it("el perfil es privado, no público", () => {
    expect(isPublicRoute("/profile")).toBe(false);
    expect(isProtectedRoute("/profile")).toBe(true);
    expect(isProtectedRoute("/profile/settings")).toBe(true);
  });

  it("las páginas públicas no son rutas protegidas", () => {
    expect(isProtectedRoute("/login")).toBe(false);
    expect(isProtectedRoute("/")).toBe(false);
  });

  it("expone el destino de login y el redirect autenticado por defecto", () => {
    expect(LOGIN_ROUTE).toBe("/login");
    expect(DEFAULT_AUTHENTICATED_REDIRECT).toBe("/profile");
  });
});
