import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { GmailFolderService } from '../gmail-folder.service';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { CryptoService } from '../../../../../common/services/crypto.service';
import { ProviderTokenService } from '../../provider-token.service';
import { RealtimeEventsService } from '../../../../realtime/services/realtime-events.service';

// Create mock functions that will be available in the factory
// Using var to allow hoisting
/* eslint-disable no-var */
var mockLabelsListFn: jest.Mock;
var mockLabelsCreateFn: jest.Mock;
var mockLabelsUpdateFn: jest.Mock;
var mockLabelsDeleteFn: jest.Mock;
/* eslint-enable no-var */

// Mock googleapis
jest.mock('googleapis', () => {
  // Initialize mock functions inside the factory
  mockLabelsListFn = jest.fn();
  mockLabelsCreateFn = jest.fn();
  mockLabelsUpdateFn = jest.fn();
  mockLabelsDeleteFn = jest.fn();

  return {
    google: {
      auth: {
        OAuth2: jest.fn().mockImplementation(() => ({
          setCredentials: jest.fn(),
        })),
      },
      gmail: jest.fn().mockReturnValue({
        users: {
          labels: {
            list: mockLabelsListFn,
            create: mockLabelsCreateFn,
            update: mockLabelsUpdateFn,
            delete: mockLabelsDeleteFn,
          },
        },
      }),
    },
  };
});

// Mock PrismaService
const mockPrismaService = {
  folder: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  },
};

// Mock CryptoService
const mockCryptoService = {
  decrypt: jest.fn(),
};

// Mock ProviderTokenService
const mockProviderTokenService = {
  getProviderWithToken: jest.fn(),
};

// Mock RealtimeEventsService
const mockRealtimeEventsService = {
  emitToTenant: jest.fn(),
  emitFolderCountsUpdate: jest.fn(),
};

describe('GmailFolderService', () => {
  let service: GmailFolderService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailFolderService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CryptoService, useValue: mockCryptoService },
        { provide: ProviderTokenService, useValue: mockProviderTokenService },
        { provide: RealtimeEventsService, useValue: mockRealtimeEventsService },
      ],
    }).compile();

    service = module.get<GmailFolderService>(GmailFolderService);
  });

  describe('determineFolderFromLabels', () => {
    it('should return INBOX when no labels provided', () => {
      const result = service.determineFolderFromLabels(undefined);
      expect(result).toBe('INBOX');
    });

    it('should return INBOX when labels array is empty', () => {
      const result = service.determineFolderFromLabels([]);
      expect(result).toBe('INBOX');
    });

    it('should return TRASH when TRASH label present', () => {
      const result = service.determineFolderFromLabels(['INBOX', 'TRASH']);
      expect(result).toBe('TRASH');
    });

    it('should return SPAM when SPAM label present', () => {
      const result = service.determineFolderFromLabels(['INBOX', 'SPAM']);
      expect(result).toBe('SPAM');
    });

    it('should return SENT when SENT label present', () => {
      const result = service.determineFolderFromLabels(['SENT']);
      expect(result).toBe('SENT');
    });

    it('should return DRAFTS when DRAFT label present', () => {
      const result = service.determineFolderFromLabels(['DRAFT']);
      expect(result).toBe('DRAFTS');
    });

    it('should return DRAFTS when DRAFTS label present', () => {
      const result = service.determineFolderFromLabels(['DRAFTS']);
      expect(result).toBe('DRAFTS');
    });

    it('should map CATEGORY_SOCIAL to SOCIAL', () => {
      const result = service.determineFolderFromLabels(['INBOX', 'CATEGORY_SOCIAL']);
      expect(result).toBe('SOCIAL');
    });

    it('should map CATEGORY_PROMOTIONS to PROMOTIONS', () => {
      const result = service.determineFolderFromLabels(['INBOX', 'CATEGORY_PROMOTIONS']);
      expect(result).toBe('PROMOTIONS');
    });

    it('should map CATEGORY_UPDATES to UPDATES', () => {
      const result = service.determineFolderFromLabels(['INBOX', 'CATEGORY_UPDATES']);
      expect(result).toBe('UPDATES');
    });

    it('should map CATEGORY_FORUMS to FORUMS', () => {
      const result = service.determineFolderFromLabels(['INBOX', 'CATEGORY_FORUMS']);
      expect(result).toBe('FORUMS');
    });

    it('should map CATEGORY_PERSONAL to INBOX', () => {
      const result = service.determineFolderFromLabels(['INBOX', 'CATEGORY_PERSONAL']);
      expect(result).toBe('INBOX');
    });

    it('should prioritize TRASH over categories', () => {
      const result = service.determineFolderFromLabels(['INBOX', 'CATEGORY_SOCIAL', 'TRASH']);
      expect(result).toBe('TRASH');
    });

    it('should prioritize SPAM over categories', () => {
      const result = service.determineFolderFromLabels(['INBOX', 'CATEGORY_PROMOTIONS', 'SPAM']);
      expect(result).toBe('SPAM');
    });

    it('should use fallback when provided and no match found', () => {
      const result = service.determineFolderFromLabels(['UNKNOWN_LABEL'], 'CUSTOM');
      expect(result).toBe('CUSTOM');
    });

    it('should return ARCHIVE for custom-label-only emails (no system folder label)', () => {
      const result = service.determineFolderFromLabels(['Label_123', 'STARRED']);
      expect(result).toBe('ARCHIVE');
    });

    it('should return ARCHIVE for emails with only STARRED label', () => {
      const result = service.determineFolderFromLabels(['STARRED']);
      expect(result).toBe('ARCHIVE');
    });

    it('should return ARCHIVE for emails with only IMPORTANT label', () => {
      const result = service.determineFolderFromLabels(['IMPORTANT']);
      expect(result).toBe('ARCHIVE');
    });

    it('should return ARCHIVE for emails with only custom labels', () => {
      const result = service.determineFolderFromLabels(['Label_abc', 'Label_def']);
      expect(result).toBe('ARCHIVE');
    });

    it('should return INBOX for emails with INBOX + custom labels', () => {
      const result = service.determineFolderFromLabels(['INBOX', 'Label_abc', 'STARRED']);
      expect(result).toBe('INBOX');
    });
  });

  describe('getFolderPathForLabel', () => {
    it('should return label name for custom labels (Label_xxx)', () => {
      const result = service.getFolderPathForLabel('Label_123', 'My Custom Label');
      expect(result).toBe('My Custom Label');
    });

    it('should return label name for custom labels (label_xxx lowercase)', () => {
      const result = service.getFolderPathForLabel('label_456', 'Another Label');
      expect(result).toBe('Another Label');
    });

    it('should return INBOX for system label INBOX', () => {
      const result = service.getFolderPathForLabel('INBOX', 'Inbox');
      expect(result).toBe('INBOX');
    });

    it('should return DRAFTS for DRAFT label', () => {
      const result = service.getFolderPathForLabel('DRAFT', 'Draft');
      expect(result).toBe('DRAFTS');
    });

    it('should return category path for CATEGORY_SOCIAL', () => {
      const result = service.getFolderPathForLabel('CATEGORY_SOCIAL', 'Social');
      expect(result).toBe('SOCIAL');
    });

    it('should return category path for CATEGORY_PROMOTIONS', () => {
      const result = service.getFolderPathForLabel('CATEGORY_PROMOTIONS', 'Promotions');
      expect(result).toBe('PROMOTIONS');
    });

    it('should return INBOX for CATEGORY_PERSONAL', () => {
      const result = service.getFolderPathForLabel('CATEGORY_PERSONAL', 'Personal');
      expect(result).toBe('INBOX');
    });

    it('should return label ID for unknown labels', () => {
      const result = service.getFolderPathForLabel('UNKNOWN_ID', 'Unknown');
      expect(result).toBe('UNKNOWN_ID');
    });
  });

  describe('getSpecialUseForLabel', () => {
    it('should return INBOX for INBOX label', () => {
      const result = service.getSpecialUseForLabel('INBOX');
      expect(result).toBe('INBOX');
    });

    it('should return SENT for SENT label', () => {
      const result = service.getSpecialUseForLabel('SENT');
      expect(result).toBe('SENT');
    });

    it('should return DRAFTS for DRAFT label', () => {
      const result = service.getSpecialUseForLabel('DRAFT');
      expect(result).toBe('DRAFTS');
    });

    it('should return TRASH for TRASH label', () => {
      const result = service.getSpecialUseForLabel('TRASH');
      expect(result).toBe('TRASH');
    });

    it('should return JUNK for SPAM label', () => {
      const result = service.getSpecialUseForLabel('SPAM');
      expect(result).toBe('JUNK');
    });

    it('should return FLAGGED for STARRED label', () => {
      const result = service.getSpecialUseForLabel('STARRED');
      expect(result).toBe('FLAGGED');
    });

    it('should return IMPORTANT for IMPORTANT label', () => {
      const result = service.getSpecialUseForLabel('IMPORTANT');
      expect(result).toBe('IMPORTANT');
    });

    it('should return undefined for custom labels', () => {
      const result = service.getSpecialUseForLabel('Label_123');
      expect(result).toBeUndefined();
    });

    it('should return category special use for CATEGORY_SOCIAL', () => {
      const result = service.getSpecialUseForLabel('CATEGORY_SOCIAL');
      expect(result).toBe('CATEGORY_SOCIAL');
    });
  });

  describe('syncGmailFolders', () => {
    const tenantId = 'tenant-1';
    const providerId = 'provider-1';
    const mockGmail = {
      users: {
        labels: {
          list: jest.fn(),
        },
      },
    } as any;

    it('should sync labels from Gmail API to database', async () => {
      const mockLabels = [
        { id: 'INBOX', name: 'INBOX', type: 'system', messagesTotal: 100, messagesUnread: 10 },
        { id: 'SENT', name: 'SENT', type: 'system', messagesTotal: 50, messagesUnread: 0 },
        { id: 'Label_123', name: 'Custom Label', type: 'user', messagesTotal: 20, messagesUnread: 5 },
      ];

      mockGmail.users.labels.list.mockResolvedValue({ data: { labels: mockLabels } });
      mockPrismaService.folder.findMany.mockResolvedValue([]);
      mockPrismaService.folder.upsert.mockImplementation(async (args: any) => ({
        id: `folder-${args.where.providerId_path.path}`,
        ...args.create,
      }));

      await service.syncGmailFolders(mockGmail, tenantId, providerId);

      expect(mockGmail.users.labels.list).toHaveBeenCalledWith({ userId: 'me' });
      expect(mockPrismaService.folder.upsert).toHaveBeenCalledTimes(3);
    });

    it('should sync CATEGORY_ labels as sidebar folders (SOCIAL, PROMOTIONS) but skip CATEGORY_PERSONAL', async () => {
      const mockLabels = [
        { id: 'INBOX', name: 'INBOX', type: 'system', messagesTotal: 100, messagesUnread: 10 },
        { id: 'CATEGORY_SOCIAL', name: 'Social', type: 'system', messagesTotal: 30, messagesUnread: 5 },
        { id: 'CATEGORY_PROMOTIONS', name: 'Promotions', type: 'system', messagesTotal: 50, messagesUnread: 10 },
      ];

      mockGmail.users.labels.list.mockResolvedValue({ data: { labels: mockLabels } });
      mockPrismaService.folder.findMany.mockResolvedValue([]);
      mockPrismaService.folder.upsert.mockImplementation(async (args: any) => ({
        id: `folder-${args.where.providerId_path.path}`,
        ...args.create,
      }));

      await service.syncGmailFolders(mockGmail, tenantId, providerId);

      // INBOX, SOCIAL (from CATEGORY_SOCIAL), and PROMOTIONS (from CATEGORY_PROMOTIONS)
      // are all synced so sidebar tabs can show emails in those categories
      expect(mockPrismaService.folder.upsert).toHaveBeenCalledTimes(3);
      expect(mockPrismaService.folder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { providerId_path: { providerId, path: 'INBOX' } },
        }),
      );
      expect(mockPrismaService.folder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { providerId_path: { providerId, path: 'SOCIAL' } },
        }),
      );
      expect(mockPrismaService.folder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { providerId_path: { providerId, path: 'PROMOTIONS' } },
        }),
      );
    });

    it('should delete labels no longer on server', async () => {
      const mockLabels = [
        { id: 'INBOX', name: 'INBOX', type: 'system', messagesTotal: 100, messagesUnread: 10 },
      ];

      mockGmail.users.labels.list.mockResolvedValue({ data: { labels: mockLabels } });
      mockPrismaService.folder.findMany.mockResolvedValue([
        { id: 'folder-INBOX', path: 'INBOX' },
        { id: 'folder-OLD', path: 'OLD_LABEL' },
      ]);
      mockPrismaService.folder.deleteMany.mockResolvedValue({ count: 1 });
      mockPrismaService.folder.upsert.mockImplementation(async (args: any) => ({
        id: `folder-${args.where.providerId_path.path}`,
        ...args.create,
      }));

      await service.syncGmailFolders(mockGmail, tenantId, providerId);

      expect(mockPrismaService.folder.deleteMany).toHaveBeenCalledWith({
        where: {
          providerId,
          path: { in: ['OLD_LABEL'] },
        },
      });
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Gmail API error');
      mockGmail.users.labels.list.mockRejectedValue(apiError);

      await expect(service.syncGmailFolders(mockGmail, tenantId, providerId)).rejects.toThrow('Gmail API error');
    });

    it('should handle empty labels list', async () => {
      mockGmail.users.labels.list.mockResolvedValue({ data: { labels: [] } });
      mockPrismaService.folder.findMany.mockResolvedValue([]);

      await service.syncGmailFolders(mockGmail, tenantId, providerId);

      expect(mockPrismaService.folder.upsert).not.toHaveBeenCalled();
    });

    it('should handle labels with missing id or name', async () => {
      const mockLabels = [
        { id: 'INBOX', name: 'INBOX', type: 'system' },
        { id: null, name: 'Broken Label' },
        { id: 'Label_123', name: null },
        { id: 'SENT', name: 'SENT', type: 'system' },
      ];

      mockGmail.users.labels.list.mockResolvedValue({ data: { labels: mockLabels } });
      mockPrismaService.folder.findMany.mockResolvedValue([]);
      mockPrismaService.folder.upsert.mockImplementation(async (args: any) => ({
        id: `folder-${args.where.providerId_path.path}`,
        ...args.create,
      }));

      await service.syncGmailFolders(mockGmail, tenantId, providerId);

      // Only INBOX and SENT should be upserted (valid labels)
      expect(mockPrismaService.folder.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('syncFolders', () => {
    const tenantId = 'tenant-1';
    const providerId = 'provider-1';

    it('should get token and sync folders', async () => {
      mockProviderTokenService.getProviderWithToken.mockResolvedValue({
        accessToken: 'test-access-token',
        provider: { id: providerId },
      });
      mockLabelsListFn.mockResolvedValue({ data: { labels: [] } });
      mockPrismaService.folder.findMany.mockResolvedValue([]);

      await service.syncFolders(tenantId, providerId);

      expect(mockProviderTokenService.getProviderWithToken).toHaveBeenCalledWith(providerId, tenantId);
      expect(mockLabelsListFn).toHaveBeenCalledWith({ userId: 'me' });
    });
  });

  describe('createGmailFolder', () => {
    const providerId = 'provider-1';

    beforeEach(() => {
      mockProviderTokenService.getProviderWithToken.mockResolvedValue({
        accessToken: 'test-access-token',
        provider: { id: providerId },
      });
    });

    it('should create label via Gmail API and return ID', async () => {
      mockLabelsCreateFn.mockResolvedValue({
        data: { id: 'Label_new_123', name: 'My New Label' },
      });

      const result = await service.createGmailFolder(providerId, 'My New Label');

      expect(result).toEqual({ externalId: 'Label_new_123', path: 'Label_new_123' });
      expect(mockLabelsCreateFn).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          name: 'My New Label',
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });
    });

    it('should throw ConflictException for reserved names (INBOX)', async () => {
      await expect(service.createGmailFolder(providerId, 'INBOX')).rejects.toThrow(ConflictException);
      await expect(service.createGmailFolder(providerId, 'inbox')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for reserved names (SENT)', async () => {
      await expect(service.createGmailFolder(providerId, 'SENT')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for reserved names (DRAFTS)', async () => {
      await expect(service.createGmailFolder(providerId, 'DRAFTS')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for reserved names (TRASH)', async () => {
      await expect(service.createGmailFolder(providerId, 'TRASH')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for reserved names (SPAM)', async () => {
      await expect(service.createGmailFolder(providerId, 'SPAM')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for CATEGORY_ prefix', async () => {
      await expect(service.createGmailFolder(providerId, 'CATEGORY_CUSTOM')).rejects.toThrow(ConflictException);
      await expect(service.createGmailFolder(providerId, 'category_test')).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when Gmail returns 409', async () => {
      const error = { code: 409 } as any;
      mockLabelsCreateFn.mockRejectedValue(error);

      await expect(service.createGmailFolder(providerId, 'Duplicate Label')).rejects.toThrow(ConflictException);
    });

    it('should rethrow non-409 errors', async () => {
      const error = new Error('Network error');
      mockLabelsCreateFn.mockRejectedValue(error);

      await expect(service.createGmailFolder(providerId, 'Valid Label')).rejects.toThrow('Network error');
    });
  });

  describe('renameGmailFolder', () => {
    const providerId = 'provider-1';
    const labelId = 'Label_123';

    beforeEach(() => {
      mockProviderTokenService.getProviderWithToken.mockResolvedValue({
        accessToken: 'test-access-token',
        provider: { id: providerId },
      });
    });

    it('should rename label via Gmail API', async () => {
      mockLabelsUpdateFn.mockResolvedValue({ data: { id: labelId, name: 'New Name' } });

      await service.renameGmailFolder(providerId, labelId, 'New Name');

      expect(mockLabelsUpdateFn).toHaveBeenCalledWith({
        userId: 'me',
        id: labelId,
        requestBody: { name: 'New Name' },
      });
    });

    it('should handle API errors', async () => {
      const error = new Error('Gmail API error');
      mockLabelsUpdateFn.mockRejectedValue(error);

      await expect(service.renameGmailFolder(providerId, labelId, 'New Name')).rejects.toThrow('Gmail API error');
    });
  });

  describe('deleteGmailFolder', () => {
    const providerId = 'provider-1';
    const labelId = 'Label_123';

    beforeEach(() => {
      mockProviderTokenService.getProviderWithToken.mockResolvedValue({
        accessToken: 'test-access-token',
        provider: { id: providerId },
      });
    });

    it('should delete label via Gmail API', async () => {
      mockLabelsDeleteFn.mockResolvedValue({});

      await service.deleteGmailFolder(providerId, labelId);

      expect(mockLabelsDeleteFn).toHaveBeenCalledWith({
        userId: 'me',
        id: labelId,
      });
    });

    it('should handle API errors', async () => {
      const error = new Error('Gmail API error');
      mockLabelsDeleteFn.mockRejectedValue(error);

      await expect(service.deleteGmailFolder(providerId, labelId)).rejects.toThrow('Gmail API error');
    });
  });
});
