import type { TenantId } from "@/shared/domain/tenant-id";

export interface TenantContext {
  readonly tenantId: TenantId;
  readonly userId?: string;
}
