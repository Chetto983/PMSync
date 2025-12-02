import { Test, TestingModule } from '@nestjs/testing';
import { SemanticCacheService } from './semantic-cache.service';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { MistralService } from '../../services/mistral.service';

describe('SemanticCacheService', () => {
  let service: SemanticCacheService;
  let cacheService: jest.Mocked<CacheService>;
  let mistralService: jest.Mocked<MistralService>;

  const mockEmbedding = Array(1024).fill(0.1);

  beforeEach(async () => {
    const mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const mockMistralService = {
      generateEmbedding: jest.fn().mockResolvedValue(mockEmbedding),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SemanticCacheService,
        { provide: CacheService, useValue: mockCacheService },
        { provide: MistralService, useValue: mockMistralService },
      ],
    }).compile();

    service = module.get<SemanticCacheService>(SemanticCacheService);
    cacheService = module.get(CacheService);
    mistralService = module.get(MistralService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isEnabled', () => {
    it('should return true when both cache and mistral services are available', () => {
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('get', () => {
    const tenantId = 'tenant-123';
    const query = 'What are my unread emails?';

    it('should return cache miss when no entries exist', async () => {
      cacheService.get.mockResolvedValue([]);

      const result = await service.get(tenantId, query);

      expect(result.hit).toBe(false);
      expect(result.response).toBeUndefined();
    });

    it('should return cache miss for short queries', async () => {
      const result = await service.get(tenantId, 'hi');

      expect(result.hit).toBe(false);
      expect(mistralService.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should return cache hit when similar entry exists', async () => {
      const cachedEntry = {
        queryEmbedding: mockEmbedding,
        queryText: 'Show me unread emails',
        response: 'You have 5 unread emails.',
        model: 'small',
        tokens: 100,
        createdAt: Date.now(),
        ttl: 3600,
        hits: 0,
        tenantId,
      };

      cacheService.get.mockResolvedValue([cachedEntry]);

      const result = await service.get(tenantId, query);

      expect(result.hit).toBe(true);
      expect(result.response).toBe('You have 5 unread emails.');
      expect(result.similarity).toBeGreaterThan(0.9);
    });

    it('should not return expired entries', async () => {
      const expiredEntry = {
        queryEmbedding: mockEmbedding,
        queryText: 'Show me unread emails',
        response: 'Old response',
        model: 'small',
        tokens: 100,
        createdAt: Date.now() - 7200 * 1000, // 2 hours ago
        ttl: 3600, // 1 hour TTL
        hits: 0,
        tenantId,
      };

      cacheService.get.mockResolvedValue([expiredEntry]);

      const result = await service.get(tenantId, query);

      expect(result.hit).toBe(false);
    });
  });

  describe('set', () => {
    const tenantId = 'tenant-123';
    const query = 'What are my calendar events for today?';
    const response = 'You have 3 meetings scheduled.';

    it('should store new cache entry', async () => {
      cacheService.get.mockResolvedValue([]);

      await service.set(tenantId, query, response, 'small', 150);

      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('semantic_cache:'),
        expect.arrayContaining([
          expect.objectContaining({
            queryText: query,
            response,
            model: 'small',
            tokens: 150,
          }),
        ]),
        expect.any(Object),
      );
    });

    it('should not cache short queries', async () => {
      await service.set(tenantId, 'ok', 'Response', 'small', 50);

      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should update existing similar entry instead of duplicating', async () => {
      const existingEntry = {
        queryEmbedding: mockEmbedding,
        queryText: query,
        response: 'Old response',
        model: 'small',
        tokens: 100,
        createdAt: Date.now() - 1000,
        ttl: 3600,
        hits: 5,
        tenantId,
      };

      cacheService.get.mockResolvedValue([existingEntry]);

      await service.set(tenantId, query, response, 'small', 150);

      expect(cacheService.set).toHaveBeenCalled();
      const savedEntries = cacheService.set.mock.calls[0][1] as any[];
      expect(savedEntries).toHaveLength(1);
      expect(savedEntries[0].response).toBe(response);
    });
  });

  describe('invalidate', () => {
    const tenantId = 'tenant-123';

    it('should invalidate all entries for tenant', async () => {
      const result = await service.invalidate(tenantId);

      expect(cacheService.del).toHaveBeenCalledWith(
        `semantic_cache:${tenantId}`,
        { namespace: CacheNamespace.VOLTAGENT_METRICS },
      );
      expect(result).toBe(-1);
    });

    it('should invalidate entries matching pattern', async () => {
      const entries = [
        {
          queryEmbedding: mockEmbedding,
          queryText: 'Show me emails from John',
          response: 'Found 3 emails',
          model: 'small',
          tokens: 100,
          createdAt: Date.now(),
          ttl: 3600,
          hits: 0,
          tenantId,
        },
        {
          queryEmbedding: mockEmbedding,
          queryText: 'Check calendar',
          response: 'No events',
          model: 'small',
          tokens: 50,
          createdAt: Date.now(),
          ttl: 3600,
          hits: 0,
          tenantId,
        },
      ];

      cacheService.get.mockResolvedValue(entries);

      const result = await service.invalidate(tenantId, 'emails');

      expect(result).toBe(1); // 1 entry removed
      expect(cacheService.set).toHaveBeenCalled();
      const savedEntries = cacheService.set.mock.calls[0][1] as any[];
      expect(savedEntries).toHaveLength(1);
      expect(savedEntries[0].queryText).toBe('Check calendar');
    });
  });

  describe('getStats', () => {
    const tenantId = 'tenant-123';

    it('should return cache statistics', async () => {
      const entries = [
        {
          queryEmbedding: mockEmbedding,
          queryText: 'Query 1',
          response: 'Response 1',
          model: 'small',
          tokens: 100,
          createdAt: Date.now(),
          ttl: 3600,
          hits: 10,
          tenantId,
        },
        {
          queryEmbedding: mockEmbedding,
          queryText: 'Query 2',
          response: 'Response 2',
          model: 'small',
          tokens: 200,
          createdAt: Date.now(),
          ttl: 3600,
          hits: 5,
          tenantId,
        },
      ];

      cacheService.get.mockResolvedValue(entries);

      const stats = await service.getStats(tenantId);

      expect(stats.entries).toBe(2);
      expect(stats.totalHits).toBe(15);
      expect(stats.estimatedSavings).toBeGreaterThan(0);
    });

    it('should return empty stats when no entries exist', async () => {
      cacheService.get.mockResolvedValue([]);

      const stats = await service.getStats(tenantId);

      expect(stats.entries).toBe(0);
      expect(stats.totalHits).toBe(0);
      expect(stats.estimatedSavings).toBe(0);
    });
  });
});
