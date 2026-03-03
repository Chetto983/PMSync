/**
 * Domain events for the Compliance module.
 * Phase 32: Used to decouple data-retention expiry from downstream purge.
 */
export class DeletionExpiredEvent {
  static readonly eventName = 'compliance.deletion-expired' as const;
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly expiredAt: Date,
  ) {}
}
