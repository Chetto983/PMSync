/**
 * UsageTrackingService unit tests — BTEST-04
 * Pure unit tests — all CacheService methods are mocked.
 * No DB or Redis connection required.
 */
import { UsageTrackingService } from '../usage-tracking.service';

const mockCacheService = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  incrBy: jest.fn().mockResolvedValue(1),
  incrByFloat: jest.fn().mockResolvedValue(0.0002),
};

describe('UsageTrackingService', () => {
  let service: UsageTrackingService;
  const tenantId = 'test-tenant-usage-001';

  beforeAll(() => {
    service = new UsageTrackingService(mockCacheService as any);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: get returns null (no cached stats)
    mockCacheService.get.mockResolvedValue(null);
    mockCacheService.incrBy.mockResolvedValue(1);
    mockCacheService.incrByFloat.mockResolvedValue(0.0002);
  });

  describe('trackEmailProcessed', () => {
    it('calls cache.incrBy with a key containing tenantId and "emails" segment', async () => {
      const result = await service.trackEmailProcessed(tenantId);

      expect(result).toBe(1);
      expect(mockCacheService.incrBy).toHaveBeenCalledTimes(1);

      const [calledKey] = mockCacheService.incrBy.mock.calls[0] as [string, number, unknown];
      expect(calledKey).toContain(tenantId);
      expect(calledKey).toContain('emails');
    });

    it('passes the count argument to incrBy', async () => {
      mockCacheService.incrBy.mockResolvedValue(5);
      const result = await service.trackEmailProcessed(tenantId, 5);

      expect(result).toBe(5);
      const [, count] = mockCacheService.incrBy.mock.calls[0] as [string, number, unknown];
      expect(count).toBe(5);
    });
  });

  describe('trackAICall', () => {
    it('calls cache.incrBy with a key containing tenantId and "ai" segment', async () => {
      await service.trackAICall(tenantId, 'smartReply');

      // incrBy is called for the AI counter (suffix 'ai') and for feature tracking
      // Key format: <namespace>:<tenantId>:ai  (ends with ':ai' for the counter)
      const aiCall = (mockCacheService.incrBy.mock.calls as [string, number, unknown][]).find(
        ([key]) => key.includes(tenantId) && /[:\s]ai$|:ai:/.test(key),
      );
      expect(aiCall).toBeDefined();
      expect(aiCall![0]).toContain(tenantId);
    });

    it('calls cache.incrByFloat for daily cost tracking', async () => {
      await service.trackAICall(tenantId, 'triage');

      expect(mockCacheService.incrByFloat).toHaveBeenCalledTimes(1);
      const [costKey, cost] = mockCacheService.incrByFloat.mock.calls[0] as [string, number, unknown];
      expect(costKey).toContain(tenantId);
      expect(typeof cost).toBe('number');
      expect(cost).toBeGreaterThan(0);
    });
  });

  describe('getUsage', () => {
    it('calls cache.get with a key containing tenantId and "stats" segment', async () => {
      mockCacheService.get.mockResolvedValue({
        emailsProcessed: 10,
        aiCallsUsed: 5,
        dailyCost: 0.01,
        lastUpdated: Date.now(),
      });

      const result = await service.getUsage(tenantId);

      expect(mockCacheService.get).toHaveBeenCalledTimes(1);
      const [calledKey] = mockCacheService.get.mock.calls[0] as [string];
      expect(calledKey).toContain(tenantId);
      expect(calledKey).toContain('stats');
      expect(result.emailsProcessed).toBe(10);
      expect(result.aiCallsUsed).toBe(5);
    });

    it('returns zero-valued defaults when cache has no entry', async () => {
      mockCacheService.get.mockResolvedValue(null);

      const result = await service.getUsage(tenantId);

      expect(result.emailsProcessed).toBe(0);
      expect(result.aiCallsUsed).toBe(0);
      expect(result.dailyCost).toBe(0);
    });
  });

  describe('resetUsage', () => {
    it('calls cache.del for stats, emails, and ai keys', async () => {
      await service.resetUsage(tenantId);

      expect(mockCacheService.del).toHaveBeenCalledTimes(3);

      const deletedKeys = (mockCacheService.del.mock.calls as [string][]).map(([k]) => k);
      expect(deletedKeys.some((k) => k.includes(tenantId) && k.includes('stats'))).toBe(true);
      expect(deletedKeys.some((k) => k.includes(tenantId) && k.includes('emails'))).toBe(true);
      // Key ends with ':ai' (suffix is 'ai', no trailing colon)
      expect(deletedKeys.some((k) => k.includes(tenantId) && /[:\s]ai$|:ai:/.test(k))).toBe(true);
    });
  });
});
