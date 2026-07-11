import { z } from "zod";

import { emailField } from "./fields";

// Límite bcrypt: la contraseña se trunca a 72 bytes, así que la rechazamos por encima en la
// frontera (igual que el VO `Password`) en vez de aceptar un truncado silencioso.
const MAX_PASSWORD_BYTES = 72;

export const registerSchema = z.object({
  email: emailField,
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .refine(
      (value) => new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES,
      `La contraseña no debe superar los ${MAX_PASSWORD_BYTES} bytes`,
    ),
  name: z.string().trim().max(120, "El nombre es demasiado largo").optional(),
});

export type RegisterFormValues = z.infer<typeof registerSchema>;
