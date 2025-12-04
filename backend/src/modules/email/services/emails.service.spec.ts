import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EmailsService, EmailListParams } from './emails.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailSyncBackService } from './email-sync-back.service';
import { KnowledgeBaseService } from '../../ai/services/knowledge-base.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { describe, expect, jest} from '@jest/globals';

describe('EmailsService', () => {
  let service: EmailsService;
  let prismaService: jest.Mocked<PrismaService>;
  let emailSyncBack: jest.Mocked<EmailSyncBackService>;
  let knowledgeBaseService: jest.Mocked<KnowledgeBaseService>;
  let realtimeEvents: jest.Mocked<RealtimeEventsService>;

  const mockEmail = {
    id: 'email-1',
    tenantId: 'tenant-1',
    providerId: 'provider-1',
    externalId: 'ext-1',
    threadId: 'thread-1',
    messageId: '<message@example.com>',
    from: 'sender@example.com',
    to: ['recipient@example.com'],
    cc: [],
    bcc: [],
    subject: 'Test Subject',
    bodyHtml: '<p>Test body</p>',
    bodyText: 'Test body',
    snippet: 'Test body...',
    folder: 'INBOX',
    labels: [],
    isRead: false,
    isStarred: false,
    isFlagged: false,
    isDraft: false,
    isDeleted: false,
    receivedAt: new Date('2024-01-15T10:00:00Z'),
    sentAt: new Date('2024-01-15T10:00:00Z'),
    size: 1024,
    attachments: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailsService,
        {
          provide: PrismaService,
          useValue: {
            email: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
              count: jest.fn(),
              groupBy: jest.fn(),
            },
            folder: {
              findMany: jest.fn(),
            },
            emailLabel: {
              createMany: jest.fn(),
              deleteMany: jest.fn(),
            },
            userLabel: {
              findMany: jest.fn(),
            },
            providerConfig: {
              findMany: jest.fn().mockResolvedValue([{ id: 'provider-1' }]),
            },
          },
        },
        {
          provide: EmailSyncBackService,
          useValue: {
            syncOperationToProvider: jest.fn().mockResolvedValue(undefined),
            syncOperationsBatch: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: KnowledgeBaseService,
          useValue: {
            deleteEmbeddingsForEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: RealtimeEventsService,
          useValue: {
            hasTenantConnections: jest.fn().mockReturnValue(false),
            emitEmailUpdate: jest.fn(),
            emitEmailDelete: jest.fn(),
            emitFolderCountsUpdate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EmailsService>(EmailsService);
    prismaService = module.get(PrismaService);
    emailSyncBack = module.get(EmailSyncBackService);
    knowledgeBaseService = module.get(KnowledgeBaseService);
    realtimeEvents = module.get(RealtimeEventsService);

    jest.clearAllMocks();
  });

  describe('listEmails', () => {
    it('should return paginated list of emails', async () => {
      const mockEmails = [mockEmail];
      prismaService.email.count = jest.fn().mockResolvedValue(1);
      prismaService.email.findMany = jest.fn().mockResolvedValue(mockEmails);

      const params: EmailListParams = {
        tenantId: 'tenant-1',
        page: 1,
        limit: 50,
      };

      const result = await service.listEmails(params);

      expect(result.emails).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(50);
    });

    it('should filter by folder', async () => {
      prismaService.email.count = jest.fn().mockResolvedValue(0);
      prismaService.email.findMany = jest.fn().mockResolvedValue([]);

      await service.listEmails({
        tenantId: 'tenant-1',
        filters: { folder: 'SENT' },
      });

      expect(prismaService.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            folder: { equals: 'SENT', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should filter by isRead status', async () => {
      prismaService.email.count = jest.fn().mockResolvedValue(0);
      prismaService.email.findMany = jest.fn().mockResolvedValue([]);

      await service.listEmails({
        tenantId: 'tenant-1',
        filters: { isRead: false },
      });

      expect(prismaService.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isRead: false,
          }),
        }),
      );
    });

    it('should filter by search query', async () => {
      prismaService.email.count = jest.fn().mockResolvedValue(0);
      prismaService.email.findMany = jest.fn().mockResolvedValue([]);

      await service.listEmails({
        tenantId: 'tenant-1',
        filters: { search: 'important' },
      });

      expect(prismaService.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { subject: { contains: 'important', mode: 'insensitive' } },
              { from: { contains: 'important', mode: 'insensitive' } },
              { bodyText: { contains: 'important', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      prismaService.email.count = jest.fn().mockResolvedValue(0);
      prismaService.email.findMany = jest.fn().mockResolvedValue([]);

      await service.listEmails({
        tenantId: 'tenant-1',
        filters: { startDate, endDate },
      });

      expect(prismaService.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            receivedAt: {
              gte: startDate,
              lte: endDate,
            },
          }),
        }),
      );
    });

    it('should exclude deleted emails by default', async () => {
      prismaService.email.count = jest.fn().mockResolvedValue(0);
      prismaService.email.findMany = jest.fn().mockResolvedValue([]);

      await service.listEmails({
        tenantId: 'tenant-1',
      });

      expect(prismaService.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
          }),
        }),
      );
    });

    it('should show deleted emails in TRASH folder', async () => {
      prismaService.email.count = jest.fn().mockResolvedValue(0);
      prismaService.email.findMany = jest.fn().mockResolvedValue([]);

      await service.listEmails({
        tenantId: 'tenant-1',
        filters: { folder: 'TRASH' },
      });

      // Should not have isDeleted: false when viewing TRASH
      const call = (prismaService.email.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.isDeleted).toBeUndefined();
    });
  });

  describe('getEmailById', () => {
    it('should return email when found', async () => {
      prismaService.email.findFirst = jest.fn().mockResolvedValue({
        ...mockEmail,
        provider: { id: 'provider-1', email: 'user@example.com', providerType: 'google' },
        attachments: [],
        emailLabels: [],
      });

      const result = await service.getEmailById('email-1', 'tenant-1');

      expect(result.id).toBe('email-1');
      expect(prismaService.email.findFirst).toHaveBeenCalledWith({
        where: { id: 'email-1', tenantId: 'tenant-1' },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException when email not found', async () => {
      prismaService.email.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.getEmailById('nonexistent', 'tenant-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getEmailsByIds', () => {
    it('should return multiple emails by IDs', async () => {
      const mockEmails = [
        { ...mockEmail, id: 'email-1' },
        { ...mockEmail, id: 'email-2' },
      ];
      prismaService.email.findMany = jest.fn().mockResolvedValue(mockEmails);

      const result = await service.getEmailsByIds(['email-1', 'email-2'], 'tenant-1');

      expect(result).toHaveLength(2);
      expect(prismaService.email.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['email-1', 'email-2'] },
          tenantId: 'tenant-1',
        },
        include: expect.any(Object),
      });
    });
  });

  describe('updateEmail', () => {
    it('should update email and sync to provider', async () => {
      prismaService.email.findFirst = jest.fn().mockResolvedValue(mockEmail);
      prismaService.email.update = jest.fn().mockResolvedValue({ ...mockEmail, isRead: true });
      prismaService.email.findMany = jest.fn().mockResolvedValue([{ ...mockEmail, isRead: true }]);

      const result = await service.updateEmail('email-1', 'tenant-1', { isRead: true });

      expect(result.isRead).toBe(true);
      expect(prismaService.email.update).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { isRead: true },
      });
    });

    it('should throw NotFoundException when email not found', async () => {
      prismaService.email.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        service.updateEmail('nonexistent', 'tenant-1', { isRead: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when provider is inactive or missing', async () => {
      prismaService.email.findFirst = jest.fn().mockResolvedValue(mockEmail);
      prismaService.providerConfig.findMany.mockResolvedValueOnce([]);

      await expect(
        service.updateEmail('email-1', 'tenant-1', { isRead: true }),
      ).rejects.toThrow(NotFoundException);
      expect(prismaService.email.update).not.toHaveBeenCalled();
    });

    it('should emit realtime update event', async () => {
      prismaService.email.findFirst = jest.fn().mockResolvedValue(mockEmail);
      prismaService.email.update = jest.fn().mockResolvedValue({ ...mockEmail, isStarred: true });
      prismaService.email.findMany = jest.fn().mockResolvedValue([{ ...mockEmail, isStarred: true }]);

      await service.updateEmail('email-1', 'tenant-1', { isStarred: true });

      expect(realtimeEvents.emitEmailUpdate).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          emailId: 'email-1',
          updates: { isStarred: true },
        }),
      );
    });
  });

  describe('deleteEmail', () => {
    it('should soft delete email and move to TRASH', async () => {
      prismaService.email.findFirst = jest.fn().mockResolvedValue(mockEmail);
      prismaService.email.update = jest.fn().mockResolvedValue({ ...mockEmail, isDeleted: true, folder: 'TRASH' });

      const result = await service.deleteEmail('email-1', 'tenant-1');

      expect(result.success).toBe(true);
      expect(prismaService.email.update).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { isDeleted: true, folder: 'TRASH' },
      });
    });

    it('should permanently delete email if already in TRASH', async () => {
      const trashEmail = { ...mockEmail, folder: 'TRASH', isDeleted: true };
      prismaService.email.findFirst = jest.fn().mockResolvedValue(trashEmail);
      prismaService.email.delete = jest.fn().mockResolvedValue(trashEmail);

      const result = await service.deleteEmail('email-1', 'tenant-1');

      expect(result.success).toBe(true);
      expect(prismaService.email.delete).toHaveBeenCalledWith({ where: { id: 'email-1' } });
      expect(knowledgeBaseService.deleteEmbeddingsForEmail).toHaveBeenCalledWith('tenant-1', 'email-1');
    });

    it('should throw NotFoundException when email not found', async () => {
      prismaService.email.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.deleteEmail('nonexistent', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    it('should return email statistics', async () => {
      prismaService.email.count = jest
        .fn()
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(15) // unread
        .mockResolvedValueOnce(5); // starred

      prismaService.email.groupBy = jest.fn().mockResolvedValue([
        { folder: 'INBOX', _count: { id: 80 } },
        { folder: 'SENT', _count: { id: 20 } },
      ]);

      const result = await service.getStats('tenant-1');

      expect(result.total).toBe(100);
      expect(result.unread).toBe(15);
      expect(result.starred).toBe(5);
      expect(result.byFolder['INBOX']).toBe(80);
      expect(result.byFolder['SENT']).toBe(20);
    });

    it('should filter stats by providerId when specified', async () => {
      prismaService.email.count = jest.fn().mockResolvedValue(50);
      prismaService.email.groupBy = jest.fn().mockResolvedValue([]);

      await service.getStats('tenant-1', 'provider-1');

      expect(prismaService.email.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          providerId: 'provider-1',
        }),
      });
    });
  });

  describe('saveDraft', () => {
    it('should create a new draft', async () => {
      const draftData = {
        providerId: 'provider-1',
        to: ['recipient@example.com'],
        subject: 'Draft Subject',
        bodyHtml: '<p>Draft content</p>',
        bodyText: 'Draft content',
      };

      prismaService.email.create = jest.fn().mockResolvedValue({
        id: 'draft-1',
        ...draftData,
        isDraft: true,
        folder: 'DRAFTS',
      });
      prismaService.providerConfig = {
        findFirst: jest.fn().mockResolvedValue({ id: 'provider-1' }),
      } as any;

      const result = await service.saveDraft('tenant-1', draftData);

      expect(result.isDraft).toBe(true);
      expect(result.folder).toBe('DRAFTS');
      expect(prismaService.email.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          isDraft: true,
          folder: 'DRAFTS',
        }),
      });
    });

    it('should throw NotFoundException when provider is missing', async () => {
      const draftData = {
        providerId: 'provider-unknown',
        subject: 'Draft Subject',
      };

      prismaService.providerConfig = {
        findFirst: jest.fn().mockResolvedValue(null),
      } as any;

      await expect(service.saveDraft('tenant-1', draftData as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when provider belongs to another tenant', async () => {
      const draftData = {
        providerId: 'provider-1',
        subject: 'Draft Subject',
      };

      // Simulate tenant mismatch by returning null for the scoped lookup
      prismaService.providerConfig = {
        findFirst: jest.fn().mockResolvedValue(null),
      } as any;

      await expect(service.saveDraft('tenant-2', draftData as any)).rejects.toThrow(NotFoundException);
    });

    it('should update an existing draft', async () => {
      const draftData = {
        id: 'existing-draft',
        providerId: 'provider-1',
        subject: 'Updated Draft Subject',
        bodyHtml: '<p>Updated content</p>',
      };

      prismaService.email.update = jest.fn().mockResolvedValue(undefined);
      prismaService.email.findUnique = jest.fn().mockResolvedValue({
        id: 'existing-draft',
        ...draftData,
        isDraft: true,
      });
      prismaService.providerConfig = {
        findFirst: jest.fn().mockResolvedValue({ id: 'provider-1' }),
      } as any;

      await service.saveDraft('tenant-1', draftData);

      expect(prismaService.email.update).toHaveBeenCalledWith({
        where: { id: 'existing-draft' },
        data: expect.any(Object),
      });
    });
  });

  describe('getDraft', () => {
    it('should return draft when found', async () => {
      const draft = { ...mockEmail, id: 'draft-1', isDraft: true, folder: 'DRAFTS' };
      prismaService.email.findFirst = jest.fn().mockResolvedValue(draft);

      const result = await service.getDraft('draft-1', 'tenant-1');

      expect(result.id).toBe('draft-1');
      expect(result.isDraft).toBe(true);
    });

    it('should throw NotFoundException when draft not found', async () => {
      prismaService.email.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.getDraft('nonexistent', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('bulkUpdateRead', () => {
    it('should update read status for multiple emails', async () => {
      const emails = [
        { ...mockEmail, id: 'email-1' },
        { ...mockEmail, id: 'email-2' },
      ];
      prismaService.email.findMany = jest.fn().mockResolvedValue(emails);
      prismaService.email.updateMany = jest.fn().mockResolvedValue({ count: 2 });

      const result = await service.bulkUpdateRead(['email-1', 'email-2'], 'tenant-1', true);

      expect(result.updated).toBe(2);
      expect(prismaService.email.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['email-1', 'email-2'] },
          tenantId: 'tenant-1',
        },
        data: { isRead: true },
      });
    });

    it('should sync read status changes to provider', async () => {
      prismaService.email.findMany = jest.fn().mockResolvedValue([mockEmail]);
      prismaService.email.updateMany = jest.fn().mockResolvedValue({ count: 1 });

      await service.bulkUpdateRead(['email-1'], 'tenant-1', true);

      expect(emailSyncBack.syncOperationsBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            emailId: 'email-1',
            operation: 'markRead',
          }),
        ]),
      );
    });
  });

  describe('searchEmails', () => {
    it('should search emails by query', async () => {
      prismaService.email.findMany = jest.fn().mockResolvedValue([mockEmail]);

      const result = await service.searchEmails('tenant-1', 'important');

      expect(result).toHaveLength(1);
      expect(prismaService.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { subject: { contains: 'important', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });

    it('should exclude trash and spam from search results', async () => {
      prismaService.email.findMany = jest.fn().mockResolvedValue([]);

      await service.searchEmails('tenant-1', 'query');

      expect(prismaService.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            folder: { notIn: ['TRASH', 'SPAM'] },
          }),
        }),
      );
    });

    it('should limit search results', async () => {
      prismaService.email.findMany = jest.fn().mockResolvedValue([]);

      await service.searchEmails('tenant-1', 'query', undefined, 10);

      expect(prismaService.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        }),
      );
    });
  });

  describe('bulkDelete', () => {
    it('should soft delete multiple emails', async () => {
      const emails = [
        { ...mockEmail, id: 'email-1' },
        { ...mockEmail, id: 'email-2' },
      ];
      prismaService.email.findMany = jest.fn().mockResolvedValue(emails);
      prismaService.email.updateMany = jest.fn().mockResolvedValue({ count: 2 });

      const result = await service.bulkDelete(['email-1', 'email-2'], 'tenant-1');

      expect(result.deleted).toBe(2);
      expect(prismaService.email.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['email-1', 'email-2'] },
          tenantId: 'tenant-1',
        },
        data: { isDeleted: true, folder: 'TRASH' },
      });
    });

    it('should emit delete events for each email', async () => {
      prismaService.email.findMany = jest.fn().mockResolvedValue([mockEmail]);
      prismaService.email.updateMany = jest.fn().mockResolvedValue({ count: 1 });

      await service.bulkDelete(['email-1'], 'tenant-1');

      expect(realtimeEvents.emitEmailDelete).toHaveBeenCalled();
    });
  });

  describe('bulkUpdateStarred', () => {
    it('should update starred status for multiple emails', async () => {
      prismaService.email.findMany = jest.fn().mockResolvedValue([mockEmail]);
      prismaService.email.updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const result = await service.bulkUpdateStarred(['email-1'], 'tenant-1', true);

      expect(result.updated).toBe(1);
      expect(prismaService.email.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['email-1'] },
          tenantId: 'tenant-1',
        },
        data: { isStarred: true },
      });
    });

    it('should sync star changes to provider', async () => {
      prismaService.email.findMany = jest.fn().mockResolvedValue([mockEmail]);
      prismaService.email.updateMany = jest.fn().mockResolvedValue({ count: 1 });

      await service.bulkUpdateStarred(['email-1'], 'tenant-1', true);

      expect(emailSyncBack.syncOperationsBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'star',
          }),
        ]),
      );
    });
  });

  describe('bulkMoveToFolder', () => {
    it('should move multiple emails to folder', async () => {
      prismaService.email.findMany = jest.fn().mockResolvedValue([mockEmail]);
      prismaService.email.updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const result = await service.bulkMoveToFolder(['email-1'], 'tenant-1', 'ARCHIVE');

      expect(result.updated).toBe(1);
      expect(prismaService.email.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['email-1'] },
          tenantId: 'tenant-1',
        },
        data: { folder: 'ARCHIVE' },
      });
    });

    it('should sync folder move to provider', async () => {
      prismaService.email.findMany = jest.fn().mockResolvedValue([mockEmail]);
      prismaService.email.updateMany = jest.fn().mockResolvedValue({ count: 1 });

      await service.bulkMoveToFolder(['email-1'], 'tenant-1', 'ARCHIVE');

      expect(emailSyncBack.syncOperationsBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            operation: 'moveToFolder',
            folder: 'ARCHIVE',
            sourceFolder: expect.any(String),
            emailId: 'email-1',
          }),
        ]),
      );
    });
  });

  describe('bulkAddLabels', () => {
    it('should add labels to multiple emails', async () => {
      prismaService.userLabel.findMany = jest.fn().mockResolvedValue([
        { id: 'label-1' },
        { id: 'label-2' },
      ]);
      prismaService.emailLabel.createMany = jest.fn().mockResolvedValue({ count: 2 });
      prismaService.email.findMany = jest.fn().mockResolvedValue([mockEmail]);

      const result = await service.bulkAddLabels(
        ['email-1'],
        'tenant-1',
        ['label-1', 'label-2'],
      );

      expect(result.updated).toBe(2);
      expect(prismaService.emailLabel.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            emailId: 'email-1',
            labelId: 'label-1',
          }),
        ]),
        skipDuplicates: true,
      });
    });

    it('should throw NotFoundException when labels not found', async () => {
      prismaService.userLabel.findMany = jest.fn().mockResolvedValue([{ id: 'label-1' }]);

      await expect(
        service.bulkAddLabels(['email-1'], 'tenant-1', ['label-1', 'label-2']),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('bulkRemoveLabels', () => {
    it('should remove labels from multiple emails', async () => {
      prismaService.emailLabel.deleteMany = jest.fn().mockResolvedValue({ count: 2 });
      prismaService.email.findMany = jest.fn().mockResolvedValue([mockEmail]);

      const result = await service.bulkRemoveLabels(
        ['email-1'],
        'tenant-1',
        ['label-1', 'label-2'],
      );

      expect(result.deleted).toBe(2);
      expect(prismaService.emailLabel.deleteMany).toHaveBeenCalledWith({
        where: {
          emailId: { in: ['email-1'] },
          labelId: { in: ['label-1', 'label-2'] },
        },
      });
    });
  });

  describe('getThread', () => {
    it('should return all emails in a thread', async () => {
      const threadEmails = [
        { ...mockEmail, id: 'email-1' },
        { ...mockEmail, id: 'email-2' },
      ];
      prismaService.email.findMany = jest.fn().mockResolvedValue(threadEmails);

      const result = await service.getThread('thread-1', 'tenant-1');

      expect(result).toHaveLength(2);
      expect(prismaService.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { threadId: 'thread-1' },
              { id: 'thread-1' },
            ],
          }),
        }),
      );
    });

    it('should throw NotFoundException when thread not found', async () => {
      prismaService.email.findMany = jest.fn().mockResolvedValue([]);

      await expect(service.getThread('nonexistent', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAttachmentDownloadUrl', () => {
    it('should return attachment info', async () => {
      const emailWithAttachment = {
        ...mockEmail,
        attachments: [
          {
            id: 'att-1',
            filename: 'document.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            storageType: 's3',
            storagePath: 's3://bucket/document.pdf',
            isInline: false,
            contentId: null,
          },
        ],
      };
      prismaService.email.findFirst = jest.fn().mockResolvedValue(emailWithAttachment);

      const result = await service.getAttachmentDownloadUrl('email-1', 'att-1', 'tenant-1');

      expect(result.id).toBe('att-1');
      expect(result.filename).toBe('document.pdf');
      expect(result.storagePath).toBe('s3://bucket/document.pdf');
    });

    it('should throw NotFoundException when email not found', async () => {
      prismaService.email.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        service.getAttachmentDownloadUrl('nonexistent', 'att-1', 'tenant-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when attachment not found', async () => {
      prismaService.email.findFirst = jest.fn().mockResolvedValue({
        ...mockEmail,
        attachments: [],
      });

      await expect(
        service.getAttachmentDownloadUrl('email-1', 'nonexistent', 'tenant-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
