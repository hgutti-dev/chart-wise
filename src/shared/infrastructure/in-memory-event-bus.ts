import type { EventBus, EventHandler } from "@/shared/application/event-bus";
import type { DomainEvent } from "@/shared/domain/domain-event";

type AnyEventHandler = EventHandler<DomainEvent>;

export class InMemoryEventBus implements EventBus {
  private readonly handlersByEventName = new Map<
    string,
    Set<AnyEventHandler>
  >();

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlersByEventName.get(event.eventName);
    if (handlers === undefined) return;

    for (const handler of [...handlers]) {
      await handler(event);
    }
  }

  subscribe<TEvent extends DomainEvent>(
    eventName: TEvent["eventName"],
    handler: EventHandler<TEvent>,
  ): () => void {
    const handlers =
      this.handlersByEventName.get(eventName) ?? new Set<AnyEventHandler>();
    const eventHandler = handler as AnyEventHandler;

    handlers.add(eventHandler);
    this.handlersByEventName.set(eventName, handlers);

    return () => {
      handlers.delete(eventHandler);
      // Solo purga el nombre si el mapa sigue apuntando a ESTE set: un unsubscribe
      // repetido (o tardío) no debe borrar un set recreado por una suscripción posterior.
      if (
        handlers.size === 0 &&
        this.handlersByEventName.get(eventName) === handlers
      ) {
        this.handlersByEventName.delete(eventName);
      }
    };
  }
}
