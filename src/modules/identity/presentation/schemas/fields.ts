import { z } from "zod";

// Espejo de la forma que valida el VO `Email` del dominio (un local, una @, un dominio con
// punto, sin espacios) + su normalización (trim + lowercase). Compartido por los schemas de
// registro y login para no divergir. El dominio sigue siendo la autoridad final.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => EMAIL_REGEX.test(value), "Introduce un email válido");
