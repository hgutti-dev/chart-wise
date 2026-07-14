// El tipo se importa estáticamente (elidido en runtime: no carga el bundle); el valor llega por
// import dinámico dentro del guard de Node.
import type { UserRegistered as UserRegisteredEvent } from "@/modules/identity";

// Next.js llama a `register()` una vez al arrancar el servidor. Es el composition root del
// cableado POR EVENTOS entre módulos: suscribe el handler de provisión de `tenancy` al
// `UserRegistered` que publica `identity`, sobre la MISMA instancia de `eventBus`. Así
// `identity` no conoce a su consumidor (FR-010 / NFR-004): la composición vive en app/.
//
// Solo en runtime Node: el handler toca la DB (Prisma), que no existe en Edge. El import de los
// composition roots (Prisma) es dinámico para no arrastrarlos al bundle Edge.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { eventBus, UserRegistered } = await import("@/modules/identity");
  const { provisionWorkspaceOnUserRegistered } = await import("@/modules/tenancy");

  eventBus.subscribe(UserRegistered.eventName, (event: UserRegisteredEvent) =>
    provisionWorkspaceOnUserRegistered.handle({
      userId: event.userId,
      email: event.email,
    }),
  );
}
