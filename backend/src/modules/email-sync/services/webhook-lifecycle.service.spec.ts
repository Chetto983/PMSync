import { WebhookLifecycleService } from './webhook-lifecycle.service';

describe('WebhookLifecycleService', () => {
  const mockPrisma = {} as any;

  const createService = (gmailStats: any, microsoftStats: any) =>
    new WebhookLifecycleService(
      mockPrisma,
      { getStats: jest.fn().mockResolvedValue(gmailStats) } as any,
      { getStats: jest.fn().mockResolvedValue(microsoftStats) } as any,
      { get: jest.fn().mockReturnValue('true') } as any,
    );

  it('reports issues when stale renewals exist', async () => {
    const service = createService(
      {
        activeSubscriptions: 1,
        expiringWithin24h: 0,
        errors: { providersWithErrors: 0 },
      },
      {
        activeSubscriptions: 1,
        expiringWithin24h: 0,
        errors: { providersWithErrors: 0 },
        staleRenewals: 2,
      },
    );

    const result = await service.getHealthStatus();
    expect(result.issues.some((i) => i.includes('stale'))).toBe(true);
    expect(result.microsoft.staleRenewals).toBe(2);
    expect(result.healthy).toBe(false);
  });

  it('returns healthy when no issues', async () => {
    const service = createService(
      {
        activeSubscriptions: 1,
        expiringWithin24h: 0,
        errors: { providersWithErrors: 0 },
      },
      {
        activeSubscriptions: 1,
        expiringWithin24h: 0,
        errors: { providersWithErrors: 0 },
        staleRenewals: 0,
      },
    );

    const result = await service.getHealthStatus();
    expect(result.issues).toHaveLength(0);
    expect(result.healthy).toBe(true);
  });
});
