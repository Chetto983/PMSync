import { QueueService } from './queue.service';

type QueueMock = ReturnType<typeof createQueueMock>;

const createQueueMock = (name: string) => {
  const mockJob = { remove: jest.fn(), data: {} };
  const mockExistingJob = {
    processedOn: Date.now() - 1000,
    finishedOn: Date.now(),
    getState: jest.fn().mockResolvedValue('completed'),
    remove: jest.fn(),
  };

  return {
    name: `email-sync-${name}`,
    add: jest.fn(),
    addBulk: jest.fn(),
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 1,
      active: 2,
      completed: 3,
      failed: 4,
      delayed: 5,
    }),
    pause: jest.fn(),
    resume: jest.fn(),
    obliterate: jest.fn(),
    getJobs: jest.fn().mockResolvedValue([mockJob]),
    getJob: jest.fn().mockResolvedValue(mockExistingJob),
    close: jest.fn().mockResolvedValue(undefined),
    mockJob,
    mockExistingJob,
  };
};

describe('QueueService', () => {
  let service: QueueService;
  let highQueue: QueueMock;
  let normalQueue: QueueMock;
  let lowQueue: QueueMock;

  beforeEach(() => {
    service = new QueueService({ get: jest.fn() } as any);

    highQueue = createQueueMock('high');
    normalQueue = createQueueMock('normal');
    lowQueue = createQueueMock('low');

    service['highQueue'] = highQueue as any;
    service['normalQueue'] = normalQueue as any;
    service['lowQueue'] = lowQueue as any;
    service['redisConnection'] = {
      keys: jest.fn().mockResolvedValue([]),
      quit: jest.fn().mockResolvedValue(undefined),
      scan: jest.fn().mockResolvedValue(['0', []]),
      ping: jest.fn().mockResolvedValue('PONG'),
      sadd: jest.fn().mockResolvedValue(1),
      srem: jest.fn().mockResolvedValue(1),
      smembers: jest.fn().mockResolvedValue([]),
      del: jest.fn().mockResolvedValue(1),
      status: 'ready',
    } as any;

    // Initialize queueEvents as empty array to prevent cleanup issues
    service['queueEvents'] = [];
  });

  afterEach(async () => {
    // Cleanup to prevent memory leaks - call onModuleDestroy
    await service.onModuleDestroy();
    jest.clearAllMocks();
  });

  describe('addSyncJob', () => {
    it('adds a job to the appropriate queue', async () => {
      const data = {
        tenantId: 'tenant',
        providerId: 'provider',
        providerType: 'google',
        email: 'user@example.com',
        priority: 'high' as const,
        syncType: 'full' as const,
      };

      await service.addSyncJob(data as any);

      expect(highQueue.add).toHaveBeenCalledWith(
        'sync-google-user@example.com',
        data,
        expect.objectContaining({
          jobId: expect.stringContaining('provider'),
        }),
      );
    });
  });

  describe('addBulkSyncJobs', () => {
    it('groups jobs by priority and adds them in batches', async () => {
      const jobs = [
        { priority: 'high', providerId: 'h', providerType: 'google', email: 'h', tenantId: 't', syncType: 'full' },
        { priority: 'normal', providerId: 'n', providerType: 'google', email: 'n', tenantId: 't', syncType: 'full' },
        { priority: 'low', providerId: 'l', providerType: 'google', email: 'l', tenantId: 't', syncType: 'full' },
      ] as any[];

      await service.addBulkSyncJobs(jobs);

      expect(highQueue.addBulk).toHaveBeenCalledWith(expect.any(Array));
      expect(normalQueue.addBulk).toHaveBeenCalledWith(expect.any(Array));
      expect(lowQueue.addBulk).toHaveBeenCalledWith(expect.any(Array));
    });
  });

  describe('queue controls', () => {
    it('pauses and resumes queues', async () => {
      await service.pauseQueue('normal');
      expect(normalQueue.pause).toHaveBeenCalled();

      await service.resumeQueue('normal');
      expect(normalQueue.resume).toHaveBeenCalled();
    });

    it('obliterates a queue', async () => {
      await service.obliterateQueue('low');
      expect(lowQueue.obliterate).toHaveBeenCalledWith({ force: true });
    });
  });

  describe('getQueueStatus', () => {
    it('returns status for all queues', async () => {
      const statuses = await service.getQueueStatus();

      expect(statuses).toHaveLength(3);
      expect(statuses[0]).toMatchObject({
        queueName: expect.stringContaining('high'),
        waiting: 1,
      });
    });
  });

  describe('removeJobsForTenant', () => {
    it('removes pending jobs associated with a tenant', async () => {
      highQueue.getJobs.mockResolvedValueOnce([
        { data: { tenantId: 'tenant-a' }, remove: jest.fn() },
        { data: { tenantId: 'tenant-b' }, remove: jest.fn() },
      ]);
      normalQueue.getJobs.mockResolvedValueOnce([]);
      lowQueue.getJobs.mockResolvedValueOnce([]);

      const removed = await service.removeJobsForTenant('tenant-a');

      expect(removed).toBe(1);
      expect(highQueue.getJobs).toHaveBeenCalled();
    });
  });

  describe('removeJobsForProvider', () => {
    it('removes pending jobs associated with a provider', async () => {
      normalQueue.getJobs.mockResolvedValueOnce([
        { data: { providerId: 'provider-a' }, remove: jest.fn() },
        { data: { providerId: 'another' }, remove: jest.fn() },
      ]);
      highQueue.getJobs.mockResolvedValueOnce([]);
      lowQueue.getJobs.mockResolvedValueOnce([]);

      const removed = await service.removeJobsForProvider('provider-a');

      expect(removed).toBe(1);
      expect(normalQueue.getJobs).toHaveBeenCalled();
    });
  });

  describe('metrics summary', () => {
    it('tracks completion and failures', async () => {
      await (service as any).recordCompletion('high', highQueue, 'job-1');
      (service as any).recordFailure('normal', 'boom');

      const summary = service.getQueueMetricsSummary();

      expect(summary.find((s) => s.queue === 'high')?.completed).toBe(1);
      expect(summary.find((s) => s.queue === 'normal')?.failed).toBe(1);
    });
  });

  describe('health summary', () => {
    it('reports redis and queue health', async () => {
      const health = await service.getHealthSummary();

      expect(health.redisConnected).toBe(true);
      expect(health.redisStatus).toBe('ready');
      expect(health.queues).toHaveLength(3);
      expect(health.metrics).toHaveLength(3);
      expect(health.lagMs).toBeDefined();
    });
  });

  describe('jitter', () => {
    it('applies jitter when adding jobs', async () => {
      const data = {
        tenantId: 'tenant',
        providerId: 'provider',
        providerType: 'google',
        email: 'user@example.com',
        priority: 'normal' as const,
        syncType: 'full' as const,
      };

      await service.addSyncJob(data as any);

      const call = normalQueue.add.mock.calls[0][2];
      expect(call.delay).toBeGreaterThanOrEqual(0);
    });
  });
});
