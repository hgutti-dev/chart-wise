// Config de rutas para el gate de navegación. La verificación autoritativa la hace el layout
// privado con `auth()` (runtime Node); el middleware (Edge, Fase G) solo hará redirección
// barata por presencia de cookie usando estas listas. Sin lógica de negocio ni permisos
// (eso es de `tenancy`). `config/` nunca contiene permisos.

export const LOGIN_ROUTE = "/login";
export const DEFAULT_AUTHENTICATED_REDIRECT = "/profile";

// Accesibles sin sesión: login, registro y confirmación de email.
export const PUBLIC_ROUTES = ["/login", "/register", "/verify-email"] as const;

// Exigen sesión: sin cookie de sesión, el middleware redirige a /login.
export const PROTECTED_ROUTES = ["/profile"] as const;

const matches = (routes: readonly string[], pathname: string): boolean =>
  routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));

export const isPublicRoute = (pathname: string): boolean =>
  matches(PUBLIC_ROUTES, pathname);

export const isProtectedRoute = (pathname: string): boolean =>
  matches(PROTECTED_ROUTES, pathname);
