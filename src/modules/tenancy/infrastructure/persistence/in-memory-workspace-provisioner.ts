import type { Membership } from "../../domain/entities/membership";
import type { Tenant } from "../../domain/entities/tenant";
import type { WorkspaceProvisioner } from "../../domain/ports/workspace-provisioner";

interface FakeOptions {
  readonly failOnProvision?: boolean;
}

// Fake que simula la atomicidad de la transacción: con `failOnProvision`, lanza SIN persistir nada
// (como un ROLLBACK). Expone los almacenes para las aserciones de test.
export class InMemoryWorkspaceProvisioner implements WorkspaceProvisioner {
  readonly tenants: Tenant[] = [];
  readonly memberships: Membership[] = [];
  private readonly failOnProvision: boolean;

  constructor(options: FakeOptions = {}) {
    this.failOnProvision = options.failOnProvision ?? false;
  }

  async provision(tenant: Tenant, ownerMembership: Membership): Promise<void> {
    if (this.failOnProvision) {
      throw new Error("provisión fallida (simulada): la transacción no persiste nada");
    }
    this.tenants.push(tenant);
    this.memberships.push(ownerMembership);
  }
}
