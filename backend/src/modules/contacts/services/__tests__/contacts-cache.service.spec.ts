/**
 * ContactsCacheService integration tests — BTEST-02
 * All cache operations tested against a real Redis test instance.
 * DB is not used — flushdb() is safe in this spec.
 */
import { ContactsCacheService } from '../contacts-cache.service';
import { Redis } from 'ioredis';

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string, defaultValue: unknown) => defaultValue),
};
const mockRedisConnection = { client: null };

describe('ContactsCacheService', () => {
  let service: ContactsCacheService;
  let testRedis: Redis;

  beforeAll(async () => {
    testRedis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    });

    service = new ContactsCacheService(
      mockConfigService as any,
      mockRedisConnection as any,
    );
    // Inject real Redis client, bypassing onModuleInit
    (service as any)['redis'] = testRedis;
  });

  afterAll(async () => {
    await testRedis.flushdb();
    await testRedis.quit();
  });

  beforeEach(async () => {
    // Clear test keys between tests for isolation
    const keys = await testRedis.keys('contacts:*');
    if (keys.length > 0) {
      await testRedis.del(...keys);
    }
  });

  describe('cacheContactCounts / getCachedContactCounts', () => {
    it('returns null when no data is cached for tenant', async () => {
      const result = await service.getCachedContactCounts('tenant-nocache');
      expect(result).toBeNull();
    });

    it('stores and retrieves contact counts within TTL', async () => {
      const tenantId = 'tenant-cache-test-1';
      const counts = { total: 42, byProvider: { google: 30, microsoft: 12 } } as any;

      await service.cacheContactCounts(tenantId, counts);
      const result = await service.getCachedContactCounts(tenantId);

      expect(result).toEqual(counts);
    });
  });

  describe('invalidateContactCountsCache', () => {
    it('removes cached contact counts so subsequent get returns null', async () => {
      const tenantId = 'tenant-invalidate-test';
      const counts = { total: 10, byProvider: {} } as any;

      await service.cacheContactCounts(tenantId, counts);
      // Confirm it was stored
      const before = await service.getCachedContactCounts(tenantId);
      expect(before).toEqual(counts);

      await service.invalidateContactCountsCache(tenantId);

      const after = await service.getCachedContactCounts(tenantId);
      expect(after).toBeNull();
    });
  });

  describe('acquireSyncLock / releaseSyncLock', () => {
    it('acquires lock on first call and returns true', async () => {
      const providerId = 'provider-lock-test-1';
      const acquired = await service.acquireSyncLock(providerId);
      expect(acquired).toBe(true);
    });

    it('returns false on second acquisition attempt for same provider (lock contention)', async () => {
      const providerId = 'provider-lock-test-contention';
      const first = await service.acquireSyncLock(providerId);
      const second = await service.acquireSyncLock(providerId);

      expect(first).toBe(true);
      expect(second).toBe(false);
    });

    it('allows re-acquisition after lock is released', async () => {
      const providerId = 'provider-lock-release-test';

      const first = await service.acquireSyncLock(providerId);
      expect(first).toBe(true);

      await service.releaseSyncLock(providerId);

      const second = await service.acquireSyncLock(providerId);
      expect(second).toBe(true);
    });

    it('two different providerIds do not block each other', async () => {
      const providerA = 'provider-lock-a';
      const providerB = 'provider-lock-b';

      const lockedA = await service.acquireSyncLock(providerA);
      const lockedB = await service.acquireSyncLock(providerB);

      expect(lockedA).toBe(true);
      expect(lockedB).toBe(true);
    });
  });

  describe('isAvailable', () => {
    it('returns true when Redis client is injected', () => {
      expect(service.isAvailable()).toBe(true);
    });
  });
});
