import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { FolderSyncService } from '../folder-sync.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RedisLockService } from '../../../../common/services/redis-lock.service';
import { AlertingService } from '../../../../common/services/alerting.service';
import { FolderSyncQueryService } from '../folder-sync-query.service';
import { ImapFolderSyncService } from '../imap-folder-sync.service';
import { GmailFolderService } from '../gmail/gmail-folder.service';
import { MicrosoftFolderService } from '../microsoft/microsoft-folder.service';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock PrismaService
const mockPrismaService = {
  folder: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  providerConfig: {
    findUnique: jest.fn(),
  },
};

// Mock other services
const mockRedisLock = {
  withLock: jest.fn((key, ttl, fn) => fn()),
};

const mockAlertingService = {
  checkLockDuration: jest.fn(),
};

const mockQueryService = {
  getFolders: jest.fn(),
  getFolderByPath: jest.fn(),
  updateFolderCounts: jest.fn(),
  updateAllFolderCounts: jest.fn(),
  getDbFolderPaths: jest.fn(),
  auditFolderSyncFromPaths: jest.fn(),
  cleanupOrphanedFolders: jest.fn(),
};

const mockImapFolderSync = {
  syncImapFolders: jest.fn(),
  createImapFolder: jest.fn(),
  renameImapFolder: jest.fn(),
  deleteImapFolder: jest.fn(),
};

const mockGmailFolderService = {
  syncFolders: jest.fn(),
  createGmailFolder: jest.fn(),
  renameGmailFolder: jest.fn(),
  deleteGmailFolder: jest.fn(),
};

const mockMicrosoftFolderService = {
  syncMicrosoftFolders: jest.fn(),
  createMicrosoftFolder: jest.fn(),
  renameMicrosoftFolder: jest.fn(),
  deleteMicrosoftFolder: jest.fn(),
};

describe('FolderSyncService - Move Operations (API-01)', () => {
  let service: FolderSyncService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FolderSyncService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisLockService, useValue: mockRedisLock },
        { provide: AlertingService, useValue: mockAlertingService },
        { provide: FolderSyncQueryService, useValue: mockQueryService },
        { provide: ImapFolderSyncService, useValue: mockImapFolderSync },
        { provide: GmailFolderService, useValue: mockGmailFolderService },
        { provide: MicrosoftFolderService, useValue: mockMicrosoftFolderService },
      ],
    }).compile();

    service = module.get<FolderSyncService>(FolderSyncService);
  });

  describe('moveFolder', () => {
    const folderId = 'folder-1';
    const parentId = 'parent-1';
    const tenantId = 'tenant-1';

    it('should move folder to new parent and update level', async () => {
      mockPrismaService.folder.findFirst
        .mockResolvedValueOnce({
          id: folderId,
          tenantId,
          isSystem: false,
          level: 0,
          parentId: null,
        })
        .mockResolvedValueOnce({
          id: parentId,
          tenantId,
          level: 1,
        })
        // For circular reference check
        .mockResolvedValueOnce({ parentId: null });

      mockPrismaService.folder.update.mockResolvedValue({});
      mockPrismaService.folder.findMany.mockResolvedValue([]);

      await service.moveFolder(folderId, parentId, tenantId);

      expect(mockPrismaService.folder.update).toHaveBeenCalledWith({
        where: { id_tenantId: { id: folderId, tenantId } },
        data: { parentId, level: 2 },
      });
    });

    it('should move folder to root (parentId=null)', async () => {
      mockPrismaService.folder.findFirst.mockResolvedValue({
        id: folderId,
        tenantId,
        isSystem: false,
        level: 2,
        parentId: 'some-parent',
      });

      mockPrismaService.folder.update.mockResolvedValue({});
      mockPrismaService.folder.findMany.mockResolvedValue([]);

      await service.moveFolder(folderId, null, tenantId);

      expect(mockPrismaService.folder.update).toHaveBeenCalledWith({
        where: { id_tenantId: { id: folderId, tenantId } },
        data: { parentId: null, level: 0 },
      });
    });

    it('should throw NotFoundException if folder not found', async () => {
      mockPrismaService.folder.findFirst.mockResolvedValue(null);

      await expect(
        service.moveFolder(folderId, parentId, tenantId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if folder belongs to different tenant', async () => {
      mockPrismaService.folder.findFirst.mockResolvedValue(null);

      await expect(
        service.moveFolder(folderId, parentId, tenantId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for system folders', async () => {
      mockPrismaService.folder.findFirst.mockResolvedValue({
        id: folderId,
        tenantId,
        isSystem: true,
      });

      await expect(
        service.moveFolder(folderId, parentId, tenantId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if parent not found', async () => {
      mockPrismaService.folder.findFirst
        .mockResolvedValueOnce({
          id: folderId,
          tenantId,
          isSystem: false,
        })
        .mockResolvedValueOnce(null);

      await expect(
        service.moveFolder(folderId, parentId, tenantId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if circular reference detected (self)', async () => {
      mockPrismaService.folder.findFirst
        .mockResolvedValueOnce({
          id: folderId,
          tenantId,
          isSystem: false,
        })
        .mockResolvedValueOnce({
          id: folderId,
          tenantId,
          level: 0,
        });

      await expect(
        service.moveFolder(folderId, folderId, tenantId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if circular reference detected (ancestor)', async () => {
      const childId = 'child-1';
      const grandchildId = 'grandchild-1';

      mockPrismaService.folder.findFirst
        .mockResolvedValueOnce({
          id: folderId,
          tenantId,
          isSystem: false,
        })
        .mockResolvedValueOnce({
          id: grandchildId,
          tenantId,
          level: 2,
        })
        // Circular reference check - walking up from grandchild
        .mockResolvedValueOnce({ parentId: childId })
        .mockResolvedValueOnce({ parentId: folderId });

      await expect(
        service.moveFolder(folderId, grandchildId, tenantId),
      ).rejects.toThrow(ConflictException);
    });

    it('should recursively update children levels', async () => {
      const childId = 'child-1';

      mockPrismaService.folder.findFirst
        .mockResolvedValueOnce({
          id: folderId,
          tenantId,
          isSystem: false,
          level: 0,
        })
        .mockResolvedValueOnce({
          id: parentId,
          tenantId,
          level: 0,
        })
        // Circular reference check
        .mockResolvedValueOnce({ parentId: null });

      mockPrismaService.folder.findMany
        .mockResolvedValueOnce([{ id: childId }])
        .mockResolvedValueOnce([]);

      mockPrismaService.folder.update.mockResolvedValue({});

      await service.moveFolder(folderId, parentId, tenantId);

      // Should update parent folder and child folder
      expect(mockPrismaService.folder.update).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.folder.update).toHaveBeenCalledWith({
        where: { id_tenantId: { id: folderId, tenantId } },
        data: { parentId, level: 1 },
      });
      expect(mockPrismaService.folder.update).toHaveBeenCalledWith({
        where: { id_tenantId: { id: childId, tenantId } },
        data: { level: 2 },
      });
    });

    it('should recursively update grandchildren levels', async () => {
      const childId = 'child-1';
      const grandchildId = 'grandchild-1';

      mockPrismaService.folder.findFirst
        .mockResolvedValueOnce({
          id: folderId,
          tenantId,
          isSystem: false,
          level: 0,
        })
        .mockResolvedValueOnce({
          id: parentId,
          tenantId,
          level: 0,
        })
        // Circular reference check
        .mockResolvedValueOnce({ parentId: null });

      mockPrismaService.folder.findMany
        .mockResolvedValueOnce([{ id: childId }])
        .mockResolvedValueOnce([{ id: grandchildId }])
        .mockResolvedValueOnce([]);

      mockPrismaService.folder.update.mockResolvedValue({});

      await service.moveFolder(folderId, parentId, tenantId);

      // Should update folder (level 1), child (level 2), grandchild (level 3)
      expect(mockPrismaService.folder.update).toHaveBeenCalledTimes(3);
    });
  });

  describe('wouldCreateCircularReference (via moveFolder)', () => {
    const tenantId = 'tenant-1';

    it('should detect self-reference as circular', async () => {
      const folderId = 'folder-1';

      mockPrismaService.folder.findFirst
        .mockResolvedValueOnce({
          id: folderId,
          tenantId,
          isSystem: false,
        })
        .mockResolvedValueOnce({
          id: folderId,
          tenantId,
          level: 0,
        });

      await expect(
        service.moveFolder(folderId, folderId, tenantId),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow valid hierarchy move', async () => {
      const folderId = 'folder-a';
      const parentId = 'folder-b';

      mockPrismaService.folder.findFirst
        .mockResolvedValueOnce({
          id: folderId,
          tenantId,
          isSystem: false,
          level: 0,
        })
        .mockResolvedValueOnce({
          id: parentId,
          tenantId,
          level: 0,
        })
        // Circular reference check - parent has no ancestors
        .mockResolvedValueOnce({ parentId: null });

      mockPrismaService.folder.update.mockResolvedValue({});
      mockPrismaService.folder.findMany.mockResolvedValue([]);

      await expect(
        service.moveFolder(folderId, parentId, tenantId),
      ).resolves.not.toThrow();
    });
  });
});
