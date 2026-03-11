import { Test, TestingModule } from '@nestjs/testing';
import { FolderSyncQueryService, FolderInfo } from '../folder-sync-query.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PrismaRetryService } from '../../../../common/services/prisma-retry.service';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock PrismaService
const mockPrismaService = {
  folder: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  email: {
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  providerConfig: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

// Mock RealtimeEventsService
const mockRealtimeEvents = {
  emitFolderCountsUpdate: jest.fn(),
};

// Mock PrismaRetryService with retry simulation matching real service behavior
const mockPrismaRetryService = {
  withRetry: jest.fn().mockImplementation(async (fn: () => Promise<unknown>) => {
    const maxAttempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error: unknown) {
        lastError = error;
        const code = (error as { code?: string })?.code;
        const isRetryable = code === 'P2002' || code === 'P2034';

        if (!isRetryable) {
          throw error;
        }

        if (attempt >= maxAttempts) {
          throw error;
        }
        // Continue to retry for P2002/P2034
      }
    }
    throw lastError;
  }),
};

describe('FolderSyncQueryService', () => {
  let service: FolderSyncQueryService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FolderSyncQueryService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PrismaRetryService, useValue: mockPrismaRetryService },
        { provide: RealtimeEventsService, useValue: mockRealtimeEvents },
      ],
    }).compile();

    service = module.get<FolderSyncQueryService>(FolderSyncQueryService);
  });

  describe('syncFoldersToDatabase', () => {
    const tenantId = 'tenant-1';
    const providerId = 'provider-1';
    const testFolders: FolderInfo[] = [
      { path: 'INBOX', name: 'INBOX', delimiter: '/', attributes: [], specialUse: '\\Inbox' },
      { path: 'Sent', name: 'Sent', delimiter: '/', attributes: [], specialUse: '\\Sent' },
    ];

    it('should create new folders correctly', async () => {
      mockPrismaService.folder.findMany.mockResolvedValue([]);
      mockPrismaService.folder.upsert.mockImplementation(async (args) => ({
        id: `folder-${args.where.providerId_path.path}`,
        path: args.where.providerId_path.path,
        name: args.create.name,
        tenantId,
        providerId,
      }));

      const result = await service.syncFoldersToDatabase(tenantId, providerId, testFolders);

      expect(result).toHaveLength(2);
      expect(mockPrismaService.folder.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.folder.deleteMany).not.toHaveBeenCalled();
    });

    it('should update existing folders correctly', async () => {
      mockPrismaService.folder.findMany.mockResolvedValue([
        { id: 'folder-INBOX', path: 'INBOX', name: 'INBOX', tenantId, providerId },
      ]);
      mockPrismaService.folder.upsert.mockImplementation(async (args) => ({
        id: `folder-${args.where.providerId_path.path}`,
        path: args.where.providerId_path.path,
        name: args.create.name,
        tenantId,
        providerId,
      }));

      const result = await service.syncFoldersToDatabase(tenantId, providerId, testFolders);

      expect(result).toHaveLength(2);
      expect(mockPrismaService.folder.upsert).toHaveBeenCalledTimes(2);
    });

    it('should delete removed folders', async () => {
      mockPrismaService.folder.findMany.mockResolvedValue([
        { id: 'folder-INBOX', path: 'INBOX', name: 'INBOX', tenantId, providerId },
        { id: 'folder-Trash', path: 'Trash', name: 'Trash', tenantId, providerId },
        { id: 'folder-Old', path: 'Old', name: 'Old', tenantId, providerId },
      ]);
      mockPrismaService.folder.upsert.mockImplementation(async (args) => ({
        id: `folder-${args.where.providerId_path.path}`,
        path: args.where.providerId_path.path,
        name: args.create.name,
        tenantId,
        providerId,
      }));

      await service.syncFoldersToDatabase(tenantId, providerId, testFolders);

      expect(mockPrismaService.folder.deleteMany).toHaveBeenCalledWith({
        where: {
          providerId,
          path: { in: ['Trash', 'Old'] },
        },
      });
    });

    it('should handle P2002 (unique constraint) with retry', async () => {
      mockPrismaService.folder.findMany.mockResolvedValue([]);
      let callCount = 0;
      mockPrismaService.folder.upsert.mockImplementation(async (args) => {
        callCount++;
        if (callCount === 1) {
          const error = new Error('Unique constraint violation') as any;
          error.code = 'P2002';
          throw error;
        }
        return {
          id: `folder-${args.where.providerId_path.path}`,
          path: args.where.providerId_path.path,
          name: args.create.name,
          tenantId,
          providerId,
        };
      });

      const singleFolder: FolderInfo[] = [
        { path: 'INBOX', name: 'INBOX', delimiter: '/', attributes: [] },
      ];
      const result = await service.syncFoldersToDatabase(tenantId, providerId, singleFolder);

      expect(result).toHaveLength(1);
      expect(callCount).toBe(2); // One failure + one retry
    });

    it('should handle P2034 (deadlock) with retry', async () => {
      mockPrismaService.folder.findMany.mockResolvedValue([]);
      let callCount = 0;
      mockPrismaService.folder.upsert.mockImplementation(async (args) => {
        callCount++;
        if (callCount <= 2) {
          const error = new Error('Deadlock') as any;
          error.code = 'P2034';
          throw error;
        }
        return {
          id: `folder-${args.where.providerId_path.path}`,
          path: args.where.providerId_path.path,
          name: args.create.name,
          tenantId,
          providerId,
        };
      });

      const singleFolder: FolderInfo[] = [
        { path: 'INBOX', name: 'INBOX', delimiter: '/', attributes: [] },
      ];
      const result = await service.syncFoldersToDatabase(tenantId, providerId, singleFolder);

      expect(result).toHaveLength(1);
      expect(callCount).toBe(3); // Two failures + one success
    });

    it('should throw error after max retries exceeded', async () => {
      mockPrismaService.folder.findMany.mockResolvedValue([]);
      mockPrismaService.folder.upsert.mockRejectedValue(
        Object.assign(new Error('Unique constraint violation'), { code: 'P2002' }),
      );

      const singleFolder: FolderInfo[] = [
        { path: 'INBOX', name: 'INBOX', delimiter: '/', attributes: [] },
      ];

      await expect(
        service.syncFoldersToDatabase(tenantId, providerId, singleFolder),
      ).rejects.toThrow('Unique constraint violation');
    });

    it('should set parent relationships in second pass', async () => {
      mockPrismaService.folder.findMany.mockResolvedValue([]);
      mockPrismaService.folder.upsert.mockImplementation(async (args) => ({
        id: `folder-${args.where.providerId_path.path}`,
        path: args.where.providerId_path.path,
        name: args.create.name,
        tenantId,
        providerId,
      }));
      mockPrismaService.folder.update.mockResolvedValue({});

      const foldersWithParent: FolderInfo[] = [
        { path: 'INBOX', name: 'INBOX', delimiter: '/', attributes: [] },
        { path: 'INBOX/Subfolder', name: 'Subfolder', delimiter: '/', attributes: [], parent: 'INBOX' },
      ];

      await service.syncFoldersToDatabase(tenantId, providerId, foldersWithParent);

      expect(mockPrismaService.folder.update).toHaveBeenCalledWith({
        where: { id_tenantId: { id: 'folder-INBOX/Subfolder', tenantId } },
        data: { parentId: 'folder-INBOX' },
      });
    });
  });

  describe('updateFolderCounts', () => {
    const providerId = 'provider-1';
    const folderPath = 'INBOX';
    const tenantId = 'tenant-1';

    it('should update total and unread counts correctly', async () => {
      mockPrismaService.folder.findUnique.mockResolvedValue({
        id: 'folder-1',
        name: 'INBOX',
        path: 'INBOX',
        tenantId,
        totalCount: 0,
        unreadCount: 0,
        specialUse: '\\Inbox',
      });
      mockPrismaService.email.count.mockResolvedValueOnce(100).mockResolvedValueOnce(25);
      mockPrismaService.folder.update.mockResolvedValue({});

      const result = await service.updateFolderCounts(providerId, folderPath, tenantId);

      expect(result).toEqual({
        folderId: 'folder-1',
        folderName: 'INBOX',
        totalCount: 100,
        unreadCount: 25,
        tenantId,
      });
      expect(mockPrismaService.folder.update).toHaveBeenCalledWith({
        where: { id_tenantId: { id: 'folder-1', tenantId } },
        data: { totalCount: 100, unreadCount: 25 },
      });
    });

    it('should return null for non-existent folder', async () => {
      mockPrismaService.folder.findUnique.mockResolvedValue(null);

      const result = await service.updateFolderCounts(providerId, folderPath);

      expect(result).toBeNull();
      expect(mockPrismaService.email.count).not.toHaveBeenCalled();
    });

    it('should return null when counts unchanged (debounce)', async () => {
      mockPrismaService.folder.findUnique.mockResolvedValue({
        id: 'folder-1',
        name: 'INBOX',
        path: 'INBOX',
        tenantId,
        totalCount: 100,
        unreadCount: 25,
        specialUse: null,
      });
      mockPrismaService.email.count.mockResolvedValueOnce(100).mockResolvedValueOnce(25);

      const result = await service.updateFolderCounts(providerId, folderPath, tenantId);

      expect(result).toBeNull();
      expect(mockPrismaService.folder.update).not.toHaveBeenCalled();
    });
  });

  describe('updateAllFolderCounts', () => {
    const providerId = 'provider-1';
    const tenantId = 'tenant-1';

    it('should update all folders for a provider', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({ id: providerId, tenantId });
      mockPrismaService.folder.findMany.mockResolvedValue([
        { id: 'f1', name: 'INBOX', path: 'INBOX', tenantId, totalCount: 0, unreadCount: 0, specialUse: null },
        { id: 'f2', name: 'Sent', path: 'Sent', tenantId, totalCount: 0, unreadCount: 0, specialUse: null },
      ]);
      mockPrismaService.email.groupBy.mockResolvedValueOnce([
        { folder: 'INBOX', _count: { id: 50 } },
        { folder: 'Sent', _count: { id: 30 } },
      ]).mockResolvedValueOnce([
        { folder: 'INBOX', _count: { id: 10 } },
      ]);
      mockPrismaService.$transaction.mockResolvedValue([]);

      await service.updateAllFolderCounts(providerId);

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockRealtimeEvents.emitFolderCountsUpdate).toHaveBeenCalledTimes(2);
    });

    it('should handle empty folder list gracefully', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue({ id: providerId, tenantId });
      mockPrismaService.folder.findMany.mockResolvedValue([]);

      await service.updateAllFolderCounts(providerId);

      expect(mockPrismaService.email.groupBy).not.toHaveBeenCalled();
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('should skip if provider not found', async () => {
      mockPrismaService.providerConfig.findUnique.mockResolvedValue(null);

      await service.updateAllFolderCounts(providerId);

      expect(mockPrismaService.folder.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getFolderKeys', () => {
    it('should return name and path variants', () => {
      const folder = { name: 'Inbox', path: 'INBOX', specialUse: null };
      const keys = service.getFolderKeys(folder);

      expect(keys).toContain('Inbox');
      expect(keys).toContain('INBOX');
      // Keys: Inbox, INBOX (from name), INBOX (from path) - deduplicated = 2
      expect(keys.length).toBeGreaterThanOrEqual(2);
    });

    it('should include specialUse normalized', () => {
      const folder = { name: 'Inbox', path: 'INBOX', specialUse: '\\Inbox' };
      const keys = service.getFolderKeys(folder);

      expect(keys).toContain('INBOX');
      expect(keys.some(k => k.includes('INBOX'))).toBe(true);
    });

    it('should handle folder with no path', () => {
      const folder = { name: 'Inbox', path: null, specialUse: null };
      const keys = service.getFolderKeys(folder);

      expect(keys).toContain('Inbox');
      expect(keys).toContain('INBOX');
    });
  });

  describe('auditFolderSyncFromPaths', () => {
    it('should detect missing folders in DB', () => {
      const dbPaths = new Set(['INBOX', 'Sent']);
      const serverPaths = new Set(['INBOX', 'Sent', 'Drafts']);

      const result = service.auditFolderSyncFromPaths(dbPaths, serverPaths);

      expect(result.inSync).toBe(false);
      expect(result.onlyOnServer).toContain('Drafts');
      expect(result.onlyInDb).toHaveLength(0);
    });

    it('should detect extra folders in DB', () => {
      const dbPaths = new Set(['INBOX', 'Sent', 'OldFolder']);
      const serverPaths = new Set(['INBOX', 'Sent']);

      const result = service.auditFolderSyncFromPaths(dbPaths, serverPaths);

      expect(result.inSync).toBe(false);
      expect(result.onlyInDb).toContain('OldFolder');
      expect(result.onlyOnServer).toHaveLength(0);
    });

    it('should return inSync=true when folders match', () => {
      const dbPaths = new Set(['INBOX', 'Sent', 'Drafts']);
      const serverPaths = new Set(['INBOX', 'Sent', 'Drafts']);

      const result = service.auditFolderSyncFromPaths(dbPaths, serverPaths);

      expect(result.inSync).toBe(true);
      expect(result.onlyInDb).toHaveLength(0);
      expect(result.onlyOnServer).toHaveLength(0);
      expect(result.recommendations).toContain('All folders are in sync.');
    });
  });

  describe('cleanupOrphanedFolders', () => {
    const tenantId = 'tenant-1';
    const providerId = 'provider-1';

    it('should delete folders not on server', async () => {
      mockPrismaService.folder.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.cleanupOrphanedFolders(tenantId, providerId, ['OldFolder', 'AnotherOld']);

      expect(result.deletedCount).toBe(2);
      expect(result.deletedPaths).toEqual(['OldFolder', 'AnotherOld']);
      expect(mockPrismaService.folder.deleteMany).toHaveBeenCalledWith({
        where: { providerId, tenantId, path: { in: ['OldFolder', 'AnotherOld'] } },
      });
    });

    it('should not delete when no orphaned paths', async () => {
      const result = await service.cleanupOrphanedFolders(tenantId, providerId, []);

      expect(result.deletedCount).toBe(0);
      expect(result.deletedPaths).toEqual([]);
      expect(mockPrismaService.folder.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('getDbFolderPaths', () => {
    it('should return set of folder paths', async () => {
      mockPrismaService.folder.findMany.mockResolvedValue([
        { path: 'INBOX' },
        { path: 'Sent' },
        { path: 'Drafts' },
      ]);

      const result = await service.getDbFolderPaths('tenant-1', 'provider-1');

      expect(result.size).toBe(3);
      expect(result.has('INBOX')).toBe(true);
      expect(result.has('Sent')).toBe(true);
      expect(result.has('Drafts')).toBe(true);
    });
  });

  describe('deleteFoldersByPath', () => {
    it('should delete folders and return count', async () => {
      mockPrismaService.folder.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.deleteFoldersByPath('provider-1', 'tenant-1', ['a', 'b', 'c']);

      expect(result).toBe(3);
    });

    it('should return 0 for empty paths array', async () => {
      const result = await service.deleteFoldersByPath('provider-1', 'tenant-1', []);

      expect(result).toBe(0);
      expect(mockPrismaService.folder.deleteMany).not.toHaveBeenCalled();
    });
  });
});
