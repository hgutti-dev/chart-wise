import { Note, type PersistedNoteProps } from "../../domain/entities/note";

// Fila escalar de la tabla Note (subconjunto del cliente Prisma). Se declara aquí para
// desacoplar el mapper de los genéricos del cliente generado.
export type NoteRow = PersistedNoteProps;

export const toDomain = (row: NoteRow): Note => Note.fromPersistence(row);

export const toPersistence = (note: Note): NoteRow => ({
  id: note.id,
  tenantId: note.tenantId,
  title: note.title.value,
  body: note.body,
  createdAt: note.createdAt,
});
