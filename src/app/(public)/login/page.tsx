import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/modules/identity";

import { loginAction } from "../actions/login.action";

// Vista de login (no endpoint): renderiza el form y le pasa el Server Action por props.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; registered?: string }>;
}) {
  const { callbackUrl, registered } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Inicia sesión</CardTitle>
        <CardDescription>Accede a tu cuenta de chart-wise.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {registered ? (
          <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm">
            Cuenta creada. Revisa tu email para verificarla e inicia sesión.
          </p>
        ) : null}

        <LoginForm action={loginAction} callbackUrl={callbackUrl} />

        <p className="text-center text-sm text-muted-foreground">
          ¿No tienes cuenta?{" "}
          <Link
            href="/register"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Crea una
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
