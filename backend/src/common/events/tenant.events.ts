/**
 * Domain events for the Tenant module.
 * Phase 32: Used to decouple tenant lifecycle from downstream cleanup.
 */
export class TenantDeletedEvent {
  static readonly eventName = 'tenant.deleted' as const;
  constructor(
    public readonly tenantId: string,
    public readonly deletedAt: Date,
  ) {}
}
