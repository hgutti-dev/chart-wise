import type { TenantContext } from "@/shared/application/tenant-context";
import type { DomainError } from "@/shared/domain/domain-error";
import { isErr, type Result } from "@/shared/domain/result";

import { asNoteId, Note } from "../../domain/entities/note";
import type { NoteRepository } from "../../domain/ports/note.repository";

export interface CreateNoteInput {
  readonly title: string;
  readonly body?: string | null;
}

// Traduce el borde (TenantContext, input crudo) al dominio: fija el tenant activo,
// genera identidad y tiempo, valida vía el agregado y persiste. La identidad y el
// reloj se inyectan aquí para que el dominio (Note.create) sea una función pura.
export class CreateNote {
  constructor(private readonly notes: NoteRepository) {}

  async execute(
    ctx: TenantContext,
    input: CreateNoteInput,
  ): Promise<Result<Note, DomainError>> {
    const note = Note.create({
      id: asNoteId(crypto.randomUUID()),
      tenantId: ctx.tenantId,
      title: input.title,
      body: input.body ?? null,
      createdAt: new Date(),
    });
    if (isErr(note)) return note;

    await this.notes.save(note.value);
    return note;
  }
}
