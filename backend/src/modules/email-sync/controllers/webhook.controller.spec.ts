import { WebhookController } from './webhook.controller';

describe('WebhookController', () => {
  const gmailWebhook = { handleNotification: jest.fn(), getStats: jest.fn() } as any;
  const microsoftWebhook = { handleNotifications: jest.fn(), getStats: jest.fn() } as any;
  const syncAuth = { validateWebhookToken: jest.fn() } as any;

  const controller = new WebhookController(gmailWebhook, microsoftWebhook, syncAuth);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns validation token during microsoft validation handshake', async () => {
    const result = await controller.handleMicrosoftNotification(
      { value: [] } as any,
      'validation-token',
      'q-token',
      'header-token',
    );

    expect(result).toBe('validation-token');
    expect(syncAuth.validateWebhookToken).not.toHaveBeenCalled();
  });

  it('returns validation token when authorized', async () => {
    const result = await controller.handleMicrosoftNotification(
      { value: [] } as any,
      'validation-token',
      'q-token',
      'header-token',
    );

    expect(result).toBe('validation-token');
    expect(syncAuth.validateWebhookToken).not.toHaveBeenCalled();
  });
});
