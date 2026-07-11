import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth, identity } from "@/modules/identity";

import { logoutAction } from "../../(public)/actions/logout.action";

// Vista de perfil: muestra la identidad autenticada (DTO plano, SIN passwordHash) y un botón
// de logout que invoca el Server Action. El gate lo aplica `(private)/layout.tsx`.
export default async function ProfilePage() {
  const session = await auth();
  const user = session?.user?.id
    ? await identity.getCurrentUser.execute(session.user.id)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Tu perfil</CardTitle>
        <CardDescription>Identidad de tu cuenta.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {user ? (
          <dl className="grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{user.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Nombre</dt>
              <dd className="font-medium">{user.name ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Email verificado</dt>
              <dd className="font-medium">{user.emailVerified ? "Sí" : "No"}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">No se pudo cargar tu perfil.</p>
        )}

        <form action={logoutAction}>
          <Button type="submit" variant="outline" className="w-full">
            Cerrar sesión
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
