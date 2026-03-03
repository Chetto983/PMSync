/**
 * Domain events for the Providers module.
 * Phase 31: Type definitions only. Wiring happens in Phase 32.
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
