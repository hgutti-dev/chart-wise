// Identificador de tenant como branded type: es un `string` en runtime, pero el
// sistema de tipos impide intercambiarlo con otros ids u otros strings. Vive en el
// kernel de dominio (shared/domain) para que los puertos puedan nombrarlo sin violar
// la regla de dependencia. `TenantContext` (shared/application) se compone SOBRE este
// tipo: la dependencia apunta hacia adentro.
export type TenantId = string & { readonly __brand: "TenantId" };

export const asTenantId = (value: string): TenantId => value as TenantId;
