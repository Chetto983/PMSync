import { GmailWebhookService, GMAIL_WEBHOOK_RESOURCE } from './gmail-webhook.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { QueueService } from './queue.service';
import { ConfigService } from '@nestjs/config';
import { ProviderTokenService } from '../../providers/services/provider-token.service';
import { GmailPubSubMessage } from '../interfaces/webhook.interface';
import { google } from 'googleapis';

const watchMock = jest.fn();
const stopMock = jest.fn();
const setCredentialsMock = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn(() => ({
        setCredentials: setCredentialsMock,
      })),
    },
    gmail: jest.fn(() => ({
      users: {
        watch: watchMock,
        stop: stopMock,
      },
    })),
  },
}));

describe('GmailWebhookService', () => {
  let service: GmailWebhookService;
  let prisma: {
    providerConfig: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    webhookSubscription: {
      update: jest.Mock;
      updateMany: jest.Mock;
      upsert: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
    };
  };
  let queueService: { addSyncJob: jest.Mock };
  let configService: { get: jest.Mock };
  let providerTokenService: { getProviderWithToken: jest.Mock };

  beforeEach(() => {
    prisma = {
      providerConfig: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      webhookSubscription: {
        update: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
      },
    };

    queueService = {
      addSyncJob: jest.fn(),
    };

    configService = {
      get: jest.fn(),
    };

    providerTokenService = {
      getProviderWithToken: jest.fn(),
    };

    service = new GmailWebhookService(
      prisma as unknown as PrismaService,
      queueService as unknown as QueueService,
      configService as unknown as ConfigService,
      providerTokenService as unknown as ProviderTokenService,
    );

    watchMock.mockReset();
    stopMock.mockReset();
    setCredentialsMock.mockReset();
    (google.auth.OAuth2 as unknown as jest.Mock).mockClear();
    (google.gmail as unknown as jest.Mock).mockClear();
  });

  describe('handleNotification', () => {
    it('decodes Gmail Pub/Sub payloads and enqueues a high-priority sync', async () => {
      const provider = {
        id: 'provider-1',
        email: 'user@example.com',
        tenantId: 'tenant-1',
        providerType: 'google',
        isActive: true,
        lastSyncedAt: new Date('2025-01-01T00:00:00Z'),
        metadata: { historyId: '100' },
      };

      prisma.providerConfig.findFirst.mockResolvedValue(provider);
      prisma.webhookSubscription.findFirst.mockResolvedValue({ id: 'sub-1' });
      prisma.webhookSubscription.updateMany.mockResolvedValue({ count: 1 });
      queueService.addSyncJob.mockResolvedValue(undefined);

      const gmailData = {
        emailAddress: provider.email,
        historyId: '123456',
      };

      const message: GmailPubSubMessage = {
        message: {
          data: Buffer.from(JSON.stringify(gmailData)).toString('base64'),
          messageId: 'msg-1',
          publishTime: new Date().toISOString(),
        },
        subscription: 'projects/test/subscriptions/gmail',
      };

      await expect(service.handleNotification(message)).resolves.toBeUndefined();

      expect(prisma.providerConfig.findFirst).toHaveBeenCalledWith({
        where: {
          email: provider.email,
          providerType: 'google',
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          tenantId: true,
          lastSyncedAt: true,
          metadata: true,
        },
      });

      expect(prisma.webhookSubscription.updateMany).toHaveBeenCalledWith({
        where: {
          providerId: provider.id,
          resourcePath: GMAIL_WEBHOOK_RESOURCE,
        },
        data: {
          lastNotificationAt: expect.any(Date),
          notificationCount: { increment: 1 },
        },
      });

      expect(queueService.addSyncJob).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: provider.id,
          tenantId: provider.tenantId,
          email: provider.email,
          priority: 'high',
          syncType: 'incremental',
          lastSyncedAt: provider.lastSyncedAt,
        }),
      );
    });

    it('forces full sync when subscription missing or gap detected', async () => {
      const provider = {
        id: 'provider-1',
        email: 'user@example.com',
        tenantId: 'tenant-1',
        providerType: 'google',
        isActive: true,
        lastSyncedAt: new Date('2025-01-01T00:00:00Z'),
        metadata: { historyId: '200' },
      };

      prisma.providerConfig.findFirst.mockResolvedValue(provider);
      prisma.webhookSubscription.findFirst.mockResolvedValue(null); // missing subscription row
      prisma.webhookSubscription.updateMany.mockResolvedValue({ count: 0 });
      queueService.addSyncJob.mockResolvedValue(undefined);

      const gmailData = {
        emailAddress: provider.email,
        historyId: '100', // gap
      };

      const message: GmailPubSubMessage = {
        message: {
          data: Buffer.from(JSON.stringify(gmailData)).toString('base64'),
          messageId: 'msg-1',
          publishTime: new Date().toISOString(),
        },
        subscription: 'projects/test/subscriptions/gmail',
      };

      await service.handleNotification(message);

      expect(queueService.addSyncJob).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: provider.id,
          syncType: 'full',
        }),
      );
    });

    it('skips processing when no active Gmail provider matches the payload', async () => {
      prisma.providerConfig.findFirst.mockResolvedValue(null);

      const payload: GmailPubSubMessage = {
        message: {
          data: Buffer.from(
            JSON.stringify({
              emailAddress: 'missing@example.com',
              historyId: '987',
            }),
          ).toString('base64'),
          messageId: 'msg-2',
          publishTime: new Date().toISOString(),
        },
        subscription: 'projects/test/subscriptions/gmail',
      };

      await expect(service.handleNotification(payload)).resolves.toBeUndefined();

      expect(queueService.addSyncJob).not.toHaveBeenCalled();
      expect(prisma.webhookSubscription.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('createSubscription', () => {
    it('sets up a Gmail watch and persists the subscription metadata', async () => {
      const provider = {
        id: 'provider-42',
        email: 'watch@example.com',
        providerType: 'google' as const,
        accessToken: 'encrypted-token',
        tokenEncryptionIv: 'iv',
        tokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      };

      const expiration = Date.now() + 3600 * 1000;

      prisma.providerConfig.findUnique.mockResolvedValue(provider);
      providerTokenService.getProviderWithToken.mockResolvedValue({
        provider,
        accessToken: 'plain-access-token',
      });
      prisma.webhookSubscription.upsert.mockResolvedValue(undefined);

      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        switch (key) {
          case 'GOOGLE_PUBSUB_TOPIC':
            return 'projects/demo/topics/gmail';
          case 'GOOGLE_CLIENT_ID':
            return 'client-id';
          case 'GOOGLE_CLIENT_SECRET':
            return 'client-secret';
          default:
            return defaultValue;
        }
      });

      watchMock.mockResolvedValue({
        data: {
          historyId: 'history-abc',
          expiration: `${expiration}`,
        },
      });

      await expect(
        service.createSubscription({
          providerId: provider.id,
          providerType: 'google',
        }),
      ).resolves.toBeUndefined();

      expect(providerTokenService.getProviderWithToken).toHaveBeenCalledWith(provider.id);

      expect(setCredentialsMock).toHaveBeenCalledWith({
        access_token: 'plain-access-token',
      });

      expect(watchMock).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          topicName: 'projects/demo/topics/gmail',
          labelFilterAction: 'include',
        },
      });

      const upsertArgs = prisma.webhookSubscription.upsert.mock.calls[0][0];

      expect(upsertArgs).toMatchObject({
        where: {
          providerId_resourcePath: {
            providerId: provider.id,
            resourcePath: GMAIL_WEBHOOK_RESOURCE,
          },
        },
      });
      expect(upsertArgs.create).toMatchObject({
        providerId: provider.id,
        providerType: 'google',
        subscriptionId: 'history-abc',
        resourcePath: GMAIL_WEBHOOK_RESOURCE,
        isActive: true,
        metadata: {
          topicName: 'projects/demo/topics/gmail',
          historyId: 'history-abc',
        },
      });
      expect(upsertArgs.update).toMatchObject({
        subscriptionId: 'history-abc',
        isActive: true,
      });
      expect(upsertArgs.create.expiresAt).toEqual(new Date(expiration));
      expect(upsertArgs.update.expiresAt).toEqual(new Date(expiration));
    });
  });
});
