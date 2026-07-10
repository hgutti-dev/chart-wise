import { DomainEvent } from "@/shared/domain/domain-event";

import type { UserId } from "../entities/user";

// Costura para `tenancy` (ADR-004): RegisterUser lo publica al registrar; sin consumidor
// en esta fase. `occurredAt` se inyecta desde la aplicación (contrato de DomainEvent).
export class UserRegistered extends DomainEvent {
  static readonly eventName = "identity.user-registered";

  readonly eventName: typeof UserRegistered.eventName = UserRegistered.eventName;

  constructor(
    readonly userId: UserId,
    readonly email: string,
    occurredAt: Date,
  ) {
    super(occurredAt);
  }
}
