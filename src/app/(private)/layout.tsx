import { redirect } from "next/navigation";

import { auth } from "@/modules/identity";
import { LOGIN_ROUTE } from "@/config/routes";

// Gate autoritativo del área privada (runtime Node): `auth()` verifica la sesión JWT. Sin
// sesión -> /login. El middleware (Edge, Fase G) solo hace la redirección barata por cookie;
// esta es la comprobación real. Route group `(private)`: no añade segmento a la URL.
export default async function PrivateLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) {
    redirect(LOGIN_ROUTE);
  }

  // Pass-through: las vistas privadas (perfil) montan su propia navegación Organic a pantalla
  // completa. El gate de arriba es la comprobación autoritativa; aquí no se añade layout.
  return <>{children}</>;
}
