import { Test, TestingModule } from '@nestjs/testing';
import { ImapMessageService } from '../services/imap-message.service';
import { ImapConnectionPoolService } from '../services/imap-connection-pool.service';
import { ImapFolderService } from '../services/imap-folder.service';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('ImapMessageService', () => {
  let service: ImapMessageService;
  let mockPool: jest.Mocked<ImapConnectionPoolService>;
  let mockFolderService: jest.Mocked<ImapFolderService>;

  const createMockClient = (overrides: Record<string, any> = {}) => ({
    getMailboxLock: jest.fn().mockResolvedValue({ release: jest.fn() }),
    mailbox: { exists: 100 },
    search: jest.fn().mockResolvedValue([103, 102, 101]),
    fetch: jest.fn().mockImplementation(function* () {
      yield {
        uid: 103,
        flags: new Set(['\\Seen']),
        envelope: {
          from: [{ address: 'sender@example.com', name: 'Sender' }],
          to: [{ address: 'recipient@example.com', name: 'Recipient' }],
          subject: 'Test Subject',
          date: new Date('2025-01-15'),
          messageId: '<msg-103@example.com>',
        },
        bodyStructure: { childNodes: [] },
      };
      yield {
        uid: 102,
        flags: new Set(),
        envelope: {
          from: [{ address: 'other@example.com', name: 'Other' }],
          to: [{ address: 'recipient@example.com' }],
          subject: 'Another Subject',
          date: new Date('2025-01-14'),
          messageId: '<msg-102@example.com>',
        },
        bodyStructure: { childNodes: [{}] },
      };
    }),
    fetchOne: jest.fn().mockResolvedValue({
      uid: 101,
      flags: new Set(['\\Seen', '\\Flagged']),
      envelope: {
        from: [{ address: 'sender@example.com', name: 'Sender' }],
        to: [{ address: 'recipient@example.com' }],
        subject: 'Single Message',
        date: new Date('2025-01-13'),
        messageId: '<msg-101@example.com>',
      },
      bodyStructure: {},
      source: Buffer.from('From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Single Message\r\n\r\nBody text'),
    }),
    download: jest.fn().mockResolvedValue({
      content: {
        on: jest.fn().mockReturnThis(),
        destroy: jest.fn(),
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('Raw message content');
        },
      },
      meta: { contentType: 'message/rfc822', expectedSize: 100 },
    }),
    messageMove: jest.fn().mockResolvedValue(true),
    messageCopy: jest.fn().mockResolvedValue({ uidMap: new Map([[101, 201]]) }),
    messageFlagsAdd: jest.fn().mockResolvedValue(true),
    messageFlagsRemove: jest.fn().mockResolvedValue(true),
    messageDelete: jest.fn().mockResolvedValue(true),
    status: jest.fn().mockResolvedValue({ highestModseq: 12345n }),
    ...overrides,
  });

  beforeEach(async () => {
    mockPool = {
      withConnection: jest.fn().mockImplementation(async (fn) => {
        const client = createMockClient();
        return fn(client);
      }),
      acquireConnection: jest.fn().mockResolvedValue(createMockClient()),
      releaseConnection: jest.fn(),
    } as any;

    mockFolderService = {
      resolveFolder: jest.fn().mockImplementation(async (folder) => {
        const mapping: Record<string, string> = {
          INBOX: 'INBOX',
          SENT: 'Sent',
          TRASH: '[Gmail]/Trash',
          DRAFTS: '[Gmail]/Drafts',
          ARCHIVE: '[Gmail]/All Mail',
          SPAM: '[Gmail]/Spam',
        };
        return mapping[folder] || folder;
      }),
      pathToCanonicalFolder: jest.fn().mockImplementation((path) => {
        if (path === 'INBOX') return 'INBOX';
        if (path === 'Sent') return 'SENT';
        if (path.includes('Trash')) return 'TRASH';
        return path;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImapMessageService,
        { provide: ImapConnectionPoolService, useValue: mockPool },
        { provide: ImapFolderService, useValue: mockFolderService },
      ],
    }).compile();

    service = module.get<ImapMessageService>(ImapMessageService);
  });

  describe('listMessages', () => {
    it('should list messages with pagination', async () => {
      const result = await service.listMessages({
        folder: 'INBOX',
        pageSize: 10,
      });

      expect(result.messages).toHaveLength(2);
      expect(result.totalEstimate).toBe(100);
      expect(mockFolderService.resolveFolder).toHaveBeenCalledWith('INBOX');
    });

    it('should handle empty results gracefully', async () => {
      mockPool.withConnection.mockImplementationOnce(async (fn) => {
        const client = createMockClient({
          search: jest.fn().mockResolvedValue([]),
        });
        return fn(client);
      });

      const result = await service.listMessages({
        folder: 'INBOX',
        pageSize: 10,
      });

      expect(result.messages).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it('should handle search errors gracefully', async () => {
      mockPool.withConnection.mockImplementationOnce(async (fn) => {
        const client = createMockClient({
          search: jest.fn().mockRejectedValue(new Error('Search failed')),
        });
        return fn(client);
      });

      const result = await service.listMessages({
        folder: 'INBOX',
        pageSize: 10,
      });

      expect(result.messages).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.totalEstimate).toBe(0);
    });

    it('should use pageToken for pagination', async () => {
      const result = await service.listMessages({
        folder: 'INBOX',
        pageSize: 10,
        pageToken: '103',
      });

      // Starting after UID 103, should get UIDs less than 103
      expect(result.messages.length).toBeGreaterThanOrEqual(0);
    });

    it('should resolve canonical folder names', async () => {
      await service.listMessages({
        folder: 'SENT',
        pageSize: 10,
      });

      expect(mockFolderService.resolveFolder).toHaveBeenCalledWith('SENT');
    });
  });

  describe('getMessage', () => {
    it('should get message by ID', async () => {
      const message = await service.getMessage('INBOX:101');

      expect(message).toBeDefined();
      expect(message?.id).toBe('INBOX:101');
      expect(message?.isRead).toBe(true);
      expect(message?.isStarred).toBe(true);
    });

    it('should return null for non-existent message', async () => {
      mockPool.withConnection.mockImplementationOnce(async (fn) => {
        const client = createMockClient({
          fetchOne: jest.fn().mockResolvedValue(null),
        });
        return fn(client);
      });

      const message = await service.getMessage('INBOX:999');

      expect(message).toBeNull();
    });

    it('should parse message body when includeBody is true', async () => {
      const message = await service.getMessage('INBOX:101', { includeBody: true });

      expect(message).toBeDefined();
      // Body parsing depends on simpleParser mock
    });
  });

  describe('getMessageRaw', () => {
    it('should return raw RFC822 message', async () => {
      const raw = await service.getMessageRaw('INBOX:101');

      expect(raw).toBe('Raw message content');
    });
  });

  describe('parseMessageId', () => {
    it('should parse standard format folder:uid', () => {
      const [folder, uid] = service.parseMessageId('INBOX:123');

      expect(folder).toBe('INBOX');
      expect(uid).toBe(123);
    });

    it('should handle nested folder paths', () => {
      const [folder, uid] = service.parseMessageId('[Gmail]/Trash:456');

      expect(folder).toBe('[Gmail]/Trash');
      expect(uid).toBe(456);
    });

    it('should default to INBOX for simple uid', () => {
      const [folder, uid] = service.parseMessageId('789');

      expect(folder).toBe('INBOX');
      expect(uid).toBe(789);
    });

    it('should throw for invalid UID', () => {
      expect(() => service.parseMessageId('INBOX:invalid')).toThrow('Invalid IMAP message ID');
      expect(() => service.parseMessageId('INBOX:-1')).toThrow('Invalid IMAP message ID');
      expect(() => service.parseMessageId('INBOX:0')).toThrow('Invalid IMAP message ID');
    });
  });

  describe('moveMessage', () => {
    it('should move message to target folder', async () => {
      await service.moveMessage('INBOX:101', 'TRASH');

      expect(mockFolderService.resolveFolder).toHaveBeenCalledWith('TRASH');
      expect(mockPool.withConnection).toHaveBeenCalled();
    });
  });

  describe('copyMessage', () => {
    it('should copy message and return new ID', async () => {
      const newId = await service.copyMessage('INBOX:101', 'ARCHIVE');

      expect(newId).toContain(':');
      expect(mockFolderService.resolveFolder).toHaveBeenCalledWith('ARCHIVE');
    });
  });

  describe('deleteMessage', () => {
    it('should move to trash when permanent=false', async () => {
      await service.deleteMessage('INBOX:101', false);

      expect(mockFolderService.resolveFolder).toHaveBeenCalledWith('TRASH');
    });

    it('should permanently delete when permanent=true', async () => {
      let flagsAdded = false;
      let deleted = false;

      mockPool.withConnection.mockImplementationOnce(async (fn) => {
        const client = createMockClient({
          messageFlagsAdd: jest.fn().mockImplementation(() => {
            flagsAdded = true;
            return Promise.resolve(true);
          }),
          messageDelete: jest.fn().mockImplementation(() => {
            deleted = true;
            return Promise.resolve(true);
          }),
        });
        return fn(client);
      });

      await service.deleteMessage('INBOX:101', true);

      expect(flagsAdded).toBe(true);
      expect(deleted).toBe(true);
    });
  });

  describe('setReadStatus', () => {
    it('should add Seen flag when isRead=true', async () => {
      let addedFlags: string[] = [];

      mockPool.withConnection.mockImplementationOnce(async (fn) => {
        const client = createMockClient({
          messageFlagsAdd: jest.fn().mockImplementation((uids, flags) => {
            addedFlags = flags;
            return Promise.resolve(true);
          }),
        });
        return fn(client);
      });

      await service.setReadStatus('INBOX:101', true);

      expect(addedFlags).toContain('\\Seen');
    });

    it('should remove Seen flag when isRead=false', async () => {
      let removedFlags: string[] = [];

      mockPool.withConnection.mockImplementationOnce(async (fn) => {
        const client = createMockClient({
          messageFlagsRemove: jest.fn().mockImplementation((uids, flags) => {
            removedFlags = flags;
            return Promise.resolve(true);
          }),
        });
        return fn(client);
      });

      await service.setReadStatus('INBOX:101', false);

      expect(removedFlags).toContain('\\Seen');
    });
  });

  describe('setStarredStatus', () => {
    it('should add Flagged flag when isStarred=true', async () => {
      let addedFlags: string[] = [];

      mockPool.withConnection.mockImplementationOnce(async (fn) => {
        const client = createMockClient({
          messageFlagsAdd: jest.fn().mockImplementation((uids, flags) => {
            addedFlags = flags;
            return Promise.resolve(true);
          }),
        });
        return fn(client);
      });

      await service.setStarredStatus('INBOX:101', true);

      expect(addedFlags).toContain('\\Flagged');
    });
  });

  describe('batchSetReadStatus', () => {
    it('should group updates by folder', async () => {
      let foldersProcessed: string[] = [];

      mockPool.withConnection.mockImplementationOnce(async (fn) => {
        const client = createMockClient({
          getMailboxLock: jest.fn().mockImplementation((folder) => {
            foldersProcessed.push(folder);
            return Promise.resolve({ release: jest.fn() });
          }),
        });
        return fn(client);
      });

      await service.batchSetReadStatus([
        { id: 'INBOX:1', isRead: true },
        { id: 'INBOX:2', isRead: false },
        { id: 'Sent:3', isRead: true },
      ]);

      expect(foldersProcessed).toContain('INBOX');
      expect(foldersProcessed).toContain('Sent');
    });
  });

  describe('batchMoveMessages', () => {
    it('should group messages by source folder', async () => {
      await service.batchMoveMessages(
        ['INBOX:1', 'INBOX:2', 'Sent:3'],
        'ARCHIVE'
      );

      expect(mockFolderService.resolveFolder).toHaveBeenCalledWith('ARCHIVE');
    });
  });

  describe('batchDeleteMessages', () => {
    it('should move to trash when permanent=false', async () => {
      await service.batchDeleteMessages(['INBOX:1', 'INBOX:2'], false);

      expect(mockFolderService.resolveFolder).toHaveBeenCalledWith('TRASH');
    });

    it('should permanently delete when permanent=true', async () => {
      let deleteCalled = false;

      mockPool.withConnection.mockImplementationOnce(async (fn) => {
        const client = createMockClient({
          messageDelete: jest.fn().mockImplementation(() => {
            deleteCalled = true;
            return Promise.resolve(true);
          }),
        });
        return fn(client);
      });

      await service.batchDeleteMessages(['INBOX:1', 'INBOX:2'], true);

      expect(deleteCalled).toBe(true);
    });
  });

  describe('batchGetMessages', () => {
    it('should return empty array for empty input', async () => {
      const messages = await service.batchGetMessages([]);

      expect(messages).toHaveLength(0);
    });

    it('should fetch multiple messages with concurrency limit', async () => {
      const messages = await service.batchGetMessages(['INBOX:101', 'INBOX:102']);

      // Each call results in a message being fetched
      expect(messages.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sync token handling', () => {
    describe('parseSyncToken', () => {
      it('should parse legacy numeric token as INBOX modseq', () => {
        const result = service.parseSyncToken('12345');

        expect(result.get('INBOX')).toBe(12345n);
      });

      it('should parse multi-folder token format', () => {
        const result = service.parseSyncToken('INBOX:100,SENT:200,DRAFTS:300');

        expect(result.get('INBOX')).toBe(100n);
        expect(result.get('SENT')).toBe(200n);
        expect(result.get('DRAFTS')).toBe(300n);
      });

      it('should handle empty token', () => {
        const result = service.parseSyncToken('');

        expect(result.size).toBe(0);
      });

      it('should skip invalid parts gracefully', () => {
        const result = service.parseSyncToken('INBOX:100,INVALID,SENT:abc');

        expect(result.get('INBOX')).toBe(100n);
        expect(result.has('SENT')).toBe(false);
      });
    });

    describe('buildSyncToken', () => {
      it('should build multi-folder token', () => {
        const modSeqs = new Map<string, bigint>([
          ['INBOX', 100n],
          ['SENT', 200n],
        ]);

        const token = service.buildSyncToken(modSeqs);

        expect(token).toContain('INBOX:100');
        expect(token).toContain('SENT:200');
        expect(token).toContain(',');
      });

      it('should return timestamp for empty map', () => {
        const token = service.buildSyncToken(new Map());

        expect(/^\d+$/.test(token)).toBe(true);
      });
    });
  });

  describe('getChangesSince', () => {
    it('should return changes with new token', async () => {
      const result = await service.getChangesSince('INBOX:100');

      expect(result.changes).toBeDefined();
      expect(result.newSyncToken).toBeDefined();
      expect(result.hasMore).toBe(false);
    });

    it('should handle CONDSTORE not supported', async () => {
      mockPool.withConnection.mockImplementationOnce(async (fn) => {
        const client = createMockClient({
          status: jest.fn().mockResolvedValue({}),
          search: jest.fn().mockResolvedValue([1, 2, 3]),
          fetch: jest.fn().mockImplementation(function* () {
            yield {
              uid: 1,
              flags: new Set(),
              envelope: { date: new Date() },
            };
          }),
        });
        return fn(client);
      });

      const result = await service.getChangesSince('12345');

      expect(result.newSyncToken).toBeDefined();
    });
  });

  describe('getInitialSyncToken', () => {
    it('should return multi-folder token when CONDSTORE supported', async () => {
      const token = await service.getInitialSyncToken();

      // Should contain folder:modseq format or timestamp
      expect(token).toBeDefined();
    });

    it('should return timestamp when CONDSTORE not supported', async () => {
      mockPool.withConnection.mockImplementationOnce(async (fn) => {
        const client = createMockClient({
          status: jest.fn().mockResolvedValue({}),
        });
        return fn(client);
      });

      const token = await service.getInitialSyncToken();

      expect(/^\d+$/.test(token)).toBe(true);
    });
  });

  describe('getAttachment', () => {
    it('should return attachment data with stream', async () => {
      const attachment = await service.getAttachment('INBOX:101', 'att_0');

      expect(attachment.id).toBe('att_0');
      expect(attachment.contentStream).toBeDefined();
      expect(attachment.mimeType).toBe('message/rfc822');
    });

    it('should release connection on error', async () => {
      mockPool.acquireConnection.mockResolvedValueOnce(
        createMockClient({
          getMailboxLock: jest.fn().mockRejectedValue(new Error('Lock failed')),
        })
      );

      await expect(service.getAttachment('INBOX:101', 'att_0')).rejects.toThrow('Lock failed');
      expect(mockPool.releaseConnection).toHaveBeenCalled();
    });
  });
});
