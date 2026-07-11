"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";

import { type AuthFormState, emptyAuthFormState } from "../action-state";

export interface RegisterFormProps {
  // La acción llega por props (R10): el form NO importa `di` ni `next-auth`.
  readonly action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}

function FieldMessages({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <>
      {messages.map((message, index) => (
        <span
          key={index}
          className="block mt-[5px] text-[11.5px]"
          style={{ color: "var(--cw-accent-700)" }}
        >
          {message}
        </span>
      ))}
    </>
  );
}

export function RegisterForm({ action }: RegisterFormProps) {
  const [state, formAction, pending] = useActionState(action, emptyAuthFormState);

  return (
    <form action={formAction} noValidate className="grid gap-3">
      {state.error ? (
        <div
          role="alert"
          className="text-[13px] rounded-2xl px-3 py-2"
          style={{ background: "var(--cw-accent-100)", color: "var(--cw-accent-700)" }}
        >
          {state.error}
        </div>
      ) : null}

      <div>
        <label className="cw-label" htmlFor="name">Nombre (opcional)</label>
        <input
          className="cw-input"
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Ada Lovelace"
        />
        <FieldMessages messages={state.fieldErrors?.name} />
      </div>

      <div>
        <label className="cw-label" htmlFor="email">Email</label>
        <input
          className="cw-input"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tu@email.com"
          required
          aria-invalid={Boolean(state.fieldErrors?.email)}
        />
        <FieldMessages messages={state.fieldErrors?.email} />
      </div>

      <div>
        <label className="cw-label" htmlFor="password">Contraseña</label>
        <input
          className="cw-input"
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={Boolean(state.fieldErrors?.password)}
        />
        <span className="block mt-[5px] text-[11.5px]" style={{ color: "var(--cw-muted)" }}>
          Mínimo 8 caracteres.
        </span>
        <FieldMessages messages={state.fieldErrors?.password} />
      </div>

      <button
        type="submit"
        className="cw-btn cw-btn-primary cw-btn-block mt-2"
        disabled={pending}
      >
        {pending ? (
          "Creando cuenta…"
        ) : (
          <>
            Crear cuenta <ArrowRight size={14} strokeWidth={2.75} />
          </>
        )}
      </button>
    </form>
  );
}
