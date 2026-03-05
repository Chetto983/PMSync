import { Test, TestingModule } from '@nestjs/testing';
import { ImapFolderService } from '../services/imap-folder.service';
import { ImapConnectionPoolService } from '../services/imap-connection-pool.service';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('ImapFolderService', () => {
  let service: ImapFolderService;
  let mockPool: jest.Mocked<ImapConnectionPoolService>;

  const mockMailboxes = [
    { path: 'INBOX', name: 'INBOX', specialUse: '\\Inbox', flags: new Set(), subscribed: true },
    { path: 'Sent', name: 'Sent', specialUse: '\\Sent', flags: new Set(), subscribed: true },
    { path: '[Gmail]/Drafts', name: 'Drafts', specialUse: '\\Drafts', flags: new Set(), subscribed: true },
    { path: 'Custom Folder', name: 'Custom Folder', flags: new Set(), subscribed: true },
  ];

  beforeEach(async () => {
    mockPool = {
      withConnection: jest.fn().mockImplementation(async (fn) => {
        const mockClient = {
          list: jest.fn().mockResolvedValue(mockMailboxes),
          mailboxCreate: jest.fn().mockResolvedValue(true),
          mailboxDelete: jest.fn().mockResolvedValue(true),
          mailboxRename: jest.fn().mockResolvedValue(true),
          mailboxUnsubscribe: jest.fn().mockResolvedValue(true),
          noop: jest.fn().mockResolvedValue(true),
          getMailboxLock: jest.fn().mockResolvedValue({ release: jest.fn() }),
          search: jest.fn().mockResolvedValue([]),
          messageFlagsAdd: jest.fn().mockResolvedValue(true),
          messageDelete: jest.fn().mockResolvedValue(true),
        };
        return fn(mockClient);
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImapFolderService,
        { provide: ImapConnectionPoolService, useValue: mockPool },
      ],
    }).compile();

    service = await module.resolve<ImapFolderService>(ImapFolderService);
  });

  describe('listFolders', () => {
    it('should return canonical folders', async () => {
      const folders = await service.listFolders();
      expect(folders).toHaveLength(mockMailboxes.length);
      expect(folders.find(f => f.type === 'INBOX')).toBeDefined();
      expect(folders.find(f => f.type === 'SENT')).toBeDefined();
    });

    it('should cache folders', async () => {
      await service.listFolders();
      await service.listFolders();
      // Should only call pool once due to caching
      expect(mockPool.withConnection).toHaveBeenCalledTimes(1);
    });

    it('should refresh cache after clearCache', async () => {
      await service.listFolders();
      service.clearCache();
      await service.listFolders();
      expect(mockPool.withConnection).toHaveBeenCalledTimes(2);
    });
  });

  describe('getFolder', () => {
    it('should find folder by path', async () => {
      const folder = await service.getFolder('INBOX');
      expect(folder).toBeDefined();
      expect(folder?.type).toBe('INBOX');
    });

    it('should find folder by canonical type', async () => {
      const folder = await service.getFolder('SENT');
      expect(folder).toBeDefined();
    });

    it('should return null for non-existent folder', async () => {
      const folder = await service.getFolder('NonExistent');
      expect(folder).toBeNull();
    });

    it('should find folder by name (case-insensitive)', async () => {
      const folder = await service.getFolder('custom folder');
      expect(folder).toBeDefined();
      expect(folder?.name).toBe('Custom Folder');
    });
  });

  describe('resolveFolder', () => {
    it('should resolve INBOX to INBOX', async () => {
      const path = await service.resolveFolder('INBOX');
      expect(path).toBe('INBOX');
    });

    it('should resolve SENT to actual path', async () => {
      const path = await service.resolveFolder('SENT');
      expect(path).toBe('Sent');
    });

    it('should return path as-is if not canonical', async () => {
      const path = await service.resolveFolder('Custom Folder');
      expect(path).toBe('Custom Folder');
    });

    it('should return path as-is if contains separator', async () => {
      const path = await service.resolveFolder('[Gmail]/Drafts');
      expect(path).toBe('[Gmail]/Drafts');
    });
  });

  describe('createFolder', () => {
    it('should create folder and clear cache', async () => {
      await service.listFolders(); // Populate cache
      expect(service.isCacheValid()).toBe(true);

      // Mock getFolder to return the created folder
      const mockGetFolder = jest.spyOn(service, 'getFolder').mockResolvedValue({
        id: 'NewFolder',
        externalId: 'NewFolder',
        name: 'NewFolder',
        type: 'NewFolder',
        path: 'NewFolder',
        unreadCount: 0,
        totalCount: 0,
        attributes: { selectable: true, hasChildren: false, subscribed: true },
      });

      const folder = await service.createFolder('NewFolder');
      expect(folder).toBeDefined();
      expect(service.isCacheValid()).toBe(false); // Cache cleared

      mockGetFolder.mockRestore();
    });

    it('should create nested folder with parentId', async () => {
      const mockGetFolder = jest.spyOn(service, 'getFolder').mockResolvedValue({
        id: 'Parent/SubFolder',
        externalId: 'Parent/SubFolder',
        name: 'SubFolder',
        type: 'Parent/SubFolder',
        path: 'Parent/SubFolder',
        parentId: 'Parent',
        unreadCount: 0,
        totalCount: 0,
        attributes: { selectable: true, hasChildren: false, subscribed: true },
      });

      const folder = await service.createFolder('SubFolder', 'Parent');
      expect(folder.path).toBe('Parent/SubFolder');

      mockGetFolder.mockRestore();
    });
  });

  describe('deleteFolder', () => {
    it('should delete folder and clear cache', async () => {
      await service.listFolders(); // Populate cache
      expect(service.isCacheValid()).toBe(true);

      await service.deleteFolder('Custom Folder');
      expect(service.isCacheValid()).toBe(false);
    });
  });

  describe('renameFolder', () => {
    it('should rename folder and clear cache', async () => {
      await service.listFolders(); // Populate cache

      await service.renameFolder('Custom Folder', 'Renamed Folder');
      expect(service.isCacheValid()).toBe(false);
    });
  });

  describe('pathToCanonicalFolder', () => {
    it('should return cached type if available', async () => {
      await service.listFolders(); // Populate cache
      const type = service.pathToCanonicalFolder('INBOX');
      expect(type).toBe('INBOX');
    });

    it('should use heuristic when not in cache', () => {
      // Before cache is populated
      const type = service.pathToCanonicalFolder('Sent Items');
      expect(type).toBe('SENT');
    });

    it('should extract folder name from path', () => {
      const type = service.pathToCanonicalFolder('[Gmail]/Trash');
      expect(type).toBe('TRASH');
    });
  });

  describe('isCacheValid', () => {
    it('should return false initially', () => {
      expect(service.isCacheValid()).toBe(false);
    });

    it('should return true after listFolders', async () => {
      await service.listFolders();
      expect(service.isCacheValid()).toBe(true);
    });

    it('should return false after clearCache', async () => {
      await service.listFolders();
      service.clearCache();
      expect(service.isCacheValid()).toBe(false);
    });
  });
});
