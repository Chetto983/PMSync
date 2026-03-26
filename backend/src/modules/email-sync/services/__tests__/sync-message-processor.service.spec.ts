import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SyncMessageProcessorService } from '../sync-message-processor.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { RedisLockService } from '../../../../common/services/redis-lock.service';
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';

// Mock PrismaService
const mockPrisma = {
  email: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
  $executeRaw: jest.fn(),
};

// Mock RealtimeEventsService
const mockRealtimeEvents = {
  emitEmailDelete: jest.fn(),
  emitEmailNew: jest.fn(),
};

// Mock RedisLockService
const mockRedisLock = {
  withLock: jest.fn((key: string, ttl: number, fn: () => Promise<unknown>) => fn()),
};

describe('SyncMessageProcessorService', () => {
  let service: SyncMessageProcessorService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncMessageProcessorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RealtimeEventsService, useValue: mockRealtimeEvents },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<SyncMessageProcessorService>(SyncMessageProcessorService);
    service.setRedisLockService(mockRedisLock as unknown as RedisLockService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('parseImapExternalId', () => {
    describe('legacy format (just UID)', () => {
      it('should parse legacy format with numeric UID', () => {
        const result = service.parseImapExternalId('12345');
        expect(result).toEqual({
          folder: null,
          uid: 12345,
          isSpecialMarker: false,
          markerType: null,
        });
      });

      it('should return null uid for legacy invalid format', () => {
        const result = service.parseImapExternalId('notanumber');
        expect(result).toEqual({
          folder: null,
          uid: null,
          isSpecialMarker: false,
          markerType: null,
        });
      });

      it('should handle empty string', () => {
        const result = service.parseImapExternalId('');
        expect(result).toEqual({
          folder: null,
          uid: null,
          isSpecialMarker: false,
          markerType: null,
        });
      });

      it('should handle zero UID', () => {
        const result = service.parseImapExternalId('0');
        expect(result).toEqual({
          folder: null,
          uid: 0,
          isSpecialMarker: false,
          markerType: null,
        });
      });
    });

    describe('folder:uid format', () => {
      it('should parse simple folder:uid format', () => {
        const result = service.parseImapExternalId('INBOX:12345');
        expect(result).toEqual({
          folder: 'INBOX',
          uid: 12345,
          isSpecialMarker: false,
          markerType: null,
        });
      });

      it('should parse SENT folder', () => {
        const result = service.parseImapExternalId('SENT:9999');
        expect(result).toEqual({
          folder: 'SENT',
          uid: 9999,
          isSpecialMarker: false,
          markerType: null,
        });
      });

      it('should parse folder with colon in name', () => {
        const result = service.parseImapExternalId('Work:Projects:99');
        expect(result).toEqual({
          folder: 'Work:Projects',
          uid: 99,
          isSpecialMarker: false,
          markerType: null,
        });
      });

      it('should parse deeply nested folder', () => {
        const result = service.parseImapExternalId('Personal:Work:Archive:2024:456');
        expect(result).toEqual({
          folder: 'Personal:Work:Archive:2024',
          uid: 456,
          isSpecialMarker: false,
          markerType: null,
        });
      });

      it('should return null uid for invalid number in folder format', () => {
        const result = service.parseImapExternalId('INBOX:abc');
        expect(result).toEqual({
          folder: 'INBOX',
          uid: null,
          isSpecialMarker: false,
          markerType: null,
        });
      });

      it('should handle folder with spaces', () => {
        const result = service.parseImapExternalId('My Folder:123');
        expect(result).toEqual({
          folder: 'My Folder',
          uid: 123,
          isSpecialMarker: false,
          markerType: null,
        });
      });
    });

    describe('special markers', () => {
      it('should detect NEW special marker', () => {
        const result = service.parseImapExternalId('INBOX:__NEW__123');
        expect(result).toEqual({
          folder: 'INBOX',
          uid: null,
          isSpecialMarker: true,
          markerType: 'NEW',
        });
      });

      it('should detect EXPUNGE special marker', () => {
        const result = service.parseImapExternalId('SENT:__EXPUNGE__456');
        expect(result).toEqual({
          folder: 'SENT',
          uid: null,
          isSpecialMarker: true,
          markerType: 'EXPUNGE',
        });
      });

      it('should detect FLAGS special marker', () => {
        const result = service.parseImapExternalId('DRAFTS:__FLAGS__789');
        expect(result).toEqual({
          folder: 'DRAFTS',
          uid: null,
          isSpecialMarker: true,
          markerType: 'FLAGS',
        });
      });

      it('should detect NEW marker with nested folder', () => {
        const result = service.parseImapExternalId('Work:Archive:__NEW__100');
        expect(result).toEqual({
          folder: 'Work:Archive',
          uid: null,
          isSpecialMarker: true,
          markerType: 'NEW',
        });
      });

      it('should detect EXPUNGE marker for TRASH folder', () => {
        const result = service.parseImapExternalId('TRASH:__EXPUNGE__999');
        expect(result).toEqual({
          folder: 'TRASH',
          uid: null,
          isSpecialMarker: true,
          markerType: 'EXPUNGE',
        });
      });
    });
  });

  describe('handleDeletion', () => {
    const providerId = 'provider-1';
    const tenantId = 'tenant-1';

    it('should return needsReconciliation true for EXPUNGE marker', async () => {
      const result = await service.handleDeletion(
        'INBOX:__EXPUNGE__123',
        providerId,
        tenantId,
      );

      expect(result).toEqual({
        needsReconciliation: true,
        folder: 'INBOX',
      });
      expect(mockPrisma.email.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.email.update).not.toHaveBeenCalled();
    });

    it('should mark email as deleted when found with folder:uid format', async () => {
      mockPrisma.email.findFirst.mockResolvedValue({
        id: 'email-123',
        folder: 'INBOX',
        externalId: 'INBOX:12345',
      });
      mockPrisma.email.update.mockResolvedValue({
        id: 'email-123',
        isDeleted: true,
        folder: 'TRASH',
      });

      const result = await service.handleDeletion(
        'INBOX:12345',
        providerId,
        tenantId,
      );

      expect(result).toEqual({ needsReconciliation: false });
      expect(mockPrisma.email.update).toHaveBeenCalledWith({
        where: { id_tenantId: { id: 'email-123', tenantId } },
        data: { isDeleted: true, folder: 'TRASH' },
      });
      expect(mockRealtimeEvents.emitEmailDelete).toHaveBeenCalledWith(tenantId, {
        emailId: 'email-123',
        providerId,
        folder: 'INBOX',
        reason: 'message-deleted',
      });
    });

    it('should mark email as deleted when found with legacy format', async () => {
      mockPrisma.email.findFirst.mockResolvedValue({
        id: 'email-456',
        folder: 'INBOX',
        externalId: '99999',
      });
      mockPrisma.email.update.mockResolvedValue({
        id: 'email-456',
        isDeleted: true,
        folder: 'TRASH',
      });

      const result = await service.handleDeletion(
        '99999',
        providerId,
        tenantId,
      );

      expect(result).toEqual({ needsReconciliation: false });
      expect(mockPrisma.email.update).toHaveBeenCalledWith({
        where: { id_tenantId: { id: 'email-456', tenantId } },
        data: { isDeleted: true, folder: 'TRASH' },
      });
    });

    it('should handle email not found gracefully', async () => {
      mockPrisma.email.findFirst.mockResolvedValue(null);

      const result = await service.handleDeletion(
        'nonexistent:999',
        providerId,
        tenantId,
      );

      expect(result).toEqual({ needsReconciliation: false });
      expect(mockPrisma.email.update).not.toHaveBeenCalled();
      expect(mockRealtimeEvents.emitEmailDelete).not.toHaveBeenCalled();
    });

    it('should handle EXPUNGE marker for nested folder', async () => {
      const result = await service.handleDeletion(
        'Work:Archive:__EXPUNGE__555',
        providerId,
        tenantId,
      );

      expect(result).toEqual({
        needsReconciliation: true,
        folder: 'Work:Archive',
      });
    });

    it('should query with OR clause for backward compatibility', async () => {
      mockPrisma.email.findFirst.mockResolvedValue(null);

      await service.handleDeletion('INBOX:777', providerId, tenantId);

      // Verify the query includes both formats
      expect(mockPrisma.email.findFirst).toHaveBeenCalledWith({
        where: {
          providerId,
          OR: expect.arrayContaining([
            { externalId: 'INBOX:777' },
            { externalId: '777' },
            { externalId: 'INBOX:777' },
          ]),
        },
        select: { id: true, folder: true, externalId: true },
      });
    });
  });

  describe('upsertMessage', () => {
    it('should throw error when RedisLockService not set', async () => {
      // Create new service without RedisLockService
      const moduleWithoutLock: TestingModule = await Test.createTestingModule({
        providers: [
          SyncMessageProcessorService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: RealtimeEventsService, useValue: mockRealtimeEvents },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        ],
      }).compile();

      const serviceWithoutLock = moduleWithoutLock.get<SyncMessageProcessorService>(
        SyncMessageProcessorService,
      );

      const mockDriver = {
        isConnected: jest.fn().mockReturnValue(true),
      };

      const mockContext = {
        tenantId: 'tenant-1',
        providerId: 'provider-1',
        processAttachments: jest.fn(),
      };

      await expect(
        serviceWithoutLock.upsertMessage(
          mockDriver as any,
          {
            id: 'msg-1',
            from: { email: 'test@test.com' },
            subject: 'Test',
            receivedAt: new Date(),
            to: [],
            cc: [],
            bcc: [],
            attachments: [],
            hasAttachments: false,
          } as any,
          'provider-1',
          'tenant-1',
          mockContext as any,
        ),
      ).rejects.toThrow('RC-9: RedisLockService not available');
    });

    it('should throw error when lock acquisition fails', async () => {
      mockRedisLock.withLock.mockRejectedValue(new Error('Redis connection failed'));

      const mockDriver = {
        isConnected: jest.fn().mockReturnValue(true),
      };

      const mockContext = {
        tenantId: 'tenant-1',
        providerId: 'provider-1',
        processAttachments: jest.fn(),
      };

      await expect(
        service.upsertMessage(
          mockDriver as any,
          {
            id: 'msg-1',
            from: { email: 'test@test.com' },
            subject: 'Test',
            receivedAt: new Date(),
            to: [],
            cc: [],
            bcc: [],
            attachments: [],
            hasAttachments: false,
          } as any,
          'provider-1',
          'tenant-1',
          mockContext as any,
        ),
      ).rejects.toThrow('RC-9: Failed to acquire distributed lock');
    });
  });

  describe('upsertMessage — label integration (T-0702)', () => {
    const providerId = 'provider-1';
    const tenantId = 'tenant-1';
    const mockDriver = { isConnected: jest.fn().mockReturnValue(true) };
    const mockContext = {
      tenantId,
      providerId,
      processAttachments: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
      // Re-set withLock implementation after jest.clearAllMocks() in outer beforeEach
      mockRedisLock.withLock.mockImplementation(
        (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
      );
    });

    const makeCanonicalMsg = (overrides: Record<string, unknown> = {}) => ({
      id: 'msg-1',
      from: { email: 'sender@test.com' },
      subject: 'Test Subject',
      receivedAt: new Date('2026-03-26T10:00:00Z'),
      to: [{ email: 'recipient@test.com' }],
      cc: [],
      bcc: [],
      attachments: [],
      hasAttachments: false,
      folder: 'INBOX',
      labels: ['INBOX', 'UNREAD'],
      isRead: false,
      isStarred: false,
      isFlagged: false,
      ...overrides,
    });

    const makeExistingEmail = (overrides: Record<string, unknown> = {}) => ({
      id: 'email-uuid-1',
      version: 1,
      userModifiedAt: null as Date | null,
      isRead: false,
      isStarred: false,
      isFlagged: false,
      folder: 'INBOX',
      labels: ['INBOX', 'UNREAD'],
      ...overrides,
    });

    it('should create new email with canonical labels when no existing record', async () => {
      mockPrisma.email.findUnique.mockResolvedValue(null);
      const createdEmail = {
        id: 'new-email-id',
        subject: 'Test Subject',
        folder: 'INBOX',
        snippet: '',
        bodyText: '',
        bodyHtml: '',
        from: 'sender@test.com',
        to: ['recipient@test.com'],
        receivedAt: new Date(),
      };
      mockPrisma.email.create.mockResolvedValue(createdEmail);

      const msg = makeCanonicalMsg({ labels: ['INBOX', 'CATEGORY_SOCIAL', 'Label_work'] });
      const result = await service.upsertMessage(
        mockDriver as any, msg as any, providerId, tenantId, mockContext as any,
      );

      expect(result.wasNew).toBe(true);
      expect(mockPrisma.email.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            labels: ['INBOX', 'CATEGORY_SOCIAL', 'Label_work'],
            folder: 'INBOX',
          }),
        }),
      );
    });

    it('should merge labels on existing email — preserve custom, replace system', async () => {
      // DB has: INBOX, UNREAD, Label_abc (custom)
      // Gmail says: INBOX, STARRED (UNREAD removed, STARRED added)
      const existing = makeExistingEmail({
        labels: ['INBOX', 'UNREAD', 'Label_abc'],
      });
      mockPrisma.email.findUnique
        .mockResolvedValueOnce(existing)  // initial lookup
        .mockResolvedValueOnce({ ...existing, labels: ['INBOX', 'STARRED', 'Label_abc'] }); // post-update fetch
      mockPrisma.$executeRaw.mockResolvedValue(1);

      const msg = makeCanonicalMsg({ labels: ['INBOX', 'STARRED'] });
      const result = await service.upsertMessage(
        mockDriver as any, msg as any, providerId, tenantId, mockContext as any,
      );

      expect(result.wasNew).toBe(false);
      // $executeRaw is called with template literal; verify it was called
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it('should preserve user state when userModifiedAt is recent (RC-2)', async () => {
      // User modified 1 minute ago — state fields should be preserved
      const existing = makeExistingEmail({
        userModifiedAt: new Date(Date.now() - 60_000),
        isRead: true,
        isStarred: true,
        labels: ['INBOX', 'STARRED', 'Label_custom'],
      });
      mockPrisma.email.findUnique.mockResolvedValue(existing);
      mockPrisma.email.update.mockResolvedValue({
        ...existing,
        id: 'email-uuid-1',
        subject: 'Updated Subject',
        folder: 'INBOX',
        snippet: '',
        bodyText: '',
        bodyHtml: '',
        from: 'sender@test.com',
        to: ['recipient@test.com'],
        receivedAt: new Date(),
      });

      const msg = makeCanonicalMsg({
        labels: ['INBOX'],
        isRead: false,
        isStarred: false,
      });

      const result = await service.upsertMessage(
        mockDriver as any, msg as any, providerId, tenantId, mockContext as any,
      );

      expect(result.wasNew).toBe(false);
      // Should use email.update (not $executeRaw) and NOT include state fields
      expect(mockPrisma.email.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            isRead: expect.anything(),
            isStarred: expect.anything(),
            labels: expect.anything(),
          }),
        }),
      );
      // $executeRaw should NOT be called (userModifiedRecently path)
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('should detect RC-6 conflict when user modifies during sync', async () => {
      const existing = makeExistingEmail({ userModifiedAt: null });
      mockPrisma.email.findUnique
        .mockResolvedValueOnce(existing) // initial lookup
        .mockResolvedValueOnce(existing); // re-fetch after conflict
      // $executeRaw returns 0 = no rows updated (user modified between read and write)
      mockPrisma.$executeRaw.mockResolvedValue(0);

      const msg = makeCanonicalMsg();
      const result = await service.upsertMessage(
        mockDriver as any, msg as any, providerId, tenantId, mockContext as any,
      );

      expect(result.wasNew).toBe(false);
      expect(result.conflictDetected).toBe(true);
    });

    it('should handle folder change with label consistency', async () => {
      // Email moved from INBOX to TRASH
      const existing = makeExistingEmail({
        folder: 'INBOX',
        labels: ['INBOX', 'UNREAD', 'Label_project'],
      });
      mockPrisma.email.findUnique
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ ...existing, folder: 'TRASH', labels: ['TRASH', 'Label_project'] });
      mockPrisma.$executeRaw.mockResolvedValue(1);

      const msg = makeCanonicalMsg({
        folder: 'TRASH',
        labels: ['TRASH'],
      });

      const result = await service.upsertMessage(
        mockDriver as any, msg as any, providerId, tenantId, mockContext as any,
      );

      expect(result.wasNew).toBe(false);
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it('should use empty labels when canonical message has no labels (new email)', async () => {
      mockPrisma.email.findUnique.mockResolvedValue(null);
      mockPrisma.email.create.mockResolvedValue({
        id: 'new-email-id',
        subject: 'Test',
        folder: 'ARCHIVE',
        snippet: '',
        bodyText: '',
        bodyHtml: '',
        from: 'sender@test.com',
        to: [],
        receivedAt: new Date(),
      });

      const msg = makeCanonicalMsg({ labels: undefined, folder: 'ARCHIVE' });
      await service.upsertMessage(
        mockDriver as any, msg as any, providerId, tenantId, mockContext as any,
      );

      expect(mockPrisma.email.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            labels: [],
          }),
        }),
      );
    });

    it('should throw when email deleted during conditional update', async () => {
      const existing = makeExistingEmail({ userModifiedAt: null });
      mockPrisma.email.findUnique
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(null); // deleted between update and re-fetch
      mockPrisma.$executeRaw.mockResolvedValue(1);

      const msg = makeCanonicalMsg();
      // Inner error "was deleted during sync" is caught by withLock wrapper
      // and re-thrown as RC-9 with original message embedded
      await expect(
        service.upsertMessage(mockDriver as any, msg as any, providerId, tenantId, mockContext as any),
      ).rejects.toThrow('RC-9: Failed to acquire distributed lock');
    });
  });

  describe('processBatch', () => {
    const providerId = 'provider-1';
    const tenantId = 'tenant-1';
    const mockContext = {
      tenantId,
      providerId,
      userId: 'user-1',
      processAttachments: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
      mockPrisma.email.findMany.mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation((ops: unknown[]) => Promise.resolve(ops.map(() => ({
        id: `email-${Math.random()}`,
        subject: 'Test',
        folder: 'INBOX',
        snippet: '',
        bodyText: '',
        bodyHtml: '',
        from: 'test@test.com',
        to: [],
        receivedAt: new Date(),
      }))));
    });

    it('should return zero counts for empty batch', async () => {
      const mockDriver = { isConnected: jest.fn().mockReturnValue(true) };

      const result = await service.processBatch(
        mockDriver as any,
        [],
        providerId,
        tenantId,
        mockContext as any,
      );

      expect(result).toEqual({ processed: 0, newCount: 0 });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should process batch of messages', async () => {
      const mockDriver = { isConnected: jest.fn().mockReturnValue(true) };
      const messages = [
        {
          id: 'msg-1',
          from: { email: 'sender1@test.com' },
          subject: 'Test 1',
          receivedAt: new Date(),
          to: [{ email: 'recipient@test.com' }],
          cc: [],
          bcc: [],
          attachments: [],
          hasAttachments: false,
          folder: 'INBOX',
        },
        {
          id: 'msg-2',
          from: { email: 'sender2@test.com' },
          subject: 'Test 2',
          receivedAt: new Date(),
          to: [{ email: 'recipient@test.com' }],
          cc: [],
          bcc: [],
          attachments: [],
          hasAttachments: false,
          folder: 'INBOX',
        },
      ];

      const result = await service.processBatch(
        mockDriver as any,
        messages as any,
        providerId,
        tenantId,
        mockContext as any,
      );

      expect(result.processed).toBe(2);
      expect(result.newCount).toBe(2);
      expect(mockRealtimeEvents.emitEmailNew).toHaveBeenCalledTimes(2);
    });

    it('should not count existing emails as new', async () => {
      // Set up existing emails
      mockPrisma.email.findMany.mockResolvedValue([
        { externalId: 'msg-1' },
      ]);

      const mockDriver = { isConnected: jest.fn().mockReturnValue(true) };
      const messages = [
        {
          id: 'msg-1', // Already exists
          from: { email: 'sender@test.com' },
          subject: 'Existing',
          receivedAt: new Date(),
          to: [],
          cc: [],
          bcc: [],
          attachments: [],
          hasAttachments: false,
          folder: 'INBOX',
        },
        {
          id: 'msg-2', // New
          from: { email: 'sender@test.com' },
          subject: 'New',
          receivedAt: new Date(),
          to: [],
          cc: [],
          bcc: [],
          attachments: [],
          hasAttachments: false,
          folder: 'INBOX',
        },
      ];

      const result = await service.processBatch(
        mockDriver as any,
        messages as any,
        providerId,
        tenantId,
        mockContext as any,
      );

      expect(result.processed).toBe(2);
      expect(result.newCount).toBe(1); // Only msg-2 is new
    });

    it('should retry on P2002 unique constraint error', async () => {
      const mockDriver = { isConnected: jest.fn().mockReturnValue(true) };
      const messages = [{
        id: 'msg-retry',
        from: { email: 'sender@test.com' },
        subject: 'Test',
        receivedAt: new Date(),
        to: [],
        cc: [],
        bcc: [],
        attachments: [],
        hasAttachments: false,
        folder: 'INBOX',
      }];

      // First call fails with P2002, second succeeds
      let callCount = 0;
      mockPrisma.$transaction.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error = new Error('Unique constraint violation');
          (error as any).code = 'P2002';
          return Promise.reject(error);
        }
        return Promise.resolve([{
          id: 'email-1',
          subject: 'Test',
          folder: 'INBOX',
          snippet: '',
          bodyText: '',
          bodyHtml: '',
          from: 'sender@test.com',
          to: [],
          receivedAt: new Date(),
        }]);
      });

      const result = await service.processBatch(
        mockDriver as any,
        messages as any,
        providerId,
        tenantId,
        mockContext as any,
      );

      expect(result.processed).toBe(1);
      expect(callCount).toBe(2); // Retried once
    });

    it('should retry on P2034 deadlock error', async () => {
      const mockDriver = { isConnected: jest.fn().mockReturnValue(true) };
      const messages = [{
        id: 'msg-deadlock',
        from: { email: 'sender@test.com' },
        subject: 'Test',
        receivedAt: new Date(),
        to: [],
        cc: [],
        bcc: [],
        attachments: [],
        hasAttachments: false,
        folder: 'INBOX',
      }];

      // First call fails with P2034, second succeeds
      let callCount = 0;
      mockPrisma.$transaction.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error = new Error('Deadlock detected');
          (error as any).code = 'P2034';
          return Promise.reject(error);
        }
        return Promise.resolve([{
          id: 'email-1',
          subject: 'Test',
          folder: 'INBOX',
          snippet: '',
          bodyText: '',
          bodyHtml: '',
          from: 'sender@test.com',
          to: [],
          receivedAt: new Date(),
        }]);
      });

      const result = await service.processBatch(
        mockDriver as any,
        messages as any,
        providerId,
        tenantId,
        mockContext as any,
      );

      expect(result.processed).toBe(1);
      expect(callCount).toBe(2);
    });

    it('should fail after max retries', async () => {
      const mockDriver = { isConnected: jest.fn().mockReturnValue(true) };
      const messages = [{
        id: 'msg-fail',
        from: { email: 'sender@test.com' },
        subject: 'Test',
        receivedAt: new Date(),
        to: [],
        cc: [],
        bcc: [],
        attachments: [],
        hasAttachments: false,
        folder: 'INBOX',
      }];

      // Always fail with P2002
      const error = new Error('Unique constraint violation');
      (error as any).code = 'P2002';
      mockPrisma.$transaction.mockRejectedValue(error);

      await expect(
        service.processBatch(
          mockDriver as any,
          messages as any,
          providerId,
          tenantId,
          mockContext as any,
        ),
      ).rejects.toThrow('Unique constraint violation');
    });

    it('should skip junk folder for embeddings', async () => {
      const mockDriver = { isConnected: jest.fn().mockReturnValue(true) };
      const messages = [{
        id: 'spam-msg',
        from: { email: 'spammer@test.com' },
        subject: 'SPAM',
        receivedAt: new Date(),
        to: [],
        cc: [],
        bcc: [],
        attachments: [],
        hasAttachments: false,
        folder: 'SPAM', // Junk folder
      }];

      mockPrisma.$transaction.mockResolvedValue([{
        id: 'email-spam',
        subject: 'SPAM',
        folder: 'SPAM',
        snippet: '',
        bodyText: '',
        bodyHtml: '',
        from: 'spammer@test.com',
        to: [],
        receivedAt: new Date(),
      }]);

      const embeddingEnqueue = jest.fn().mockResolvedValue(undefined);
      const contextWithEmbedding = {
        ...mockContext,
      };

      await service.processBatch(
        mockDriver as any,
        messages as any,
        providerId,
        tenantId,
        contextWithEmbedding as any,
      );

      // Should not queue embeddings for SPAM folder
      expect(embeddingEnqueue).not.toHaveBeenCalled();
    });
  });

  describe('mergeLabels (T-0701)', () => {
    // Access private method via type cast — standard NestJS test pattern
    const callMerge = (svc: SyncMessageProcessorService, existing: string[], gmail: string[]) =>
      (svc as any).mergeLabels(existing, gmail);

    it('should return gmail labels when no existing labels', () => {
      const result = callMerge(service, [], ['INBOX', 'UNREAD']);
      expect(result).toEqual(['INBOX', 'UNREAD']);
    });

    it('should return gmail labels when existing matches', () => {
      const result = callMerge(service, ['INBOX', 'UNREAD'], ['INBOX', 'UNREAD']);
      expect(result).toEqual(['INBOX', 'UNREAD']);
    });

    it('should replace system labels with gmail source of truth', () => {
      // Email was in INBOX, now moved to TRASH by Gmail
      const result = callMerge(service, ['INBOX', 'UNREAD'], ['TRASH']);
      // INBOX and UNREAD are system labels — dropped because Gmail says they're gone
      expect(result).toEqual(['TRASH']);
    });

    it('should preserve custom labels not in Gmail', () => {
      // User added Label_abc locally, not yet synced to Gmail
      const result = callMerge(
        service,
        ['INBOX', 'Label_abc', 'STARRED'],
        ['INBOX'],
      );
      // STARRED is system → dropped (Gmail removed it)
      // Label_abc is custom → preserved
      expect(result).toEqual(expect.arrayContaining(['INBOX', 'Label_abc']));
      expect(result).not.toContain('STARRED');
      expect(result).toHaveLength(2);
    });

    it('should preserve multiple custom labels', () => {
      const result = callMerge(
        service,
        ['INBOX', 'Label_abc', 'Label_def', 'STARRED'],
        ['INBOX', 'UNREAD'],
      );
      expect(result).toEqual(expect.arrayContaining(['INBOX', 'UNREAD', 'Label_abc', 'Label_def']));
      expect(result).not.toContain('STARRED');
      expect(result).toHaveLength(4);
    });

    it('should handle custom labels with lowercase prefix', () => {
      const result = callMerge(
        service,
        ['label_xyz'],
        ['INBOX'],
      );
      // label_xyz is custom (lowercase prefix) — preserved
      expect(result).toEqual(expect.arrayContaining(['INBOX', 'label_xyz']));
    });

    it('should drop CATEGORY_ labels as system labels', () => {
      // Category was removed by Gmail
      const result = callMerge(
        service,
        ['INBOX', 'CATEGORY_SOCIAL'],
        ['INBOX'],
      );
      expect(result).toEqual(['INBOX']);
      expect(result).not.toContain('CATEGORY_SOCIAL');
    });

    it('should handle empty gmail labels (archived email)', () => {
      const result = callMerge(
        service,
        ['INBOX', 'UNREAD', 'Label_abc'],
        [],
      );
      // System labels dropped, custom preserved
      expect(result).toEqual(['Label_abc']);
    });

    it('should handle both arrays empty', () => {
      const result = callMerge(service, [], []);
      expect(result).toEqual([]);
    });

    it('should not duplicate labels present in both', () => {
      const result = callMerge(
        service,
        ['INBOX', 'Label_abc'],
        ['INBOX', 'Label_abc', 'UNREAD'],
      );
      expect(result).toEqual(expect.arrayContaining(['INBOX', 'Label_abc', 'UNREAD']));
      expect(result).toHaveLength(3);
    });

    it('should treat all SYSTEM_LABELS as provider source of truth', () => {
      const systemLabels = ['INBOX', 'SENT', 'TRASH', 'SPAM', 'DRAFT', 'STARRED', 'IMPORTANT', 'UNREAD', 'CHAT'];
      for (const sysLabel of systemLabels) {
        const result = callMerge(service, [sysLabel], []);
        expect(result).not.toContain(sysLabel);
      }
    });

    it('should treat CATEGORY_ prefixed labels as system labels', () => {
      const categories = ['CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS'];
      for (const cat of categories) {
        const result = callMerge(service, [cat], []);
        expect(result).not.toContain(cat);
      }
    });

    it('should handle real-world mixed scenario', () => {
      // Existing: user has inbox email with custom labels and starred
      const existing = ['INBOX', 'UNREAD', 'STARRED', 'CATEGORY_PERSONAL', 'Label_work', 'Label_urgent'];
      // Gmail sync: email read, unstarred, moved from personal to promotions
      const gmail = ['INBOX', 'CATEGORY_PROMOTIONS', 'Label_work'];

      const result = callMerge(service, existing, gmail);

      // Gmail says: INBOX, CATEGORY_PROMOTIONS, Label_work
      // Dropped: UNREAD (system, gmail removed), STARRED (system, gmail removed), CATEGORY_PERSONAL (system, gmail removed)
      // Preserved: Label_urgent (custom, not in gmail)
      expect(result).toEqual(expect.arrayContaining(['INBOX', 'CATEGORY_PROMOTIONS', 'Label_work', 'Label_urgent']));
      expect(result).not.toContain('UNREAD');
      expect(result).not.toContain('STARRED');
      expect(result).not.toContain('CATEGORY_PERSONAL');
      expect(result).toHaveLength(4);
    });
  });

  describe('setRedisLockService', () => {
    it('should allow setting RedisLockService', () => {
      const newMock = { withLock: jest.fn() };
      expect(() => service.setRedisLockService(newMock as any)).not.toThrow();
    });
  });
});
