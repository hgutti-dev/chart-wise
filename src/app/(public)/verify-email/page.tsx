import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheck } from "lucide-react";

import { Brand } from "@/components/auth/auth-shell";
import { identity } from "@/modules/identity";
import { isErr } from "@/shared/domain/result";

export const metadata = { title: "Verificación de email · chart-wise" };

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

  const verified = status === "verified";
  const message = {
    verified: "Tu email quedó verificado. Ya puedes iniciar sesión.",
    invalid: "El enlace de verificación no es válido o ha expirado.",
    missing: "Falta el token de verificación en el enlace.",
  }[status];

  return (
    <div className="cw-page min-h-screen flex flex-col items-center p-9 sm:px-6">
      <Brand className="mb-9" />

      <div
        className="cw-card w-full max-w-[440px] p-9 text-center flex flex-col items-center"
        style={{ boxShadow: "0 3px 10px rgba(46,43,37,.16)" }}
      >
        {verified ? (
          <div className="grid place-items-center mb-4 rounded-full" style={{ width: 76, height: 76, background: "var(--cw-sage-200)" }}>
            <CircleCheck size={36} strokeWidth={2.75} style={{ color: "var(--cw-sage-700)" }} />
          </div>
        ) : (
          <div className="grid place-items-center mb-4 rounded-full" style={{ width: 76, height: 76, background: "var(--cw-accent-100)" }}>
            <CircleAlert size={34} strokeWidth={2.75} style={{ color: "var(--cw-accent-700)" }} />
          </div>
        )}

        <h1 className="cw-head mb-2" style={{ fontSize: 29 }}>
          {verified ? "Email verificado" : "Verificación de email"}
        </h1>
        <p className="cw-muted mb-6 max-w-[34ch]">{message}</p>

        <Link href="/login" className="cw-btn cw-btn-primary cw-btn-block">
          Ir a iniciar sesión <ArrowRight size={14} strokeWidth={2.75} />
        </Link>

        {!verified ? (
          <Link href="/register" className="cw-btn cw-btn-ghost mt-3">
            Volver a registrarme
          </Link>
        ) : null}
      </div>

      <p className="mt-6 text-[13.5px]" style={{ color: "var(--cw-muted)" }}>
        ¿Cuenta equivocada?{" "}
        <Link href="/login" className="font-semibold">
          Volver a iniciar sesión
        </Link>
      </p>
    </div>
  );
}
