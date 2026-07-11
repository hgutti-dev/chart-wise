import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "@/config/env";
import { PrismaClient } from "@/generated/prisma/client";
import type { EventBus } from "@/shared/application/event-bus";
import { InMemoryEventBus } from "@/shared/infrastructure/in-memory-event-bus";

import { AuthenticateCredentials } from "./application/use-cases/authenticate-credentials";
import { GetCurrentUser } from "./application/use-cases/get-current-user";
import { RegisterUser } from "./application/use-cases/register-user";
import { RequestEmailVerification } from "./application/use-cases/request-email-verification";
import { VerifyEmail } from "./application/use-cases/verify-email";
import type { UserRepository } from "./domain/ports/user.repository";
import type { VerificationTokenRepository } from "./domain/ports/verification-token.repository";
import { createAuth } from "./infrastructure/auth/create-auth";
import {
  credentialsSignIn,
  type CredentialsSignInInput,
} from "./infrastructure/auth/credentials-sign-in";
import { BcryptHasher } from "./infrastructure/crypto/bcrypt-hasher";
import { FakeEmailSender } from "./infrastructure/email/fake-email-sender";
import { PrismaUserRepository } from "./infrastructure/persistence/prisma-user.repository";
import { PrismaVerificationTokenRepository } from "./infrastructure/persistence/prisma-verification-token.repository";

// Composition root del módulo `identity`. El cliente Prisma es un singleton de módulo (pool);
// identidad NO es tenant-scoped -> memoizarlo no filtra datos entre tenants. Auth.js se compone
// aquí a partir de la infraestructura y el caso de uso de credenciales, pero todo el
// acoplamiento a `@auth/*`/`next-auth` queda confinado en `infrastructure/auth/`.
let prismaSingleton: PrismaClient | undefined;

const getPrisma = (): PrismaClient => {
  if (prismaSingleton === undefined) {
    const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
    prismaSingleton = new PrismaClient({ adapter });
  }
  return prismaSingleton;
};

const prisma = getPrisma();
const hasher = new BcryptHasher();
const emailSender = new FakeEmailSender(env.APP_URL);
const events: EventBus = new InMemoryEventBus();
const users: UserRepository = new PrismaUserRepository(prisma);
const tokens: VerificationTokenRepository = new PrismaVerificationTokenRepository(prisma);

const authenticate = new AuthenticateCredentials(users, hasher);

// Instancia de Auth.js (handlers/auth/signIn/signOut) — superficie server-callable del módulo.
export const { handlers, auth, signIn, signOut } = createAuth({ prisma, authenticate });

// Login por credenciales para los Server Actions: la traducción del `AuthError` de Auth.js
// queda confinada; app/ recibe un `Result`-like plano. El cast acota el `signIn` de NextAuth
// al contrato mínimo que consume el wrapper.
export const signInWithCredentials = (input: CredentialsSignInInput) =>
  credentialsSignIn(
    signIn as unknown as Parameters<typeof credentialsSignIn>[0],
    input,
  );

// Casos de uso ya cableados, expuestos para los Server Actions de `app/` (Fase F).
export interface IdentityModule {
  readonly registerUser: RegisterUser;
  readonly requestEmailVerification: RequestEmailVerification;
  readonly verifyEmail: VerifyEmail;
  readonly getCurrentUser: GetCurrentUser;
}

export const identity: IdentityModule = {
  registerUser: new RegisterUser(users, hasher, events),
  requestEmailVerification: new RequestEmailVerification(users, tokens, emailSender),
  verifyEmail: new VerifyEmail(users, tokens),
  getCurrentUser: new GetCurrentUser(users),
};
