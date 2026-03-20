import { Test, TestingModule } from '@nestjs/testing';
import { EmailCrudService, EmailListParams } from './email-crud.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailSyncBackService } from './email-sync-back.service';
import { KnowledgeBaseService } from '../../ai/services/knowledge-base.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { StorageService } from './storage.service';
import { EmailFolderService } from './email-folder.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

const mockPrismaService = {
  email: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  contact: {
    findMany: jest.fn(),
  },
  providerConfig: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};

const mockEmailSyncBackService = {
  syncOperationsBatch: jest.fn().mockResolvedValue(undefined),
  syncOperationToProvider: jest.fn().mockResolvedValue(undefined),
};

const mockKnowledgeBaseService = {
  deleteEmbeddingsForEmail: jest.fn().mockResolvedValue(undefined),
};

const mockRealtimeEventsService = {
  emitEmailUpdate: jest.fn(),
  emitEmailDelete: jest.fn(),
};

const mockStorageService = {
  deleteObjects: jest.fn().mockResolvedValue({ deleted: 0, failed: 0 }),
};

const mockEmailFolderService = {
  buildEmailWhere: jest.fn().mockResolvedValue({ where: { tenantId: 'tenant-1', isDeleted: false }, fromVip: false }),
  updateFolderCounts: jest.fn().mockResolvedValue(undefined),
  getDraftsFolderPath: jest.fn().mockResolvedValue('DRAFTS'),
  getTrashFolderPath: jest.fn().mockResolvedValue('TRASH'),
};

describe('EmailCrudService', () => {
  let service: EmailCrudService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailCrudService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailSyncBackService, useValue: mockEmailSyncBackService },
        { provide: KnowledgeBaseService, useValue: mockKnowledgeBaseService },
        { provide: RealtimeEventsService, useValue: mockRealtimeEventsService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: EmailFolderService, useValue: mockEmailFolderService },
      ],
    }).compile();

    service = module.get<EmailCrudService>(EmailCrudService);
    prisma = module.get(PrismaService);
  });

  describe('listEmails', () => {
    const mockEmails = [
      { id: 'email-1', subject: 'Test 1', from: 'test@example.com', isRead: false },
      { id: 'email-2', subject: 'Test 2', from: 'test2@example.com', isRead: true },
    ];

    it('should return paginated emails with default params', async () => {
      prisma.email.count.mockResolvedValue(2);
      prisma.email.findMany.mockResolvedValue(mockEmails);

      const params: EmailListParams = { tenantId: 'tenant-1' };
      const result = await service.listEmails(params);

      expect(result.emails).toEqual(mockEmails);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 2,
        totalPages: 1,
      });
    });

    it('should respect custom pagination params', async () => {
      prisma.email.count.mockResolvedValue(100);
      prisma.email.findMany.mockResolvedValue(mockEmails);

      const params: EmailListParams = { tenantId: 'tenant-1', page: 2, limit: 10 };
      const result = await service.listEmails(params);

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.totalPages).toBe(10);
      expect(prisma.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });

    it('should throw BadRequestException for invalid page', async () => {
      const params: EmailListParams = { tenantId: 'tenant-1', page: 0 };
      await expect(service.listEmails(params)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid limit', async () => {
      const params: EmailListParams = { tenantId: 'tenant-1', limit: 0 };
      await expect(service.listEmails(params)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for limit exceeding maxLimit', async () => {
      const params: EmailListParams = { tenantId: 'tenant-1', limit: 200 };
      await expect(service.listEmails(params)).rejects.toThrow(BadRequestException);
    });

    it('should filter by VIP contacts when fromVip is true', async () => {
      mockEmailFolderService.buildEmailWhere.mockResolvedValueOnce({
        where: { tenantId: 'tenant-1', isDeleted: false },
        fromVip: true,
      });
      prisma.contact.findMany.mockResolvedValue([
        { emails: [{ value: 'vip@example.com' }] },
      ]);
      prisma.email.count.mockResolvedValue(1);
      prisma.email.findMany.mockResolvedValue([mockEmails[0]]);

      const params: EmailListParams = { tenantId: 'tenant-1', filters: { fromVip: true } };
      const result = await service.listEmails(params);

      expect(result.emails).toHaveLength(1);
      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', isVip: true, isDeleted: false },
        select: { emails: true },
      });
    });

    it('should return empty result when no VIP contacts exist', async () => {
      mockEmailFolderService.buildEmailWhere.mockResolvedValueOnce({
        where: { tenantId: 'tenant-1', isDeleted: false },
        fromVip: true,
      });
      prisma.contact.findMany.mockResolvedValue([]);

      const params: EmailListParams = { tenantId: 'tenant-1', filters: { fromVip: true } };
      const result = await service.listEmails(params);

      expect(result.emails).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('getEmailById', () => {
    const mockEmail = {
      id: 'email-1',
      tenantId: 'tenant-1',
      subject: 'Test Email',
      from: 'sender@example.com',
      isDeleted: false,
      provider: { id: 'provider-1', email: 'user@example.com', providerType: 'gmail' },
      attachments: [],
      emailLabels: [],
    };

    it('should return email when found', async () => {
      prisma.email.findFirst.mockResolvedValue(mockEmail);

      const result = await service.getEmailById('email-1', 'tenant-1');

      expect(result).toEqual(mockEmail);
      expect(prisma.email.findFirst).toHaveBeenCalledWith({
        where: { id: 'email-1', tenantId: 'tenant-1', isDeleted: false },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException when email not found', async () => {
      prisma.email.findFirst.mockResolvedValue(null);

      await expect(service.getEmailById('nonexistent', 'tenant-1')).rejects.toThrow(NotFoundException);
    });

    it('should include deleted emails when includeDeleted is true', async () => {
      prisma.email.findFirst.mockResolvedValue({ ...mockEmail, isDeleted: true });

      const result = await service.getEmailById('email-1', 'tenant-1', true);

      expect(result.isDeleted).toBe(true);
      expect(prisma.email.findFirst).toHaveBeenCalledWith({
        where: { id: 'email-1', tenantId: 'tenant-1' },
        include: expect.any(Object),
      });
    });
  });

  describe('getEmailsByIds', () => {
    const mockEmails = [
      { id: 'email-1', subject: 'Test 1' },
      { id: 'email-2', subject: 'Test 2' },
    ];

    it('should return multiple emails by IDs', async () => {
      prisma.email.findMany.mockResolvedValue(mockEmails);

      const result = await service.getEmailsByIds(['email-1', 'email-2'], 'tenant-1');

      expect(result).toEqual(mockEmails);
      expect(prisma.email.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['email-1', 'email-2'] }, tenantId: 'tenant-1' },
        include: expect.any(Object),
      });
    });

    it('should return partial results when some IDs not found', async () => {
      prisma.email.findMany.mockResolvedValue([mockEmails[0]]);

      const result = await service.getEmailsByIds(['email-1', 'nonexistent'], 'tenant-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('email-1');
    });

    it('should return empty array when no IDs match', async () => {
      prisma.email.findMany.mockResolvedValue([]);

      const result = await service.getEmailsByIds(['nonexistent'], 'tenant-1');

      expect(result).toEqual([]);
    });
  });

  describe('updateEmail', () => {
    const mockEmail = {
      id: 'email-1',
      tenantId: 'tenant-1',
      providerId: 'provider-1',
      externalId: 'ext-1',
      folder: 'INBOX',
      isRead: false,
      isStarred: false,
      isFlagged: false,
      threadId: 'thread-1',
      provider: { id: 'provider-1', email: 'user@example.com', providerType: 'gmail' },
      attachments: [],
      emailLabels: [],
    };

    beforeEach(() => {
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([
            { id: 'email-1', providerId: 'provider-1', folder: 'INBOX', externalId: 'ext-1' },
          ]),
          email: {
            update: jest.fn().mockResolvedValue({ ...mockEmail, isRead: true }),
          },
        };
        return callback(tx);
      });
      prisma.providerConfig.findMany.mockResolvedValue([{ id: 'provider-1' }]);
    });

    it('should update email read status', async () => {
      const result = await service.updateEmail('email-1', 'tenant-1', { isRead: true });

      expect(result.isRead).toBe(true);
      expect(mockRealtimeEventsService.emitEmailUpdate).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          emailId: 'email-1',
          reason: 'read-status-updated',
        }),
      );
    });

    it('should update email starred status', async () => {
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([
            { id: 'email-1', providerId: 'provider-1', folder: 'INBOX', externalId: 'ext-1' },
          ]),
          email: {
            update: jest.fn().mockResolvedValue({ ...mockEmail, isStarred: true }),
          },
        };
        return callback(tx);
      });

      await service.updateEmail('email-1', 'tenant-1', { isStarred: true });

      expect(mockRealtimeEventsService.emitEmailUpdate).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          reason: 'starred-updated',
        }),
      );
    });

    it('should update email flagged status', async () => {
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([
            { id: 'email-1', providerId: 'provider-1', folder: 'INBOX', externalId: 'ext-1' },
          ]),
          email: {
            update: jest.fn().mockResolvedValue({ ...mockEmail, isFlagged: true }),
          },
        };
        return callback(tx);
      });

      await service.updateEmail('email-1', 'tenant-1', { isFlagged: true });

      expect(mockRealtimeEventsService.emitEmailUpdate).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          reason: 'flagged-updated',
        }),
      );
    });

    it('should include sourceFolder when moving an email between folders', async () => {
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([
            { id: 'email-1', providerId: 'provider-1', folder: 'INBOX', externalId: 'ext-1' },
          ]),
          email: {
            update: jest.fn().mockResolvedValue({ ...mockEmail, folder: 'Archive' }),
          },
        };
        return callback(tx);
      });

      await service.updateEmail('email-1', 'tenant-1', { folder: 'Archive' });

      expect(mockRealtimeEventsService.emitEmailUpdate).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          folder: 'Archive',
          reason: 'folder-updated',
          sourceFolder: 'INBOX',
        }),
      );
    });

    it('should throw NotFoundException when email not found', async () => {
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([]),
        };
        return callback(tx);
      });

      await expect(service.updateEmail('nonexistent', 'tenant-1', { isRead: true }))
        .rejects.toThrow(NotFoundException);
    });

    it('should sync changes to provider', async () => {
      await service.updateEmail('email-1', 'tenant-1', { isRead: true });

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEmailSyncBackService.syncOperationsBatch).toHaveBeenCalled();
    });
  });

  describe('deleteEmail', () => {
    beforeEach(() => {
      prisma.providerConfig.findMany.mockResolvedValue([{ id: 'provider-1' }]);
    });

    it('should soft delete email (move to trash)', async () => {
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([
            { id: 'email-1', externalId: 'ext-1', providerId: 'provider-1', tenantId: 'tenant-1', folder: 'INBOX', isDeleted: false },
          ]),
          email: {
            update: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const result = await service.deleteEmail('email-1', 'tenant-1');

      expect(result).toEqual({ success: true });
      expect(mockKnowledgeBaseService.deleteEmbeddingsForEmail).toHaveBeenCalledWith('tenant-1', 'email-1');
      expect(mockRealtimeEventsService.emitEmailDelete).toHaveBeenCalled();
    });

    it('should hard delete already-deleted email', async () => {
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([
            { id: 'email-1', externalId: 'ext-1', providerId: 'provider-1', tenantId: 'tenant-1', folder: 'TRASH', isDeleted: true },
          ]),
          email: {
            delete: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const result = await service.deleteEmail('email-1', 'tenant-1');

      expect(result).toEqual({ success: true });
      expect(mockEmailSyncBackService.syncOperationToProvider).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'hardDelete' }),
      );
    });

    it('should throw NotFoundException when email not found', async () => {
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([]),
        };
        return callback(tx);
      });

      await expect(service.deleteEmail('nonexistent', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('saveDraft', () => {
    const mockProvider = { id: 'provider-1' };
    const mockDraft = {
      id: 'draft-1',
      tenantId: 'tenant-1',
      providerId: 'provider-1',
      subject: 'Draft Subject',
      isDraft: true,
    };

    beforeEach(() => {
      prisma.providerConfig.findFirst.mockResolvedValue(mockProvider);
    });

    it('should create new draft', async () => {
      prisma.email.create.mockResolvedValue(mockDraft);

      const result = await service.saveDraft('tenant-1', {
        providerId: 'provider-1',
        subject: 'Draft Subject',
        to: ['recipient@example.com'],
      });

      expect(result).toEqual(mockDraft);
      expect(prisma.email.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          isDraft: true,
          folder: 'DRAFTS',
        }),
      });
    });

    it('should update existing draft', async () => {
      prisma.email.updateMany.mockResolvedValue({ count: 1 });
      prisma.email.findFirst.mockResolvedValue(mockDraft);

      const result = await service.saveDraft('tenant-1', {
        id: 'draft-1',
        providerId: 'provider-1',
        subject: 'Updated Draft',
      });

      expect(result).toEqual(mockDraft);
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: { id: 'draft-1', tenantId: 'tenant-1', isDraft: true },
        data: expect.any(Object),
      });
    });

    it('should throw NotFoundException when updating nonexistent draft', async () => {
      prisma.email.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.saveDraft('tenant-1', {
        id: 'nonexistent',
        providerId: 'provider-1',
      })).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when provider not found', async () => {
      prisma.providerConfig.findFirst.mockResolvedValue(null);

      await expect(service.saveDraft('tenant-1', {
        providerId: 'invalid-provider',
      })).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDraft', () => {
    it('should return draft when found', async () => {
      const mockDraft = { id: 'draft-1', subject: 'Draft', isDraft: true };
      prisma.email.findFirst.mockResolvedValue(mockDraft);

      const result = await service.getDraft('draft-1', 'tenant-1');

      expect(result).toEqual(mockDraft);
      expect(prisma.email.findFirst).toHaveBeenCalledWith({
        where: { id: 'draft-1', tenantId: 'tenant-1', isDraft: true },
      });
    });

    it('should throw NotFoundException when draft not found', async () => {
      prisma.email.findFirst.mockResolvedValue(null);

      await expect(service.getDraft('nonexistent', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteDraft', () => {
    it('should delete draft and cleanup S3 attachments', async () => {
      const mockDraft = {
        id: 'draft-1',
        attachments: [
          { storagePath: 's3://bucket/path/file1.pdf' },
          { storagePath: 's3://bucket/path/file2.pdf' },
        ],
      };
      prisma.email.findFirst.mockResolvedValue(mockDraft);
      prisma.email.delete.mockResolvedValue(mockDraft);
      mockStorageService.deleteObjects.mockResolvedValue({ deleted: 2, failed: 0 });

      await service.deleteDraft('draft-1', 'tenant-1');

      expect(prisma.email.delete).toHaveBeenCalledWith({
        where: { id_tenantId: { id: 'draft-1', tenantId: 'tenant-1' } },
      });
      expect(mockStorageService.deleteObjects).toHaveBeenCalledWith([
        's3://bucket/path/file1.pdf',
        's3://bucket/path/file2.pdf',
      ]);
    });

    it('should not fail when draft not found', async () => {
      prisma.email.findFirst.mockResolvedValue(null);

      await expect(service.deleteDraft('nonexistent', 'tenant-1')).resolves.not.toThrow();
      expect(prisma.email.delete).not.toHaveBeenCalled();
    });

    it('should handle S3 cleanup failures gracefully', async () => {
      const mockDraft = {
        id: 'draft-1',
        attachments: [{ storagePath: 's3://bucket/path/file.pdf' }],
      };
      prisma.email.findFirst.mockResolvedValue(mockDraft);
      prisma.email.delete.mockResolvedValue(mockDraft);
      mockStorageService.deleteObjects.mockRejectedValue(new Error('S3 error'));

      await expect(service.deleteDraft('draft-1', 'tenant-1')).resolves.not.toThrow();
      expect(prisma.email.delete).toHaveBeenCalled();
    });
  });

  describe('ensureProvidersActive', () => {
    it('should pass when all providers are active', async () => {
      prisma.providerConfig.findMany.mockResolvedValue([
        { id: 'provider-1' },
        { id: 'provider-2' },
      ]);

      await expect(service.ensureProvidersActive('tenant-1', ['provider-1', 'provider-2']))
        .resolves.not.toThrow();
    });

    it('should throw NotFoundException when provider not found', async () => {
      prisma.providerConfig.findMany.mockResolvedValue([{ id: 'provider-1' }]);

      await expect(service.ensureProvidersActive('tenant-1', ['provider-1', 'invalid']))
        .rejects.toThrow(NotFoundException);
    });

    it('should skip empty provider list', async () => {
      await expect(service.ensureProvidersActive('tenant-1', []))
        .resolves.not.toThrow();
      expect(prisma.providerConfig.findMany).not.toHaveBeenCalled();
    });

    it('should deduplicate provider IDs', async () => {
      prisma.providerConfig.findMany.mockResolvedValue([{ id: 'provider-1' }]);

      await service.ensureProvidersActive('tenant-1', ['provider-1', 'provider-1', 'provider-1']);

      expect(prisma.providerConfig.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: { in: ['provider-1'] },
        }),
        select: { id: true },
      });
    });
  });
});
