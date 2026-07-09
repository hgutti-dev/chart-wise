import type { PrismaClient } from "@/generated/prisma/client";
import type { TenantId } from "@/shared/domain/tenant-id";

import type { Note, NoteId } from "../../domain/entities/note";
import type { NoteRepository } from "../../domain/ports/note.repository";
import { toDomain } from "./note.mapper";

// Repositorio real contra Postgres. Cada operación sobre la tabla scoped abre una
// transacción y fija el tenant de sesión con `set_config('app.current_tenant', $1, true)`:
// - `SET LOCAL` no admite bind params, `set_config(..., is_local=true)` sí -> parametrizado
//   (sin inyección) y acotado a la transacción.
// - La policy RLS filtra por ese setting; si no se fija, current_setting(...,true)=NULL y la
//   policy niega todo (cero filas). El filtro explícito por tenantId es la primera capa; RLS
//   es la red de seguridad.
export class PrismaNoteRepository implements NoteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(note: Note): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${note.tenantId}, true)`;
      await tx.note.create({
        data: {
          id: note.id,
          tenantId: note.tenantId,
          title: note.title.value,
          body: note.body,
          createdAt: note.createdAt,
        },
      });
    });
  }

  async findById(tenantId: TenantId, id: NoteId): Promise<Note | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
      const row = await tx.note.findFirst({ where: { id, tenantId } });
      return row ? toDomain(row) : null;
    });
  }
}
