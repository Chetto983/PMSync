jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn().mockResolvedValue({ statusCode: 201 }),
}));

import * as webpush from 'web-push';
import { PushService } from './push.service';

const mockPrisma = {
  pushSubscription: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  },
  userPreferences: {
    findUnique: jest.fn(),
  },
} as any;

const mockConfig = {
  get: jest.fn().mockReturnValue(''),
} as any;

describe('PushService', () => {
  let service: PushService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PushService(mockPrisma, mockConfig);
  });

  describe('getSubscriptionsForUser', () => {
    it('should return all subscriptions for a given tenantId + userId (PUSH-04)', async () => {
      const mockSubs = [{ id: 'sub-1', endpoint: 'https://push.example.com' }];
      mockPrisma.pushSubscription.findMany.mockResolvedValue(mockSubs);

      const result = await service.getSubscriptionsForUser('tenant-1', 'user-1');

      expect(mockPrisma.pushSubscription.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', userId: 'user-1' },
      });
      expect(result).toEqual(mockSubs);
    });
  });

  describe('deleteStaleSubscription', () => {
    it('should delete subscription by id with tenantId filter (PUSH-03)', async () => {
      mockPrisma.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

      await service.deleteStaleSubscription('sub-1', 'tenant-1');

      expect(mockPrisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { id: 'sub-1', tenantId: 'tenant-1' },
      });
    });
  });

  describe('sendNotification', () => {
    it('should call webpush.sendNotification with correct subscription keys', async () => {
      const sub = {
        endpoint: 'https://push.example.com/sub1',
        p256dh: 'p256dh-key',
        auth: 'auth-key',
      };

      await service.sendNotification(sub, '{"title":"test"}');

      expect(webpush.sendNotification).toHaveBeenCalledWith(
        {
          endpoint: 'https://push.example.com/sub1',
          keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
        },
        '{"title":"test"}',
      );
    });
  });

  describe('getUserPushPreferences', () => {
    it('should return push preferences for user (PUSH-05)', async () => {
      mockPrisma.userPreferences.findUnique.mockResolvedValue({
        pushEmailEnabled: false,
        pushCalendarEnabled: true,
        pushAiEnabled: true,
      });

      const result = await service.getUserPushPreferences('tenant-1', 'user-1');

      expect(mockPrisma.userPreferences.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: {
          pushEmailEnabled: true,
          pushCalendarEnabled: true,
          pushAiEnabled: true,
        },
      });
      expect(result).toEqual({
        pushEmailEnabled: false,
        pushCalendarEnabled: true,
        pushAiEnabled: true,
      });
    });

    it('should return defaults when no preferences record exists', async () => {
      mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

      const result = await service.getUserPushPreferences('tenant-1', 'user-1');

      expect(result).toEqual({
        pushEmailEnabled: true,
        pushCalendarEnabled: true,
        pushAiEnabled: true,
      });
    });
  });
});
