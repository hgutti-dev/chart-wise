import { AuthError } from "next-auth";

export interface CredentialsSignInInput {
  readonly email: string;
  readonly password: string;
  readonly redirectTo: string;
}

type SignIn = (provider: string, options: Record<string, unknown>) => Promise<unknown>;

// Glue de Auth.js para el login por credenciales, CONFINADO en infrastructure/auth/ (NFR-002).
// `signIn` lanza en ÉXITO un NEXT_REDIRECT (que DEBE propagarse para navegar) y un `AuthError`
// si las credenciales fallan. Traducimos `AuthError` a un error de UI (mismo mensaje que el
// dominio, sin enumeración) y re-lanzamos todo lo demás —incluido el redirect—. Así el Server
// Action de app/ nunca importa `next-auth`.
export async function credentialsSignIn(
  signIn: SignIn,
  { email, password, redirectTo }: CredentialsSignInInput,
): Promise<{ error?: string }> {
  try {
    await signIn("credentials", { email, password, redirectTo });
    return {}; // inalcanzable en éxito: signIn lanza NEXT_REDIRECT
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email o contraseña incorrectos." };
    }
    throw error;
  }
}
