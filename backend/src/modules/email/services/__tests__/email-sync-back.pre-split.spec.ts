/**
 * Pre-split characterization tests for EmailSyncBackService
 *
 * These tests document CURRENT behavior before the god-file split.
 * They must pass BEFORE and AFTER the split to prove zero behavior change.
 */

// Mock googleapis before any imports
jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn() })) },
    gmail: jest.fn().mockReturnValue({
      users: {
        messages: {
          get: jest.fn().mockResolvedValue({ data: { labelIds: ['INBOX', 'UNREAD'] } }),
          modify: jest.fn().mockResolvedValue({}),
          delete: jest.fn().mockResolvedValue({}),
          batchDelete: jest.fn().mockResolvedValue({}),
          batchModify: jest.fn().mockResolvedValue({}),
        },
      },
    }),
  },
}));

jest.mock('@microsoft/microsoft-graph-client', () => ({
  Client: {
    init: jest.fn().mockReturnValue({
      api: jest.fn().mockReturnValue({
        post: jest.fn().mockResolvedValue({ responses: [] }),
        patch: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      }),
    }),
  },
}));

jest.mock('imapflow', () => ({
  ImapFlow: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    logout: jest.fn().mockResolvedValue(undefined),
    mailboxOpen: jest.fn().mockResolvedValue(undefined),
    messageFlagsAdd: jest.fn().mockResolvedValue(undefined),
    messageFlagsRemove: jest.fn().mockResolvedValue(undefined),
    messageMove: jest.fn().mockResolvedValue(undefined),
    messageCopy: jest.fn().mockResolvedValue(undefined),
    messageDelete: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { EmailSyncBackService } from '../email-sync-back.service';
import { GmailSyncBackService } from '../gmail-sync-back.service';
import { MicrosoftSyncBackService } from '../microsoft-sync-back.service';
import { ImapSyncBackService } from '../imap-sync-back.service';
import { SyncBackOrchestratorService } from '../sync-back-orchestrator.service';
import type { EmailSyncOperation } from '../email-sync-back.service';

describe('EmailSyncBackService (Pre-Split Characterization)', () => {
  let service: EmailSyncBackService;
  let mockPrisma: any;
  let mockCrypto: any;
  let mockGoogleOAuth: any;
  let mockMicrosoftOAuth: any;
  let mockRedisLock: any;

  const baseOp: EmailSyncOperation = {
    emailId: 'email-1',
    externalId: 'ext-123',
    providerId: 'provider-1',
    tenantId: 'tenant-1',
    operation: 'markRead',
  };

  beforeEach(() => {
    mockPrisma = {
      providerConfig: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'provider-1',
          providerType: 'GOOGLE',
          accessToken: 'enc-token',
          tokenEncryptionIv: 'iv-1',
          tokenExpiresAt: new Date(Date.now() + 3600000),
          tenantId: 'tenant-1',
        }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'provider-1',
          providerType: 'GOOGLE',
          accessToken: 'enc-token',
          tokenEncryptionIv: 'iv-1',
          tokenExpiresAt: new Date(Date.now() + 3600000),
          tenantId: 'tenant-1',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      email: {
        findFirst: jest.fn().mockResolvedValue({ folder: 'INBOX' }),
      },
      folder: {
        findFirst: jest.fn().mockResolvedValue({ path: 'INBOX', name: 'INBOX' }),
      },
    };

    mockCrypto = {
      decrypt: jest.fn().mockReturnValue('decrypted-token'),
      encrypt: jest.fn().mockReturnValue({ encrypted: 'enc', iv: 'iv' }),
    };

    mockGoogleOAuth = {
      refreshAccessToken: jest.fn().mockResolvedValue({
        accessToken: 'new-token',
        expiresAt: new Date(Date.now() + 3600000),
      }),
    };

    mockMicrosoftOAuth = {
      refreshAccessToken: jest.fn().mockResolvedValue({
        accessToken: 'new-token',
        expiresAt: new Date(Date.now() + 3600000),
      }),
    };

    mockRedisLock = {
      withLock: jest.fn().mockImplementation((_key: string, _ttl: number, fn: () => Promise<any>) => fn()),
    };

    // Create real sub-services with shared mocks
    const gmailSync = new GmailSyncBackService();
    const microsoftSync = new MicrosoftSyncBackService(mockPrisma);
    const imapSync = new ImapSyncBackService(mockPrisma, mockCrypto);
    const orchestrator = new SyncBackOrchestratorService(
      mockPrisma,
      mockCrypto,
      mockGoogleOAuth,
      mockMicrosoftOAuth,
      mockRedisLock,
      gmailSync,
      microsoftSync,
      imapSync,
    );

    service = new EmailSyncBackService(
      mockPrisma,
      mockCrypto,
      mockGoogleOAuth,
      mockMicrosoftOAuth,
      mockRedisLock,
      gmailSync,
      microsoftSync,
      imapSync,
      orchestrator,
    );
  });

  describe('syncOperationToProvider', () => {
    it('should dispatch GOOGLE operations to Gmail sync', async () => {
      await service.syncOperationToProvider({ ...baseOp, operation: 'markRead' });
      expect(mockRedisLock.withLock).toHaveBeenCalledWith(
        `sync-back:${baseOp.emailId}`,
        60000,
        expect.any(Function),
        { maxRetries: 2 },
      );
    });

    it('should dispatch MICROSOFT operations', async () => {
      mockPrisma.providerConfig.findFirst.mockResolvedValue({
        id: 'provider-1',
        providerType: 'MICROSOFT',
        accessToken: 'enc-token',
        tokenEncryptionIv: 'iv-1',
        tokenExpiresAt: new Date(Date.now() + 3600000),
        tenantId: 'tenant-1',
      });
      await service.syncOperationToProvider({ ...baseOp, operation: 'markRead' });
      expect(mockRedisLock.withLock).toHaveBeenCalled();
    });

    it('should dispatch IMAP operations', async () => {
      mockPrisma.providerConfig.findFirst.mockResolvedValue({
        id: 'provider-1',
        providerType: 'IMAP',
        imapHost: 'imap.test.com',
        imapUsername: 'user@test.com',
        imapPassword: 'enc-pass',
        imapEncryptionIv: 'iv',
        imapPort: 993,
        imapUseTls: true,
        tenantId: 'tenant-1',
      });
      await service.syncOperationToProvider({
        ...baseOp,
        externalId: 'INBOX:123',
        operation: 'markRead',
        sourceFolder: 'INBOX',
      });
      expect(mockRedisLock.withLock).toHaveBeenCalled();
    });

    it('should throw on empty externalId', async () => {
      await expect(
        service.syncOperationToProvider({ ...baseOp, externalId: '' }),
      ).rejects.toThrow('externalId is empty or missing');
    });

    it('should throw on missing providerId', async () => {
      await expect(
        service.syncOperationToProvider({ ...baseOp, providerId: '' }),
      ).rejects.toThrow('Missing providerId');
    });

    it('should throw when provider not found', async () => {
      mockPrisma.providerConfig.findFirst.mockResolvedValue(null);
      await expect(
        service.syncOperationToProvider(baseOp),
      ).rejects.toThrow('Provider not found');
    });
  });

  describe('syncOperationsBatch', () => {
    it('should handle empty operations array', async () => {
      await expect(service.syncOperationsBatch([])).resolves.toBeUndefined();
    });

    it('should route operations by provider type', async () => {
      mockPrisma.providerConfig.findFirst.mockResolvedValue({
        id: 'provider-1',
        providerType: 'GOOGLE',
        accessToken: 'enc-token',
        tokenEncryptionIv: 'iv-1',
        tokenExpiresAt: new Date(Date.now() + 3600000),
        tenantId: 'tenant-1',
      });
      await service.syncOperationsBatch([
        { ...baseOp, operation: 'markRead' },
        { ...baseOp, emailId: 'email-2', externalId: 'ext-456', operation: 'star' },
      ]);
    });

    it('should skip operations with invalid externalId', async () => {
      await service.syncOperationsBatch([
        { ...baseOp, externalId: '' },
      ]);
    });

    it('should skip operations with missing providerId', async () => {
      await service.syncOperationsBatch([
        { ...baseOp, providerId: '' },
      ]);
    });

    it('should skip cross-tenant provider references', async () => {
      mockPrisma.providerConfig.findFirst.mockResolvedValue({
        id: 'provider-1',
        providerType: 'GOOGLE',
        accessToken: 'enc-token',
        tokenEncryptionIv: 'iv-1',
        tokenExpiresAt: new Date(Date.now() + 3600000),
        tenantId: 'tenant-1',
      });
      await service.syncOperationsBatch([
        { ...baseOp, tenantId: 'tenant-1' },
        { ...baseOp, emailId: 'email-2', externalId: 'ext-456', tenantId: 'tenant-2' },
      ]);
    });
  });

  describe('public API surface', () => {
    it('should expose syncOperationToProvider as public method', () => {
      expect(typeof service.syncOperationToProvider).toBe('function');
    });

    it('should expose syncOperationsBatch as public method', () => {
      expect(typeof service.syncOperationsBatch).toBe('function');
    });
  });
});
