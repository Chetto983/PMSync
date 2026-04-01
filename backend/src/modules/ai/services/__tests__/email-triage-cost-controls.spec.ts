/**
 * EmailTriageService — Cost control verification tests (T-0505)
 *
 * Verifies:
 * 1. Batch cap at 20 emails (MAX_TRIAGE_PER_BATCH)
 * 2. 24h age window enforced on eligible emails
 * 3. Subscription/enablement check runs BEFORE LLM calls
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EmailTriageService } from '../email-triage.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { EmailInsightsService } from '../email-insights.service';
import { SubscriptionService } from '../../../subscription/services/subscription.service';
import { RedisConnectionService } from '../../../../common/services/redis-connection.service';

describe('EmailTriageService — cost controls', () => {
  let service: EmailTriageService;
  let mockPrisma: any;
  let mockInsights: any;
  let mockSubscription: any;
  let mockRedis: any;

  beforeEach(async () => {
    mockRedis = {
      eval: jest.fn().mockResolvedValue(1), // Semaphore always available
      zremrangebyscore: jest.fn().mockResolvedValue(0),
      zcard: jest.fn().mockResolvedValue(0),
    };

    mockPrisma = {
      userPreferences: { findUnique: jest.fn() },
      email: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };

    mockInsights = {
      analyzeEmailUnified: jest.fn().mockResolvedValue({
        priority: 3,
        labels: ['work'],
        summary: 'test',
        sentiment: 'neutral',
        urgency: 'medium',
        keyTopics: [],
        escalationRisk: false,
        hasDeadline: false,
        needsFollowUp: false,
      }),
    };

    mockSubscription = {
      getOrCreateSubscription: jest.fn().mockResolvedValue({ plan: 'PROFESSIONAL' }),
      hasFeature: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailTriageService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailInsightsService, useValue: mockInsights },
        { provide: SubscriptionService, useValue: mockSubscription },
        { provide: RedisConnectionService, useValue: { client: mockRedis } },
      ],
    }).compile();

    service = module.get<EmailTriageService>(EmailTriageService);
    service.onModuleInit();
  });

  describe('batch size cap', () => {
    it('triageSpecificEmails caps at 20 even when given 25 email IDs', async () => {
      mockPrisma.userPreferences.findUnique.mockResolvedValue({ aiAutoTriageEnabled: true });

      const emailIds = Array.from({ length: 25 }, (_, i) => `email-${i}`);

      const result = await service.triageSpecificEmails(emailIds, {
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      // Should process only 20 (MAX_TRIAGE_PER_BATCH)
      expect(result.processed).toBe(20);
      expect(result.skipped).toBe(5); // 25 - 20 = 5 skipped
      expect(mockInsights.analyzeEmailUnified).toHaveBeenCalledTimes(20);
    });
  });

  describe('eligible emails query uses 24h cutoff', () => {
    it('getEligibleEmails passes receivedAt >= 24h ago', async () => {
      mockPrisma.email.findMany.mockResolvedValue([]);

      await service.getEligibleEmails('tenant-1');

      const call = mockPrisma.email.findMany.mock.calls[0][0];
      const cutoff = call.where.receivedAt.gte;

      // Cutoff should be roughly 24h ago (within 5s tolerance)
      const expectedCutoff = Date.now() - 24 * 60 * 60 * 1000;
      expect(Math.abs(cutoff.getTime() - expectedCutoff)).toBeLessThan(5000);
    });

    it('getEligibleEmails respects take limit', async () => {
      mockPrisma.email.findMany.mockResolvedValue([]);

      await service.getEligibleEmails('tenant-1');

      const call = mockPrisma.email.findMany.mock.calls[0][0];
      expect(call.take).toBe(20);
    });
  });

  describe('cost check order', () => {
    it('subscription check runs BEFORE semaphore acquire and LLM calls', async () => {
      // Disable auto-triage via subscription
      mockSubscription.hasFeature.mockReturnValue(false);
      mockPrisma.userPreferences.findUnique.mockResolvedValue({ aiAutoTriageEnabled: true });

      const result = await service.processUntriagedEmails({
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      // Should be blocked by subscription check
      expect(result.skippedReason).toBe('Auto-triage disabled for user');
      // Semaphore should NOT have been called (check before semaphore)
      expect(mockRedis.eval).not.toHaveBeenCalled();
      // LLM should NOT have been called
      expect(mockInsights.analyzeEmailUnified).not.toHaveBeenCalled();
    });

    it('user preference check runs BEFORE LLM calls', async () => {
      mockPrisma.userPreferences.findUnique.mockResolvedValue({ aiAutoTriageEnabled: false });

      const result = await service.processUntriagedEmails({
        tenantId: 'tenant-1',
        userId: 'user-1',
      });

      expect(result.skippedReason).toBe('Auto-triage disabled for user');
      expect(mockInsights.analyzeEmailUnified).not.toHaveBeenCalled();
    });
  });
});
