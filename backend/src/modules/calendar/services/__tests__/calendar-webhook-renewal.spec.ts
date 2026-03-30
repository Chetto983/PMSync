/**
 * Calendar webhook auto-renewal tests — T-0201
 *
 * Tests the renewExpiringSoon() logic in AbstractCalendarWebhookService
 * via GoogleCalendarWebhookService (concrete implementation).
 *
 * Strategy:
 * - Create WebhookSubscription rows with expiresAt in the past/near-future
 * - Call renewExpiringSoon() and verify setupSubscription is invoked
 * - Verify failed subscriptions are retried with error count < 10
 * - JOBS_ENABLED=false to prevent BullMQ/Redis startup
 */
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import {
  createTestTenant,
  createTestUser,
  createTestProviderAccount,
} from '../../../../../test/helpers/factories';
import { GoogleCalendarWebhookService } from '../google-calendar-webhook.service';

// ─── Mock dependencies ───────────────────────────────────────────────────────

const mockCrypto = {
  decrypt: jest.fn().mockReturnValue('decrypted-token'),
  encrypt: jest.fn().mockReturnValue('encrypted-token'),
};

const mockConfig = {
  get: jest.fn().mockImplementation((key: string, defaultVal?: unknown) => {
    if (key === 'JOBS_ENABLED') return 'false';
    return defaultVal;
  }),
};

const mockCalendarSyncQueue = {
  addSyncJob: jest.fn().mockResolvedValue(undefined),
};

const mockCalendarWebhookAuth = {
  getGoogleWebhookToken: jest.fn().mockReturnValue(undefined),
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Calendar Webhook Renewal (T-0201)', () => {
  let service: GoogleCalendarWebhookService;
  let prisma: ReturnType<typeof getTestPrismaClient>;

  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const providerIds: string[] = [];
  const subscriptionIds: string[] = [];

  beforeAll(async () => {
    prisma = getTestPrismaClient();
    service = new GoogleCalendarWebhookService(
      prisma as any,
      mockCrypto as any,
      mockConfig as any,
      mockCalendarSyncQueue as any,
      mockCalendarWebhookAuth as any,
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.webhookSubscription.deleteMany({ where: { id: { in: subscriptionIds } } });
    await prisma.providerConfig.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });

  describe('renewExpiringSoon', () => {
    it('renews subscriptions expiring within 24 hours', async () => {
      const tenant = await createTestTenant({ name: 'Renewal Expiring Tenant' });
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        email: 'renewal-expiring@test.local',
        supportsCalendar: true,
      });
      providerIds.push(provider.id);

      // Create subscription expiring in 6 hours (within the 24h renewal window)
      const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
      const subscription = await prisma.webhookSubscription.create({
        data: {
          tenantId: tenant.id,
          providerId: provider.id,
          providerType: 'google',
          subscriptionId: `calendar-${provider.id}-renewal-test`,
          resourcePath: '/calendar/v3/calendars/primary/events',
          webhookUrl: 'https://api.test.local/webhooks/calendar/google/push',
          isActive: true,
          expiresAt,
        },
      });
      subscriptionIds.push(subscription.id);

      // Mock setupSubscription to avoid real Google API calls
      const setupSpy = jest
        .spyOn(service, 'setupSubscription')
        .mockResolvedValue(undefined);

      const renewed = await service.renewExpiringSoon();

      expect(renewed).toBeGreaterThanOrEqual(1);
      expect(setupSpy).toHaveBeenCalledWith(provider.id);

      setupSpy.mockRestore();
    });

    it('does NOT renew subscriptions with expiry > 24 hours away', async () => {
      const tenant = await createTestTenant({ name: 'Renewal NotExpiring Tenant' });
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        email: 'renewal-not-expiring@test.local',
        supportsCalendar: true,
      });
      providerIds.push(provider.id);

      // Create subscription expiring in 5 days (well outside 24h window)
      const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const subscription = await prisma.webhookSubscription.create({
        data: {
          tenantId: tenant.id,
          providerId: provider.id,
          providerType: 'google',
          subscriptionId: `calendar-${provider.id}-no-renewal-test`,
          resourcePath: '/calendar/v3/calendars/primary/events',
          webhookUrl: 'https://api.test.local/webhooks/calendar/google/push',
          isActive: true,
          expiresAt,
        },
      });
      subscriptionIds.push(subscription.id);

      const setupSpy = jest
        .spyOn(service, 'setupSubscription')
        .mockResolvedValue(undefined);

      const renewed = await service.renewExpiringSoon();

      // Should not have called setupSubscription for this provider
      const calls = setupSpy.mock.calls.filter(
        (call) => call[0] === provider.id,
      );
      expect(calls).toHaveLength(0);

      setupSpy.mockRestore();
    });

    it('retries failed subscriptions with errorCount < 10', async () => {
      const tenant = await createTestTenant({ name: 'Renewal Failed Retry Tenant' });
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        email: 'renewal-failed-retry@test.local',
        supportsCalendar: true,
      });
      providerIds.push(provider.id);

      // Create a failed (inactive) subscription with low error count
      const subscription = await prisma.webhookSubscription.create({
        data: {
          tenantId: tenant.id,
          providerId: provider.id,
          providerType: 'google',
          subscriptionId: `calendar-${provider.id}-failed-test`,
          resourcePath: '/calendar/v3/calendars/primary/events',
          webhookUrl: 'https://api.test.local/webhooks/calendar/google/push',
          isActive: false,
          errorCount: 3,
          expiresAt: new Date(Date.now() - 60 * 60 * 1000), // Already expired
        },
      });
      subscriptionIds.push(subscription.id);

      const setupSpy = jest
        .spyOn(service, 'setupSubscription')
        .mockResolvedValue(undefined);

      const renewed = await service.renewExpiringSoon();

      expect(renewed).toBeGreaterThanOrEqual(1);
      expect(setupSpy).toHaveBeenCalledWith(provider.id);

      setupSpy.mockRestore();
    });

    it('does NOT retry failed subscriptions with errorCount >= 10', async () => {
      const tenant = await createTestTenant({ name: 'Renewal MaxErrors Tenant' });
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        email: 'renewal-max-errors@test.local',
        supportsCalendar: true,
      });
      providerIds.push(provider.id);

      // Create a failed subscription that has maxed out retries
      const subscription = await prisma.webhookSubscription.create({
        data: {
          tenantId: tenant.id,
          providerId: provider.id,
          providerType: 'google',
          subscriptionId: `calendar-${provider.id}-maxerr-test`,
          resourcePath: '/calendar/v3/calendars/primary/events',
          webhookUrl: 'https://api.test.local/webhooks/calendar/google/push',
          isActive: false,
          errorCount: 10,
          expiresAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      });
      subscriptionIds.push(subscription.id);

      const setupSpy = jest
        .spyOn(service, 'setupSubscription')
        .mockResolvedValue(undefined);

      await service.renewExpiringSoon();

      // Should NOT have been called for this provider
      const calls = setupSpy.mock.calls.filter(
        (call) => call[0] === provider.id,
      );
      expect(calls).toHaveLength(0);

      setupSpy.mockRestore();
    });
  });

  describe('getStats', () => {
    it('returns active subscription count and recent notifications', async () => {
      const stats = await service.getStats();

      expect(stats).toHaveProperty('activeSubscriptions');
      expect(stats).toHaveProperty('recentNotifications');
      expect(stats).toHaveProperty('lastNotifications');
      expect(typeof stats.activeSubscriptions).toBe('number');
    });
  });
});
