import type { TenantId } from "@/shared/domain/tenant-id";

import type { Note, NoteId } from "../../domain/entities/note";
import type { NoteRepository } from "../../domain/ports/note.repository";

// Fake para desarrollo/tests sin base de datos. Replica el aislamiento por tenant que en
// producción garantiza RLS: una lectura con otro tenant devuelve null.
export class InMemoryNoteRepository implements NoteRepository {
  private readonly notes = new Map<NoteId, Note>();

  async save(note: Note): Promise<void> {
    this.notes.set(note.id, note);
  }

  async findById(tenantId: TenantId, id: NoteId): Promise<Note | null> {
    const note = this.notes.get(id);
    if (note === undefined || note.tenantId !== tenantId) return null;
    return note;
  }
}
