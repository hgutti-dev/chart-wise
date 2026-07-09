import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "@/config/env";
import { PrismaClient } from "@/generated/prisma/client";

import { CreateNote } from "./application/use-cases/create-note";
import type { NoteRepository } from "./domain/ports/note.repository";
import { InMemoryNoteRepository } from "./infrastructure/persistence/in-memory-note.repository";
import { PrismaNoteRepository } from "./infrastructure/persistence/prisma-note.repository";

export interface NoteModule {
  readonly createNote: CreateNote;
}

// El cliente Prisma es un singleton de módulo: es un pool de conexiones, seguro de
// reutilizar. El aislamiento por tenant NO está horneado aquí (el repositorio es sin
// estado; el tenant llega por parámetro en cada llamada), así que memoizarlo no filtra
// datos entre tenants.
let prismaSingleton: PrismaClient | undefined;

const getPrisma = (): PrismaClient => {
  if (prismaSingleton === undefined) {
    const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
    prismaSingleton = new PrismaClient({ adapter });
  }
  return prismaSingleton;
};

// Real vs. fake según entorno: en tests el repositorio in-memory evita depender de
// Postgres; en el resto se usa Prisma con RLS.
const selectRepository = (): NoteRepository =>
  env.NODE_ENV === "test"
    ? new InMemoryNoteRepository()
    : new PrismaNoteRepository(getPrisma());

// Composition root del módulo. `repository` es inyectable para tests (p. ej. el de
// aislamiento pasa un PrismaNoteRepository con un cliente controlado).
export const createNoteModule = (
  repository: NoteRepository = selectRepository(),
): NoteModule => ({
  createNote: new CreateNote(repository),
});
