import Link from "next/link";

import { AuthShell, OrDivider } from "@/components/auth/auth-shell";
import { GoogleIcon } from "@/components/auth/google-icon";
import { RegisterForm } from "@/modules/identity";

import { googleSignInAction } from "../actions/google.action";
import { registerAction } from "../actions/register.action";

export const metadata = { title: "Crea tu cuenta · chart-wise" };

const previewBars: ReadonlyArray<readonly [string, string]> = [
  ["38%", "#ffe1d0"],
  ["64%", "#ffc6a5"],
  ["48%", "#ccdbb2"],
  ["92%", "var(--cw-accent)"],
  ["72%", "#aebf92"],
];

// Vista de registro (no endpoint): renderiza el form y le pasa el Server Action por props.
export default function RegisterPage() {
  return (
    <AuthShell
      heading="Crea tu cuenta"
      sub="Empieza a analizar tus datasets en minutos."
      aside={
        <>
          {/* mini-preview de dashboard */}
          <div className="w-[220px] mb-6">
            <div
              className="cw-card p-[18px]"
              style={{ background: "var(--cw-bg)", color: "var(--cw-text)", boxShadow: "0 12px 32px rgba(46,43,37,.22)" }}
            >
              <div className="text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--cw-accent)" }}>
                Insights
              </div>
              <div className="flex items-end gap-[9px] h-[78px] mt-3">
                {previewBars.map(([height, background], index) => (
                  <span key={index} className="flex-1 rounded-lg" style={{ height, background }} />
                ))}
              </div>
            </div>
          </div>
          <h2 className="cw-head text-[color:var(--cw-bg)] mb-3" style={{ fontSize: 30 }}>
            Convierte datos crudos en insight.
          </h2>
          <p className="opacity-80 m-0">
            Sube tus datos, pásalos al motor de análisis y lee los dashboards — todo dentro de tu organización.
          </p>
        </>
      }
    >
      <form action={googleSignInAction}>
        <button type="submit" className="cw-btn cw-btn-secondary cw-btn-block gap-[10px]">
          <GoogleIcon /> Continuar con Google
        </button>
      </form>

      <OrDivider />

      <RegisterForm action={registerAction} />

      <p className="mt-6 text-[13.5px]" style={{ color: "var(--cw-muted)" }}>
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-semibold">
          Inicia sesión
        </Link>
      </p>
    </AuthShell>
  );
}
