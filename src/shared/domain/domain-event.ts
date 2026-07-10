// Base de todos los eventos de dominio (ADR-004). El EventBus enruta las suscripciones
// por `eventName`, el discriminador que cada evento concreto fija. `occurredAt` se
// INYECTA desde la capa de aplicación —nunca se genera aquí— para que el dominio sea
// puro y determinista, igual que `createdAt` se pasa a las entidades (p. ej. `Note`).
// Sin imports de framework/infra: `shared/domain` solo puede depender de sí mismo/config.
export abstract class DomainEvent {
  abstract readonly eventName: string;

  protected constructor(readonly occurredAt: Date) {}
}
