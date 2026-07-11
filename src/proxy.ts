import { type NextRequest, NextResponse } from "next/server";

import { isProtectedRoute, LOGIN_ROUTE } from "@/config/routes";

// Proxy de navegación (convención `proxy`, antes `middleware` en Next < 16): SOLO redirección
// barata por PRESENCIA de la cookie de sesión. NO importa el ORM (cliente de base de datos) ni
// la librería de autenticación, ni accede a la DB; el confinamiento del linter y el test de
// arquitectura lo verifican. La verificación autoritativa de la sesión la hace `auth()` en
// `(private)/layout.tsx`: aquí no se decodifica ni valida el JWT (SC-012). El proxy corre en
// runtime Node por defecto, pero se mantiene deliberadamente sin acceso a DB (gate barato).

// Cookie de sesión JWT de la librería de auth (v5): sin prefijo en HTTP local, con `__Secure-`
// bajo HTTPS.
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

const hasSessionCookie = (request: NextRequest): boolean =>
  SESSION_COOKIES.some((name) => request.cookies.has(name));

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  // Solo se fuerza el redirect en el caso sin ambigüedad: ruta protegida y SIN cookie (no hay
  // sesión posible). El caso inverso (cookie presente en una pública) NO se redirige para
  // evitar bucles con cookies caducadas —el layout las rebota a /login de todas formas—.
  if (isProtectedRoute(pathname) && !hasSessionCookie(request)) {
    const loginUrl = new URL(LOGIN_ROUTE, request.url);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Corre en rutas de navegación; excluye API (Auth.js gestiona /api/auth), assets de Next y
  // cualquier fichero con extensión (estáticos).
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
