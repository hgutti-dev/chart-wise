// API pública del módulo `identity`: única superficie importable desde fuera (el linter
// prohíbe deep-imports). AuthN only (ADR-007): expone identidad y sesión, nunca autorización.

// Factory de Auth.js: la instancia (handlers/auth/signIn/signOut) se compone en el composition
// root de app/, que inyecta el extensor de claims de `tenancy`. + casos de uso ya cableados.
export { createIdentityAuth, identity, type IdentityModule } from "./di";

// Costura de poblado de claims (dónde se enganchan jwt/session): app/ inyecta aquí el extensor
// de `tenancy`. identity define la costura, no el contenido (FR-009).
export type { SessionClaimsExtension } from "./infrastructure/auth/auth.config";

// Glue de login por credenciales (traduce el AuthError de Auth.js, sin filtrar `next-auth`) + su
// input. app/ compone el wrapper con el `signIn` de la instancia creada.
export {
  credentialsSignIn,
  type CredentialsSignInInput,
} from "./infrastructure/auth/credentials-sign-in";

// Tipo de sesión augmentado, sin filtrar `next-auth` fuera de infrastructure/auth/ (NFR-002).
export type { AppSession } from "./infrastructure/auth/session";

// Helper puro anti open-redirect para la `callbackUrl` del login (FR-012).
export { resolveInternalRedirect } from "./application/redirect/resolve-internal-redirect";

// Presentation: schemas de validación (frontera) + formularios cliente (reciben la acción por
// props) + el contrato de estado de las acciones.
export type { AuthFormState } from "./presentation/action-state";
export {
  LoginForm,
  type LoginFormProps,
} from "./presentation/components/login-form";
export {
  RegisterForm,
  type RegisterFormProps,
} from "./presentation/components/register-form";
export {
  loginSchema,
  type LoginFormValues,
} from "./presentation/schemas/login.schema";
export {
  registerSchema,
  type RegisterFormValues,
} from "./presentation/schemas/register.schema";

// Contratos de casos de uso (para los Server Actions de Fase F) y sus DTOs/inputs.
export type { AuthenticatedUser } from "./application/use-cases/authenticate-credentials";
export type {
  CurrentUserDto,
  GetCurrentUser,
} from "./application/use-cases/get-current-user";
export type {
  RegisterUser,
  RegisterUserInput,
} from "./application/use-cases/register-user";
export type { RequestEmailVerification } from "./application/use-cases/request-email-verification";
export type {
  VerifyEmail,
  VerifyEmailInput,
} from "./application/use-cases/verify-email";

// Identidad de dominio + errores esperados para consumir los `Result`.
export type { User, UserId } from "./domain/entities/user";
export {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidEmailError,
  InvalidVerificationTokenError,
  WeakPasswordError,
} from "./domain/errors";
