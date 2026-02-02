import { Injectable, Logger } from '@nestjs/common';
import { Folder } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaRetryService } from '../../../common/services/prisma-retry.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { folderNameToCanonical, isSystemFolder } from '../drivers/interfaces/canonical.types';

/** Folder information for syncing to database. */
export interface FolderInfo {
  path: string;
  externalId?: string;
  name: string;
  delimiter: string;
  attributes: string[];
  specialUse?: string;
  parent?: string;
  isSelectable?: boolean;
  uidNext?: number;
  uidValidity?: string;
  syncToken?: string;
}

/** Result of folder count update. */
export interface FolderCountResult {
  folderId: string;
  folderName: string;
  totalCount: number;
  unreadCount: number;
  tenantId?: string;
}

function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

const PARALLEL_FOLDER_BATCH_SIZE = 10;
const TRANSACTION_BATCH_SIZE = 50;

/**
 * FolderSyncQueryService - Shared folder database operations
 *
 * Extracted from folder-sync.service.ts (Phase 4: Service Splits).
 * Provider-agnostic DB operations: syncFoldersToDatabase, updateFolderCounts,
 * updateAllFolderCounts, getFolderKeys, audit, cleanup.
 *
 * DEBT-02: Uses PrismaRetryService for P2002/P2034 retry handling.
 */
@Injectable()
export class FolderSyncQueryService {
  private readonly logger = new Logger(FolderSyncQueryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly prismaRetry: PrismaRetryService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  /** Sync folders to database with P2002/P2034 retry via PrismaRetryService. */
  async syncFoldersToDatabase(
    tenantId: string,
    providerId: string,
    folderInfos: FolderInfo[],
  ): Promise<Folder[]> {
    const syncedFolders: Folder[] = [];
    const existingFolders = await this.prisma.folder.findMany({
      where: { providerId, tenantId },
    });

    const existingPaths = new Set(existingFolders.map((f) => f.path));
    const newPaths = new Set(folderInfos.map((f) => f.path));
    const deletedPaths = Array.from(existingPaths).filter((path) => !newPaths.has(path));

    if (deletedPaths.length > 0) {
      this.logger.log(`Deleting ${deletedPaths.length} removed folders`);
      await this.prisma.folder.deleteMany({
        where: { providerId, path: { in: deletedPaths } },
      });
    }

    const pathToIdMap = new Map<string, string>();
    const folderChunks = chunk(folderInfos, PARALLEL_FOLDER_BATCH_SIZE);

    for (const folderChunk of folderChunks) {
      const upsertPromises = folderChunk.map(async (folderInfo) => {
        const level = folderInfo.path.split(folderInfo.delimiter).length - 1;
        const isSelectable = !folderInfo.attributes.some(
          (attr) => attr === '\\Noselect' || attr === '\\NonExistent' || attr.toLowerCase() === '\\noselect',
        );

        // DEBT-02: Replace inline retry with PrismaRetryService
        const folder = await this.prismaRetry.withRetry(
          () => this.prisma.folder.upsert({
            where: { providerId_path: { providerId, path: folderInfo.path } },
            create: {
              tenantId,
              providerId,
              externalId: folderInfo.externalId,
              path: folderInfo.path,
              name: folderInfo.name,
              delimiter: folderInfo.delimiter,
              attributes: folderInfo.attributes,
              specialUse: folderInfo.specialUse,
              isSystem: isSystemFolder(folderInfo.specialUse ?? ''),
              level,
              isSelectable,
              syncToken: folderInfo.syncToken,
              uidNext: folderInfo.uidNext,
              uidValidity: folderInfo.uidValidity,
            },
            update: {
              name: folderInfo.name,
              delimiter: folderInfo.delimiter,
              attributes: folderInfo.attributes,
              specialUse: folderInfo.specialUse,
              isSystem: isSystemFolder(folderInfo.specialUse ?? ''),
              externalId: folderInfo.externalId,
              level,
              isSelectable,
              syncToken: folderInfo.syncToken ?? undefined,
              uidNext: folderInfo.uidNext ?? undefined,
              uidValidity: folderInfo.uidValidity ?? undefined,
              lastSyncedAt: new Date(),
            },
          }),
          { loggerName: 'FolderSync' },
        );
        return { folderInfo, folder };
      });

      const results = await Promise.all(upsertPromises);
      for (const { folderInfo, folder } of results) {
        pathToIdMap.set(folderInfo.path, folder.id);
        syncedFolders.push(folder);
      }
    }

    // Second pass: parallel parent relationship updates
    const foldersWithParents = folderInfos.filter((f) => f.parent && pathToIdMap.has(f.parent));
    const parentUpdateChunks = chunk(foldersWithParents, PARALLEL_FOLDER_BATCH_SIZE);

    for (const parentChunk of parentUpdateChunks) {
      const updatePromises = parentChunk.map(async (folderInfo) => {
        const parentId = pathToIdMap.get(folderInfo.parent!);
        const folderId = pathToIdMap.get(folderInfo.path);
        if (folderId && parentId) {
          // DEBT-02: Replace inline retry with PrismaRetryService
          await this.prismaRetry.withRetry(
            () => this.prisma.folder.update({
              where: { id_tenantId: { id: folderId, tenantId } },
              data: { parentId },
            }),
            { loggerName: 'FolderSync' },
          );
        }
      });
      await Promise.all(updatePromises);
    }

    return syncedFolders;
  }

  /** Get all folders for a provider. */
  async getFolders(tenantId: string, providerId: string): Promise<Folder[]> {
    return this.prisma.folder.findMany({
      where: { tenantId, providerId },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
  }

  /** Get folder by path. */
  async getFolderByPath(providerId: string, path: string): Promise<Folder | null> {
    return this.prisma.folder.findUnique({
      where: { providerId_path: { providerId, path } },
    });
  }

  /** Update folder counts (total and unread) for a single folder. Returns null if not found or unchanged. */
  async updateFolderCounts(providerId: string, folderPath: string, tenantId?: string): Promise<FolderCountResult | null> {
    const folder = await this.prisma.folder.findUnique({
      where: { providerId_path: { providerId, path: folderPath } },
      select: { id: true, name: true, path: true, tenantId: true, totalCount: true, unreadCount: true, specialUse: true },
    });

    if (!folder) {
      this.logger.warn(`Folder not found: ${folderPath} (provider: ${providerId})`);
      return null;
    }

    const folderKeys = this.getFolderKeys(folder);
    const emailWhereBase = { providerId, folder: { in: folderKeys }, ...(tenantId && { tenantId }) };

    const totalCount = await this.prisma.email.count({ where: emailWhereBase });
    const unreadCount = await this.prisma.email.count({ where: { ...emailWhereBase, isRead: false } });

    if (folder.totalCount === totalCount && folder.unreadCount === unreadCount) {
      return null;
    }

    await this.prisma.folder.update({
      where: { id_tenantId: { id: folder.id, tenantId: folder.tenantId } },
      data: { totalCount, unreadCount },
    });

    return { folderId: folder.id, folderName: folder.name, totalCount, unreadCount, tenantId: folder.tenantId ?? tenantId };
  }

  /** Update all folder counts for a provider using groupBy (O(5) queries instead of O(4N+1)). */
  async updateAllFolderCounts(providerId: string): Promise<void> {
    this.logger.log(`Updating folder counts for provider ${providerId}`);

    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
      select: { id: true, tenantId: true },
    });

    if (!provider) {
      this.logger.warn(`Provider ${providerId} not found, skipping folder count update`);
      return;
    }

    const folders = await this.prisma.folder.findMany({
      where: { providerId },
      select: { id: true, name: true, path: true, tenantId: true, totalCount: true, unreadCount: true, specialUse: true },
    });

    if (folders.length === 0) {
      this.logger.debug(`No folders found for provider ${providerId}`);
      return;
    }

    // Build folder key map for matching
    const folderKeyMap = new Map<string, typeof folders[0]>();
    for (const folder of folders) {
      for (const key of this.getFolderKeys(folder)) {
        folderKeyMap.set(key.toUpperCase(), folder);
      }
    }

    // Get counts via groupBy (2 queries total)
    const totalCounts = await this.prisma.email.groupBy({ by: ['folder'], where: { providerId }, _count: { id: true } });
    const unreadCounts = await this.prisma.email.groupBy({ by: ['folder'], where: { providerId, isRead: false }, _count: { id: true } });

    const totalCountMap = new Map(totalCounts.map((c) => [c.folder.toUpperCase(), c._count.id]));
    const unreadCountMap = new Map(unreadCounts.map((c) => [c.folder.toUpperCase(), c._count.id]));

    // Aggregate counts per folder
    const folderCounts = new Map<string, { total: number; unread: number }>();
    for (const folder of folders) {
      let total = 0, unread = 0;
      for (const key of this.getFolderKeys(folder)) {
        total += totalCountMap.get(key.toUpperCase()) || 0;
        unread += unreadCountMap.get(key.toUpperCase()) || 0;
      }
      folderCounts.set(folder.id, { total, unread });
    }

    // Collect changed folders
    const updates: { id: string; tenantId: string; totalCount: number; unreadCount: number }[] = [];
    const changedFolders: typeof folders = [];

    for (const folder of folders) {
      const counts = folderCounts.get(folder.id) || { total: 0, unread: 0 };
      if (folder.totalCount !== counts.total || folder.unreadCount !== counts.unread) {
        updates.push({ id: folder.id, tenantId: folder.tenantId, totalCount: counts.total, unreadCount: counts.unread });
        changedFolders.push({ ...folder, totalCount: counts.total, unreadCount: counts.unread });
      }
    }

    // Batch update in transaction (chunked to prevent memory issues)
    if (updates.length > 0) {
      for (let i = 0; i < updates.length; i += TRANSACTION_BATCH_SIZE) {
        const batch = updates.slice(i, i + TRANSACTION_BATCH_SIZE);
        await this.prisma.$transaction(
          batch.map((u) => this.prisma.folder.update({
            where: { id_tenantId: { id: u.id, tenantId: u.tenantId } },
            data: { totalCount: u.totalCount, unreadCount: u.unreadCount },
          })),
        );
      }
    }

    // Emit realtime events
    if (provider.tenantId) {
      for (const folder of changedFolders) {
        this.realtimeEvents.emitFolderCountsUpdate(provider.tenantId, {
          providerId,
          folderId: folder.id,
          folderName: folder.name,
          totalCount: folder.totalCount ?? 0,
          unreadCount: folder.unreadCount ?? 0,
          timestamp: new Date().toISOString(),
        });
      }
    }

    this.logger.log(`Updated counts for ${updates.length}/${folders.length} folders (provider: ${providerId})`);
  }

  /** Resolve folder keys for counting. Returns name, path, specialUse variants. */
  getFolderKeys(folder: { name: string; path?: string | null; specialUse?: string | null }): string[] {
    const keys = new Set<string>();
    keys.add(folder.name);
    keys.add(folder.name.toUpperCase());
    if (folder.path) {
      keys.add(folder.path);
      keys.add(folder.path.toUpperCase());
    }
    if (folder.specialUse) {
      keys.add(folder.specialUse.replace('\\', '').toUpperCase());
    }
    keys.add(folderNameToCanonical(folder.name));
    return Array.from(keys);
  }

  /** Compare DB vs server folder paths for audit. */
  auditFolderSyncFromPaths(dbPaths: Set<string>, serverPaths: Set<string>): {
    inSync: boolean;
    onlyInDb: string[];
    onlyOnServer: string[];
    recommendations: string[];
  } {
    const onlyInDb = Array.from(dbPaths).filter((p) => !serverPaths.has(p));
    const onlyOnServer = Array.from(serverPaths).filter((p) => !dbPaths.has(p));
    const inSync = onlyInDb.length === 0 && onlyOnServer.length === 0;

    const recommendations: string[] = [];
    if (onlyInDb.length > 0) recommendations.push(`${onlyInDb.length} folder(s) exist in database but not on server.`);
    if (onlyOnServer.length > 0) recommendations.push(`${onlyOnServer.length} folder(s) exist on server but not in database.`);
    if (inSync) recommendations.push('All folders are in sync.');

    return { inSync, onlyInDb, onlyOnServer, recommendations };
  }

  /** Get database folder paths for a provider. */
  async getDbFolderPaths(tenantId: string, providerId: string): Promise<Set<string>> {
    const dbFolders = await this.prisma.folder.findMany({
      where: { providerId, tenantId },
      select: { path: true },
    });
    return new Set(dbFolders.map((f) => f.path));
  }

  /** Clean up orphaned folders (exist in DB but not on server). */
  async cleanupOrphanedFolders(tenantId: string, providerId: string, orphanedPaths: string[]): Promise<{ deletedCount: number; deletedPaths: string[] }> {
    if (orphanedPaths.length === 0) return { deletedCount: 0, deletedPaths: [] };

    this.logger.log(`Cleaning up ${orphanedPaths.length} orphaned folders`);
    await this.prisma.folder.deleteMany({
      where: { providerId, tenantId, path: { in: orphanedPaths } },
    });

    return { deletedCount: orphanedPaths.length, deletedPaths: orphanedPaths };
  }

  /** Delete folders by path (used when syncing removes folders from server). */
  async deleteFoldersByPath(providerId: string, paths: string[]): Promise<number> {
    if (paths.length === 0) return 0;
    this.logger.log(`Deleting ${paths.length} folders by path`);
    const result = await this.prisma.folder.deleteMany({
      where: { providerId, path: { in: paths } },
    });
    return result.count;
  }
}
