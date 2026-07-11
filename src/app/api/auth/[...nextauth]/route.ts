import { handlers } from "@/modules/identity";

// Adaptador de entrada de Auth.js. Importa `handlers` desde la API pública del módulo
// (@/modules/identity), NUNCA `next-auth` directamente (confinamiento NFR-002 / SC-002).
export const { GET, POST } = handlers;
