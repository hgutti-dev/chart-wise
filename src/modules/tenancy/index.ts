// API pública del módulo `tenancy`: única superficie importable desde fuera (el linter prohíbe
// deep-imports). Entrega la autorización (dominio puro) y el extensor de claims (compuesto en app/).

// Extensor de claims para el composition root de app/: puebla activeTenantId/role en el JWT y los
// refleja en la sesión, compuesto con los callbacks base de `identity` (FR-009).
export { tenantClaims } from "./di";

// Value object del rol (conjunto cerrado): tipo público para interpretar `session.role` fuera del
// módulo, y `Role.create()` para revalidar el claim al reconstruir el `AuthContext` (SC-010).
export { Role } from "./domain/value-objects/role";
