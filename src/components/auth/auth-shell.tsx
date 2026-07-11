import Link from "next/link";
import { TrendingUp } from "lucide-react";

/** Wordmark de chart-wise, reutilizado en todas las vistas. */
export function Brand({
  className,
  tone = "ink",
}: {
  className?: string;
  tone?: "ink" | "cream";
}) {
  const color = tone === "cream" ? "var(--cw-bg)" : "var(--cw-text)";
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-[9px] no-underline ${className ?? ""}`}
      style={{ color, fontFamily: "var(--font-caprasimo)", fontSize: 20 }}
    >
      <span
        className="grid place-items-center shrink-0"
        style={{ width: 30, height: 30, borderRadius: 10, background: "var(--cw-accent)", color: "var(--cw-bg)" }}
      >
        <TrendingUp size={17} strokeWidth={2.75} />
      </span>
      chart-wise
    </Link>
  );
}

/**
 * Shell de dos columnas para las vistas públicas (registro / login).
 * Columna izquierda: panel de marca salvia. Derecha: el formulario.
 */
export function AuthShell({
  heading,
  sub,
  aside,
  children,
}: {
  heading: string;
  sub: string;
  aside: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="cw-page min-h-screen grid lg:grid-cols-[1.02fr_1fr]">
      {/* Panel de marca */}
      <aside
        className="relative overflow-hidden hidden lg:flex flex-col p-9 text-[color:var(--cw-bg)]"
        style={{ background: "var(--cw-sage-800)" }}
      >
        <div className="absolute rounded-full" style={{ width: 360, height: 360, background: "var(--cw-sage-700)", top: -120, right: -110 }} />
        <div className="absolute rounded-full" style={{ width: 200, height: 200, background: "var(--cw-accent)", opacity: 0.35, bottom: 60, left: -70 }} />
        <div className="relative z-10">
          <Brand tone="cream" />
        </div>
        <div className="relative z-10 mt-auto max-w-[30ch]">{aside}</div>
      </aside>

      {/* Formulario */}
      <main className="flex items-center justify-center p-9 sm:px-6">
        <div className="w-full max-w-[384px]">
          <div className="mb-6 lg:hidden">
            <Brand />
          </div>
          <div className="mb-6">
            <h1 className="cw-head mb-2" style={{ fontSize: 34 }}>{heading}</h1>
            <p className="cw-muted m-0">{sub}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

/** Divisor "o". */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 my-4 text-xs" style={{ color: "var(--cw-muted)" }}>
      <span className="h-px flex-1" style={{ background: "var(--cw-divider)" }} />
      o
      <span className="h-px flex-1" style={{ background: "var(--cw-divider)" }} />
    </div>
  );
}
