import type { DomainEvent } from "@/shared/domain/domain-event";

export type EventHandler<TEvent extends DomainEvent = DomainEvent> = (
  event: TEvent,
) => void | Promise<void>;

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;

  subscribe<TEvent extends DomainEvent>(
    eventName: TEvent["eventName"],
    handler: EventHandler<TEvent>,
  ): () => void;
}
