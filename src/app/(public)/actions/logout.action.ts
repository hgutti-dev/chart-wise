"use server";

import { signOut } from "@/app/auth";

// Server Action de cierre de sesión: `signOut` borra la cookie de sesión JWT y lanza el
// redirect a /login. Se invoca desde un `<form>` en el perfil (no un endpoint expuesto).
export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
