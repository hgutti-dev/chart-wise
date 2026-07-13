import type { PrismaClient } from "@/generated/prisma/client";
import type { TenantId } from "@/shared/domain/tenant-id";

import type { Membership } from "../../domain/entities/membership";
import type { MembershipRepository } from "../../domain/ports/membership.repository";
import type { Role } from "../../domain/value-objects/role";
import { toDomain } from "./mappers/membership.mapper";

// Repositorio real contra Postgres. Cada operación abre una transacción y fija el contexto de
// sesión con set_config(..., is_local=true) (parametrizable, sin inyección, acotado a la tx):
// - Ruta scoped (create/findRole): app.current_tenant -> la policy tenant filtra por tenant.
// - Ruta "mis membresías" (listByUser/findActive): app.current_user -> la policy por usuario.
// El filtro explícito (where) es la primera capa; RLS es la red de seguridad.
export class PrismaMembershipRepository implements MembershipRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(membership: Membership): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${membership.tenantId}, true)`;
      await tx.membership.create({
        data: {
          id: membership.id,
          tenantId: membership.tenantId,
          userId: membership.userId,
          role: membership.role,
          createdAt: membership.createdAt,
        },
      });
    });
  }

  async findRole(userId: string, tenantId: TenantId): Promise<Role | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
      const row = await tx.membership.findFirst({ where: { userId, tenantId } });
      return row ? toDomain(row).role : null;
    });
  }

  async listByUser(userId: string): Promise<Membership[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user', ${userId}, true)`;
      const rows = await tx.membership.findMany({ where: { userId } });
      return rows.map(toDomain);
    });
  }

  // "Activa" = la más antigua del usuario (su workspace personal). El SwitchActiveTenant
  // explícito llega en Fase 5; aquí se resuelve un tenant activo por defecto para el claim.
  async findActive(userId: string): Promise<Membership | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_user', ${userId}, true)`;
      const row = await tx.membership.findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" },
      });
      return row ? toDomain(row) : null;
    });
  }
}
