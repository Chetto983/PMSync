import { Test, TestingModule } from '@nestjs/testing';
import { RateLimiterService } from './rate-limiter.service';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';

describe('RateLimiterService', () => {
  let service: RateLimiterService;
  let mockCacheService: jest.Mocked<CacheService>;

  beforeEach(async () => {
    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimiterService,
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkLimit', () => {
    it('should allow first request within limits', async () => {
      mockCacheService.get.mockResolvedValue(null);
      mockCacheService.set.mockResolvedValue(undefined);

      const result = await service.checkLimit('tenant-123');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('should track requests correctly', async () => {
      // Simulate bucket with some requests
      mockCacheService.get.mockResolvedValue({
        count: 10,
        tokens: 5000,
        windowStart: Date.now(),
      });
      mockCacheService.set.mockResolvedValue(undefined);

      const result = await service.checkLimit('tenant-123');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeLessThan(60); // 60 is default limit
    });

    it('should deny when tenant request limit exceeded', async () => {
      // Simulate bucket at limit
      mockCacheService.get.mockResolvedValue({
        count: 60, // At limit
        tokens: 0,
        windowStart: Date.now(),
      });

      const result = await service.checkLimit('tenant-123');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.reason).toContain('Tenant rate limit exceeded');
    });

    it('should deny when token limit exceeded', async () => {
      // First call returns request bucket (not at limit)
      // Second call returns token bucket at limit
      mockCacheService.get
        .mockResolvedValueOnce({ count: 5, tokens: 0, windowStart: Date.now() })
        .mockResolvedValueOnce({ count: 0, tokens: 99600, windowStart: Date.now() }) // Near token limit
        .mockResolvedValueOnce({ count: 0, tokens: 0, windowStart: Date.now() }); // Global
      mockCacheService.set.mockResolvedValue(undefined);

      // Request with 500 estimated tokens would exceed 100,000 limit
      const result = await service.checkLimit('tenant-123', 500);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('token limit exceeded');
    });

    it('should calculate reset time correctly', async () => {
      const windowStart = Date.now() - 30000; // 30 seconds ago
      mockCacheService.get.mockResolvedValue({
        count: 5,
        tokens: 100,
        windowStart,
      });
      mockCacheService.set.mockResolvedValue(undefined);

      const result = await service.checkLimit('tenant-123');

      // Should reset in ~30 seconds
      expect(result.resetInSeconds).toBeGreaterThanOrEqual(25);
      expect(result.resetInSeconds).toBeLessThanOrEqual(35);
    });
  });

  describe('recordUsage', () => {
    it('should record token usage', async () => {
      mockCacheService.get.mockResolvedValue({
        count: 0,
        tokens: 1000,
        windowStart: Date.now(),
      });
      mockCacheService.set.mockResolvedValue(undefined);

      await service.recordUsage('tenant-123', 500);

      expect(mockCacheService.set).toHaveBeenCalled();
    });

    it('should handle cache errors gracefully', async () => {
      mockCacheService.get.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(service.recordUsage('tenant-123', 500)).resolves.not.toThrow();
    });
  });

  describe('getStatus', () => {
    it('should return current rate limit status', async () => {
      mockCacheService.get.mockResolvedValue({
        count: 20,
        tokens: 50000,
        windowStart: Date.now(),
      });

      const status = await service.getStatus('tenant-123');

      expect(status.requestsRemaining).toBe(40); // 60 - 20
      expect(status.tokensRemaining).toBe(50000); // 100000 - 50000
      expect(status.requestsResetIn).toBeGreaterThan(0);
      expect(status.tokensResetIn).toBeGreaterThan(0);
    });

    it('should return full capacity when no usage', async () => {
      mockCacheService.get.mockResolvedValue(null);

      const status = await service.getStatus('tenant-123');

      expect(status.requestsRemaining).toBe(60);
      expect(status.tokensRemaining).toBe(100000);
    });
  });

  describe('resetLimits', () => {
    it('should clear rate limits for tenant', async () => {
      mockCacheService.del.mockResolvedValue(undefined);

      await service.resetLimits('tenant-123');

      expect(mockCacheService.del).toHaveBeenCalledWith(
        'rate:req:tenant-123',
        expect.objectContaining({ namespace: CacheNamespace.VOLTAGENT_METRICS }),
      );
      expect(mockCacheService.del).toHaveBeenCalledWith(
        'rate:tokens:tenant-123',
        expect.objectContaining({ namespace: CacheNamespace.VOLTAGENT_METRICS }),
      );
    });
  });

  describe('cleanupExpiredBuckets', () => {
    it('should clean up expired local buckets', () => {
      // This test verifies the cleanup method doesn't throw
      expect(() => service.cleanupExpiredBuckets()).not.toThrow();
    });
  });

  describe('without CacheService (fallback mode)', () => {
    let fallbackService: RateLimiterService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [RateLimiterService],
      }).compile();

      fallbackService = module.get<RateLimiterService>(RateLimiterService);
    });

    it('should work with in-memory fallback', async () => {
      const result = await fallbackService.checkLimit('tenant-local');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59); // 60 - 1
    });

    it('should track limits locally', async () => {
      // Make 3 requests
      await fallbackService.checkLimit('tenant-local');
      await fallbackService.checkLimit('tenant-local');
      const third = await fallbackService.checkLimit('tenant-local');

      expect(third.remaining).toBe(57); // 60 - 3
    });

    it('should track different tenants separately', async () => {
      await fallbackService.checkLimit('tenant-a');
      await fallbackService.checkLimit('tenant-a');
      const tenantA = await fallbackService.checkLimit('tenant-a');

      const tenantB = await fallbackService.checkLimit('tenant-b');

      expect(tenantA.remaining).toBe(57); // 60 - 3
      expect(tenantB.remaining).toBe(59); // 60 - 1
    });
  });
});
