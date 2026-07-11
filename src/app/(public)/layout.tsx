// Layout compartido de las vistas públicas de auth (login/registro/verificación): centra la
// tarjeta. Route group `(public)`: no añade segmento a la URL.
export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
