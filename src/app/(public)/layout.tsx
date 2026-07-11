// Layout compartido de las vistas públicas de auth (login/registro/verificación). Cada vista
// controla su propio lienzo a pantalla completa (AuthShell de dos columnas o tarjeta centrada),
// así que este layout es un pass-through. Route group `(public)`: no añade segmento a la URL.
export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
