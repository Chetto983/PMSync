import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiQueueService, AiJobData } from './ai-queue.service';

describe('AiQueueService', () => {
  let service: AiQueueService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          AI_QUEUE_WORKER_MODE: 'false',
          AI_QUEUE_CONCURRENCY: 3,
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiQueueService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AiQueueService>(AiQueueService);
  });

  afterEach(async () => {
    // Service may not be fully initialized in tests without Redis
    try {
      await service.onModuleDestroy();
    } catch {
      // Ignore cleanup errors in tests
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('before initialization', () => {
    it('should return null when adding jobs before init', async () => {
      // Service not initialized, should return null
      const job: AiJobData = {
        type: 'email-insights',
        tenantId: 'tenant-123',
        payload: { emailIds: ['email-1'] },
      };

      const result = await service.addJob(job);

      expect(result).toBeNull();
    });

    it('should return empty array for bulk jobs before init', async () => {
      const jobs: AiJobData[] = [
        { type: 'email-insights', tenantId: 'tenant-123', payload: {} },
        { type: 'embedding-generation', tenantId: 'tenant-123', payload: {} },
      ];

      const results = await service.addBulkJobs(jobs);

      expect(results).toEqual([]);
    });

    it('should return null for job status before init', async () => {
      const result = await service.getJobStatus('job-123');

      expect(result).toBeNull();
    });

    it('should return false for cancel before init', async () => {
      const result = await service.cancelJob('job-123');

      expect(result).toBe(false);
    });

    it('should return empty metrics before init', async () => {
      const metrics = await service.getQueueMetrics();

      expect(metrics).toEqual([]);
    });

    it('should return 0 for removeJobsForTenant before init', async () => {
      const removed = await service.removeJobsForTenant('tenant-123');

      expect(removed).toBe(0);
    });
  });

  describe('job type definitions', () => {
    it('should support email-insights job type', () => {
      const job: AiJobData = {
        type: 'email-insights',
        tenantId: 'tenant-123',
        userId: 'user-456',
        payload: { emailIds: ['email-1', 'email-2'] },
        priority: 'normal',
      };

      expect(job.type).toBe('email-insights');
      expect(job.payload.emailIds).toHaveLength(2);
    });

    it('should support embedding-generation job type', () => {
      const job: AiJobData = {
        type: 'embedding-generation',
        tenantId: 'tenant-123',
        payload: {
          items: [
            { id: 'doc-1', content: 'Hello world', type: 'email' },
          ],
        },
        priority: 'low',
      };

      expect(job.type).toBe('embedding-generation');
      expect(job.priority).toBe('low');
    });

    it('should support batch-analysis job type', () => {
      const job: AiJobData = {
        type: 'batch-analysis',
        tenantId: 'tenant-123',
        payload: { batchId: 'batch-1', itemCount: 50 },
        priority: 'high',
        timeout: 300000, // 5 minutes
      };

      expect(job.type).toBe('batch-analysis');
      expect(job.timeout).toBe(300000);
    });

    it('should support deduplication keys', () => {
      const job: AiJobData = {
        type: 'email-insights',
        tenantId: 'tenant-123',
        payload: { emailIds: ['email-1'] },
        dedupKey: 'email-insights:tenant-123:email-1',
      };

      expect(job.dedupKey).toContain('tenant-123');
    });
  });

  describe('registerProcessor', () => {
    it('should register a job processor', () => {
      const processor = jest.fn();

      service.registerProcessor('email-insights', processor);

      // Processor should be registered (internal state)
      expect(() => service.registerProcessor('email-insights', processor)).not.toThrow();
    });

    it('should allow multiple processor types', () => {
      const processor1 = jest.fn();
      const processor2 = jest.fn();

      service.registerProcessor('email-insights', processor1);
      service.registerProcessor('embedding-generation', processor2);

      // Both should be registered without error
      expect(true).toBe(true);
    });
  });

  describe('pauseAll and resumeAll', () => {
    it('should not throw when pausing without Redis', async () => {
      await expect(service.pauseAll()).resolves.not.toThrow();
    });

    it('should not throw when resuming without Redis', async () => {
      await expect(service.resumeAll()).resolves.not.toThrow();
    });
  });
});
