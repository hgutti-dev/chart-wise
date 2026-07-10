import { describe, expect, it } from "vitest";

import type { EventBus } from "@/shared/application/event-bus";
import { DomainEvent } from "@/shared/domain/domain-event";
import { InMemoryEventBus } from "@/shared/infrastructure/in-memory-event-bus";

class TestEvent extends DomainEvent {
  static readonly eventName = "shared.test-event";

  readonly eventName: typeof TestEvent.eventName = TestEvent.eventName;

  constructor(occurredAt: Date) {
    super(occurredAt);
  }
}

class OtherTestEvent extends DomainEvent {
  static readonly eventName = "shared.other-test-event";

  readonly eventName: typeof OtherTestEvent.eventName = OtherTestEvent.eventName;

  constructor(occurredAt: Date) {
    super(occurredAt);
  }
}

describe("InMemoryEventBus", () => {
  it("entrega un evento publicado a los handlers suscritos", async () => {
    const eventBus: EventBus = new InMemoryEventBus();
    const event = new TestEvent(new Date("2026-07-10T00:00:00.000Z"));
    const received: TestEvent[] = [];

    eventBus.subscribe<TestEvent>(TestEvent.eventName, (receivedEvent) => {
      received.push(receivedEvent);
    });

    await eventBus.publish(event);

    expect(received).toEqual([event]);
  });

  it("solo entrega eventos del nombre suscrito", async () => {
    const eventBus: EventBus = new InMemoryEventBus();
    const received: TestEvent[] = [];

    eventBus.subscribe<TestEvent>(TestEvent.eventName, (event) => {
      received.push(event);
    });

    await eventBus.publish(
      new OtherTestEvent(new Date("2026-07-10T00:00:00.000Z")),
    );

    expect(received).toEqual([]);
  });

  it("deja de entregar eventos tras desuscribirse", async () => {
    const eventBus: EventBus = new InMemoryEventBus();
    let invocationCount = 0;

    const unsubscribe = eventBus.subscribe<TestEvent>(
      TestEvent.eventName,
      () => {
        invocationCount += 1;
      },
    );

    unsubscribe();
    await eventBus.publish(
      new TestEvent(new Date("2026-07-10T00:00:00.000Z")),
    );

    expect(invocationCount).toBe(0);
  });

  it("un unsubscribe repetido no afecta a una re-suscripción del mismo evento", async () => {
    const eventBus: EventBus = new InMemoryEventBus();

    const unsubscribeFirst = eventBus.subscribe<TestEvent>(
      TestEvent.eventName,
      () => {},
    );
    unsubscribeFirst(); // vacía el set y purga el nombre

    const received: TestEvent[] = [];
    eventBus.subscribe<TestEvent>(TestEvent.eventName, (event) => {
      received.push(event);
    });

    unsubscribeFirst(); // segunda llamada: no debe purgar el set recreado

    const event = new TestEvent(new Date("2026-07-10T00:00:00.000Z"));
    await eventBus.publish(event);

    expect(received).toEqual([event]);
  });
});
