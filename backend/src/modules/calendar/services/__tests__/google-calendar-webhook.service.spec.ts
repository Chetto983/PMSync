/**
 * GoogleCalendarWebhookService integration tests — BTEST-01
 * Tests run against a real PostgreSQL test database.
 * The service's handleNotification method looks up WebhookSubscription by channelId
 * and enqueues a calendar sync via CalendarSyncQueueService.addSyncJob.
 *
 * Strategy:
 * - Create real WebhookSubscription rows in DB via prisma directly (no factory yet)
 * - Mock calendarSyncQueue.addSyncJob to assert it is called correctly
 * - Constructor injects mocked crypto and config to prevent Redis startup in onModuleInit
 *   (JOBS_ENABLED=false via mockConfig.get)
 */
import { GoogleCalendarWebhookService } from '../google-calendar-webhook.service';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import {
  createTestTenant,
  createTestUser,
  createTestProviderAccount,
} from '../../../../../test/helpers/factories';

// ─── Mock dependencies ───────────────────────────────────────────────────────

const mockCrypto = {
  decrypt: jest.fn().mockReturnValue('decrypted-token'),
  encrypt: jest.fn().mockReturnValue('encrypted-token'),
};

const mockConfig = {
  // Return 'false' for JOBS_ENABLED to prevent onModuleInit Redis/BullMQ startup
  get: jest.fn().mockImplementation((key: string, defaultVal?: unknown) => {
    if (key === 'JOBS_ENABLED') return 'false';
    return defaultVal;
  }),
};

const mockCalendarSyncQueue = {
  addSyncJob: jest.fn().mockResolvedValue(undefined),
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('GoogleCalendarWebhookService', () => {
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
    );
    // Do NOT call onModuleInit — JOBS_ENABLED=false prevents Redis startup anyway
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCalendarSyncQueue.addSyncJob.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await prisma.webhookSubscription.deleteMany({ where: { id: { in: subscriptionIds } } });
    await prisma.providerConfig.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    // cleanupTestData() intentionally omitted — targeted cleanup above is sufficient.
    // TRUNCATE CASCADE in parallel with other specs causes FK violations.
  });

  describe('handleNotification', () => {
    it('enqueues sync job via addSyncJob when channelId matches an active subscription', async () => {
      const tenant = await createTestTenant({ name: 'Webhook Valid Tenant' });
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        email: 'webhook-valid@test.local',
        supportsCalendar: true,
      });
      providerIds.push(provider.id);

      const channelId = `calendar-${provider.id}-test-channel-001`;
      const subscription = await prisma.webhookSubscription.create({
        data: {
          tenantId: tenant.id,
          providerId: provider.id,
          providerType: 'google',
          subscriptionId: channelId,
          resourcePath: '/calendar/v3/calendars/primary/events',
          webhookUrl: 'https://api.test.local/webhooks/calendar/google/push',
          isActive: true,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      subscriptionIds.push(subscription.id);

      await service.handleNotification({
        'x-goog-channel-id': channelId,
        'x-goog-resource-id': 'resource-abc-123',
        'x-goog-resource-state': 'exists',
      });

      expect(mockCalendarSyncQueue.addSyncJob).toHaveBeenCalledTimes(1);
      expect(mockCalendarSyncQueue.addSyncJob).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: tenant.id,
          providerId: provider.id,
          priority: 'high',
        }),
      );
    });

    it('enqueues sync job for resource-state=sync (channel handshake)', async () => {
      const tenant = await createTestTenant({ name: 'Webhook Sync State Tenant' });
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        email: 'webhook-sync-state@test.local',
        supportsCalendar: true,
      });
      providerIds.push(provider.id);

      const channelId = `calendar-${provider.id}-test-channel-sync`;
      const subscription = await prisma.webhookSubscription.create({
        data: {
          tenantId: tenant.id,
          providerId: provider.id,
          providerType: 'google',
          subscriptionId: channelId,
          resourcePath: '/calendar/v3/calendars/primary/events',
          webhookUrl: 'https://api.test.local/webhooks/calendar/google/push',
          isActive: true,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      subscriptionIds.push(subscription.id);

      await service.handleNotification({
        'x-goog-channel-id': channelId,
        'x-goog-resource-id': 'resource-sync-456',
        'x-goog-resource-state': 'sync',
      });

      expect(mockCalendarSyncQueue.addSyncJob).toHaveBeenCalledTimes(1);
    });

    it('does NOT enqueue sync job when channelId is unknown (no active subscription)', async () => {
      await service.handleNotification({
        'x-goog-channel-id': 'unknown-channel-id-xyz',
        'x-goog-resource-id': 'resource-unknown',
        'x-goog-resource-state': 'exists',
      });

      expect(mockCalendarSyncQueue.addSyncJob).not.toHaveBeenCalled();
    });

    it('does NOT enqueue sync job when subscription resourcePath is not a calendar path', async () => {
      const tenant = await createTestTenant({ name: 'Webhook Non-Calendar Tenant' });
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        email: 'webhook-non-calendar@test.local',
      });
      providerIds.push(provider.id);

      const channelId = `email-${provider.id}-test-channel-email`;
      const subscription = await prisma.webhookSubscription.create({
        data: {
          tenantId: tenant.id,
          providerId: provider.id,
          providerType: 'google',
          subscriptionId: channelId,
          // Non-calendar path — should be ignored by the calendar webhook handler
          resourcePath: '/mail/v1/users/me/messages',
          webhookUrl: 'https://api.test.local/webhooks/email/google/push',
          isActive: true,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      subscriptionIds.push(subscription.id);

      await service.handleNotification({
        'x-goog-channel-id': channelId,
        'x-goog-resource-id': 'resource-email-789',
        'x-goog-resource-state': 'exists',
      });

      expect(mockCalendarSyncQueue.addSyncJob).not.toHaveBeenCalled();
    });

    it('returns without error when required headers are missing', async () => {
      // Missing x-goog-channel-id — should return silently
      await expect(
        service.handleNotification({
          'x-goog-resource-id': 'resource-no-channel',
          'x-goog-resource-state': 'exists',
        }),
      ).resolves.toBeUndefined();

      expect(mockCalendarSyncQueue.addSyncJob).not.toHaveBeenCalled();
    });
  });
});
