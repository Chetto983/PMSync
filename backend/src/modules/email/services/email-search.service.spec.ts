import { Test, TestingModule } from '@nestjs/testing';
import { EmailSearchService } from './email-search.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageService } from './storage.service';
import { EmailFolderService } from './email-folder.service';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const mockPrismaService = {
  email: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const mockStorageService = {
  // Not used by EmailSearchService but required for DI
};

const mockEmailFolderService = {
  buildEmailWhere: jest.fn().mockResolvedValue({
    where: { tenantId: 'tenant-1', isDeleted: false },
    fromVip: false,
    isTrashView: false,
    folderValues: [],
    excludedFolderPaths: [],
  }),
  buildConversationWhereSql: jest.fn().mockReturnValue(Prisma.sql`"tenantId" = 'tenant-1' AND "isDeleted" = false`),
};

describe('EmailSearchService', () => {
  let service: EmailSearchService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailSearchService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: EmailFolderService, useValue: mockEmailFolderService },
      ],
    }).compile();

    service = module.get<EmailSearchService>(EmailSearchService);
    prisma = module.get(PrismaService);
  });

  describe('searchEmails', () => {
    const mockEmails = [
      { id: 'email-1', providerId: 'provider-1', from: 'test@example.com', subject: 'Test 1', snippet: 'Hello', receivedAt: new Date(), isRead: false },
      { id: 'email-2', providerId: 'provider-1', from: 'test2@example.com', subject: 'Test 2', snippet: 'World', receivedAt: new Date(), isRead: true },
    ];

    it('should return emails matching search query', async () => {
      prisma.email.findMany.mockResolvedValue(mockEmails);

      const result = await service.searchEmails('tenant-1', 'test');

      expect(result).toEqual(mockEmails);
      expect(mockEmailFolderService.buildEmailWhere).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        providerId: undefined,
        excludeTrashSpam: true,
        filters: { search: 'test' },
      });
    });

    it('should respect limit parameter', async () => {
      prisma.email.findMany.mockResolvedValue([mockEmails[0]]);

      await service.searchEmails('tenant-1', 'test', undefined, 1);

      expect(prisma.email.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1,
        }),
      );
    });

    it('should exclude trash/spam folders via buildEmailWhere', async () => {
      prisma.email.findMany.mockResolvedValue(mockEmails);

      await service.searchEmails('tenant-1', 'query');

      expect(mockEmailFolderService.buildEmailWhere).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeTrashSpam: true,
        }),
      );
    });

    it('should return empty array when no matches', async () => {
      prisma.email.findMany.mockResolvedValue([]);

      const result = await service.searchEmails('tenant-1', 'nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('getStats', () => {
    const mockByFolder = [
      { folder: 'INBOX', _count: { id: 10 } },
      { folder: 'SENT', _count: { id: 5 } },
    ];

    beforeEach(() => {
      prisma.email.count.mockResolvedValue(15);
      prisma.email.groupBy.mockResolvedValue(mockByFolder);
    });

    it('should return all email statistics', async () => {
      // Mock counts: total, unread, starred, important, today, thisWeek, attachments
      prisma.email.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(25)  // unread
        .mockResolvedValueOnce(10)  // starred
        .mockResolvedValueOnce(12)  // important
        .mockResolvedValueOnce(5)   // today
        .mockResolvedValueOnce(20)  // thisWeek
        .mockResolvedValueOnce(8);  // attachments
      prisma.email.groupBy.mockResolvedValue(mockByFolder);

      const result = await service.getStats('tenant-1');

      expect(result).toEqual({
        total: 100,
        unread: 25,
        starred: 10,
        important: 12,
        today: 5,
        thisWeek: 20,
        attachments: 8,
        byFolder: { INBOX: 10, SENT: 5 },
      });
    });

    it('should exclude trash/spam from unread count', async () => {
      // Set up two different where clauses for the two buildEmailWhere calls
      mockEmailFolderService.buildEmailWhere
        .mockResolvedValueOnce({
          where: { tenantId: 'tenant-1', isDeleted: false },
          fromVip: false,
          isTrashView: false,
          folderValues: [],
          excludedFolderPaths: [],
        })
        .mockResolvedValueOnce({
          where: { tenantId: 'tenant-1', isDeleted: false, folder: { notIn: ['TRASH', 'SPAM'] } },
          fromVip: false,
          isTrashView: false,
          folderValues: [],
          excludedFolderPaths: ['TRASH', 'SPAM'],
        });

      prisma.email.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(20)  // unread excludes trash/spam
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(20)
        .mockResolvedValueOnce(8);
      prisma.email.groupBy.mockResolvedValue([]);

      await service.getStats('tenant-1');

      // Second call should be with excludeTrashSpam: true
      expect(mockEmailFolderService.buildEmailWhere).toHaveBeenNthCalledWith(2, {
        tenantId: 'tenant-1',
        providerId: undefined,
        excludeTrashSpam: true,
      });
    });

    it('should return byFolder breakdown', async () => {
      const folderBreakdown = [
        { folder: 'INBOX', _count: { id: 50 } },
        { folder: 'SENT', _count: { id: 30 } },
        { folder: 'DRAFTS', _count: { id: 10 } },
      ];
      prisma.email.count.mockResolvedValue(90);
      prisma.email.groupBy.mockResolvedValue(folderBreakdown);

      const result = await service.getStats('tenant-1');

      expect(result.byFolder).toEqual({
        INBOX: 50,
        SENT: 30,
        DRAFTS: 10,
      });
    });

    it('should calculate today and thisWeek counts correctly', async () => {
      prisma.email.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(25)
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(7)   // today
        .mockResolvedValueOnce(35)  // thisWeek
        .mockResolvedValueOnce(8);
      prisma.email.groupBy.mockResolvedValue([]);

      const result = await service.getStats('tenant-1');

      expect(result.today).toBe(7);
      expect(result.thisWeek).toBe(35);
    });
  });

  describe('getConversations', () => {
    const mockConversationGroups = [
      {
        threadKey: 'thread-1',
        latestReceivedAt: new Date('2026-01-15'),
        emailCount: 3,
        hasUnread: true,
        hasStarred: false,
        hasFlagged: true,
      },
      {
        threadKey: 'thread-2',
        latestReceivedAt: new Date('2026-01-14'),
        emailCount: 1,
        hasUnread: false,
        hasStarred: true,
        hasFlagged: false,
      },
    ];

    const mockLatestEmailsByThread = [
      { threadKey: 'thread-1', emailId: 'email-1' },
      { threadKey: 'thread-2', emailId: 'email-2' },
    ];

    const mockLatestEmails = [
      {
        id: 'email-1',
        externalId: 'ext-1',
        threadId: 'thread-1',
        from: 'alice@example.com',
        to: ['bob@example.com'],
        subject: 'Thread 1 Subject',
        snippet: 'Hello',
        folder: 'INBOX',
        labels: [],
        isRead: false,
        isStarred: false,
        isFlagged: true,
        receivedAt: new Date('2026-01-15'),
        sentAt: new Date('2026-01-15'),
        emailLabels: [],
      },
      {
        id: 'email-2',
        externalId: 'ext-2',
        threadId: 'thread-2',
        from: 'charlie@example.com',
        to: ['dave@example.com'],
        subject: 'Thread 2 Subject',
        snippet: 'World',
        folder: 'INBOX',
        labels: [],
        isRead: true,
        isStarred: true,
        isFlagged: false,
        receivedAt: new Date('2026-01-14'),
        sentAt: new Date('2026-01-14'),
        emailLabels: [],
      },
    ];

    it('should return conversations grouped by threadId', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce(mockConversationGroups)  // main query
        .mockResolvedValueOnce([{ total: 2 }])          // count query
        .mockResolvedValueOnce(mockLatestEmailsByThread); // latest emails query
      prisma.email.findMany.mockResolvedValue(mockLatestEmails);

      const result = await service.getConversations({
        tenantId: 'tenant-1',
      });

      expect(result.conversations).toHaveLength(2);
      expect(result.conversations[0].threadId).toBe('thread-1');
      expect(result.conversations[0].emailCount).toBe(3);
      expect(result.conversations[1].threadId).toBe('thread-2');
    });

    it('should paginate results correctly', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([mockConversationGroups[0]])
        .mockResolvedValueOnce([{ total: 100 }])
        .mockResolvedValueOnce([mockLatestEmailsByThread[0]]);
      prisma.email.findMany.mockResolvedValue([mockLatestEmails[0]]);

      const result = await service.getConversations({
        tenantId: 'tenant-1',
        page: 3,
        limit: 10,
      });

      expect(result.pagination).toEqual({
        page: 3,
        limit: 10,
        total: 100,
        totalPages: 10,
      });
    });

    it('should return conversation metadata (emailCount, hasUnread, hasStarred)', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce(mockConversationGroups)
        .mockResolvedValueOnce([{ total: 2 }])
        .mockResolvedValueOnce(mockLatestEmailsByThread);
      prisma.email.findMany.mockResolvedValue(mockLatestEmails);

      const result = await service.getConversations({ tenantId: 'tenant-1' });

      const conv1 = result.conversations[0];
      expect(conv1.emailCount).toBe(3);
      expect(conv1.isRead).toBe(false);  // hasUnread: true -> isRead: false
      expect(conv1.isStarred).toBe(false);
      expect(conv1.isFlagged).toBe(true);

      const conv2 = result.conversations[1];
      expect(conv2.emailCount).toBe(1);
      expect(conv2.isRead).toBe(true);   // hasUnread: false -> isRead: true
      expect(conv2.isStarred).toBe(true);
    });

    it('should return empty result when no conversations', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([])           // empty groups
        .mockResolvedValueOnce([{ total: 0 }]);

      const result = await service.getConversations({ tenantId: 'tenant-1' });

      expect(result.conversations).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });
  });

  describe('getThread', () => {
    const mockThreadEmails = [
      {
        id: 'email-1',
        tenantId: 'tenant-1',
        threadId: 'thread-1',
        subject: 'Thread Subject',
        receivedAt: new Date('2026-01-10'),
        isDeleted: false,
        attachments: [],
        emailLabels: [],
      },
      {
        id: 'email-2',
        tenantId: 'tenant-1',
        threadId: 'thread-1',
        subject: 'Re: Thread Subject',
        receivedAt: new Date('2026-01-11'),
        isDeleted: false,
        attachments: [],
        emailLabels: [],
      },
    ];

    it('should return all emails in a thread ordered by receivedAt', async () => {
      prisma.email.findMany.mockResolvedValue(mockThreadEmails);

      const result = await service.getThread('thread-1', 'tenant-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('email-1');
      expect(result[1].id).toBe('email-2');
      expect(prisma.email.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          OR: [{ threadId: 'thread-1' }, { id: 'thread-1' }],
          isDeleted: false,
        },
        orderBy: { receivedAt: 'asc' },
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException when thread not found', async () => {
      prisma.email.findMany.mockResolvedValue([]);

      await expect(service.getThread('nonexistent', 'tenant-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('should include deleted emails when includeDeleted is true', async () => {
      const emailsWithDeleted = [
        ...mockThreadEmails,
        { ...mockThreadEmails[0], id: 'email-3', isDeleted: true },
      ];
      prisma.email.findMany.mockResolvedValue(emailsWithDeleted);

      const result = await service.getThread('thread-1', 'tenant-1', true);

      expect(result).toHaveLength(3);
      expect(prisma.email.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-1',
          OR: [{ threadId: 'thread-1' }, { id: 'thread-1' }],
        },
        orderBy: { receivedAt: 'asc' },
        include: expect.any(Object),
      });
    });
  });

  describe('getAttachmentDownloadUrl', () => {
    const mockEmailWithAttachment = {
      id: 'email-1',
      tenantId: 'tenant-1',
      isDeleted: false,
      attachments: [
        {
          id: 'attachment-1',
          filename: 'document.pdf',
          mimeType: 'application/pdf',
          size: 1024,
          storageType: 's3',
          storagePath: 's3://bucket/path/document.pdf',
          isInline: false,
          contentId: null,
        },
      ],
    };

    it('should return attachment metadata when found', async () => {
      prisma.email.findFirst.mockResolvedValue(mockEmailWithAttachment);

      const result = await service.getAttachmentDownloadUrl('email-1', 'attachment-1', 'tenant-1');

      expect(result).toEqual({
        id: 'attachment-1',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storageType: 's3',
        storagePath: 's3://bucket/path/document.pdf',
        isInline: false,
        contentId: null,
      });
    });

    it('should throw NotFoundException when email not found', async () => {
      prisma.email.findFirst.mockResolvedValue(null);

      await expect(service.getAttachmentDownloadUrl('nonexistent', 'attachment-1', 'tenant-1'))
        .rejects.toThrow(new NotFoundException('Email not found'));
    });

    it('should throw NotFoundException when attachment not found', async () => {
      const emailWithoutAttachment = {
        ...mockEmailWithAttachment,
        attachments: [],
      };
      prisma.email.findFirst.mockResolvedValue(emailWithoutAttachment);

      await expect(service.getAttachmentDownloadUrl('email-1', 'nonexistent', 'tenant-1'))
        .rejects.toThrow(new NotFoundException('Attachment not found'));
    });
  });
});
