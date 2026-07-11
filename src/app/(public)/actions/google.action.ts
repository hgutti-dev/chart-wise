"use server";

import { resolveInternalRedirect, signIn } from "@/modules/identity";

// Server Action (CSRF integrado) para el login OAuth con Google: compone el `signIn` de Auth.js
// vía la API pública del módulo. El provider Google ya está configurado en identity/auth. En
// éxito, Auth.js lanza el redirect de navegación hacia el proveedor. La `callbackUrl` se sanea
// contra open-redirect (FR-012), igual que el login por credenciales.
export async function googleSignInAction(formData: FormData): Promise<void> {
  const callbackUrl = formData.get("callbackUrl");
  const redirectTo = resolveInternalRedirect(
    typeof callbackUrl === "string" ? callbackUrl : null,
  );

  await signIn("google", { redirectTo });
}
