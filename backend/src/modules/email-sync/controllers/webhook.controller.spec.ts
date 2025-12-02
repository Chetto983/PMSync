import { WebhookController } from './webhook.controller';

describe('WebhookController', () => {
  const gmailWebhook = { handleNotification: jest.fn(), getStats: jest.fn() } as any;
  const microsoftWebhook = { handleNotifications: jest.fn(), getStats: jest.fn() } as any;
  const syncAuth = { validateWebhookToken: jest.fn() } as any;

  const controller = new WebhookController(gmailWebhook, microsoftWebhook, syncAuth);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates token on microsoft validation handshake when token is expected', async () => {
    syncAuth.validateWebhookToken.mockImplementationOnce(() => {
      throw new Error('unauthorized');
    });

    await expect(
      controller.handleMicrosoftNotification(
        { value: [] } as any,
        'validation-token',
        'q-token',
        'header-token',
      ),
    ).rejects.toThrow('unauthorized');
  });

  it('returns validation token when authorized', async () => {
    syncAuth.validateWebhookToken.mockReturnValueOnce(undefined);

    const result = await controller.handleMicrosoftNotification(
      { value: [] } as any,
      'validation-token',
      'q-token',
      'header-token',
    );

    expect(result).toBe('validation-token');
    expect(syncAuth.validateWebhookToken).toHaveBeenCalled();
  });
});
