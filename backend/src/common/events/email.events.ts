/**
 * Domain events for the Email module.
 * Phase 31: Type definitions only. Wiring happens in Phase 32.
 */
export class EmailSyncedEvent {
  static readonly eventName = 'email.synced' as const;
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly emailId: string,
    public readonly providerId: string,
    public readonly syncedAt: Date,
  ) {}
}
