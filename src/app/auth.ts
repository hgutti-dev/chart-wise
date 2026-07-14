import {
  createIdentityAuth,
  credentialsSignIn,
  type CredentialsSignInInput,
} from "@/modules/identity";
import { tenantClaims } from "@/modules/tenancy";

// Composition root de Auth.js (FR-009 / D6): compone los callbacks base de `identity` con el
// extensor de claims de `tenancy` (poblado de tenant/rol), inyectado aquí. Es el ÚNICO punto que
// conoce ambos módulos; `identity` NO importa `tenancy` (NFR-004). Los route handlers, el gate
// del layout privado y los Server Actions consumen esta superficie, no `@/modules/identity`.
export const { handlers, auth, signIn, signOut } = createIdentityAuth(tenantClaims);

// Login por credenciales para los Server Actions: envuelve el `signIn` de la instancia con el
// glue de `identity` que traduce el AuthError de Auth.js, sin filtrar `next-auth` a app/.
export const signInWithCredentials = (input: CredentialsSignInInput) =>
  credentialsSignIn(
    signIn as unknown as Parameters<typeof credentialsSignIn>[0],
    input,
  );
