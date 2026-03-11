/**
 * GoogleContactsWebhookService integration tests — BTEST-02
 * Tests handleNotification and pollForChanges against real PostgreSQL.
 * Non-Prisma dependencies are mocked with jest.fn().
 */
import { GoogleContactsWebhookService, GOOGLE_CONTACTS_RESOURCE } from '../google-contacts-webhook.service';
import { getTestPrismaClient } from '../../../../../test/helpers/prisma-test-client';
import { cleanupTestData } from '../../../../../test/helpers/cleanup';
import { createTestTenant, createTestProviderAccount, createTestUser } from '../../../../../test/helpers/factories';

const mockCrypto = { decrypt: jest.fn().mockReturnValue('valid-token') };
const mockConfig = {
  get: jest.fn().mockImplementation((_key: string, defaultValue?: unknown) => defaultValue ?? 'true'),
};
const mockGoogleContactsSync = { syncContacts: jest.fn().mockResolvedValue(0) };
const mockContactsSyncQueue = { addSyncJob: jest.fn().mockResolvedValue(undefined) };

describe('GoogleContactsWebhookService', () => {
  let service: GoogleContactsWebhookService;
  let prisma: ReturnType<typeof getTestPrismaClient>;

  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const providerIds: string[] = [];
  const subscriptionIds: string[] = [];

  beforeAll(() => {
    prisma = getTestPrismaClient();
    service = new GoogleContactsWebhookService(
      prisma as any,
      mockCrypto as any,
      mockConfig as any,
      mockGoogleContactsSync as any,
      mockContactsSyncQueue as any,
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockContactsSyncQueue.addSyncJob.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await prisma.webhookSubscription.deleteMany({ where: { id: { in: subscriptionIds } } });
    await prisma.providerConfig.deleteMany({ where: { id: { in: providerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await cleanupTestData();
  });

  describe('handleNotification', () => {
    it('enqueues a sync job when an active subscription exists for the provider', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        supportsContacts: true,
      });
      providerIds.push(provider.id);

      // Create a real webhook subscription
      const subscription = await prisma.webhookSubscription.create({
        data: {
          tenantId: tenant.id,
          providerId: provider.id,
          providerType: 'google',
          subscriptionId: `contacts-${provider.id}`,
          resourcePath: GOOGLE_CONTACTS_RESOURCE,
          webhookUrl: null,
          isActive: true,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          metadata: { lastPollAt: null, pollInterval: 300000 },
        },
      });
      subscriptionIds.push(subscription.id);

      await service.handleNotification(provider.id);

      expect(mockContactsSyncQueue.addSyncJob).toHaveBeenCalledTimes(1);
      expect(mockContactsSyncQueue.addSyncJob).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: provider.id,
          tenantId: tenant.id,
          providerType: 'google',
          priority: 'high',
        }),
      );
    });

    it('does not enqueue job when no active subscription exists for the provider', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        supportsContacts: true,
      });
      providerIds.push(provider.id);

      // No subscription created — handleNotification should return gracefully
      await service.handleNotification(provider.id);

      expect(mockContactsSyncQueue.addSyncJob).not.toHaveBeenCalled();
    });
  });

  describe('pollForChanges', () => {
    it('enqueues sync job when polling interval has elapsed (lastPollAt is old)', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        supportsContacts: true,
      });
      providerIds.push(provider.id);

      // lastPollAt is 10 minutes ago — well past the 5-minute interval
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const subscription = await prisma.webhookSubscription.create({
        data: {
          tenantId: tenant.id,
          providerId: provider.id,
          providerType: 'google',
          subscriptionId: `contacts-poll-old-${provider.id}`,
          resourcePath: GOOGLE_CONTACTS_RESOURCE,
          webhookUrl: null,
          isActive: true,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          metadata: { lastPollAt: tenMinutesAgo.toISOString(), pollInterval: 300000 },
        },
      });
      subscriptionIds.push(subscription.id);

      await service.pollForChanges(provider.id);

      expect(mockContactsSyncQueue.addSyncJob).toHaveBeenCalledTimes(1);
      expect(mockContactsSyncQueue.addSyncJob).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: provider.id,
          tenantId: tenant.id,
          providerType: 'google',
          priority: 'normal',
        }),
      );
    });

    it('skips sync when polling interval has NOT elapsed (lastPollAt is recent)', async () => {
      const tenant = await createTestTenant();
      tenantIds.push(tenant.id);
      const user = await createTestUser(tenant.id);
      userIds.push(user.id);
      const provider = await createTestProviderAccount(tenant.id, user.id, {
        providerType: 'google',
        supportsContacts: true,
      });
      providerIds.push(provider.id);

      // lastPollAt is 30 seconds ago — within the 5-minute interval
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      const subscription = await prisma.webhookSubscription.create({
        data: {
          tenantId: tenant.id,
          providerId: provider.id,
          providerType: 'google',
          subscriptionId: `contacts-poll-recent-${provider.id}`,
          resourcePath: GOOGLE_CONTACTS_RESOURCE,
          webhookUrl: null,
          isActive: true,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          metadata: { lastPollAt: thirtySecondsAgo.toISOString(), pollInterval: 300000 },
        },
      });
      subscriptionIds.push(subscription.id);

      await service.pollForChanges(provider.id);

      expect(mockContactsSyncQueue.addSyncJob).not.toHaveBeenCalled();
    });
  });
});
