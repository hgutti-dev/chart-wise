import type { TenantId } from "@/shared/domain/tenant-id";

import type { Membership } from "../../domain/entities/membership";
import type { MembershipRepository } from "../../domain/ports/membership.repository";
import type { Role } from "../../domain/value-objects/role";

// Fake para desarrollo/tests sin base de datos. Replica el aislamiento que en producción
// garantiza RLS: findRole solo resuelve si coinciden userId Y tenantId; la ruta por usuario
// (listByUser/findActive) devuelve las membresías propias cruzando tenants.
export class InMemoryMembershipRepository implements MembershipRepository {
  private readonly memberships: Membership[] = [];

  async create(membership: Membership): Promise<void> {
    this.memberships.push(membership);
  }

  async findRole(userId: string, tenantId: TenantId): Promise<Role | null> {
    const found = this.memberships.find(
      (m) => m.userId === userId && m.tenantId === tenantId,
    );
    return found ? found.role : null;
  }

  async listByUser(userId: string): Promise<Membership[]> {
    return this.memberships.filter((m) => m.userId === userId);
  }

  // "Activa" = la más antigua del usuario (su workspace personal, creado al registrarse).
  // El cambio explícito de tenant activo (SwitchActiveTenant) llega en Fase 5.
  async findActive(userId: string): Promise<Membership | null> {
    const owned = this.memberships
      .filter((m) => m.userId === userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return owned[0] ?? null;
  }
}
