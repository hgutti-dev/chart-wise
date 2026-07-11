"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { type AuthFormState, emptyAuthFormState } from "../action-state";

export interface LoginFormProps {
  // La acción llega por props (R10): el form NO importa `di` ni `next-auth`.
  readonly action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  readonly callbackUrl?: string;
}

const toFieldErrors = (messages?: string[]) =>
  messages?.map((message) => ({ message }));

export function LoginForm({ action, callbackUrl }: LoginFormProps) {
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
            autoComplete="current-password"
            required
            aria-invalid={Boolean(state.fieldErrors?.password)}
          />
          <FieldError errors={toFieldErrors(state.fieldErrors?.password)} />
        </Field>

        {callbackUrl ? (
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Entrando…" : "Iniciar sesión"}
        </Button>
      </FieldGroup>
    </form>
  );
}
