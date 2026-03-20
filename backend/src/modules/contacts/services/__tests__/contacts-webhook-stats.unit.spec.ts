jest.mock('../../../../prisma/tenant-scoping/tenant-context', () => ({
  withoutTenantScopingAsync: jest.fn((fn: () => unknown) => fn()),
}));

import { withoutTenantScopingAsync } from '../../../../prisma/tenant-scoping/tenant-context';
import {
  GoogleContactsWebhookService,
  GOOGLE_CONTACTS_RESOURCE,
} from '../google-contacts-webhook.service';
import {
  MicrosoftContactsWebhookService,
  MICROSOFT_CONTACTS_RESOURCE,
} from '../microsoft-contacts-webhook.service';

describe('Contacts webhook stats', () => {
  const prisma = {
    webhookSubscription: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const config = {
    get: jest.fn().mockImplementation((_key: string, defaultValue?: unknown) => defaultValue ?? 'true'),
  };
  const crypto = { decrypt: jest.fn() };
  const syncQueue = { addSyncJob: jest.fn() };
  const googleSync = { syncContacts: jest.fn() };
  const microsoftSync = { syncContacts: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.webhookSubscription.count.mockResolvedValue(2);
    prisma.webhookSubscription.findMany.mockResolvedValue([
      { providerId: 'provider-1', notificationCount: 3, lastNotificationAt: new Date() },
    ]);
  });

  it('GoogleContactsWebhookService.getStats runs without tenant scoping', async () => {
    const service = new GoogleContactsWebhookService(
      prisma as any,
      crypto as any,
      config as any,
      googleSync as any,
      syncQueue as any,
    );

    const result = await service.getStats();

    expect(withoutTenantScopingAsync).toHaveBeenCalledTimes(1);
    expect(prisma.webhookSubscription.count).toHaveBeenCalledWith({
      where: {
        providerType: 'google',
        resourcePath: GOOGLE_CONTACTS_RESOURCE,
        isActive: true,
      },
    });
    expect(result).toEqual({
      activeSubscriptions: 2,
      recentNotifications: 1,
      lastNotifications: [
        expect.objectContaining({ providerId: 'provider-1', notificationCount: 3 }),
      ],
    });
  });

  it('MicrosoftContactsWebhookService.getStats runs without tenant scoping', async () => {
    const service = new MicrosoftContactsWebhookService(
      prisma as any,
      crypto as any,
      config as any,
      microsoftSync as any,
      syncQueue as any,
    );

    const result = await service.getStats();

    expect(withoutTenantScopingAsync).toHaveBeenCalledTimes(1);
    expect(prisma.webhookSubscription.count).toHaveBeenCalledWith({
      where: {
        providerType: 'microsoft',
        resourcePath: MICROSOFT_CONTACTS_RESOURCE,
        isActive: true,
      },
    });
    expect(result).toEqual({
      activeSubscriptions: 2,
      recentNotifications: 1,
      lastNotifications: [
        expect.objectContaining({ providerId: 'provider-1', notificationCount: 3 }),
      ],
    });
  });
});
