import { PushController } from './push.controller';

const mockPushService = {
  subscribe: jest.fn().mockResolvedValue(undefined),
  unsubscribe: jest.fn().mockResolvedValue(undefined),
} as any;

describe('PushController', () => {
  let controller: PushController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PushController(mockPushService);
  });

  describe('subscribe', () => {
    it('should accept a valid push subscription DTO', async () => {
      const req = {
        user: { id: 'user-1', tenantId: 'tenant-1' },
        headers: { 'user-agent': 'TestBrowser/1.0' },
      } as any;
      const dto = {
        endpoint: 'https://push.example.com/sub1',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      };

      const result = await controller.subscribe(req, dto);

      expect(mockPushService.subscribe).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        dto,
        'TestBrowser/1.0',
      );
      expect(result).toEqual({ data: null });
    });
  });

  describe('unsubscribe', () => {
    it('should delete subscription by endpoint', async () => {
      const req = {
        user: { id: 'user-1', tenantId: 'tenant-1' },
        headers: {},
      } as any;
      const dto = { endpoint: 'https://push.example.com/sub1' };

      await controller.unsubscribe(req, dto);

      expect(mockPushService.unsubscribe).toHaveBeenCalledWith(
        'tenant-1',
        'https://push.example.com/sub1',
      );
    });
  });
});
