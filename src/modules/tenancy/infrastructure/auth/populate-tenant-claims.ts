import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

import type { MembershipRepository } from "../../domain/ports/membership.repository";

// Extensor de claims PROPIEDAD de `tenancy`, confinado en infrastructure/auth/** (NFR-002). Se
// COMPONE con los callbacks base de `identity` en el composition root de `app/`; `identity` NO
// importa `tenancy` (R1/NFR-004). Recibe el `MembershipRepository` inyectado desde `tenancy/di`.
export interface TenantClaims {
  readonly populateToken: (token: JWT) => Promise<JWT>;
  readonly applyToSession: (session: Session, token: JWT) => Session;
}

export function createTenantClaims(memberships: MembershipRepository): TenantClaims {
  return {
    // Corre en el sign-in: resuelve la membresía activa y fija activeTenantId/role en el token.
    // El JWT es una foto, no un espejo (R6): sin membresía activa (o sin sub), no toca el token.
    async populateToken(token: JWT): Promise<JWT> {
      const userId = token.sub;
      if (userId === undefined) return token;
      const active = await memberships.findActive(userId);
      if (active === null) return token;
      return { ...token, activeTenantId: active.tenantId, role: active.role };
    },
    // Mecánico: refleja el claim del token en la sesión. La semántica del rol es de tenancy;
    // identity solo delega aquí, sin conocer roles (ADR-007).
    applyToSession(session: Session, token: JWT): Session {
      return { ...session, activeTenantId: token.activeTenantId, role: token.role };
    },
  };
}
