import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RegisterForm } from "@/modules/identity";

import { registerAction } from "../actions/register.action";

// Vista de registro (no endpoint): renderiza el form y le pasa el Server Action por props.
export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Crea tu cuenta</CardTitle>
        <CardDescription>Empieza a analizar tus datasets.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RegisterForm action={registerAction} />

        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Inicia sesión
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
