import type { PrismaClient } from "@/generated/prisma/client";

import type { User, UserId } from "../../domain/entities/user";
import type { UserRepository } from "../../domain/ports/user.repository";
import type { Email } from "../../domain/value-objects/email";
import { toDomain, toPersistence } from "./mappers/user.mapper";

// Repositorio real de identidad contra Postgres. A diferencia de `PrismaNoteRepository`,
// NO abre transacción ni fija `set_config('app.current_tenant')`: identidad NO es
// tenant-scoped (sin RLS), solo depende de los GRANT de la migración. `save` es un upsert
// por id: cubre tanto el alta (RegisterUser / adapter) como la re-emisión de la MISMA
// entidad tras `markEmailVerified`, que conserva su id.
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(user: User): Promise<void> {
    const row = toPersistence(user);
    await this.prisma.user.upsert({
      where: { id: row.id },
      create: row,
      update: {
        email: row.email,
        name: row.name,
        image: row.image,
        passwordHash: row.passwordHash,
        emailVerified: row.emailVerified,
      },
    });
  }

  async findByEmail(email: Email): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email: email.value } });
    return row ? toDomain(row) : null;
  }

  async findById(id: UserId): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }
}
