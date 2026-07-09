import { DomainError } from "@/shared/domain/domain-error";

export class EmptyNoteTitleError extends DomainError {
  readonly code = "example.note-title.empty";

  constructor() {
    super("El título de la nota no puede estar vacío.");
  }
}
