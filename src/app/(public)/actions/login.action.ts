"use server";

import { signInWithCredentials } from "@/app/auth";
import {
  type AuthFormState,
  loginSchema,
  resolveInternalRedirect,
} from "@/modules/identity";

// Server Action (CSRF integrado): compone el `signIn` de Auth.js vía la API pública, que en
// éxito lanza el redirect de navegación y en fallo devuelve un error (traducido en el módulo,
// sin filtrar `next-auth`). La `callbackUrl` se sanea contra open-redirect (FR-012).
export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const callbackUrl = formData.get("callbackUrl");
  const redirectTo = resolveInternalRedirect(
    typeof callbackUrl === "string" ? callbackUrl : null,
  );

  return signInWithCredentials({ ...parsed.data, redirectTo });
}
