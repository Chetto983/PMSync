jest.mock('../../../prisma/tenant-scoping/tenant-context', () => ({
  withoutTenantScopingAsync: jest.fn((fn: () => unknown) => fn()),
}));

import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';
import { ContactsWebhookController } from './contacts-webhook.controller';

describe('ContactsWebhookController', () => {
  const googleContactsWebhook = {
    handleNotification: jest.fn(),
    getStats: jest.fn(),
  };
  const microsoftContactsWebhook = {
    handleNotifications: jest.fn(),
    getStats: jest.fn(),
  };
  const syncAuth = {
    validateWebhookToken: jest.fn(),
  };

  let controller: ContactsWebhookController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ContactsWebhookController(
      googleContactsWebhook as any,
      microsoftContactsWebhook as any,
      syncAuth as any,
    );
  });

  it('wraps Google sync trigger in withoutTenantScopingAsync', async () => {
    googleContactsWebhook.handleNotification.mockResolvedValue(undefined);

    await controller.triggerGoogleContactsSync({ providerId: 'provider-1' } as any, 'token');

    expect(syncAuth.validateWebhookToken).toHaveBeenCalledWith('token');
    expect(withoutTenantScopingAsync).toHaveBeenCalledTimes(1);
    expect(googleContactsWebhook.handleNotification).toHaveBeenCalledWith('provider-1');
  });

  it('wraps Microsoft notifications in withoutTenantScopingAsync', async () => {
    const payload = { value: [{ subscriptionId: 'sub-1' }] };
    microsoftContactsWebhook.handleNotifications.mockResolvedValue(undefined);

    await controller.handleMicrosoftContactsNotification(payload as any);

    expect(withoutTenantScopingAsync).toHaveBeenCalledTimes(1);
    expect(microsoftContactsWebhook.handleNotifications).toHaveBeenCalledWith(payload.value);
  });

  it('wraps health stats in withoutTenantScopingAsync', async () => {
    googleContactsWebhook.getStats.mockResolvedValue({ activeSubscriptions: 1 });
    microsoftContactsWebhook.getStats.mockResolvedValue({ activeSubscriptions: 2 });

    const result = await controller.getWebhookHealth();

    expect(withoutTenantScopingAsync).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'ok',
      google: { activeSubscriptions: 1 },
      microsoft: { activeSubscriptions: 2 },
    });
    expect(typeof result.timestamp).toBe('string');
  });
});
