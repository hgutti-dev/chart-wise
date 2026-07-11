import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { identity } from "@/modules/identity";
import { isErr } from "@/shared/domain/result";

// Vista de confirmación de email: consume el token del enlace (`?token=&email=`) invocando
// `VerifyEmail`. Un token inexistente, usado, de otro identifier o expirado -> mismo error
// controlado (SC-008). No es un endpoint: es la página a la que apunta el enlace del correo.
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string }>;
}) {
  const { token, email } = await searchParams;

  let status: "missing" | "verified" | "invalid";
  if (!token || !email) {
    status = "missing";
  } else {
    const result = await identity.verifyEmail.execute({ identifier: email, token });
    status = isErr(result) ? "invalid" : "verified";
  }

  const message = {
    verified: "Tu email quedó verificado. Ya puedes iniciar sesión.",
    invalid: "El enlace de verificación no es válido o ha expirado.",
    missing: "Falta el token de verificación en el enlace.",
  }[status];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Verificación de email</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{message}</p>
        <Link href="/login" className={buttonVariants({ size: "lg", className: "w-full" })}>
          Ir a iniciar sesión
        </Link>
      </CardContent>
    </Card>
  );
}
