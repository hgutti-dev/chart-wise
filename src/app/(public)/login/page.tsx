import Link from "next/link";

import { AuthShell, OrDivider } from "@/components/auth/auth-shell";
import { GoogleIcon } from "@/components/auth/google-icon";
import { LoginForm } from "@/modules/identity";

import { googleSignInAction } from "../actions/google.action";
import { loginAction } from "../actions/login.action";

export const metadata = { title: "Inicia sesión · chart-wise" };

// Vista de login (no endpoint): renderiza el form y le pasa el Server Action por props. El
// botón de Google usa su propio Server Action (provider ya configurado en identity/auth).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; registered?: string }>;
}) {
  const { callbackUrl, registered } = await searchParams;

  return (
    <AuthShell
      heading="Bienvenido de vuelta"
      sub="Inicia sesión en tu cuenta de chart-wise."
      aside={
        <>
          <h2 className="cw-head text-[color:var(--cw-bg)] mb-3" style={{ fontSize: 30 }}>
            Tus dashboards te esperan.
          </h2>
          <p className="opacity-80 m-0">
            Retoma donde tu organización lo dejó — cada dataset e insight, justo donde estaban.
          </p>
        </>
      }
    >
      {registered ? (
        <div
          className="mb-4 text-[13px] rounded-2xl px-3 py-2"
          style={{ background: "var(--cw-sage-200)", color: "var(--cw-sage-700-ink)" }}
        >
          Cuenta creada. Revisa tu email para verificarla e inicia sesión.
        </div>
      ) : null}

      <form action={googleSignInAction}>
        {callbackUrl ? (
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
        ) : null}
        <button type="submit" className="cw-btn cw-btn-secondary cw-btn-block gap-[10px]">
          <GoogleIcon /> Continuar con Google
        </button>
      </form>

      <OrDivider />

      <LoginForm action={loginAction} callbackUrl={callbackUrl} />

      <p className="mt-6 text-[13.5px]" style={{ color: "var(--cw-muted)" }}>
        ¿No tienes cuenta?{" "}
        <Link href="/register" className="font-semibold">
          Crea una
        </Link>
      </p>
    </AuthShell>
  );
}
