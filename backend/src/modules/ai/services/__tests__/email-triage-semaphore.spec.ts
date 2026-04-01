/**
 * EmailTriageService — Redis sorted-set semaphore tests
 *
 * Verifies that the sorted-set semaphore uses Redis Lua scripts
 * (ACQUIRE_SCRIPT / RELEASE_SCRIPT) to enforce a global concurrency limit
 * with per-slot TTL so crashed workers auto-expire.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EmailTriageService } from '../email-triage.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { EmailInsightsService } from '../email-insights.service';
import { SubscriptionService } from '../../../subscription/services/subscription.service';
import { RedisConnectionService } from '../../../../common/services/redis-connection.service';

describe('EmailTriageService — Redis semaphore', () => {
  let service: EmailTriageService;
  let mockRedis: { eval: jest.Mock; zremrangebyscore: jest.Mock; zcard: jest.Mock };

  beforeEach(async () => {
    mockRedis = {
      eval: jest.fn(),
      zremrangebyscore: jest.fn().mockResolvedValue(0),
      zcard: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailTriageService,
        {
          provide: PrismaService,
          useValue: {
            userPreferences: { findUnique: jest.fn() },
            email: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn(), groupBy: jest.fn(), findFirst: jest.fn() },
          },
        },
        {
          provide: EmailInsightsService,
          useValue: { analyzeEmailUnified: jest.fn() },
        },
        {
          provide: SubscriptionService,
          useValue: {
            getOrCreateSubscription: jest.fn(),
            hasFeature: jest.fn(),
          },
        },
        {
          provide: RedisConnectionService,
          useValue: { client: mockRedis },
        },
      ],
    }).compile();

    service = module.get<EmailTriageService>(EmailTriageService);
    service.onModuleInit();
  });

  describe('acquireSemaphore', () => {
    it('returns true when below limit (Lua returns 1)', async () => {
      mockRedis.eval.mockResolvedValue(1);

      const result = await (service as any).acquireSemaphore();

      expect(result).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);

      const [script, numKeys, key, max, expiryCutoff, slotId, now] = mockRedis.eval.mock.calls[0];
      expect(script).toContain('ZREMRANGEBYSCORE');
      expect(script).toContain('ZADD');
      expect(script).toContain('ZCARD');
      expect(numKeys).toBe(1);
      expect(key).toBe('pmsync:triage-semaphore:slots');
      expect(max).toBe(5);
      expect(typeof expiryCutoff).toBe('number');
      expect(typeof slotId).toBe('string');
      expect(typeof now).toBe('number');
      // Slot ID should be stored for later release
      expect((service as any).currentSlotId).toBe(slotId);
    });

    it('returns false when at limit (Lua returns 0)', async () => {
      mockRedis.eval.mockResolvedValue(0);

      const result = await (service as any).acquireSemaphore();

      expect(result).toBe(false);
      expect((service as any).currentSlotId).toBeNull();
    });

    it('returns false and logs error when Redis fails', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis down'));

      const result = await (service as any).acquireSemaphore();

      expect(result).toBe(false); // Fail closed
    });

    it('cleans expired slots before checking capacity (expiry cutoff in args)', async () => {
      mockRedis.eval.mockResolvedValue(1);
      const before = Date.now();

      await (service as any).acquireSemaphore();

      const [, , , , expiryCutoff, , now] = mockRedis.eval.mock.calls[0];
      // Expiry cutoff should be ~5 minutes before now
      expect(now - expiryCutoff).toBeGreaterThanOrEqual(5 * 60 * 1000 - 100);
      expect(now - expiryCutoff).toBeLessThanOrEqual(5 * 60 * 1000 + 100);
      expect(now).toBeGreaterThanOrEqual(before);
    });
  });

  describe('releaseSemaphore', () => {
    it('removes specific slot by member id via Lua', async () => {
      // First acquire to set currentSlotId
      mockRedis.eval.mockResolvedValueOnce(1);
      await (service as any).acquireSemaphore();
      const slotId = (service as any).currentSlotId;
      expect(slotId).toBeTruthy();

      // Now release
      mockRedis.eval.mockResolvedValueOnce(0);
      (service as any).releaseSemaphore();

      await new Promise((r) => setImmediate(r));

      expect(mockRedis.eval).toHaveBeenCalledTimes(2);
      const [script, numKeys, key, releasedSlotId] = mockRedis.eval.mock.calls[1];
      expect(script).toContain('ZREM');
      expect(script).toContain('ZREMRANGEBYSCORE');
      expect(numKeys).toBe(1);
      expect(key).toBe('pmsync:triage-semaphore:slots');
      expect(releasedSlotId).toBe(slotId);
      // currentSlotId should be cleared
      expect((service as any).currentSlotId).toBeNull();
    });

    it('no-ops when no slot is held', async () => {
      (service as any).currentSlotId = null;
      (service as any).releaseSemaphore();

      await new Promise((r) => setImmediate(r));

      expect(mockRedis.eval).not.toHaveBeenCalled();
    });

    it('swallows errors without throwing', async () => {
      (service as any).currentSlotId = 'test-slot';
      mockRedis.eval.mockRejectedValue(new Error('Redis down'));

      expect(() => (service as any).releaseSemaphore()).not.toThrow();

      await new Promise((r) => setImmediate(r));
    });
  });

  describe('getSemaphoreUtilization', () => {
    it('returns active slot count after cleaning expired', async () => {
      mockRedis.zremrangebyscore.mockResolvedValue(2);
      mockRedis.zcard.mockResolvedValue(3);

      const result = await service.getSemaphoreUtilization();

      expect(result).toEqual({ active: 3, max: 5 });
      expect(mockRedis.zremrangebyscore).toHaveBeenCalledWith(
        'pmsync:triage-semaphore:slots',
        '-inf',
        expect.any(Number),
      );
    });

    it('returns -1 active on Redis failure', async () => {
      mockRedis.zremrangebyscore.mockRejectedValue(new Error('Redis down'));

      const result = await service.getSemaphoreUtilization();

      expect(result).toEqual({ active: -1, max: 5 });
    });
  });

  describe('processUntriagedEmails — semaphore full', () => {
    it('skips when semaphore full (acquireSemaphore returns false)', async () => {
      const prisma = (service as any).prisma;
      prisma.userPreferences.findUnique.mockResolvedValue({ aiAutoTriageEnabled: true });
      const subService = (service as any).subscriptionService;
      subService.getOrCreateSubscription.mockResolvedValue({ plan: 'PROFESSIONAL' });
      subService.hasFeature.mockReturnValue(true);

      prisma.email.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);

      // Semaphore at capacity
      mockRedis.eval.mockResolvedValue(0);

      const result = await service.processUntriagedEmails({
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      expect(result.skippedReason).toContain('Concurrency limit');
      expect(result.processed).toBe(0);
      expect(result.skipped).toBe(2);
    });
  });

  describe('worker crash simulation', () => {
    it('stale slot is cleaned up by next acquire after TTL expires', async () => {
      // Simulate: worker A acquires slot at time T
      mockRedis.eval.mockResolvedValueOnce(1);
      await (service as any).acquireSemaphore();
      const staleSlotId = (service as any).currentSlotId;
      expect(staleSlotId).toBeTruthy();

      // Worker A "crashes" — no releaseSemaphore() call
      // Next acquire by worker B should pass expiryCutoff that would clean stale slot
      mockRedis.eval.mockResolvedValueOnce(1);
      await (service as any).acquireSemaphore();

      // Verify the Lua script receives an expiry cutoff that cleans old entries
      const [, , , , expiryCutoff] = mockRedis.eval.mock.calls[1];
      expect(typeof expiryCutoff).toBe('number');
      // The cutoff is Date.now() - 5min, so it would clean slots older than 5min
      expect(expiryCutoff).toBeLessThan(Date.now());
    });
  });
});
