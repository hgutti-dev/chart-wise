import { handlers } from "@/app/auth";

// Adaptador de entrada de Auth.js. Importa `handlers` del composition root de app/ (que compone
// identity + tenancy), NUNCA `next-auth` directamente (confinamiento NFR-002 / SC-002).
export const { GET, POST } = handlers;
