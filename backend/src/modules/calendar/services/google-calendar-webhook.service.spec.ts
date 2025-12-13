import { Test, TestingModule } from '@nestjs/testing';
import { GoogleCalendarWebhookService } from './google-calendar-webhook.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { ConfigService } from '@nestjs/config';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { CalendarSyncQueueService } from './calendar-sync-queue.service';
import { google } from 'googleapis';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock googleapis
jest.mock('googleapis');

describe('GoogleCalendarWebhookService', () => {
  let service: GoogleCalendarWebhookService;
  let prisma: jest.Mocked<PrismaService>;
  let crypto: jest.Mocked<CryptoService>;
  let _config: jest.Mocked<ConfigService>;
  let calendarSync: jest.Mocked<GoogleCalendarSyncService>;
  let calendarSyncQueue: jest.Mocked<CalendarSyncQueueService>;

  const mockOAuth2Client = {
    setCredentials: jest.fn(),
  };

  const mockCalendar = {
    calendarList: {
      list: jest.fn(),
    },
    events: {
      watch: jest.fn(),
    },
    channels: {
      stop: jest.fn(),
    },
  };

  beforeEach(async () => {
    // Reset mocks
    (google.auth.OAuth2 as jest.Mock) = jest.fn().mockImplementation(() => mockOAuth2Client);
    (google.calendar as jest.Mock) = jest.fn().mockReturnValue(mockCalendar);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleCalendarWebhookService,
        {
          provide: PrismaService,
          useValue: {
            providerConfig: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            webhookSubscription: {
              findFirst: jest.fn(),
              findMany: jest.fn(),
              upsert: jest.fn(),
              update: jest.fn(),
              count: jest.fn(),
            },
          },
        },
        {
          provide: CryptoService,
          useValue: {
            decrypt: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              if (key === 'BACKEND_URL') return 'http://localhost:3000';
              return defaultValue;
            }),
          },
        },
        {
          provide: GoogleCalendarSyncService,
          useValue: {
            syncCalendar: jest.fn(),
          },
        },
        {
          provide: CalendarSyncQueueService,
          useValue: {
            queueSync: jest.fn<any>().mockResolvedValue(undefined),
            addSyncJob: jest.fn<any>().mockResolvedValue(undefined),
            getQueueStats: jest.fn<any>().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0 }),
          },
        },
      ],
    }).compile();

    service = module.get<GoogleCalendarWebhookService>(GoogleCalendarWebhookService);
    prisma = module.get(PrismaService);
    crypto = module.get(CryptoService);
    _config = module.get(ConfigService);
    calendarSync = module.get(GoogleCalendarSyncService);
    calendarSyncQueue = module.get(CalendarSyncQueueService);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('setupWatch', () => {
    it('should setup watch for provider with calendar access', async () => {
      const providerId = 'provider-1';
      const mockProvider = {
        id: providerId,
        supportsCalendar: true,
        accessToken: 'encrypted-token',
        tokenEncryptionIv: 'iv-123',
      };

      const mockCalendarList = {
        data: {
          items: [
            { id: 'calendar-1', accessRole: 'owner', deleted: false },
            { id: 'calendar-2', accessRole: 'writer', deleted: false },
          ],
        },
      };

      prisma.providerConfig.findUnique.mockResolvedValue(mockProvider as any);
      crypto.decrypt.mockReturnValue('decrypted-access-token');
      mockCalendar.calendarList.list.mockResolvedValue(mockCalendarList);
      mockCalendar.events.watch.mockResolvedValue({
        data: { resourceId: 'resource-123' },
      });
      prisma.webhookSubscription.upsert.mockResolvedValue({} as any);

      await service.setupWatch(providerId);

      expect(prisma.providerConfig.findUnique).toHaveBeenCalledWith({
        where: { id: providerId },
      });
      expect(crypto.decrypt).toHaveBeenCalledWith('encrypted-token', 'iv-123');
      expect(mockCalendar.calendarList.list).toHaveBeenCalled();
      expect(mockCalendar.events.watch).toHaveBeenCalledTimes(2);
      expect(prisma.webhookSubscription.upsert).toHaveBeenCalledTimes(2);
    });

    it('should throw error if provider not found', async () => {
      prisma.providerConfig.findUnique.mockResolvedValue(null);

      await expect(service.setupWatch('invalid-provider')).rejects.toThrow(
        'Provider not found or does not support calendar',
      );
    });

    it('should skip deleted calendars', async () => {
      const mockProvider = {
        id: 'provider-1',
        supportsCalendar: true,
        accessToken: 'encrypted-token',
        tokenEncryptionIv: 'iv-123',
      };

      const mockCalendarList = {
        data: {
          items: [
            { id: 'calendar-1', accessRole: 'owner', deleted: true },
            { id: 'calendar-2', accessRole: 'owner', deleted: false },
          ],
        },
      };

      prisma.providerConfig.findUnique.mockResolvedValue(mockProvider as any);
      crypto.decrypt.mockReturnValue('token');
      mockCalendar.calendarList.list.mockResolvedValue(mockCalendarList);
      mockCalendar.events.watch.mockResolvedValue({
        data: { resourceId: 'resource-123' },
      });
      prisma.webhookSubscription.upsert.mockResolvedValue({} as any);

      await service.setupWatch('provider-1');

      // Should only setup watch for non-deleted calendar
      expect(mockCalendar.events.watch).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleNotification', () => {
    it('should handle notification and queue sync', async () => {
      const headers = {
        'x-goog-channel-id': 'channel-123',
        'x-goog-resource-id': 'resource-123',
        'x-goog-resource-state': 'exists',
      };

      const mockSubscription = {
        id: 'sub-1',
        providerId: 'provider-1',
        tenantId: 'tenant-1',
        resourcePath: '/calendar/v3/calendars/cal-1/events',
        isActive: true,
        provider: {
          email: 'user@example.com',
        },
      };

      prisma.webhookSubscription.findFirst.mockResolvedValue(mockSubscription as any);
      prisma.webhookSubscription.update.mockResolvedValue({} as any);

      await service.handleNotification(headers);

      expect(prisma.webhookSubscription.findFirst).toHaveBeenCalledWith({
        where: {
          subscriptionId: 'channel-123',
          providerType: 'google',
          isActive: true,
        },
        include: {
          provider: {
            select: { email: true },
          },
        },
      });
      expect(prisma.webhookSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: {
          lastNotificationAt: expect.any(Date),
          notificationCount: { increment: 1 },
        },
      });
      expect(calendarSyncQueue.addSyncJob).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        providerId: 'provider-1',
        providerType: 'google',
        email: 'user@example.com',
        priority: 'high',
      });
    });

    it('should also queue sync for sync state', async () => {
      const headers = {
        'x-goog-channel-id': 'channel-123',
        'x-goog-resource-id': 'resource-123',
        'x-goog-resource-state': 'sync',
      };

      const mockSubscription = {
        id: 'sub-1',
        providerId: 'provider-1',
        tenantId: 'tenant-1',
        resourcePath: '/calendar/v3/calendars/cal-1/events',
        isActive: true,
        provider: {
          email: 'user@example.com',
        },
      };

      prisma.webhookSubscription.findFirst.mockResolvedValue(mockSubscription as any);
      prisma.webhookSubscription.update.mockResolvedValue({} as any);

      await service.handleNotification(headers);

      expect(calendarSyncQueue.addSyncJob).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        providerId: 'provider-1',
        providerType: 'google',
        email: 'user@example.com',
        priority: 'high',
      });
    });

    it('should ignore notification without required headers', async () => {
      const headers = {};

      await service.handleNotification(headers as any);

      expect(prisma.webhookSubscription.findFirst).not.toHaveBeenCalled();
    });

    it('should ignore notification for non-calendar subscription', async () => {
      const headers = {
        'x-goog-channel-id': 'channel-123',
        'x-goog-resource-id': 'resource-123',
        'x-goog-resource-state': 'exists',
      };

      const mockSubscription = {
        id: 'sub-1',
        providerId: 'provider-1',
        resourcePath: '/gmail/v1/users/me/messages',
        isActive: true,
      };

      prisma.webhookSubscription.findFirst.mockResolvedValue(mockSubscription as any);
      prisma.webhookSubscription.update.mockResolvedValue({} as any);

      await service.handleNotification(headers);

      expect(calendarSync.syncCalendar).not.toHaveBeenCalled();
    });
  });

  describe('renewExpiringSoon', () => {
    it('should renew expiring subscriptions', async () => {
      const mockSubscriptions = [
        {
          id: 'sub-1',
          providerId: 'provider-1',
          providerType: 'google',
          resourcePath: '/calendar/v3/calendars/cal-1/events',
          isActive: true,
          expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours from now
        },
      ];

      const mockProvider = {
        id: 'provider-1',
        supportsCalendar: true,
        accessToken: 'encrypted-token',
        tokenEncryptionIv: 'iv-123',
      };

      const mockCalendarList = {
        data: {
          items: [{ id: 'calendar-1', accessRole: 'owner', deleted: false }],
        },
      };

      prisma.webhookSubscription.findMany.mockResolvedValue(mockSubscriptions as any);
      prisma.providerConfig.findUnique.mockResolvedValue(mockProvider as any);
      crypto.decrypt.mockReturnValue('token');
      mockCalendar.calendarList.list.mockResolvedValue(mockCalendarList);
      mockCalendar.events.watch.mockResolvedValue({
        data: { resourceId: 'resource-123' },
      });
      prisma.webhookSubscription.upsert.mockResolvedValue({} as any);

      const renewed = await service.renewExpiringSoon();

      expect(renewed).toBe(1);
      expect(prisma.webhookSubscription.findMany).toHaveBeenCalled();
    });

    it('should return 0 if no subscriptions are expiring', async () => {
      prisma.webhookSubscription.findMany.mockResolvedValue([]);

      const renewed = await service.renewExpiringSoon();

      expect(renewed).toBe(0);
    });
  });

  describe('stopWatch', () => {
    it('should stop watch and mark subscription as inactive', async () => {
      const providerId = 'provider-1';
      const mockSubscriptions = [
        {
          id: 'sub-1',
          providerId,
          subscriptionId: 'channel-123',
          metadata: { resourceId: 'resource-123' },
        },
      ];

      const mockProvider = {
        id: providerId,
        accessToken: 'encrypted-token',
        tokenEncryptionIv: 'iv-123',
      };

      prisma.webhookSubscription.findMany.mockResolvedValue(mockSubscriptions as any);
      prisma.providerConfig.findUnique.mockResolvedValue(mockProvider as any);
      crypto.decrypt.mockReturnValue('token');
      mockCalendar.channels.stop.mockResolvedValue({});
      prisma.webhookSubscription.update.mockResolvedValue({} as any);

      await service.stopWatch(providerId);

      expect(mockCalendar.channels.stop).toHaveBeenCalledWith({
        requestBody: {
          id: 'channel-123',
          resourceId: 'resource-123',
        },
      });
      expect(prisma.webhookSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { isActive: false },
      });
    });

    it('should return early if no subscriptions found', async () => {
      prisma.webhookSubscription.findMany.mockResolvedValue([]);

      await service.stopWatch('provider-1');

      expect(mockCalendar.channels.stop).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return webhook statistics', async () => {
      prisma.webhookSubscription.count.mockResolvedValue(5);
      prisma.webhookSubscription.findMany.mockResolvedValue([
        {
          providerId: 'provider-1',
          notificationCount: 10,
          lastNotificationAt: new Date(),
        },
        {
          providerId: 'provider-2',
          notificationCount: 5,
          lastNotificationAt: new Date(),
        },
      ] as any);

      const stats = await service.getStats();

      expect(stats.activeSubscriptions).toBe(5);
      expect(stats.recentNotifications).toBe(2);
      expect(stats.lastNotifications).toHaveLength(2);
    });
  });
});
