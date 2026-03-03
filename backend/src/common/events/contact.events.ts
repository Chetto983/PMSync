/**
 * Domain events for the Contacts module.
 * Phase 31: Type definitions only. Wiring happens in Phase 32.
 */
export class ContactUpdatedEvent {
  static readonly eventName = 'contact.updated' as const;
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly contactId: string,
    public readonly updatedFields: string[],
    public readonly updatedAt: Date,
  ) {}
}
