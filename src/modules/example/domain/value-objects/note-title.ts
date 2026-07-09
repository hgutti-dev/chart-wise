import type { DomainError } from "@/shared/domain/domain-error";
import { err, ok, type Result } from "@/shared/domain/result";

import { EmptyNoteTitleError } from "../errors/empty-note-title.error";
import { NoteTitleTooLongError } from "../errors/note-title-too-long.error";

const MAX_LENGTH = 200;

export class NoteTitle {
  private constructor(private readonly _value: string) {}

  static create(raw: string): Result<NoteTitle, DomainError> {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return err(new EmptyNoteTitleError());
    if (trimmed.length > MAX_LENGTH) {
      return err(new NoteTitleTooLongError(MAX_LENGTH, trimmed.length));
    }
    return ok(new NoteTitle(trimmed));
  }

  get value(): string {
    return this._value;
  }

  equals(other: NoteTitle): boolean {
    return this._value === other._value;
  }
}
