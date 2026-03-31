/**
 * EmailTriageService — Redis distributed semaphore tests (Phase 128-02)
 *
 * Verifies that the counting semaphore uses Redis Lua scripts
 * (ACQUIRE_SCRIPT / RELEASE_SCRIPT) to enforce a global concurrency limit
 * across all replicas.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EmailTriageService } from '../email-triage.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { EmailInsightsService } from '../email-insights.service';
import { SubscriptionService } from '../../../subscription/services/subscription.service';
import { RedisConnectionService } from '../../../../common/services/redis-connection.service';

describe('EmailTriageService — Redis semaphore', () => {
  let service: EmailTriageService;
  let mockRedis: { eval: jest.Mock };

  beforeEach(async () => {
    mockRedis = { eval: jest.fn() };

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
    // Trigger onModuleInit to wire Redis
    service.onModuleInit();
  });

  describe('acquireSemaphore', () => {
    it('returns true when below limit (Lua returns 1)', async () => {
      mockRedis.eval.mockResolvedValue(1);

      // acquireSemaphore is private — invoke via processUntriagedEmails path
      // Instead, use reflection to call it directly for unit isolation
      const result = await (service as any).acquireSemaphore();

      expect(result).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledTimes(1);

      const [script, numKeys, key, max, ttl] = mockRedis.eval.mock.calls[0];
      expect(script).toContain('INCR');
      expect(script).toContain('EXPIRE');
      expect(numKeys).toBe(1);
      expect(key).toBe('pmsync:triage-semaphore:count');
      expect(max).toBe(5);
      expect(ttl).toBe(120);
    });

    it('returns false when at limit (Lua returns 0)', async () => {
      mockRedis.eval.mockResolvedValue(0);

      const result = await (service as any).acquireSemaphore();

      expect(result).toBe(false);
    });

    it('returns false and logs error when Redis fails', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis down'));

      const result = await (service as any).acquireSemaphore();

      expect(result).toBe(false); // Fail closed
    });
  });

  describe('releaseSemaphore', () => {
    it('decrements via Lua RELEASE_SCRIPT', async () => {
      mockRedis.eval.mockResolvedValue(4);

      (service as any).releaseSemaphore();

      // releaseSemaphore is fire-and-forget, wait for microtask
      await new Promise((r) => setImmediate(r));

      expect(mockRedis.eval).toHaveBeenCalledTimes(1);
      const [script, numKeys, key] = mockRedis.eval.mock.calls[0];
      expect(script).toContain('DECR');
      expect(numKeys).toBe(1);
      expect(key).toBe('pmsync:triage-semaphore:count');
    });

    it('swallows errors without throwing', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis down'));

      // Should not throw
      expect(() => (service as any).releaseSemaphore()).not.toThrow();

      // Wait for the rejected promise to settle
      await new Promise((r) => setImmediate(r));
    });
  });

  describe('processUntriagedEmails — semaphore full', () => {
    it('skips when semaphore full (acquireSemaphore returns false)', async () => {
      // Make isAutoTriageEnabled return true
      const prisma = (service as any).prisma;
      prisma.userPreferences.findUnique.mockResolvedValue({ aiAutoTriageEnabled: true });
      const subService = (service as any).subscriptionService;
      subService.getOrCreateSubscription.mockResolvedValue({ plan: 'PROFESSIONAL' });
      subService.hasFeature.mockReturnValue(true);

      // Return some eligible emails
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
});
