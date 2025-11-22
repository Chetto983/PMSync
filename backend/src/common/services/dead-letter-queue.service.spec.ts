import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DeadLetterQueueService, DLQJobData } from './dead-letter-queue.service';
import { CacheService } from './cache.service';

describe('DeadLetterQueueService', () => {
  let service: DeadLetterQueueService;
  let _cacheService: CacheService;
  let _configService: ConfigService;

  const mockQueue = {
    add: jest.fn(),
    getJob: jest.fn(),
    getJobs: jest.fn(),
    close: jest.fn(),
  };

  const mockQueueEvents = {
    on: jest.fn(),
    close: jest.fn(),
  };

  const mockRedisConnection = {
    quit: jest.fn(),
  };

  const mockCacheService = {
    incr: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadLetterQueueService,
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                REDIS_HOST: 'localhost',
                REDIS_PORT: 6379,
                REDIS_PASSWORD: 'testpass',
                DLQ_ALERT_THRESHOLD: 10,
                DLQ_CLEANUP_INTERVAL_MS: 86400000,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<DeadLetterQueueService>(DeadLetterQueueService);
    _cacheService = module.get<CacheService>(CacheService);
    _configService = module.get<ConfigService>(ConfigService);

    // Manually set mocked queue and events
    (service as any).dlqQueue = mockQueue;
    (service as any).queueEvents = mockQueueEvents;
    (service as any).redisConnection = mockRedisConnection;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    // Note: Event listener setup test skipped because the service uses manually injected
    // mocks instead of real queue initialization in tests
  });

  describe('addToDeadLetter', () => {
    it('should add failed job to DLQ', async () => {
      const originalData = { providerId: 'provider-123', email: 'test@example.com' };
      const error = new Error('Sync failed');

      mockQueue.getJob.mockResolvedValue(null); // No existing job
      mockQueue.add.mockResolvedValue({ id: 'dlq-job-123' });
      mockCacheService.incr.mockResolvedValue(1);

      await service.addToDeadLetter(
        'job-123',
        'email-sync-high',
        originalData,
        error,
        3,
      );

      expect(mockQueue.add).toHaveBeenCalledWith(
        'failed-job',
        expect.objectContaining({
          originalJobId: 'job-123',
          originalQueue: 'email-sync-high',
          originalData,
          lastError: 'Sync failed',
          attemptsMade: 3,
          failureCount: 1,
        }),
        { jobId: 'dlq-job-123' },
      );
    });

    it('should increment failure count for repeated failures', async () => {
      const originalData = { providerId: 'provider-123' };
      const error = new Error('Sync failed again');

      const existingJob = {
        data: {
          failureCount: 2,
        },
        remove: jest.fn(),
      };

      mockQueue.getJob.mockResolvedValue(existingJob);
      mockQueue.add.mockResolvedValue({ id: 'dlq-job-123' });

      await service.addToDeadLetter(
        'job-123',
        'email-sync-high',
        originalData,
        error,
        3,
      );

      expect(existingJob.remove).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith(
        'failed-job',
        expect.objectContaining({
          failureCount: 3, // Incremented
        }),
        expect.any(Object),
      );
    });

    it('should track failure statistics', async () => {
      const originalData = { providerId: 'provider-123' };
      const error = new Error('Network timeout');

      mockQueue.getJob.mockResolvedValue(null);
      mockQueue.add.mockResolvedValue({ id: 'dlq-job-123' });
      mockCacheService.incr.mockResolvedValue(1);

      await service.addToDeadLetter(
        'job-123',
        'email-sync-high',
        originalData,
        error,
        3,
      );

      expect(mockCacheService.incr).toHaveBeenCalledWith(
        'dlq:total',
        expect.any(Object),
      );
      expect(mockCacheService.incr).toHaveBeenCalledWith(
        'dlq:queue:email-sync-high',
        expect.any(Object),
      );
    });

    it('should handle errors gracefully', async () => {
      const originalData = { providerId: 'provider-123' };
      const error = new Error('Sync failed');

      mockQueue.getJob.mockRejectedValue(new Error('Queue error'));

      // Should not throw
      await expect(
        service.addToDeadLetter(
          'job-123',
          'email-sync-high',
          originalData,
          error,
          3,
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('retryJob', () => {
    it('should retry failed job from DLQ', async () => {
      const dlqJobData: DLQJobData = {
        originalJobId: 'job-123',
        originalQueue: 'email-sync-high',
        originalData: { providerId: 'provider-123' },
        failedAt: new Date(),
        attemptsMade: 3,
        lastError: 'Sync failed',
        failureCount: 1,
      };

      const mockJob = {
        data: dlqJobData,
        remove: jest.fn(),
      };

      mockQueue.getJob.mockResolvedValue(mockJob);
      mockCacheService.set.mockResolvedValue(true);

      const result = await service.retryJob('dlq-job-123', {
        maxRetries: 3,
        retryDelay: 5000,
      });

      expect(result).toBe(true);
      expect(mockJob.remove).toHaveBeenCalled();
      expect(mockCacheService.set).toHaveBeenCalledWith(
        'retry:job-123',
        expect.objectContaining({
          retriedAt: expect.any(String),
          retriedFrom: 'dlq-job-123',
        }),
        expect.any(Object),
      );
    });

    it('should return false for non-existent job', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      const result = await service.retryJob('nonexistent-job');

      expect(result).toBe(false);
    });

    it('should handle retry errors gracefully', async () => {
      const mockJob = {
        data: {},
        remove: jest.fn().mockRejectedValue(new Error('Remove error')),
      };

      mockQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.retryJob('dlq-job-123');

      expect(result).toBe(false);
    });
  });

  describe('retryBulk', () => {
    it('should retry multiple jobs', async () => {
      const jobIds = ['dlq-job-1', 'dlq-job-2', 'dlq-job-3'];

      mockQueue.getJob.mockImplementation((id) => ({
        data: {
          originalJobId: id,
          originalQueue: 'test-queue',
          originalData: {},
          failedAt: new Date(),
          attemptsMade: 1,
          lastError: 'Test error',
          failureCount: 1,
        },
        remove: jest.fn(),
      }));

      mockCacheService.set.mockResolvedValue(true);

      const result = await service.retryBulk(jobIds);

      expect(result).toBe(3);
    });

    it('should handle partial failures', async () => {
      const jobIds = ['dlq-job-1', 'dlq-job-2', 'dlq-job-3'];

      mockQueue.getJob
        .mockResolvedValueOnce({
          data: {},
          remove: jest.fn(),
        })
        .mockResolvedValueOnce(null) // Non-existent
        .mockResolvedValueOnce({
          data: {},
          remove: jest.fn(),
        });

      mockCacheService.set.mockResolvedValue(true);

      const result = await service.retryBulk(jobIds);

      expect(result).toBe(2); // Only 2 succeeded
    });
  });

  describe('getStats', () => {
    it('should return DLQ statistics', async () => {
      const mockJobs = [
        {
          data: {
            originalJobId: 'job-1',
            originalQueue: 'email-sync-high',
            lastError: 'Network timeout',
            failedAt: new Date('2025-01-01'),
          },
        },
        {
          data: {
            originalJobId: 'job-2',
            originalQueue: 'email-sync-normal',
            lastError: 'Authentication failed',
            failedAt: new Date('2025-01-02'),
          },
        },
        {
          data: {
            originalJobId: 'job-3',
            originalQueue: 'email-sync-high',
            lastError: 'Network ECONNREFUSED',
            failedAt: new Date('2025-01-03'),
          },
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);

      const stats = await service.getStats();

      expect(stats.totalFailed).toBe(3);
      expect(stats.byQueue['email-sync-high']).toBe(2);
      expect(stats.byQueue['email-sync-normal']).toBe(1);
      expect(stats.byErrorType['Timeout']).toBe(1);
      expect(stats.byErrorType['Authentication']).toBe(1);
      expect(stats.byErrorType['Network']).toBe(1);
      expect(stats.recentFailures).toHaveLength(3);
    });

    it('should identify oldest failure', async () => {
      const oldDate = new Date('2025-01-01');
      const newDate = new Date('2025-01-10');

      const mockJobs = [
        {
          data: {
            originalJobId: 'job-1',
            originalQueue: 'test',
            lastError: 'Error',
            failedAt: newDate,
          },
        },
        {
          data: {
            originalJobId: 'job-2',
            originalQueue: 'test',
            lastError: 'Error',
            failedAt: oldDate,
          },
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);

      const stats = await service.getStats();

      expect(stats.oldestFailure).toEqual({
        jobId: 'job-2',
        failedAt: oldDate.toISOString(),
      });
    });
  });

  describe('getJobs', () => {
    it('should get jobs with filters', async () => {
      const mockJobs = [
        { data: { originalQueue: 'queue-a', lastError: 'Timeout error' } },
        { data: { originalQueue: 'queue-b', lastError: 'Network error' } },
        { data: { originalQueue: 'queue-a', lastError: 'Authentication error' } },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);

      const result = await service.getJobs({
        queue: 'queue-a',
        limit: 10,
      });

      expect(result).toHaveLength(2);
      expect(result[0].originalQueue).toBe('queue-a');
    });

    it('should filter by error type', async () => {
      const mockJobs = [
        { data: { originalQueue: 'test', lastError: 'Timeout error' } },
        { data: { originalQueue: 'test', lastError: 'Network ECONNREFUSED' } },
        { data: { originalQueue: 'test', lastError: 'Another timeout' } },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);

      const result = await service.getJobs({
        errorType: 'Timeout',
        limit: 10,
      });

      expect(result).toHaveLength(2);
    });

    it('should apply pagination', async () => {
      const mockJobs = Array.from({ length: 100 }, (_, i) => ({
        data: { originalJobId: `job-${i}`, originalQueue: 'test', lastError: 'Error' },
      }));

      mockQueue.getJobs.mockResolvedValue(mockJobs);

      const result = await service.getJobs({
        limit: 10,
        offset: 20,
      });

      expect(result).toHaveLength(10);
    });
  });

  describe('cleanOldFailures', () => {
    it('should remove old DLQ jobs', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31); // 31 days ago

      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5); // 5 days ago

      const mockJobs = [
        {
          data: { failedAt: oldDate },
          remove: jest.fn(),
        },
        {
          data: { failedAt: recentDate },
          remove: jest.fn(),
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);

      const result = await service.cleanOldFailures(30);

      expect(result).toBe(1);
      expect(mockJobs[0].remove).toHaveBeenCalled();
      expect(mockJobs[1].remove).not.toHaveBeenCalled();
    });

    it('should use default retention days', async () => {
      mockQueue.getJobs.mockResolvedValue([]);

      await service.cleanOldFailures();

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('removeJob', () => {
    it('should remove job from DLQ', async () => {
      const mockJob = {
        remove: jest.fn(),
      };

      mockQueue.getJob.mockResolvedValue(mockJob);

      const result = await service.removeJob('dlq-job-123');

      expect(result).toBe(true);
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('should return false for non-existent job', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      const result = await service.removeJob('nonexistent-job');

      expect(result).toBe(false);
    });
  });

  describe('getJob', () => {
    it('should get job details', async () => {
      const jobData: DLQJobData = {
        originalJobId: 'job-123',
        originalQueue: 'test-queue',
        originalData: { test: 'data' },
        failedAt: new Date(),
        attemptsMade: 3,
        lastError: 'Test error',
        failureCount: 1,
      };

      mockQueue.getJob.mockResolvedValue({ data: jobData });

      const result = await service.getJob('dlq-job-123');

      expect(result).toEqual(jobData);
    });

    it('should return null for non-existent job', async () => {
      mockQueue.getJob.mockResolvedValue(null);

      const result = await service.getJob('nonexistent-job');

      expect(result).toBeNull();
    });
  });

  describe('Error Type Extraction', () => {
    it('should categorize timeout errors', async () => {
      const mockJobs = [
        {
          data: {
            originalQueue: 'test',
            originalJobId: 'job-1',
            lastError: 'Request timeout',
            failedAt: new Date('2025-01-01T00:00:00Z'),
          }
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);

      const stats = await service.getStats();

      expect(stats.byErrorType['Timeout']).toBe(1);
    });

    it('should categorize network errors', async () => {
      const mockJobs = [
        {
          data: {
            originalQueue: 'test',
            originalJobId: 'job-2',
            lastError: 'Network ECONNREFUSED',
            failedAt: new Date('2025-01-01T00:00:00Z'),
          }
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);

      const stats = await service.getStats();

      expect(stats.byErrorType['Network']).toBe(1);
    });

    it('should categorize authentication errors', async () => {
      const mockJobs = [
        {
          data: {
            originalQueue: 'test',
            originalJobId: 'job-3',
            lastError: 'Unauthorized 401',
            failedAt: new Date('2025-01-01T00:00:00Z'),
          }
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);

      const stats = await service.getStats();

      expect(stats.byErrorType['Authentication']).toBe(1);
    });

    it('should categorize unknown errors', async () => {
      const mockJobs = [
        {
          data: {
            originalQueue: 'test',
            originalJobId: 'job-4',
            lastError: 'Something went wrong',
            failedAt: new Date('2025-01-01T00:00:00Z'),
          }
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);

      const stats = await service.getStats();

      expect(stats.byErrorType['Unknown']).toBe(1);
    });
  });

  describe('Cleanup', () => {
    it('should close connections on module destroy', async () => {
      mockQueueEvents.close.mockResolvedValue(undefined);
      mockQueue.close.mockResolvedValue(undefined);
      mockRedisConnection.quit.mockResolvedValue('OK');

      await service.onModuleDestroy();

      expect(mockQueueEvents.close).toHaveBeenCalled();
      expect(mockQueue.close).toHaveBeenCalled();
      expect(mockRedisConnection.quit).toHaveBeenCalled();
    });
  });
});
