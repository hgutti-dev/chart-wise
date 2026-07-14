import type { Role } from "../value-objects/role";

// La unidad real de autorización es el permiso, no el rol (§12.2): el código pregunta
// "¿puede `member:invite`?", nunca "¿es admin?". 13 permisos, conjunto cerrado.
export type Permission =
  | "dataset:upload"
  | "analysis:run"
  | "dashboard:read"
  | "dashboard:create"
  | "dashboard:update"
  | "dashboard:delete"
  | "dashboard:share"
  | "member:invite"
  | "member:remove"
  | "member:change_role"
  | "tenant:update"
  | "tenant:delete"
  | "billing:manage";

// Celda tri-estado: `all` (siempre), `own` (solo sobre recursos propios, resuelto por
// `can()` con `resourceOwnerId`), `false` (nunca).
export type Grant = "all" | "own" | false;

// Matriz rol→permiso = §12.2 del PDF. Es una CONSTANTE DE DOMINIO (ADR-002 / constitución §7.1):
// nunca vive en `config/`. `member:change_role` de ADMIN es `all`; el invariante "no a OWNER"
// se enforca en el caso de uso `ChangeMemberRole` (Fase 5), no aquí (R5).
export const PERMISSION_MATRIX: Record<Role, Record<Permission, Grant>> = {
  OWNER: {
    "dataset:upload": "all",
    "analysis:run": "all",
    "dashboard:read": "all",
    "dashboard:create": "all",
    "dashboard:update": "all",
    "dashboard:delete": "all",
    "dashboard:share": "all",
    "member:invite": "all",
    "member:remove": "all",
    "member:change_role": "all",
    "tenant:update": "all",
    "tenant:delete": "all",
    "billing:manage": "all",
  },
  ADMIN: {
    "dataset:upload": "all",
    "analysis:run": "all",
    "dashboard:read": "all",
    "dashboard:create": "all",
    "dashboard:update": "all",
    "dashboard:delete": "all",
    "dashboard:share": "all",
    "member:invite": "all",
    "member:remove": "all",
    "member:change_role": "all",
    "tenant:update": "all",
    "tenant:delete": false,
    "billing:manage": false,
  },
  MEMBER: {
    "dataset:upload": "all",
    "analysis:run": "all",
    "dashboard:read": "all",
    "dashboard:create": "all",
    "dashboard:update": "own",
    "dashboard:delete": "own",
    "dashboard:share": false,
    "member:invite": false,
    "member:remove": false,
    "member:change_role": false,
    "tenant:update": false,
    "tenant:delete": false,
    "billing:manage": false,
  },
  VIEWER: {
    "dataset:upload": false,
    "analysis:run": false,
    "dashboard:read": "all",
    "dashboard:create": false,
    "dashboard:update": false,
    "dashboard:delete": false,
    "dashboard:share": false,
    "member:invite": false,
    "member:remove": false,
    "member:change_role": false,
    "tenant:update": false,
    "tenant:delete": false,
    "billing:manage": false,
  },
};
