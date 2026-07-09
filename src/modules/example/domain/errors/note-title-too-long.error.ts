import { DomainError } from "@/shared/domain/domain-error";

export class NoteTitleTooLongError extends DomainError {
  readonly code = "example.note-title.too-long";

  constructor(maxLength: number, actualLength: number) {
    super(
      `El título de la nota supera el máximo de ${maxLength} caracteres (recibidos ${actualLength}).`,
    );
  }
}
