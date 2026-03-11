/**
 * SubscriptionService integration tests — BTEST-04
 * All tests run against a real PostgreSQL test database.
 * UsageTrackingService is mocked (no Redis connection needed).
 */
import { SubscriptionService } from '../subscription.service';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import { cleanupTestData } from '../../../../../test/helpers/cleanup';
import { createTestTenant } from '../../../../../test/helpers/factories';

const mockUsageTracking = {
  getUsage: jest.fn().mockResolvedValue({ emailsProcessed: 0, aiCallsUsed: 0 }),
  resetUsage: jest.fn().mockResolvedValue(undefined),
  trackEmailProcessed: jest.fn(),
  trackAICall: jest.fn(),
};

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let prisma: ReturnType<typeof getTestPrismaClient>;

  const tenantIds: string[] = [];
  const subscriptionIds: string[] = [];

  beforeAll(() => {
    prisma = getTestPrismaClient();
    service = new SubscriptionService(prisma as any, mockUsageTracking as any);
  });

  beforeEach(() => {
    jest.clearAllMocks();
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

  describe('getOrCreateSubscription', () => {
    it('creates a FREE subscription row on first call for a new tenant', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);

      const subscription = await service.getOrCreateSubscription(tenant.id);
      subscriptionIds.push(subscription.id);

      expect(subscription.tenantId).toBe(tenant.id);
      expect(subscription.plan).toBe(SubscriptionPlan.FREE);
      expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
      expect(subscription.monthlyEmailLimit).toBe(100);
      expect(subscription.monthlyAICallLimit).toBe(50);

      // Verify persisted in DB
      const fromDb = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
      expect(fromDb).not.toBeNull();
      expect(fromDb?.id).toBe(subscription.id);
    });

    it('returns the existing row on subsequent calls (idempotent)', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);

      const first = await service.getOrCreateSubscription(tenant.id);
      subscriptionIds.push(first.id);

      const second = await service.getOrCreateSubscription(tenant.id);

      expect(second.id).toBe(first.id);
      // Verify only one row exists
      const count = await prisma.subscription.count({ where: { tenantId: tenant.id } });
      expect(count).toBe(1);
    });

    it('returns null for unknown tenantId via direct DB check', async () => {
      const result = await prisma.subscription.findUnique({
        where: { tenantId: 'non-existent-tenant-id' },
      });
      expect(result).toBeNull();
    });
  });

  describe('updatePlan', () => {
    it('transitions plan FREE -> STARTER and updates limits in DB', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);

      const sub = await service.getOrCreateSubscription(tenant.id);
      subscriptionIds.push(sub.id);

      const updated = await service.updatePlan(tenant.id, SubscriptionPlan.STARTER);

      expect(updated.plan).toBe(SubscriptionPlan.STARTER);
      expect(updated.status).toBe(SubscriptionStatus.ACTIVE);
      expect(updated.monthlyEmailLimit).toBe(1000);
      expect(updated.monthlyAICallLimit).toBe(500);

      const fromDb = await prisma.subscription.findUnique({ where: { id: sub.id } });
      expect(fromDb?.plan).toBe(SubscriptionPlan.STARTER);
    });

    it('transitions plan STARTER -> PROFESSIONAL with updated limits', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);

      const sub = await service.getOrCreateSubscription(tenant.id);
      subscriptionIds.push(sub.id);

      await service.updatePlan(tenant.id, SubscriptionPlan.STARTER);
      const updated = await service.updatePlan(tenant.id, SubscriptionPlan.PROFESSIONAL);

      expect(updated.plan).toBe(SubscriptionPlan.PROFESSIONAL);
      expect(updated.monthlyEmailLimit).toBe(10000);
      expect(updated.monthlyAICallLimit).toBe(5000);
    });
  });

  describe('updateStatus', () => {
    it('transitions status to CANCELED and persists to DB', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);

      const sub = await service.getOrCreateSubscription(tenant.id);
      subscriptionIds.push(sub.id);

      const updated = await service.updateStatus(tenant.id, SubscriptionStatus.CANCELED);

      expect(updated.status).toBe(SubscriptionStatus.CANCELED);

      const fromDb = await prisma.subscription.findUnique({ where: { id: sub.id } });
      expect(fromDb?.status).toBe(SubscriptionStatus.CANCELED);
    });

    it('subsequent getOrCreateSubscription returns CANCELED row (no new row created)', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);

      const sub = await service.getOrCreateSubscription(tenant.id);
      subscriptionIds.push(sub.id);

      await service.updateStatus(tenant.id, SubscriptionStatus.CANCELED);
      const reloaded = await service.getOrCreateSubscription(tenant.id);

      expect(reloaded.id).toBe(sub.id);
      expect(reloaded.status).toBe(SubscriptionStatus.CANCELED);
    });
  });
});
