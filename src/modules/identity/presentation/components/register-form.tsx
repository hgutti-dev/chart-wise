"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { type AuthFormState, emptyAuthFormState } from "../action-state";

export interface RegisterFormProps {
  // La acción llega por props (R10): el form NO importa `di` ni `next-auth`.
  readonly action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}

const toFieldErrors = (messages?: string[]) =>
  messages?.map((message) => ({ message }));

export function RegisterForm({ action }: RegisterFormProps) {
  const [state, formAction, pending] = useActionState(action, emptyAuthFormState);

  return (
    <form action={formAction} noValidate>
      <FieldGroup>
        {state.error ? (
          <div
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </div>
        ) : null}

        <Field>
          <FieldLabel htmlFor="name">Nombre (opcional)</FieldLabel>
          <Input id="name" name="name" type="text" autoComplete="name" />
          <FieldError errors={toFieldErrors(state.fieldErrors?.name)} />
        </Field>

        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="tu@email.com"
            required
            aria-invalid={Boolean(state.fieldErrors?.email)}
          />
          <FieldError errors={toFieldErrors(state.fieldErrors?.email)} />
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Contraseña</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(state.fieldErrors?.password)}
          />
          <FieldDescription>Mínimo 8 caracteres.</FieldDescription>
          <FieldError errors={toFieldErrors(state.fieldErrors?.password)} />
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Creando cuenta…" : "Crear cuenta"}
        </Button>
      </FieldGroup>
    </form>
  );
}
