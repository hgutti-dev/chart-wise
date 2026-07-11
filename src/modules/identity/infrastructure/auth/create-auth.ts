import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";

import type { PrismaClient } from "@/generated/prisma/client";

import { type AuthConfigDeps, buildAuthConfig } from "./auth.config";

export interface CreateAuthDeps extends AuthConfigDeps {
  readonly prisma: PrismaClient;
}

// Composición de la instancia real de Auth.js. Vive en `infrastructure/auth/` (confinamiento
// NFR-002) junto al resto del acoplamiento a `@auth/*`/`next-auth`. El `PrismaAdapter` está
// tipado contra `@prisma/client`; el cliente generado es estructuralmente compatible pero
// nominalmente distinto y, en modo JWT, no se invocan sus métodos de sesión (no hay tabla
// `Session`) -> cast acotado al tipo que espera el adapter (R6).
export function createAuth({ prisma, authenticate }: CreateAuthDeps) {
  return NextAuth({
    adapter: PrismaAdapter(prisma as unknown as Parameters<typeof PrismaAdapter>[0]),
    ...buildAuthConfig({ authenticate }),
  });
}
