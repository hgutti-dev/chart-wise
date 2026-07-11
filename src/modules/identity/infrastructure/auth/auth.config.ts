import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";

import { isErr } from "@/shared/domain/result";

import type { AuthenticateCredentials } from "../../application/use-cases/authenticate-credentials";

// 30 días. Se fija EXPLÍCITAMENTE porque, con un adapter presente, Auth.js usaría sesiones
// `database` por defecto y, sin tabla `Session`, el login OAuth rompería en runtime (R2 /
// SC-015). El JWT no es revocable antes de expirar (blocklist diferido a hardening, NFR-011).
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

// `authorize` recibe `unknown`: validamos la forma en la frontera del provider (Zod).
const credentialsSchema = z.object({
  email: z.string(),
  password: z.string(),
});

export interface AuthConfigDeps {
  readonly authenticate: AuthenticateCredentials;
}

// Identidad mínima que `authorize` entrega a Auth.js (sin `passwordHash`, NFR-004).
export interface AuthorizedUser {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly image: string | null;
  readonly emailVerified: Date | null;
}

// Glue del provider Credentials extraído como función pura y exportada: valida la forma en
// la frontera (Zod) y delega en el caso de uso (tiempo constante, sin enumeración —
// NFR-005/006). Un fallo -> null (Auth.js lo traduce a login rechazado). Se prueba directo,
// sin depender de la normalización interna de `Credentials()` (que sustituye `authorize` por
// un placeholder hasta que `NextAuth()` fusiona `provider.options`).
export async function authorizeCredentials(
  authenticate: AuthenticateCredentials,
  raw: unknown,
): Promise<AuthorizedUser | null> {
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) return null;

  const result = await authenticate.execute(parsed.data);
  if (isErr(result)) return null;

  const user = result.value;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    emailVerified: user.emailVerified,
  };
}

// Config estática de Auth.js: providers + sesión JWT + páginas + callbacks. NO incluye el
// adapter ni llama a `NextAuth()`, así que es un objeto puro inspeccionable en un test sin
// env ni Prisma (SC-015). La instancia real (adapter + NextAuth) se compone en `create-auth.ts`.
export function buildAuthConfig({ authenticate }: AuthConfigDeps): NextAuthConfig {
  return {
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
    pages: { signIn: "/login" },
    providers: [
      Credentials({
        credentials: { email: {}, password: {} },
        authorize: (raw) => authorizeCredentials(authenticate, raw),
      }),
      // Sin auto-link (default seguro): un Google con un email ya registrado por credenciales
      // sigue el camino OAuthAccountNotLinked; no fusiona cuentas en silencio (FR-006).
      Google({ allowDangerousEmailAccountLinking: false }),
    ],
    callbacks: {
      // En el sign-in `user` está presente: propagamos `emailVerified` al token como epoch
      // (el JWT serializa a JSON). `token.sub` ya transporta el id del usuario.
      jwt({ token, user }) {
        if (user) {
          const emailVerified = user.emailVerified ?? null;
          token.emailVerified =
            emailVerified instanceof Date ? emailVerified.getTime() : emailVerified;
        }
        return token;
      },
      // Exponemos id/emailVerified en la sesión. `activeTenantId?`/`role?` quedan RESERVADOS:
      // los poblará `tenancy` en una fase posterior (costura tipada, sin poblar aquí, FR-009).
      session({ session, token }) {
        if (token.sub) {
          session.user.id = token.sub;
        }
        session.user.emailVerified =
          typeof token.emailVerified === "number" ? new Date(token.emailVerified) : null;
        return session;
      },
    },
  };
}
