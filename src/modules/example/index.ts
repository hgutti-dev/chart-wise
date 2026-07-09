// API pública del módulo `example`: única superficie importable desde fuera (el linter
// prohíbe deep-imports). Expone el composition root, el contrato del caso de uso y los
// tipos/errores necesarios para consumir su Result.
export { createNoteModule, type NoteModule } from "./di";
export type { CreateNote, CreateNoteInput } from "./application/use-cases/create-note";
export type { Note, NoteId } from "./domain/entities/note";
export { EmptyNoteTitleError, NoteTitleTooLongError } from "./domain/errors";
