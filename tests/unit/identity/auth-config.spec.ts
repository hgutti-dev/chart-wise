import type { Session } from "next-auth";
import { describe, expect, it } from "vitest";

import type {
  AuthenticateCredentials,
  AuthenticatedUser,
} from "@/modules/identity/application/use-cases/authenticate-credentials";
import { InvalidCredentialsError } from "@/modules/identity/domain/errors/invalid-credentials.error";
import {
  authorizeCredentials,
  buildAuthConfig,
  SESSION_MAX_AGE,
} from "@/modules/identity/infrastructure/auth/auth.config";
import { err, ok, type Result } from "@/shared/domain/result";

// Test PURO sobre `auth.config` (sin NextAuth(), sin adapter, sin env): asevera el contrato
// de config (SC-015) y el glue de credenciales `authorizeCredentials` (extraído para no
// depender de la normalización interna de `Credentials()`). La instancia real (adapter +
// NextAuth) vive en `create-auth.ts`, fuera de este test.

type AuthResult = Result<AuthenticatedUser, InvalidCredentialsError>;

// Stub del caso de uso: `authorizeCredentials` solo llama a `execute`.
const stubAuthenticate = (result: AuthResult): AuthenticateCredentials =>
  ({ execute: async (): Promise<AuthResult> => result }) as unknown as AuthenticateCredentials;

const AUTHED: AuthenticatedUser = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "ana@test.com",
  name: "Ana",
  image: null,
  emailVerified: null,
};

// Auth.js normaliza las opciones del provider bajo `.options` (deja defaults en el nivel
// superior); el flag configurado vive en `provider.options.allowDangerousEmailAccountLinking`.
type ProviderShape = {
  id?: string;
  options?: { allowDangerousEmailAccountLinking?: boolean };
};

// Config con un stub irrelevante: las aserciones de este bloque no invocan `authorize`.
const config = buildAuthConfig({ authenticate: stubAuthenticate(ok(AUTHED)) });

describe("buildAuthConfig — contrato de sesión (SC-015)", () => {
  it("fija la estrategia de sesión a jwt (obligatorio con adapter + Credentials)", () => {
    expect(config.session?.strategy).toBe("jwt");
  });

  it("fija un maxAge explícito y positivo", () => {
    expect(config.session?.maxAge).toBe(SESSION_MAX_AGE);
    expect(SESSION_MAX_AGE).toBeGreaterThan(0);
  });

  it("registra el proveedor Google sin auto-link de cuentas (FR-006)", () => {
    const google = (config.providers as ProviderShape[]).find((p) => p.id === "google");
    expect(google).toBeDefined();
    expect(google?.options?.allowDangerousEmailAccountLinking).toBe(false);
  });
});

describe("authorizeCredentials — glue del provider Credentials", () => {
  it("devuelve la identidad cuando el caso de uso responde ok", async () => {
    const user = await authorizeCredentials(stubAuthenticate(ok(AUTHED)), {
      email: "ana@test.com",
      password: "supersecret",
    });
    expect(user).toMatchObject({ id: AUTHED.id, email: AUTHED.email });
  });

  it("no expone el passwordHash en la identidad devuelta (NFR-004)", async () => {
    const user = await authorizeCredentials(stubAuthenticate(ok(AUTHED)), {
      email: "ana@test.com",
      password: "supersecret",
    });
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("devuelve null cuando el caso de uso responde err (sin enumeración)", async () => {
    const user = await authorizeCredentials(
      stubAuthenticate(err(new InvalidCredentialsError())),
      { email: "ana@test.com", password: "wrong-password" },
    );
    expect(user).toBeNull();
  });

  it("devuelve null ante credenciales malformadas (guard Zod)", async () => {
    const user = await authorizeCredentials(stubAuthenticate(ok(AUTHED)), {
      email: "ana@test.com",
    });
    expect(user).toBeNull();
  });
});

// SC-011: la augmentación de tipos (next-auth.d.ts, confinada en infrastructure/auth/) debe
// hacer que `pnpm typecheck` compile el acceso a `session.user.id`/`emailVerified` y a los
// claims RESERVADOS `activeTenantId?`/`role?`. Esta función solo debe TIPAR; su ejecución es
// irrelevante (el runtime de Vitest borra el `import type`).
const readsSessionContract = (
  session: Session,
): [string, Date | null, string | undefined, string | undefined] => [
  session.user.id,
  session.user.emailVerified,
  session.activeTenantId,
  session.role,
];

describe("contrato de sesión augmentado (SC-011)", () => {
  it("expone id/emailVerified y reserva activeTenantId?/role? (verificado en typecheck)", () => {
    expect(readsSessionContract).toBeTypeOf("function");
  });
});
