import { MicrosoftWebhookService } from './microsoft-webhook.service';

describe('MicrosoftWebhookService', () => {
  const mockPrisma = {
    webhookSubscription: {
      findFirst: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    providerConfig: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as any;

  const mockQueue = {
    addSyncJob: jest.fn(),
  } as any;

  const mockConfig = {
    get: jest.fn(),
  } as any;

  const mockProviderToken = {
    getProviderWithToken: jest.fn(),
  } as any;

  const service = new MicrosoftWebhookService(
    mockPrisma,
    mockQueue,
    mockConfig,
    mockProviderToken,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.webhookSubscription.findMany.mockResolvedValue([]);
    mockPrisma.webhookSubscription.count.mockResolvedValue(0);
  });

  it('drops notification when clientState mismatches', async () => {
    mockPrisma.webhookSubscription.findFirst.mockResolvedValue({
      providerId: 'provider-1',
      isActive: true,
      metadata: { clientState: 'expected' },
    });
    mockPrisma.providerConfig.findUnique.mockResolvedValue({
      id: 'provider-1',
      email: 'user@example.com',
      tenantId: 'tenant-1',
      lastSyncedAt: null,
    });

    await service['handleSingleNotification']({
      subscriptionId: 'sub',
      changeType: 'created',
      resource: '/me/mail',
      clientState: 'spoofed',
    } as any);

    expect(mockQueue.addSyncJob).not.toHaveBeenCalled();
  });

  it('queues sync when clientState matches', async () => {
    mockPrisma.webhookSubscription.findFirst.mockResolvedValue({
      providerId: 'provider-1',
      isActive: true,
      metadata: { clientState: 'expected' },
    });
    mockPrisma.providerConfig.findUnique.mockResolvedValue({
      id: 'provider-1',
      email: 'user@example.com',
      tenantId: 'tenant-1',
      lastSyncedAt: null,
    });

    await service['handleSingleNotification']({
      subscriptionId: 'sub',
      changeType: 'created',
      resource: '/me/mail',
      clientState: 'expected',
    } as any);

    expect(mockQueue.addSyncJob).toHaveBeenCalledTimes(1);
  });

  it('fails open to cron when renewal fails', async () => {
    mockPrisma.webhookSubscription.findMany.mockResolvedValue([
      {
        subscriptionId: 'sub-1',
        providerId: 'provider-1',
        resourcePath: '/me/mailFolders/inbox/messages',
        isActive: true,
        expiresAt: new Date(Date.now() + 1000),
      },
    ]);

    // Force renewSubscription to throw
    (service as any).renewSubscription = jest.fn().mockRejectedValue(new Error('renew fail'));

    await service.renewExpiringSubscriptions();

    expect(mockPrisma.webhookSubscription.update).toHaveBeenCalledWith({
      where: {
        providerId_resourcePath: {
          providerId: 'provider-1',
          resourcePath: '/me/mailFolders/inbox/messages',
        },
      },
      data: expect.objectContaining({
        isActive: false,
      }),
    });

    expect(mockPrisma.providerConfig.update).toHaveBeenCalledWith({
      where: { id: 'provider-1' },
      data: expect.objectContaining({
        nextSyncAt: expect.any(Date),
      }),
    });
  });

  it('returns staleRenewals in stats', async () => {
    mockPrisma.webhookSubscription.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(8) // active
      .mockResolvedValueOnce(2) // expiring
      .mockResolvedValueOnce(3) // last1h
      .mockResolvedValueOnce(1) // staleRenewals
      .mockResolvedValueOnce(4); // withErrors

    const stats = await service.getStats();

    expect(stats.staleRenewals).toBe(1);
    expect(mockPrisma.webhookSubscription.count).toHaveBeenCalled();
  });
});
