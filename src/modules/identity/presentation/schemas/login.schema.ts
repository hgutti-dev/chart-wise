import { z } from "zod";

import { emailField } from "./fields";

// Login: la contraseña solo debe estar presente. NO replicamos la política de fortaleza para
// no filtrar señales (la verificación real es no-enumerable y en tiempo constante en el dominio).
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Introduce tu contraseña"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
