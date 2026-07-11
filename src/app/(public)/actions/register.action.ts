"use server";

import { redirect } from "next/navigation";

import {
  type AuthFormState,
  EmailAlreadyRegisteredError,
  identity,
  registerSchema,
} from "@/modules/identity";
import { isErr } from "@/shared/domain/result";

// Server Action (CSRF integrado, R11): NO es un endpoint REST. Valida en la frontera, compone
// `RegisterUser` vía la API pública y traduce el `Result`. Alcance AuthN-only: crea solo `User`.
export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const rawName = formData.get("name");
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: typeof rawName === "string" && rawName.trim().length > 0 ? rawName : undefined,
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await identity.registerUser.execute(parsed.data);
  if (isErr(result)) {
    // `EmailAlreadyRegistered` se revela (UX estándar, R11); cualquier otro error es genérico.
    return {
      error:
        result.error instanceof EmailAlreadyRegisteredError
          ? "Ese email ya está registrado."
          : "No se pudo crear la cuenta. Inténtalo de nuevo.",
    };
  }

  // Verificación de email en el mismo momento del registro (FR-007). Best-effort REAL: la
  // cuenta YA está confirmada, así que un fallo INESPERADO al emitir el token o enviar el
  // correo (p. ej. un error transitorio de DB, o un EmailSender real más adelante) NO debe
  // abortar el redirect de éxito. Se registra para no perder observabilidad (no se silencia);
  // el `redirect` queda FUERA del try para que su NEXT_REDIRECT se propague siempre.
  try {
    await identity.requestEmailVerification.execute(parsed.data.email);
  } catch (error) {
    console.error("[register] fallo al emitir la verificación de email", error);
  }

  redirect("/login?registered=1");
}
