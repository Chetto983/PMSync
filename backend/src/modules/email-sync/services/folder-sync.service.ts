import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Folder } from '@prisma/client';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { AlertingService } from '../../../common/services/alerting.service';
import { FolderSyncQueryService, FolderCountResult } from './folder-sync-query.service';
import { ImapFolderSyncService } from './imap-folder-sync.service';
import { GmailFolderService } from './gmail/gmail-folder.service';
import { MicrosoftFolderService } from './microsoft/microsoft-folder.service';
import { CORE_SYSTEM_FOLDERS } from '../drivers/interfaces/canonical.types';

export type { FolderInfo, FolderCountResult } from './folder-sync-query.service';

/** FolderSyncService - Thin facade (Phase 4 refactor from 1,653 to ~200 lines) */
@Injectable()
export class FolderSyncService {
  private readonly logger = new Logger(FolderSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisLock: RedisLockService,
    private readonly alertingService: AlertingService,
    private readonly queryService: FolderSyncQueryService,
    private readonly imapFolderSync: ImapFolderSyncService,
    private readonly gmailFolderService: GmailFolderService,
    private readonly microsoftFolderService: MicrosoftFolderService,
  ) {}

  /** Sync folders - RC-A1 protected by Redis lock */
  async syncProviderFolders(tenantId: string, providerId: string): Promise<void> {
    const lockKey = `folder-sync:${providerId}`;
    await this.redisLock.withLock(lockKey, 300000, async () => {
      const syncStartTime = Date.now();
      let alertFired = false;
      const monitorInterval = setInterval(() => {
        const durationMs = Date.now() - syncStartTime;
        if (!alertFired) {
          const alert = this.alertingService.checkLockDuration(lockKey, durationMs, 240000);
          if (alert) { alertFired = true; this.logger.warn(`[RC-A1] ${alert.message}`); }
        }
      }, 30000);
      try {
        const provider = await this.prisma.providerConfig.findUnique({ where: { id: providerId } });
        if (!provider) throw new Error(`Provider ${providerId} not found`);
        await this.routeSync(provider.providerType, tenantId, providerId);
      } finally { clearInterval(monitorInterval); }
    });
  }

  private async routeSync(type: string, tenantId: string, providerId: string): Promise<void> {
    if (type === 'imap') await this.imapFolderSync.syncImapFolders(tenantId, providerId);
    else if (type === 'google') await this.gmailFolderService.syncFolders(tenantId, providerId);
    else if (type === 'microsoft') await this.microsoftFolderService.syncMicrosoftFolders(tenantId, providerId);
    else throw new Error(`Unsupported provider type: ${type}`);
  }

  // Query operations (delegated)
  getFolders(tenantId: string, providerId: string): Promise<Folder[]> { return this.queryService.getFolders(tenantId, providerId); }
  getFolderByPath(providerId: string, path: string): Promise<Folder | null> { return this.queryService.getFolderByPath(providerId, path); }
  updateFolderCounts(providerId: string, folderPath: string, tenantId?: string): Promise<FolderCountResult | null> { return this.queryService.updateFolderCounts(providerId, folderPath, tenantId); }
  updateAllFolderCounts(providerId: string): Promise<void> { return this.queryService.updateAllFolderCounts(providerId); }

  async auditFolderSync(tenantId: string, providerId: string) {
    const dbPaths = await this.queryService.getDbFolderPaths(tenantId, providerId);
    const result = this.queryService.auditFolderSyncFromPaths(dbPaths, new Set());
    return { dbFolderCount: dbPaths.size, serverFolderCount: 0, ...result };
  }

  async cleanupOrphanedFolders(tenantId: string, providerId: string, orphanedPaths?: string[]) {
    if (orphanedPaths && orphanedPaths.length > 0) return this.queryService.cleanupOrphanedFolders(tenantId, providerId, orphanedPaths);
    const audit = await this.auditFolderSync(tenantId, providerId);
    if (audit.onlyInDb.length === 0) return { deletedCount: 0, deletedPaths: [] as string[] };
    return this.queryService.cleanupOrphanedFolders(tenantId, providerId, audit.onlyInDb);
  }

  // CRUD operations (provider-routed with RC-A8 Redis lock)
  async createFolder(tenantId: string, providerId: string, name: string, parentPath?: string): Promise<{ id: string; path: string; name: string }> {
    return this.redisLock.withLock(`folder-crud:${providerId}`, 30000, async () => {
      const provider = await this.prisma.providerConfig.findUnique({ where: { id: providerId } });
      if (!provider) throw new Error(`Provider ${providerId} not found`);
      this.logger.log(`Creating folder "${name}" for provider ${providerId}`);
      const result = await this.routeCreate(provider.providerType, providerId, name, parentPath);
      const folder = await this.prisma.folder.create({
        data: { tenantId, providerId, externalId: result.externalId, path: result.path, name, delimiter: '/', isSelectable: true, level: parentPath ? 1 : 0 },
      });
      this.logger.log(`Created folder "${name}" with id ${folder.id}`);
      return { id: folder.id, path: result.path, name };
    });
  }

  private async routeCreate(type: string, providerId: string, name: string, parentPath?: string): Promise<{ externalId: string; path: string }> {
    if (type === 'imap') return this.imapFolderSync.createImapFolder(providerId, name, parentPath);
    if (type === 'google') return this.gmailFolderService.createGmailFolder(providerId, name);
    if (type === 'microsoft') return this.microsoftFolderService.createMicrosoftFolder(providerId, name, parentPath);
    throw new Error(`Unsupported provider type: ${type}`);
  }

  async renameFolder(tenantId: string, providerId: string, folderPath: string, newName: string): Promise<{ id: string; path: string; name: string }> {
    return this.redisLock.withLock(`folder-crud:${providerId}`, 30000, async () => {
      const provider = await this.prisma.providerConfig.findFirst({ where: { id: providerId, tenantId } });
      if (!provider) throw new Error(`Provider ${providerId} not found`);
      const folder = await this.prisma.folder.findFirst({ where: { providerId, path: folderPath, tenantId } });
      if (!folder) throw new Error(`Folder not found: ${folderPath}`);
      this.logger.log(`Renaming folder "${folder.name}" to "${newName}"`);
      const newPath = await this.routeRename(provider.providerType, providerId, folderPath, folder.externalId, newName, folder.path);
      const updatedFolder = await this.prisma.folder.update({
        where: { id_tenantId: { id: folder.id, tenantId: folder.tenantId } },
        data: { name: newName, path: newPath },
      });
      return { id: updatedFolder.id, path: newPath, name: newName };
    });
  }

  private async routeRename(type: string, providerId: string, folderPath: string, externalId: string | null, newName: string, currentPath: string): Promise<string> {
    if (type === 'imap') return this.imapFolderSync.renameImapFolder(providerId, folderPath, newName);
    if (type === 'google') { await this.gmailFolderService.renameGmailFolder(providerId, externalId || folderPath, newName); return currentPath; }
    if (type === 'microsoft') { await this.microsoftFolderService.renameMicrosoftFolder(providerId, externalId || folderPath, newName); return currentPath; }
    throw new Error(`Unsupported provider type: ${type}`);
  }

  async deleteFolder(tenantId: string, providerId: string, folderPath: string): Promise<void> {
    await this.redisLock.withLock(`folder-crud:${providerId}`, 30000, async () => {
      const provider = await this.prisma.providerConfig.findFirst({ where: { id: providerId, tenantId } });
      if (!provider) throw new Error(`Provider ${providerId} not found`);
      const folder = await this.prisma.folder.findFirst({ where: { providerId, path: folderPath, tenantId } });
      if (!folder) throw new Error(`Folder not found: ${folderPath}`);
      if (folder.specialUse && CORE_SYSTEM_FOLDERS.includes(folder.specialUse)) throw new Error(`Cannot delete system folder: ${folder.specialUse}`);
      this.logger.log(`Deleting folder "${folder.name}"`);
      const emailsInFolder = await this.prisma.email.count({ where: { providerId, tenantId, folder: folderPath } });
      if (emailsInFolder > 0) {
        this.logger.log(`Moving ${emailsInFolder} emails to TRASH`);
        await this.prisma.email.updateMany({ where: { providerId, tenantId, folder: folderPath }, data: { folder: 'TRASH' } });
      }
      await this.routeDelete(provider.providerType, providerId, folderPath, folder.externalId);
      await this.prisma.folder.delete({ where: { id_tenantId: { id: folder.id, tenantId: folder.tenantId } } });
    });
  }

  private async routeDelete(type: string, providerId: string, folderPath: string, externalId: string | null): Promise<void> {
    if (type === 'imap') await this.imapFolderSync.deleteImapFolder(providerId, folderPath);
    else if (type === 'google') await this.gmailFolderService.deleteGmailFolder(providerId, externalId || folderPath);
    else if (type === 'microsoft') await this.microsoftFolderService.deleteMicrosoftFolder(providerId, externalId || folderPath);
    else throw new Error(`Unsupported provider type: ${type}`);
  }

  // ========== FOLDER MOVE OPERATIONS (API-01) ==========

  /**
   * Move a folder to a new parent or to root level.
   * Updates folder hierarchy (parentId, level) and recursively updates children levels.
   * This is a DB-only operation (no provider sync needed).
   *
   * @param folderId - The folder to move
   * @param parentId - New parent ID (null = move to root)
   * @param tenantId - Tenant ID for isolation
   * @throws NotFoundException if folder or parent not found
   * @throws ConflictException if circular reference or system folder
   */
  async moveFolder(folderId: string, parentId: string | null, tenantId: string): Promise<void> {
    // 1. Validate folder exists and belongs to tenant
    const folder = await this.prisma.folder.findFirst({
      where: { id: folderId, tenantId },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    // 2. Protect system folders
    if (folder.isSystem) {
      throw new ConflictException('Cannot move system folders');
    }

    // 3. Handle move to root
    if (parentId === null) {
      await this.prisma.folder.update({
        where: { id_tenantId: { id: folderId, tenantId } },
        data: { parentId: null, level: 0 },
      });
      await this.updateChildrenLevels(folderId, 0, tenantId);
      this.logger.log(`Moved folder ${folderId} to root`);
      return;
    }

    // 4. Validate new parent exists and belongs to tenant
    const parent = await this.prisma.folder.findFirst({
      where: { id: parentId, tenantId },
    });

    if (!parent) {
      throw new NotFoundException('Parent folder not found');
    }

    // 5. Check circular reference
    if (await this.wouldCreateCircularReference(folderId, parentId, tenantId)) {
      throw new ConflictException('Cannot create circular folder hierarchy');
    }

    // 6. Update folder parent and level
    const newLevel = parent.level + 1;
    await this.prisma.folder.update({
      where: { id_tenantId: { id: folderId, tenantId } },
      data: { parentId, level: newLevel },
    });

    // 7. Recursively update children levels
    await this.updateChildrenLevels(folderId, newLevel, tenantId);
    this.logger.log(`Moved folder ${folderId} to parent ${parentId} (level ${newLevel})`);
  }

  /**
   * Check if moving a folder to a new parent would create a circular reference.
   * Walks up the parent chain from newParentId to ensure folderId is not an ancestor.
   */
  private async wouldCreateCircularReference(
    folderId: string,
    newParentId: string,
    tenantId: string,
  ): Promise<boolean> {
    // Self-reference is circular
    if (folderId === newParentId) {
      return true;
    }

    // Walk up parent chain from newParentId
    let currentParentId: string | null | undefined = newParentId;
    while (currentParentId) {
      if (currentParentId === folderId) {
        return true; // Found folderId in ancestor chain
      }

      const parent: { parentId: string | null } | null = await this.prisma.folder.findFirst({
        where: { id: currentParentId, tenantId },
        select: { parentId: true },
      });

      currentParentId = parent?.parentId;
    }

    return false;
  }

  /**
   * Recursively update levels of all descendant folders.
   */
  private async updateChildrenLevels(
    parentFolderId: string,
    parentLevel: number,
    tenantId: string,
  ): Promise<void> {
    const children = await this.prisma.folder.findMany({
      where: { parentId: parentFolderId, tenantId },
      select: { id: true },
    });

    for (const child of children) {
      const childLevel = parentLevel + 1;
      await this.prisma.folder.update({
        where: { id_tenantId: { id: child.id, tenantId } },
        data: { level: childLevel },
      });
      // Recursively update grandchildren
      await this.updateChildrenLevels(child.id, childLevel, tenantId);
    }
  }
}
