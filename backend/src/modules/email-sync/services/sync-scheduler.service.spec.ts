import { SyncSchedulerService } from './sync-scheduler.service';

describe('SyncSchedulerService', () => {
  let prisma: any;
  let queueService: any;
  let configService: any;
  let service: SyncSchedulerService;

  const providerBase = {
    id: 'provider-1',
    tenantId: 'tenant-1',
    providerType: 'google',
    email: 'user@example.com',
    lastSyncedAt: null as Date | null,
    syncPriority: 1,
    tenant: { id: 'tenant-1' },
  };

  beforeEach(() => {
    prisma = {
      providerConfig: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _avg: { avgActivityRate: 0 } }),
      },
    };

    queueService = {
      addBulkSyncJobs: jest.fn().mockResolvedValue(undefined),
      addSyncJob: jest.fn().mockResolvedValue(undefined),
      getQueueStatus: jest.fn().mockResolvedValue({ high: {}, normal: {}, low: {} }),
    };

    configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'EMAIL_SYNC_SCHEDULER_ENABLED') return 'true';
        if (key === 'WEBHOOK_STALE_THRESHOLD_MINUTES') return '10';
        if (key === 'EMAIL_SYNC_FULL_THRESHOLD_DAYS') return '7';
        return defaultValue;
      }),
    };

    service = new SyncSchedulerService(prisma, queueService, configService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('scheduleSyncJobs', () => {
    it('skips when already running', async () => {
      (service as any).isRunning = true;

      await service.scheduleSyncJobs();

      expect(queueService.addBulkSyncJobs).not.toHaveBeenCalled();
    });

    it('enqueues jobs when providers are returned', async () => {
      const providers = [{ ...providerBase }];
      const jobs = [
        {
          tenantId: providerBase.tenantId,
          providerId: providerBase.id,
          providerType: providerBase.providerType,
          email: providerBase.email,
          priority: 'high' as const,
          syncType: 'full' as const,
          lastSyncedAt: undefined,
        },
      ];

      jest.spyOn<any, any>(service as any, 'getProvidersToSync').mockResolvedValue(providers);
      jest.spyOn<any, any>(service as any, 'createSyncJobs').mockReturnValue(jobs);

      await service.scheduleSyncJobs();

      expect(queueService.addBulkSyncJobs).toHaveBeenCalledWith(jobs);
    });

    it('logs and exits when no providers need syncing', async () => {
      jest.spyOn<any, any>(service as any, 'getProvidersToSync').mockResolvedValue([]);

      await service.scheduleSyncJobs();

      expect(queueService.addBulkSyncJobs).not.toHaveBeenCalled();
    });
  });

  describe('createSyncJobs', () => {
    it('maps providers to SyncJobData with derived priority and syncType', () => {
      const spyPriority = jest
        .spyOn<any, any>(service as any, 'determinePriority')
        .mockReturnValue('normal');
      const spySyncType = jest
        .spyOn<any, any>(service as any, 'determineSyncType')
        .mockReturnValue('incremental');

      const jobs = (service as any).createSyncJobs([providerBase]);

      expect(spyPriority).toHaveBeenCalledWith(providerBase);
      expect(spySyncType).toHaveBeenCalledWith(providerBase);
      expect(jobs).toEqual([
        expect.objectContaining({
          tenantId: providerBase.tenantId,
          providerId: providerBase.id,
          priority: 'normal',
          syncType: 'incremental',
        }),
      ]);
    });

    it('forces high/full when backfillRequired metadata is set', () => {
      const provider = {
        ...providerBase,
        metadata: { backfillRequired: true },
      };

      const jobs = (service as any).createSyncJobs([provider]);

      expect(jobs[0]).toMatchObject({
        priority: 'high',
        syncType: 'full',
      });
    });
  });

  describe('determinePriority', () => {
    it('returns high when syncPriority is 1', () => {
      const priority = (service as any).determinePriority({ syncPriority: 1 });
      expect(priority).toBe('high');
    });

    it('returns normal when syncPriority is 2 or 3', () => {
      expect((service as any).determinePriority({ syncPriority: 2 })).toBe('normal');
      expect((service as any).determinePriority({ syncPriority: 3 })).toBe('normal');
    });

    it('returns low when syncPriority is 4 or greater', () => {
      expect((service as any).determinePriority({ syncPriority: 4 })).toBe('low');
      expect((service as any).determinePriority({ syncPriority: 5 })).toBe('low');
    });

    it('defaults to normal when syncPriority missing', () => {
      const priority = (service as any).determinePriority({});
      expect(priority).toBe('normal');
    });
  });

  describe('determineSyncType', () => {
    it('returns full when never synced', () => {
      const type = (service as any).determineSyncType({ lastSyncedAt: null });
      expect(type).toBe('full');
    });

    it('returns incremental when last sync within threshold', () => {
      const type = (service as any).determineSyncType({
        lastSyncedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      });
      expect(type).toBe('incremental');
    });

    it('returns full when beyond threshold', () => {
      const type = (service as any).determineSyncType({
        lastSyncedAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
      });
      expect(type).toBe('full');
    });
  });

  describe('syncProviderNow', () => {
    it('throws when provider does not exist', async () => {
      prisma.providerConfig.findUnique.mockResolvedValue(null);

      await expect(service.syncProviderNow('missing')).rejects.toThrow('Provider missing not found');
    });

    it('throws when provider is inactive', async () => {
      prisma.providerConfig.findUnique.mockResolvedValue({
        ...providerBase,
        isActive: false,
      });

      await expect(service.syncProviderNow('provider-1')).rejects.toThrow(
        'Provider provider-1 is not active',
      );
    });

    it('enqueues a manual sync job', async () => {
      prisma.providerConfig.findUnique.mockResolvedValue({
        ...providerBase,
        isActive: true,
        lastSyncedAt: null,
      });

      await service.syncProviderNow('provider-1', 'normal');

      expect(queueService.addSyncJob).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: providerBase.id,
          priority: 'normal',
        }),
      );
    });
  });

  describe('getSyncStats', () => {
    it('aggregates queue status and provider metrics', async () => {
      queueService.getQueueStatus.mockResolvedValue({ summary: true });
      prisma.providerConfig.count
        .mockResolvedValueOnce(100) // total active
        .mockResolvedValueOnce(5) // never synced
        .mockResolvedValueOnce(40) // synced today
        .mockResolvedValueOnce(7) // providers with errors
        .mockResolvedValueOnce(0) // providers with auth errors
        .mockResolvedValueOnce(2) // providers needing backfill
        .mockResolvedValueOnce(3); // providers with delta fallback

      prisma.providerConfig.groupBy.mockResolvedValue([
        { syncPriority: 1, _count: 10 },
        { syncPriority: 3, _count: 30 },
      ]);

      prisma.providerConfig.aggregate.mockResolvedValue({
        _avg: { avgActivityRate: 1.25 },
      });
      // providersNeedingBackfill already set above

      const result = await service.getSyncStats();

      expect(queueService.getQueueStatus).toHaveBeenCalled();
      expect(prisma.providerConfig.count).toHaveBeenCalledTimes(7);
      expect(prisma.providerConfig.groupBy).toHaveBeenCalled();
      expect(prisma.providerConfig.aggregate).toHaveBeenCalled();
      expect(result).toEqual({
        queues: { summary: true },
        providers: {
          total: 100,
          neverSynced: 5,
          syncedToday: 40,
        },
        scheduler: {
          isRunning: false,
          batchSize: expect.any(Number),
          intervalMinutes: expect.any(Number),
        },
        smartSync: {
          priorityDistribution: [
            {
              priority: 1,
              count: 10,
              description: 'High (3 min)',
            },
            {
              priority: 3,
              count: 30,
              description: 'Medium (30 min)',
            },
          ],
          avgActivityRate: 1.25,
          providersWithErrors: 7,
          providersWithAuthErrors: 0,
          providersNeedingBackfill: 2,
          providersWithDeltaFallback: 3,
        },
      });
    });
  });
});
