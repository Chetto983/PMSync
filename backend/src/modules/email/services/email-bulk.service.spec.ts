import { Test, TestingModule } from '@nestjs/testing';
import { EmailBulkService } from './email-bulk.service';
import { EmailCrudService } from './email-crud.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailSyncBackService } from './email-sync-back.service';
import { KnowledgeBaseService } from '../../ai/services/knowledge-base.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { EmailFolderService } from './email-folder.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

const mockPrismaService = {
  email: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  userLabel: {
    findMany: jest.fn(),
  },
  emailLabel: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockEmailCrudService = {
  ensureProvidersActive: jest.fn().mockResolvedValue(undefined),
  getEmailsByIds: jest.fn(),
};

const mockEmailSyncBackService = {
  syncOperationsBatch: jest.fn().mockResolvedValue(undefined),
};

const mockKnowledgeBaseService = {
  deleteEmbeddingsForEmails: jest.fn().mockResolvedValue(undefined),
};

const mockRealtimeEventsService = {
  emitEmailUpdate: jest.fn(),
  emitEmailDelete: jest.fn(),
};

const mockEmailFolderService = {
  updateFolderCounts: jest.fn().mockResolvedValue(undefined),
  getTrashFolderPath: jest.fn().mockResolvedValue('TRASH'),
};

describe('EmailBulkService', () => {
  let service: EmailBulkService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailBulkService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailCrudService, useValue: mockEmailCrudService },
        { provide: EmailSyncBackService, useValue: mockEmailSyncBackService },
        { provide: KnowledgeBaseService, useValue: mockKnowledgeBaseService },
        { provide: RealtimeEventsService, useValue: mockRealtimeEventsService },
        { provide: EmailFolderService, useValue: mockEmailFolderService },
      ],
    }).compile();

    service = module.get<EmailBulkService>(EmailBulkService);
    prisma = module.get(PrismaService);
  });

  describe('bulkUpdateRead', () => {
    const mockEmails = [
      { id: 'email-1', externalId: 'ext-1', providerId: 'provider-1', tenantId: 'tenant-1', folder: 'INBOX' },
      { id: 'email-2', externalId: 'ext-2', providerId: 'provider-1', tenantId: 'tenant-1', folder: 'INBOX' },
    ];

    const mockUpdatedEmails = [
      { id: 'email-1', folder: 'INBOX', providerId: 'provider-1', threadId: 'thread-1', isRead: true },
      { id: 'email-2', folder: 'INBOX', providerId: 'provider-1', threadId: 'thread-2', isRead: true },
    ];

    beforeEach(() => {
      prisma.email.findMany.mockResolvedValue(mockEmails);
      prisma.email.updateMany.mockResolvedValue({ count: 2 });
      mockEmailCrudService.getEmailsByIds.mockResolvedValue(mockUpdatedEmails);
    });

    it('should mark emails as read', async () => {
      const result = await service.bulkUpdateRead(['email-1', 'email-2'], 'tenant-1', true);

      expect(result.updated).toBe(2);
      expect(result.emails).toEqual(mockUpdatedEmails);
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['email-1', 'email-2'] }, tenantId: 'tenant-1' },
        data: { isRead: true },
      });
    });

    it('should mark emails as unread', async () => {
      mockEmailCrudService.getEmailsByIds.mockResolvedValue(
        mockUpdatedEmails.map(e => ({ ...e, isRead: false }))
      );

      const result = await service.bulkUpdateRead(['email-1', 'email-2'], 'tenant-1', false);

      expect(prisma.email.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isRead: false },
        })
      );
    });

    it('should emit realtime events for each email', async () => {
      await service.bulkUpdateRead(['email-1', 'email-2'], 'tenant-1', true);

      expect(mockRealtimeEventsService.emitEmailUpdate).toHaveBeenCalledTimes(2);
      expect(mockRealtimeEventsService.emitEmailUpdate).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          reason: 'read-status-updated',
        })
      );
    });

    it('should update folder counts', async () => {
      await service.bulkUpdateRead(['email-1', 'email-2'], 'tenant-1', true);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEmailFolderService.updateFolderCounts).toHaveBeenCalled();
    });

    it('should sync to provider', async () => {
      await service.bulkUpdateRead(['email-1', 'email-2'], 'tenant-1', true);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEmailSyncBackService.syncOperationsBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ operation: 'markRead' }),
        ])
      );
    });

    it('should throw BadRequestException for empty array', async () => {
      await expect(service.bulkUpdateRead([], 'tenant-1', true))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for exceeding MAX_BULK_EMAILS', async () => {
      const tooManyIds = Array.from({ length: 1001 }, (_, i) => `email-${i}`);

      await expect(service.bulkUpdateRead(tooManyIds, 'tenant-1', true))
        .rejects.toThrow(BadRequestException);
      expect(prisma.email.findMany).not.toHaveBeenCalled();
    });
  });

  describe('bulkUpdateStarred', () => {
    const mockEmails = [
      { id: 'email-1', externalId: 'ext-1', providerId: 'provider-1', tenantId: 'tenant-1', folder: 'INBOX' },
    ];

    beforeEach(() => {
      prisma.email.findMany.mockResolvedValue(mockEmails);
      prisma.email.updateMany.mockResolvedValue({ count: 1 });
      mockEmailCrudService.getEmailsByIds.mockResolvedValue([
        { id: 'email-1', folder: 'INBOX', providerId: 'provider-1', threadId: 'thread-1', isStarred: true },
      ]);
    });

    it('should star emails and sync isFlagged', async () => {
      const result = await service.bulkUpdateStarred(['email-1'], 'tenant-1', true);

      expect(result.updated).toBe(1);
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['email-1'] }, tenantId: 'tenant-1' },
        data: { isStarred: true, isFlagged: true },
      });
    });

    it('should unstar emails and sync isFlagged', async () => {
      mockEmailCrudService.getEmailsByIds.mockResolvedValue([
        { id: 'email-1', folder: 'INBOX', providerId: 'provider-1', threadId: 'thread-1', isStarred: false },
      ]);

      await service.bulkUpdateStarred(['email-1'], 'tenant-1', false);

      expect(prisma.email.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isStarred: false, isFlagged: false },
        })
      );
    });

    it('should emit realtime events with starred-updated reason', async () => {
      await service.bulkUpdateStarred(['email-1'], 'tenant-1', true);

      expect(mockRealtimeEventsService.emitEmailUpdate).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          reason: 'starred-updated',
        })
      );
    });

    it('should sync star operation to provider', async () => {
      await service.bulkUpdateStarred(['email-1'], 'tenant-1', true);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEmailSyncBackService.syncOperationsBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ operation: 'star' }),
        ])
      );
    });
  });

  describe('bulkUpdateFlagged', () => {
    const mockEmails = [
      { id: 'email-1', externalId: 'ext-1', providerId: 'provider-1', tenantId: 'tenant-1', folder: 'INBOX' },
    ];

    beforeEach(() => {
      prisma.email.findMany.mockResolvedValue(mockEmails);
      prisma.email.updateMany.mockResolvedValue({ count: 1 });
      mockEmailCrudService.getEmailsByIds.mockResolvedValue([
        { id: 'email-1', folder: 'INBOX', providerId: 'provider-1', threadId: 'thread-1', isFlagged: true },
      ]);
    });

    it('should flag emails and sync isStarred', async () => {
      const result = await service.bulkUpdateFlagged(['email-1'], 'tenant-1', true);

      expect(result.updated).toBe(1);
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['email-1'] }, tenantId: 'tenant-1' },
        data: { isFlagged: true, isStarred: true },
      });
    });

    it('should unflag emails and sync isStarred', async () => {
      mockEmailCrudService.getEmailsByIds.mockResolvedValue([
        { id: 'email-1', folder: 'INBOX', providerId: 'provider-1', threadId: 'thread-1', isFlagged: false },
      ]);

      await service.bulkUpdateFlagged(['email-1'], 'tenant-1', false);

      expect(prisma.email.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isFlagged: false, isStarred: false },
        })
      );
    });

    it('should emit realtime events with flagged-updated reason', async () => {
      await service.bulkUpdateFlagged(['email-1'], 'tenant-1', true);

      expect(mockRealtimeEventsService.emitEmailUpdate).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          reason: 'flagged-updated',
        })
      );
    });

    it('should sync flag operation to provider', async () => {
      await service.bulkUpdateFlagged(['email-1'], 'tenant-1', true);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEmailSyncBackService.syncOperationsBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ operation: 'flag' }),
        ])
      );
    });
  });

  describe('bulkMoveToFolder', () => {
    const mockEmails = [
      { id: 'email-1', externalId: 'ext-1', providerId: 'provider-1', tenantId: 'tenant-1', folder: 'INBOX' },
      { id: 'email-2', externalId: 'ext-2', providerId: 'provider-1', tenantId: 'tenant-1', folder: 'INBOX' },
    ];

    beforeEach(() => {
      prisma.email.findMany.mockResolvedValue(mockEmails);
      prisma.email.updateMany.mockResolvedValue({ count: 2 });
      mockEmailCrudService.getEmailsByIds.mockResolvedValue([
        { id: 'email-1', folder: 'Archive', providerId: 'provider-1', threadId: 'thread-1' },
        { id: 'email-2', folder: 'Archive', providerId: 'provider-1', threadId: 'thread-2' },
      ]);
    });

    it('should move emails to folder', async () => {
      const result = await service.bulkMoveToFolder(['email-1', 'email-2'], 'tenant-1', 'Archive');

      expect(result.updated).toBe(2);
      expect(prisma.email.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['email-1', 'email-2'] }, tenantId: 'tenant-1' },
        data: { folder: 'Archive' },
      });
    });

    it('should update folder counts for source and destination', async () => {
      await service.bulkMoveToFolder(['email-1', 'email-2'], 'tenant-1', 'Archive');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEmailFolderService.updateFolderCounts).toHaveBeenCalledWith(
        'tenant-1',
        'provider-1',
        expect.arrayContaining(['INBOX', 'Archive'])
      );
    });

    it('should emit realtime events with folder-updated reason', async () => {
      await service.bulkMoveToFolder(['email-1', 'email-2'], 'tenant-1', 'Archive');

      expect(mockRealtimeEventsService.emitEmailUpdate).toHaveBeenCalledTimes(2);
      expect(mockRealtimeEventsService.emitEmailUpdate).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          reason: 'folder-updated',
        })
      );
    });

    it('should sync moveToFolder operation to provider', async () => {
      await service.bulkMoveToFolder(['email-1', 'email-2'], 'tenant-1', 'Archive');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEmailSyncBackService.syncOperationsBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ operation: 'moveToFolder', folder: 'Archive' }),
        ])
      );
    });
  });

  describe('bulkDelete', () => {
    const mockEmails = [
      { id: 'email-1', externalId: 'ext-1', providerId: 'provider-1', tenantId: 'tenant-1', folder: 'INBOX', isDeleted: false },
      { id: 'email-2', externalId: 'ext-2', providerId: 'provider-1', tenantId: 'tenant-1', folder: 'TRASH', isDeleted: true },
    ];

    beforeEach(() => {
      prisma.email.findMany.mockResolvedValue(mockEmails);
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          email: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        });
      });
    });

    it('should soft delete non-deleted emails and hard delete already-deleted', async () => {
      const result = await service.bulkDelete(['email-1', 'email-2'], 'tenant-1');

      expect(result.deleted).toBe(2);
      expect(mockKnowledgeBaseService.deleteEmbeddingsForEmails).toHaveBeenCalledWith(
        'tenant-1',
        ['email-1', 'email-2']
      );
    });

    it('should get trash folder path for soft deletes', async () => {
      await service.bulkDelete(['email-1', 'email-2'], 'tenant-1');

      expect(mockEmailFolderService.getTrashFolderPath).toHaveBeenCalledWith('provider-1');
    });

    it('should emit delete events for all emails', async () => {
      await service.bulkDelete(['email-1', 'email-2'], 'tenant-1');

      expect(mockRealtimeEventsService.emitEmailDelete).toHaveBeenCalledTimes(2);
    });

    it('should sync delete operations to provider', async () => {
      await service.bulkDelete(['email-1', 'email-2'], 'tenant-1');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockEmailSyncBackService.syncOperationsBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ operation: 'delete' }),
          expect.objectContaining({ operation: 'hardDelete' }),
        ])
      );
    });

    it('should throw BadRequestException for empty array', async () => {
      await expect(service.bulkDelete([], 'tenant-1'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('bulkAddLabels', () => {
    const mockEmails = [
      { id: 'email-1', providerId: 'provider-1' },
      { id: 'email-2', providerId: 'provider-1' },
    ];

    const mockLabels = [
      { id: 'label-1' },
      { id: 'label-2' },
    ];

    beforeEach(() => {
      prisma.email.findMany.mockResolvedValue(mockEmails);
      prisma.userLabel.findMany.mockResolvedValue(mockLabels);
      prisma.emailLabel.createMany.mockResolvedValue({ count: 4 });
      mockEmailCrudService.getEmailsByIds.mockResolvedValue([
        { id: 'email-1', folder: 'INBOX', providerId: 'provider-1', threadId: 'thread-1' },
        { id: 'email-2', folder: 'INBOX', providerId: 'provider-1', threadId: 'thread-2' },
      ]);
    });

    it('should add labels to emails', async () => {
      const result = await service.bulkAddLabels(['email-1', 'email-2'], 'tenant-1', ['label-1', 'label-2']);

      expect(result.updated).toBe(4);
      expect(prisma.emailLabel.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          { tenantId: 'tenant-1', emailId: 'email-1', labelId: 'label-1' },
          { tenantId: 'tenant-1', emailId: 'email-1', labelId: 'label-2' },
          { tenantId: 'tenant-1', emailId: 'email-2', labelId: 'label-1' },
          { tenantId: 'tenant-1', emailId: 'email-2', labelId: 'label-2' },
        ]),
        skipDuplicates: true,
      });
    });

    it('should throw NotFoundException when labels not found', async () => {
      prisma.userLabel.findMany.mockResolvedValue([{ id: 'label-1' }]);

      await expect(service.bulkAddLabels(['email-1'], 'tenant-1', ['label-1', 'nonexistent']))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when no valid emails found', async () => {
      prisma.email.findMany.mockResolvedValue([]);

      await expect(service.bulkAddLabels(['email-1'], 'tenant-1', ['label-1']))
        .rejects.toThrow(NotFoundException);
    });

    it('should emit realtime events with labels-updated reason', async () => {
      prisma.userLabel.findMany.mockResolvedValue([{ id: 'label-1' }]);

      await service.bulkAddLabels(['email-1', 'email-2'], 'tenant-1', ['label-1']);

      expect(mockRealtimeEventsService.emitEmailUpdate).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          reason: 'labels-updated',
        })
      );
    });

    it('should throw BadRequestException for empty email array', async () => {
      await expect(service.bulkAddLabels([], 'tenant-1', ['label-1']))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for empty label array', async () => {
      await expect(service.bulkAddLabels(['email-1'], 'tenant-1', []))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('bulkRemoveLabels', () => {
    const mockEmails = [
      { id: 'email-1', providerId: 'provider-1' },
      { id: 'email-2', providerId: 'provider-1' },
    ];

    beforeEach(() => {
      prisma.email.findMany.mockResolvedValue(mockEmails);
      prisma.emailLabel.deleteMany.mockResolvedValue({ count: 4 });
      mockEmailCrudService.getEmailsByIds.mockResolvedValue([
        { id: 'email-1', folder: 'INBOX', providerId: 'provider-1', threadId: 'thread-1' },
        { id: 'email-2', folder: 'INBOX', providerId: 'provider-1', threadId: 'thread-2' },
      ]);
    });

    it('should remove labels from emails', async () => {
      const result = await service.bulkRemoveLabels(['email-1', 'email-2'], 'tenant-1', ['label-1', 'label-2']);

      expect(result.deleted).toBe(4);
      expect(prisma.emailLabel.deleteMany).toHaveBeenCalledWith({
        where: {
          emailId: { in: ['email-1', 'email-2'] },
          labelId: { in: ['label-1', 'label-2'] },
        },
      });
    });

    it('should return empty result when no valid emails found', async () => {
      prisma.email.findMany.mockResolvedValue([]);

      const result = await service.bulkRemoveLabels(['email-1'], 'tenant-1', ['label-1']);

      expect(result.deleted).toBe(0);
      expect(result.emails).toEqual([]);
      expect(prisma.emailLabel.deleteMany).not.toHaveBeenCalled();
    });

    it('should emit realtime events with labels-updated reason', async () => {
      await service.bulkRemoveLabels(['email-1', 'email-2'], 'tenant-1', ['label-1']);

      expect(mockRealtimeEventsService.emitEmailUpdate).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          reason: 'labels-updated',
        })
      );
    });

    it('should throw BadRequestException for empty email array', async () => {
      await expect(service.bulkRemoveLabels([], 'tenant-1', ['label-1']))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for empty label array', async () => {
      await expect(service.bulkRemoveLabels(['email-1'], 'tenant-1', []))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('MAX_BULK_EMAILS validation', () => {
    it('should accept exactly 1000 items', async () => {
      const ids = Array.from({ length: 1000 }, (_, i) => `email-${i}`);
      prisma.email.findMany.mockResolvedValue(ids.map(id => ({
        id,
        externalId: `ext-${id}`,
        providerId: 'provider-1',
        tenantId: 'tenant-1',
        folder: 'INBOX',
      })));
      prisma.email.updateMany.mockResolvedValue({ count: 1000 });
      mockEmailCrudService.getEmailsByIds.mockResolvedValue([]);

      await expect(service.bulkUpdateRead(ids, 'tenant-1', true)).resolves.not.toThrow();
    });

    it('should reject 1001 items', async () => {
      const ids = Array.from({ length: 1001 }, (_, i) => `email-${i}`);

      await expect(service.bulkUpdateRead(ids, 'tenant-1', true))
        .rejects.toThrow(/Maximum 1000 items/);
    });
  });
});
