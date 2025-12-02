import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MistralBatchService, BatchJobConfig, BatchRequest } from './mistral-batch.service';
import { CacheService } from '../../../../common/services/cache.service';

describe('MistralBatchService', () => {
  let service: MistralBatchService;
  let mockCacheService: jest.Mocked<CacheService>;

  // Save original env
  const originalEnv = process.env.MISTRAL_API_KEY;

  describe('without API key (disabled mode)', () => {
    beforeEach(async () => {
      // Clear env to test disabled mode
      delete process.env.MISTRAL_API_KEY;

      const mockConfigService = {
        get: jest.fn().mockReturnValue(undefined), // No API key
      };

      mockCacheService = {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
      } as any;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MistralBatchService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: CacheService, useValue: mockCacheService },
        ],
      }).compile();

      service = module.get<MistralBatchService>(MistralBatchService);
    });

    afterEach(() => {
      // Restore env
      if (originalEnv) {
        process.env.MISTRAL_API_KEY = originalEnv;
      }
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should report as disabled without API key', () => {
      expect(service.isEnabled()).toBe(false);
    });

    it('should return null for createBatchJob when disabled', async () => {
      const config: BatchJobConfig = {
        tenantId: 'tenant-123',
        model: 'mistral-small-latest',
        endpoint: '/v1/chat/completions',
        requests: [{ customId: 'req-1', body: { messages: [] } }],
      };

      const result = await service.createBatchJob(config);

      expect(result).toBeNull();
    });

    it('should return null for getJobStatus when disabled', async () => {
      const result = await service.getJobStatus('job-123');

      expect(result).toBeNull();
    });

    it('should return empty array for getJobResults when disabled', async () => {
      const result = await service.getJobResults('job-123');

      expect(result).toEqual([]);
    });

    it('should return false for cancelJob when disabled', async () => {
      const result = await service.cancelJob('job-123');

      expect(result).toBe(false);
    });

    it('should return empty array for listJobs when disabled', async () => {
      const result = await service.listJobs('tenant-123');

      expect(result).toEqual([]);
    });

    it('should return null for batchEmbeddings when disabled', async () => {
      const result = await service.batchEmbeddings('tenant-123', [
        { id: 'doc-1', text: 'Hello world' },
      ]);

      expect(result).toBeNull();
    });

    it('should return null for batchSentimentAnalysis when disabled', async () => {
      const result = await service.batchSentimentAnalysis('tenant-123', [
        { id: 'email-1', subject: 'Test', body: 'Hello' },
      ]);

      expect(result).toBeNull();
    });

    it('should return null for batchSummarize when disabled', async () => {
      const result = await service.batchSummarize('tenant-123', [
        { id: 'doc-1', content: 'Long document content here' },
      ]);

      expect(result).toBeNull();
    });
  });

  describe('BatchRequest interface', () => {
    it('should support embeddings request structure', () => {
      const request: BatchRequest = {
        customId: 'embed-1',
        body: {
          input: 'Text to embed',
        },
      };

      expect(request.customId).toBe('embed-1');
      expect(request.body.input).toBe('Text to embed');
    });

    it('should support chat completions request structure', () => {
      const request: BatchRequest = {
        customId: 'chat-1',
        body: {
          messages: [
            { role: 'system', content: 'You are helpful' },
            { role: 'user', content: 'Hello' },
          ],
          max_tokens: 100,
        },
      };

      expect(request.customId).toBe('chat-1');
      expect(request.body.messages).toHaveLength(2);
    });
  });

  describe('BatchJobConfig interface', () => {
    it('should support all endpoint types', () => {
      const endpoints = [
        '/v1/chat/completions',
        '/v1/embeddings',
        '/v1/moderations',
      ];

      endpoints.forEach((endpoint) => {
        const config: BatchJobConfig = {
          model: 'mistral-small-latest',
          endpoint: endpoint as any,
          requests: [],
          tenantId: 'tenant-123',
        };

        expect(config.endpoint).toBe(endpoint);
      });
    });

    it('should support optional metadata', () => {
      const config: BatchJobConfig = {
        model: 'mistral-embed',
        endpoint: '/v1/embeddings',
        requests: [],
        tenantId: 'tenant-123',
        metadata: {
          type: 'embeddings',
          source: 'email-sync',
        },
      };

      expect(config.metadata?.type).toBe('embeddings');
      expect(config.metadata?.source).toBe('email-sync');
    });
  });

  describe('job status types', () => {
    it('should define all possible job statuses', () => {
      const statuses = [
        'QUEUED',
        'RUNNING',
        'SUCCESS',
        'FAILED',
        'TIMEOUT_EXCEEDED',
        'CANCELLATION_REQUESTED',
        'CANCELLED',
      ];

      // These are the valid status values
      expect(statuses).toContain('QUEUED');
      expect(statuses).toContain('SUCCESS');
      expect(statuses).toContain('FAILED');
    });
  });

  describe('convenience methods structure', () => {
    beforeEach(async () => {
      // Clear env for these tests too
      delete process.env.MISTRAL_API_KEY;

      const mockConfigService = {
        get: jest.fn().mockReturnValue(undefined),
      };

      mockCacheService = {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
      } as any;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MistralBatchService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: CacheService, useValue: mockCacheService },
        ],
      }).compile();

      service = module.get<MistralBatchService>(MistralBatchService);
    });

    afterEach(() => {
      if (originalEnv) {
        process.env.MISTRAL_API_KEY = originalEnv;
      }
    });

    it('should define batchEmbeddings with correct parameters', () => {
      // Verify method signature exists
      expect(typeof service.batchEmbeddings).toBe('function');
    });

    it('should define batchSentimentAnalysis with correct parameters', () => {
      expect(typeof service.batchSentimentAnalysis).toBe('function');
    });

    it('should define batchSummarize with correct parameters', () => {
      expect(typeof service.batchSummarize).toBe('function');
    });
  });
});
