import type { DefaultSession } from "next-auth";

// Augmentación de tipos de Auth.js. Vive DENTRO de `infrastructure/auth/` (confinamiento
// NFR-002) y es global una vez incluida en la compilación. Expone la identidad en la sesión
// y tipa los claims de tenant/rol que `tenancy` puebla (compuesto en app/, FR-009).

// El rol se estrecha de `string` a la unión literal cerrada (Fase 3, T061). Se declara
// ESTRUCTURALMENTE, sin importar el `Role` de `tenancy`, para no invertir la dirección de
// dependencias (identity ↛ tenancy, NFR-004); `Role.create()` lo revalida al reconstruir el
// `AuthContext`. Mantener sincronizado con `tenancy/domain/value-objects/role.ts`.
type SessionRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

declare module "next-auth" {
  // `emailVerified` lo devuelve nuestro `authorize` de Credentials y lo fija el adapter en
  // el alta OAuth; se declara opcional en el `User` base para que ambos caminos tipen.
  interface User {
    emailVerified?: Date | null;
  }

  interface Session {
    user: {
      id: string;
      emailVerified: Date | null;
    } & DefaultSession["user"];
    activeTenantId?: string; // lo puebla `tenancy` (compuesto en app/)
    role?: SessionRole; // lo puebla `tenancy` (compuesto en app/)
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    emailVerified?: number | null; // epoch (el JWT serializa a JSON)
    activeTenantId?: string; // lo puebla `tenancy`
    role?: SessionRole; // lo puebla `tenancy`
  }
}
