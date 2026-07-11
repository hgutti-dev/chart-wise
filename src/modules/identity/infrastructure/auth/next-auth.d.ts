import type { DefaultSession } from "next-auth";

// Augmentación de tipos de Auth.js. Vive DENTRO de `infrastructure/auth/` (confinamiento
// NFR-002) y es global una vez incluida en la compilación. Expone la identidad en la sesión
// y RESERVA los claims de tenant/rol (costura para `tenancy`, sin poblar en esta fase).

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
    activeTenantId?: string; // RESERVADO — lo poblará `tenancy`
    role?: string; // RESERVADO — lo poblará `tenancy`
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    emailVerified?: number | null; // epoch (el JWT serializa a JSON)
    activeTenantId?: string; // RESERVADO
    role?: string; // RESERVADO
  }
}
