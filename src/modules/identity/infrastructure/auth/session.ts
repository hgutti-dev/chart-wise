import type { Session } from "next-auth";

// Tipo de sesión augmentado (ver next-auth.d.ts) reexpuesto DESDE `infrastructure/auth/` para
// que la API pública del módulo (`index.ts`) pueda ofrecerlo sin importar `next-auth` fuera de
// este directorio (confinamiento NFR-002). Consumidores: layout/perfil y Server Actions.
export type AppSession = Session;
