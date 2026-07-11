import Link from "next/link";
import { CircleCheck, LogOut, TrendingUp } from "lucide-react";

import { auth, identity } from "@/modules/identity";

import { logoutAction } from "../../(public)/actions/logout.action";

export const metadata = { title: "Tu perfil · chart-wise" };

// Iniciales para el avatar: nombre si existe (primera + última), si no la inicial del email.
function initialsFrom(name: string | null | undefined, email: string): string {
  const trimmed = (name ?? "").trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
    return (first + last).toUpperCase();
  }
  return (email[0] ?? "?").toUpperCase();
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-3 py-3"
      style={{ borderBottom: "1px solid color-mix(in srgb, var(--cw-text) 8%, transparent)" }}
    >
      <div className="flex-1">
        <div className="text-xs" style={{ color: "color-mix(in srgb, var(--cw-text) 60%, transparent)" }}>
          {label}
        </div>
        <div className="text-[15px]">{value}</div>
      </div>
    </div>
  );
}

// Vista de perfil: muestra la identidad autenticada (DTO plano, SIN passwordHash) y un botón
// de logout que invoca el Server Action. El gate lo aplica `(private)/layout.tsx`.
export default async function ProfilePage() {
  const session = await auth();
  const user = session?.user?.id
    ? await identity.getCurrentUser.execute(session.user.id)
    : null;

  if (!user) {
    return (
      <div className="cw-page min-h-screen grid place-items-center p-9">
        <p className="cw-muted text-sm">No se pudo cargar tu perfil.</p>
      </div>
    );
  }

  const initials = initialsFrom(user.name, user.email);
  const displayName = user.name?.trim() || user.email;

  return (
    <div className="cw-page min-h-screen">
      {/* Barra de navegación */}
      <nav className="flex items-center gap-[18px] px-6 py-[13px]" style={{ borderBottom: "1px solid var(--cw-divider)" }}>
        <Link
          href="/"
          className="inline-flex items-center gap-[9px] no-underline mr-auto"
          style={{ color: "var(--cw-text)", fontFamily: "var(--font-caprasimo)", fontSize: 18 }}
        >
          <span
            className="grid place-items-center shrink-0"
            style={{ width: 26, height: 26, borderRadius: 9, background: "var(--cw-accent)", color: "var(--cw-bg)" }}
          >
            <TrendingUp size={15} strokeWidth={2.75} />
          </span>
          chart-wise
        </Link>
        <Link href="/profile" aria-current="page" className="text-sm no-underline" style={{ color: "var(--cw-accent)" }}>
          Perfil
        </Link>
        <span
          className="grid place-items-center"
          style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--cw-accent)", color: "var(--cw-bg)", fontFamily: "var(--font-caprasimo)", fontSize: 14 }}
        >
          {initials.charAt(0)}
        </span>
      </nav>

      <main className="max-w-[640px] mx-auto px-6 py-9">
        <h1 className="cw-head mb-6" style={{ fontSize: 34 }}>Tu perfil</h1>

        {/* Tarjeta de identidad */}
        <div className="cw-card p-6 mb-4" style={{ boxShadow: "0 1px 2px rgba(46,43,37,.14)" }}>
          <div className="flex items-center gap-4">
            <span
              className="grid place-items-center shrink-0"
              style={{ width: 66, height: 66, borderRadius: "50%", background: "var(--cw-accent)", color: "var(--cw-bg)", fontFamily: "var(--font-caprasimo)", fontSize: 26 }}
            >
              {initials}
            </span>
            <div className="min-w-0">
              <div className="cw-head leading-[1.1]" style={{ fontSize: 22 }}>{displayName}</div>
              <div className="cw-muted text-sm mt-0.5">{user.email}</div>
              {user.emailVerified ? (
                <span className="cw-tag cw-tag-sage mt-[9px]">
                  <CircleCheck size={12} strokeWidth={2.75} /> Email verificado
                </span>
              ) : (
                <span className="cw-tag cw-tag-neutral mt-[9px]">Email sin verificar</span>
              )}
            </div>
          </div>
        </div>

        {/* Detalles */}
        <div className="cw-card px-6 py-[6px]" style={{ boxShadow: "0 1px 2px rgba(46,43,37,.14)" }}>
          <Row label="Nombre" value={user.name?.trim() || "—"} />
          <Row label="Email" value={user.email} />
          <Row label="Email verificado" value={user.emailVerified ? "Sí" : "No"} />
        </div>

        {/* Logout */}
        <div className="flex justify-end mt-6">
          <form action={logoutAction}>
            <button type="submit" className="cw-btn cw-btn-secondary">
              <LogOut size={15} strokeWidth={2.75} /> Cerrar sesión
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
