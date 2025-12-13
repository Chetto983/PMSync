import { Test, TestingModule } from '@nestjs/testing';
import {
  MicrosoftCalendarWebhookService,
  MICROSOFT_CALENDAR_RESOURCE,
  MicrosoftCalendarNotification,
} from './microsoft-calendar-webhook.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { ConfigService } from '@nestjs/config';
import { MicrosoftCalendarSyncService } from './microsoft-calendar-sync.service';
import { CalendarSyncQueueService } from './calendar-sync-queue.service';
import axios from 'axios';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MicrosoftCalendarWebhookService', () => {
  let service: MicrosoftCalendarWebhookService;
  let prisma: jest.Mocked<PrismaService>;
  let crypto: jest.Mocked<CryptoService>;
  let _config: jest.Mocked<ConfigService>;
  let _calendarSync: jest.Mocked<MicrosoftCalendarSyncService>;
  let calendarSyncQueue: jest.Mocked<CalendarSyncQueueService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MicrosoftCalendarWebhookService,
        {
          provide: PrismaService,
          useValue: {
            providerConfig: {
              findUnique: jest.fn(),
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
              if (key === 'WEBHOOK_CLIENT_STATE') return 'test-client-state';
              return defaultValue;
            }),
          },
        },
        {
          provide: MicrosoftCalendarSyncService,
          useValue: {
            syncCalendar: jest.fn(),
          },
        },
        {
          provide: CalendarSyncQueueService,
          useValue: {
            queueSync: jest.fn().mockResolvedValue(undefined),
            addSyncJob: jest.fn().mockResolvedValue(undefined),
            getQueueStats: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0 }),
          },
        },
      ],
    }).compile();

    service = module.get<MicrosoftCalendarWebhookService>(MicrosoftCalendarWebhookService);
    prisma = module.get(PrismaService);
    crypto = module.get(CryptoService);
    _config = module.get(ConfigService);
    _calendarSync = module.get(MicrosoftCalendarSyncService);
    calendarSyncQueue = module.get(CalendarSyncQueueService);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('setupSubscription', () => {
    it('should setup subscription for provider with calendar access', async () => {
      const providerId = 'provider-1';
      const mockProvider = {
        id: providerId,
        supportsCalendar: true,
        accessToken: 'encrypted-token',
        tokenEncryptionIv: 'iv-123',
      };

      const mockSubscriptionResponse = {
        data: {
          id: 'subscription-123',
        },
      };

      prisma.providerConfig.findUnique.mockResolvedValue(mockProvider as any);
      crypto.decrypt.mockReturnValue('decrypted-access-token');
      mockedAxios.post.mockResolvedValue(mockSubscriptionResponse);
      prisma.webhookSubscription.upsert.mockResolvedValue({} as any);

      await service.setupSubscription(providerId);

      expect(prisma.providerConfig.findUnique).toHaveBeenCalledWith({
        where: { id: providerId },
      });
      expect(crypto.decrypt).toHaveBeenCalledWith('encrypted-token', 'iv-123');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/subscriptions',
        expect.objectContaining({
          changeType: 'created,updated,deleted',
          notificationUrl: expect.stringContaining('/webhooks/calendar/microsoft/notifications'),
          resource: '/me/events',
          clientState: 'test-client-state',
        }),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer decrypted-access-token',
            'Content-Type': 'application/json',
          },
        }),
      );
      expect(prisma.webhookSubscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            providerId_resourcePath: {
              providerId,
              resourcePath: MICROSOFT_CALENDAR_RESOURCE,
            },
          },
          create: expect.objectContaining({
            providerId,
            providerType: 'microsoft',
            subscriptionId: 'subscription-123',
          }),
        }),
      );
    });

    it('should throw error if provider not found', async () => {
      prisma.providerConfig.findUnique.mockResolvedValue(null);

      await expect(service.setupSubscription('invalid-provider')).rejects.toThrow(
        'Provider not found or does not support calendar',
      );
    });

    it('should throw error if provider does not support calendar', async () => {
      const mockProvider = {
        id: 'provider-1',
        supportsCalendar: false,
        accessToken: 'encrypted-token',
        tokenEncryptionIv: 'iv-123',
      };

      prisma.providerConfig.findUnique.mockResolvedValue(mockProvider as any);

      await expect(service.setupSubscription('provider-1')).rejects.toThrow(
        'Provider not found or does not support calendar',
      );
    });
  });

  describe('handleNotifications', () => {
    it('should handle multiple notifications', async () => {
      const notifications: MicrosoftCalendarNotification[] = [
        {
          subscriptionId: 'sub-1',
          clientState: 'test-client-state',
          changeType: 'created',
          resource: '/me/events/event-1',
          subscriptionExpirationDateTime: new Date(Date.now() + 86400000).toISOString(),
        },
        {
          subscriptionId: 'sub-1',
          clientState: 'test-client-state',
          changeType: 'updated',
          resource: '/me/events/event-2',
          subscriptionExpirationDateTime: new Date(Date.now() + 86400000).toISOString(),
        },
      ];

      const mockSubscription = {
        id: 'sub-db-1',
        providerId: 'provider-1',
        tenantId: 'tenant-1',
        isActive: true,
        provider: {
          email: 'user@example.com',
        },
      };

      prisma.webhookSubscription.findFirst.mockResolvedValue(mockSubscription as any);
      prisma.webhookSubscription.update.mockResolvedValue({} as any);

      await service.handleNotifications(notifications);

      expect(prisma.webhookSubscription.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.webhookSubscription.update).toHaveBeenCalledTimes(2);
      expect(calendarSyncQueue.addSyncJob).toHaveBeenCalledTimes(2);
    });

    it('should reject notification with invalid client state', async () => {
      const notifications: MicrosoftCalendarNotification[] = [
        {
          subscriptionId: 'sub-1',
          clientState: 'invalid-state',
          changeType: 'created',
          resource: '/me/events/event-1',
          subscriptionExpirationDateTime: new Date(Date.now() + 86400000).toISOString(),
        },
      ];

      await service.handleNotifications(notifications);

      expect(prisma.webhookSubscription.findFirst).not.toHaveBeenCalled();
    });

    it('should ignore notification for non-existent subscription', async () => {
      const notifications: MicrosoftCalendarNotification[] = [
        {
          subscriptionId: 'sub-invalid',
          clientState: 'test-client-state',
          changeType: 'created',
          resource: '/me/events/event-1',
          subscriptionExpirationDateTime: new Date(Date.now() + 86400000).toISOString(),
        },
      ];

      prisma.webhookSubscription.findFirst.mockResolvedValue(null);

      await service.handleNotifications(notifications);

      expect(calendarSyncQueue.addSyncJob).not.toHaveBeenCalled();
    });

    it('should continue processing on individual notification error', async () => {
      const notifications: MicrosoftCalendarNotification[] = [
        {
          subscriptionId: 'sub-1',
          clientState: 'test-client-state',
          changeType: 'created',
          resource: '/me/events/event-1',
          subscriptionExpirationDateTime: new Date(Date.now() + 86400000).toISOString(),
        },
        {
          subscriptionId: 'sub-2',
          clientState: 'test-client-state',
          changeType: 'updated',
          resource: '/me/events/event-2',
          subscriptionExpirationDateTime: new Date(Date.now() + 86400000).toISOString(),
        },
      ];

      const mockSubscription = {
        id: 'sub-db-1',
        providerId: 'provider-1',
        tenantId: 'tenant-1',
        isActive: true,
        provider: {
          email: 'user@example.com',
        },
      };

      prisma.webhookSubscription.findFirst
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce(mockSubscription as any);
      prisma.webhookSubscription.update.mockResolvedValue({} as any);

      await service.handleNotifications(notifications);

      // Second notification should still be processed
      expect(calendarSyncQueue.addSyncJob).toHaveBeenCalledTimes(1);
    });
  });

  describe('renewExpiringSoon', () => {
    it('should renew expiring subscriptions', async () => {
      const mockSubscriptions = [
        {
          id: 'sub-1',
          providerId: 'provider-1',
          subscriptionId: 'ms-sub-1',
          providerType: 'microsoft',
          resourcePath: MICROSOFT_CALENDAR_RESOURCE,
          isActive: true,
          expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours from now
        },
      ];

      const mockProvider = {
        id: 'provider-1',
        accessToken: 'encrypted-token',
        tokenEncryptionIv: 'iv-123',
      };

      prisma.webhookSubscription.findMany.mockResolvedValue(mockSubscriptions as any);
      prisma.webhookSubscription.findFirst.mockResolvedValue(mockSubscriptions[0] as any);
      prisma.providerConfig.findUnique.mockResolvedValue(mockProvider as any);
      crypto.decrypt.mockReturnValue('decrypted-token');
      mockedAxios.patch.mockResolvedValue({ data: {} });
      prisma.webhookSubscription.update.mockResolvedValue({} as any);

      const renewed = await service.renewExpiringSoon();

      expect(renewed).toBe(1);
      expect(mockedAxios.patch).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/subscriptions/ms-sub-1',
        expect.objectContaining({
          expirationDateTime: expect.any(String),
        }),
        expect.any(Object),
      );
    });

    it('should return 0 if no subscriptions are expiring', async () => {
      prisma.webhookSubscription.findMany.mockResolvedValue([]);

      const renewed = await service.renewExpiringSoon();

      expect(renewed).toBe(0);
    });

    it('should handle errors during renewal gracefully', async () => {
      const mockSubscriptions = [
        {
          id: 'sub-1',
          providerId: 'provider-1',
          subscriptionId: 'ms-sub-1',
          providerType: 'microsoft',
          resourcePath: MICROSOFT_CALENDAR_RESOURCE,
          isActive: true,
          expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        },
        {
          id: 'sub-2',
          providerId: 'provider-2',
          subscriptionId: 'ms-sub-2',
          providerType: 'microsoft',
          resourcePath: MICROSOFT_CALENDAR_RESOURCE,
          isActive: true,
          expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        },
      ];

      const mockProvider = {
        id: 'provider-2',
        accessToken: 'encrypted-token',
        tokenEncryptionIv: 'iv-123',
      };

      prisma.webhookSubscription.findMany.mockResolvedValue(mockSubscriptions as any);
      prisma.webhookSubscription.findFirst
        .mockResolvedValueOnce(mockSubscriptions[0] as any)
        .mockResolvedValueOnce(mockSubscriptions[1] as any);
      prisma.providerConfig.findUnique
        .mockResolvedValueOnce(null) // First renewal fails
        .mockResolvedValueOnce(mockProvider as any); // Second succeeds
      crypto.decrypt.mockReturnValue('decrypted-token');
      mockedAxios.patch.mockResolvedValue({ data: {} });
      prisma.webhookSubscription.update.mockResolvedValue({} as any);

      const renewed = await service.renewExpiringSoon();

      expect(renewed).toBe(1); // Only one renewal should succeed
    });
  });

  describe('deleteSubscription', () => {
    it('should delete subscription and mark as inactive', async () => {
      const providerId = 'provider-1';
      const mockSubscription = {
        id: 'sub-1',
        providerId,
        subscriptionId: 'ms-sub-123',
        providerType: 'microsoft',
        resourcePath: MICROSOFT_CALENDAR_RESOURCE,
      };

      const mockProvider = {
        id: providerId,
        accessToken: 'encrypted-token',
        tokenEncryptionIv: 'iv-123',
      };

      prisma.webhookSubscription.findFirst.mockResolvedValue(mockSubscription as any);
      prisma.providerConfig.findUnique.mockResolvedValue(mockProvider as any);
      crypto.decrypt.mockReturnValue('decrypted-token');
      mockedAxios.delete.mockResolvedValue({ data: {} });
      prisma.webhookSubscription.update.mockResolvedValue({} as any);

      await service.deleteSubscription(providerId);

      expect(mockedAxios.delete).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/subscriptions/ms-sub-123',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer decrypted-token',
          },
        }),
      );
      expect(prisma.webhookSubscription.update).toHaveBeenCalledWith({
        where: {
          providerId_resourcePath: {
            providerId,
            resourcePath: MICROSOFT_CALENDAR_RESOURCE,
          },
        },
        data: { isActive: false },
      });
    });

    it('should return early if no subscription found', async () => {
      prisma.webhookSubscription.findFirst.mockResolvedValue(null);

      await service.deleteSubscription('provider-1');

      expect(mockedAxios.delete).not.toHaveBeenCalled();
    });

    it('should handle deletion errors gracefully', async () => {
      const mockSubscription = {
        id: 'sub-1',
        providerId: 'provider-1',
        subscriptionId: 'ms-sub-123',
        providerType: 'microsoft',
        resourcePath: MICROSOFT_CALENDAR_RESOURCE,
      };

      const mockProvider = {
        id: 'provider-1',
        accessToken: 'encrypted-token',
        tokenEncryptionIv: 'iv-123',
      };

      prisma.webhookSubscription.findFirst.mockResolvedValue(mockSubscription as any);
      prisma.providerConfig.findUnique.mockResolvedValue(mockProvider as any);
      crypto.decrypt.mockReturnValue('decrypted-token');
      mockedAxios.delete.mockRejectedValue(new Error('API error'));

      await service.deleteSubscription('provider-1');

      // Should not throw, error is logged
      expect(mockedAxios.delete).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return webhook statistics', async () => {
      prisma.webhookSubscription.count.mockResolvedValue(3);
      prisma.webhookSubscription.findMany.mockResolvedValue([
        {
          providerId: 'provider-1',
          notificationCount: 15,
          lastNotificationAt: new Date(),
        },
        {
          providerId: 'provider-2',
          notificationCount: 8,
          lastNotificationAt: new Date(),
        },
      ] as any);

      const stats = await service.getStats();

      expect(stats.activeSubscriptions).toBe(3);
      expect(stats.recentNotifications).toBe(2);
      expect(stats.lastNotifications).toHaveLength(2);
    });
  });
});
