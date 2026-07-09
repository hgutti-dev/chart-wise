import type { TenantId } from "@/shared/domain/tenant-id";

import type { Note, NoteId } from "../entities/note";

// El tenant se pasa explícito en cada lectura (tenantId: TenantId): es visible en el
// call site, greppable y TypeScript no compila si se omite. `save` no lo recibe porque
// la entidad ya transporta su propio tenantId. El repositorio no conoce autenticación
// (userId/role): solo el discriminador de aislamiento.
export interface NoteRepository {
  save(note: Note): Promise<void>;
  findById(tenantId: TenantId, id: NoteId): Promise<Note | null>;
}
