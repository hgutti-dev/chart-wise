import { err, ok, type Result } from "@/shared/domain/result";

import { InvalidRoleError } from "../errors/invalid-role.error";

// Conjunto cerrado de roles por membresía (ADR-002). `Role` es una unión de literales, no un
// `enum` de TS ni una clase: así sirve como clave de la matriz `Record<Role, …>` (Fase B) y es
// estructuralmente asignable desde/hacia el claim `role` del JWT (augmentación R1). El objeto
// compañero `Role` expone `create()` sin romper que `Role` sea también el tipo.
export const ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;

export type Role = (typeof ROLES)[number];

export const Role = {
  create(raw: string): Result<Role, InvalidRoleError> {
    const normalized = raw.trim().toUpperCase();
    if (!(ROLES as readonly string[]).includes(normalized)) {
      return err(new InvalidRoleError());
    }
    return ok(normalized as Role);
  },
} as const;
