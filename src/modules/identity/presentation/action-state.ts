// Contrato del estado de un Server Action de auth: lo devuelve la acción (en app/) y lo consume
// `useActionState` en el form (cliente). Vive en presentation para que el form lo tipe sin
// importar app; las acciones lo consumen vía la API pública del módulo (@/modules/identity).
export interface AuthFormState {
  readonly error?: string;
  readonly fieldErrors?: Record<string, string[] | undefined>;
}

export const emptyAuthFormState: AuthFormState = {};
