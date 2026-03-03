/**
 * Domain events for the Providers module.
 * Phase 31: Type definitions. Phase 32: Wiring (ProviderConnectedEvent, ProviderDisconnectedEvent).
 */
export class ProviderConnectedEvent {
  static readonly eventName = 'provider.connected' as const;
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly providerId: string,
    public readonly providerType: string,
    public readonly connectedAt: Date,
  ) {}
}

export class ProviderDisconnectedEvent {
  static readonly eventName = 'provider.disconnected' as const;
  constructor(
    public readonly tenantId: string,
    public readonly providerId: string,
    public readonly providerType: string,
    public readonly supportsCalendar: boolean,
    public readonly supportsContacts: boolean,
    public readonly disconnectedAt: Date,
  ) {}
}
