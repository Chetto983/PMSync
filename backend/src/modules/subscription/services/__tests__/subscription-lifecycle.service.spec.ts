/**
 * SubscriptionLifecycleService integration tests — BTEST-04
 * Trial expiry and past-due downgrade run against a real PostgreSQL test database.
 * SubscriptionService, UsageTrackingService, and ScheduledJobsQueueService are mocked.
 */
import { SubscriptionLifecycleService } from '../subscription-lifecycle.service';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import { cleanupTestData } from '../../../../../test/helpers/cleanup';
import { createTestTenant } from '../../../../../test/helpers/factories';

const mockUsageTracking = {
  resetUsage: jest.fn().mockResolvedValue(undefined),
  getUsage: jest.fn().mockResolvedValue({ emailsProcessed: 0, aiCallsUsed: 0 }),
};

const mockSubscriptionService = {
  updatePlan: jest.fn().mockResolvedValue({}),
  updateStatus: jest.fn().mockResolvedValue({}),
  resetUsage: jest.fn().mockResolvedValue(undefined),
};

const mockScheduledJobsQueue = {
  registerHandler: jest.fn(),
  addJob: jest.fn(),
};

describe('SubscriptionLifecycleService', () => {
  let service: SubscriptionLifecycleService;
  let prisma: ReturnType<typeof getTestPrismaClient>;

  const tenantIds: string[] = [];
  const subscriptionIds: string[] = [];

  beforeAll(() => {
    prisma = getTestPrismaClient();
    service = new SubscriptionLifecycleService(
      prisma as any,
      mockUsageTracking as any,
      mockSubscriptionService as any,
      mockScheduledJobsQueue as any,
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscriptionService.updatePlan.mockResolvedValue({});
    mockSubscriptionService.updateStatus.mockResolvedValue({});
  });

  afterAll(async () => {
    if (subscriptionIds.length > 0) {
      await prisma.subscription.deleteMany({ where: { id: { in: subscriptionIds } } });
    }
    if (tenantIds.length > 0) {
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    await cleanupTestData();
  });

  describe('runExpiryCheck — processExpiredTrials', () => {
    it('downgrades expired TRIALING subscription to FREE when currentPeriodEnd is in the past', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);

      const sub = await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: SubscriptionPlan.STARTER,
          status: SubscriptionStatus.TRIALING,
          monthlyEmailLimit: 1000,
          monthlyAICallLimit: 500,
          maxUsers: 1,
          currentPeriodEnd: new Date('2020-01-01T00:00:00Z'), // expired
          usageResetAt: new Date(),
        },
      });
      subscriptionIds.push(sub.id);

      const result = await service.runExpiryCheck();

      expect(result.expired).toBe(1);
      expect(mockSubscriptionService.updatePlan).toHaveBeenCalledWith(
        tenant.id,
        SubscriptionPlan.FREE,
      );
      expect(mockSubscriptionService.updateStatus).toHaveBeenCalledWith(
        tenant.id,
        SubscriptionStatus.ACTIVE,
      );
    });

    it('does NOT call updatePlan for TRIALING subscription when currentPeriodEnd is in the future', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const sub = await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: SubscriptionPlan.STARTER,
          status: SubscriptionStatus.TRIALING,
          monthlyEmailLimit: 1000,
          monthlyAICallLimit: 500,
          maxUsers: 1,
          currentPeriodEnd: futureDate,
          usageResetAt: new Date(),
        },
      });
      subscriptionIds.push(sub.id);

      await service.runExpiryCheck();

      // updatePlan should NOT have been called for this specific tenant
      const updatePlanCalledForTenant = (
        mockSubscriptionService.updatePlan.mock.calls as [string, ...unknown[]][]
      ).some(([id]) => id === tenant.id);

      expect(updatePlanCalledForTenant).toBe(false);
    });
  });

  describe('runExpiryCheck — processPastDueSubscriptions', () => {
    it('cancels PAST_DUE subscription when updatedAt is beyond the 7-day grace period', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);

      // Create PAST_DUE subscription with STARTER plan
      const sub = await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: SubscriptionPlan.STARTER,
          status: SubscriptionStatus.PAST_DUE,
          monthlyEmailLimit: 1000,
          monthlyAICallLimit: 500,
          maxUsers: 1,
          usageResetAt: new Date(),
        },
      });
      subscriptionIds.push(sub.id);

      // Backdate updatedAt to 30 days ago (beyond 7-day grace period)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await prisma.$executeRawUnsafe(
        `UPDATE subscriptions SET "updatedAt" = $1 WHERE id = $2`,
        thirtyDaysAgo,
        sub.id,
      );

      const result = await service.runExpiryCheck();

      expect(result.downgraded).toBe(1);
      expect(mockSubscriptionService.updatePlan).toHaveBeenCalledWith(
        tenant.id,
        SubscriptionPlan.FREE,
      );
      expect(mockSubscriptionService.updateStatus).toHaveBeenCalledWith(
        tenant.id,
        SubscriptionStatus.CANCELED,
      );
    });

    it('does NOT call updatePlan/updateStatus for PAST_DUE subscription within the grace period', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);

      // Create PAST_DUE subscription with STARTER plan — updatedAt defaults to now (within grace)
      const sub = await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: SubscriptionPlan.STARTER,
          status: SubscriptionStatus.PAST_DUE,
          monthlyEmailLimit: 1000,
          monthlyAICallLimit: 500,
          maxUsers: 1,
          usageResetAt: new Date(),
        },
      });
      subscriptionIds.push(sub.id);

      await service.runExpiryCheck();

      // updatePlan/updateStatus should NOT have been called for this tenant
      const updatePlanCalledForTenant = (
        mockSubscriptionService.updatePlan.mock.calls as [string, ...unknown[]][]
      ).some(([id]) => id === tenant.id);
      const updateStatusCalledForTenant = (
        mockSubscriptionService.updateStatus.mock.calls as [string, ...unknown[]][]
      ).some(([id]) => id === tenant.id);

      expect(updatePlanCalledForTenant).toBe(false);
      expect(updateStatusCalledForTenant).toBe(false);
    });
  });
});
