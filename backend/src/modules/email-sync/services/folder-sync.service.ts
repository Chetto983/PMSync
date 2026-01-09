import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ImapService } from '../../providers/services/imap.service';
import { Folder } from '@prisma/client';
import axios from 'axios';
import { google } from 'googleapis';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { ProviderTokenService } from './provider-token.service';
import { GmailFolderService } from './gmail/gmail-folder.service';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { folderNameToCanonical, isSystemFolder, CORE_SYSTEM_FOLDERS } from '../drivers/interfaces/canonical.types';

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

/**
 * Split an array into chunks of specified size for parallel processing
 * Performance optimization for batch database operations
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Default concurrency for parallel folder operations
const PARALLEL_FOLDER_BATCH_SIZE = 10;

@Injectable()
export class FolderSyncService {
  private readonly logger = new Logger(FolderSyncService.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

  constructor(
    private readonly prisma: PrismaService,
    private readonly imapService: ImapService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly providerTokenService: ProviderTokenService,
    private readonly gmailFolderService: GmailFolderService,
    private readonly redisLock: RedisLockService,
  ) { }

  /**
   * Sync folders for any provider type
   * RC-A1: Protected by Redis lock to prevent concurrent folder syncs
   */
  async syncProviderFolders(tenantId: string, providerId: string): Promise<void> {
    const lockKey = `folder-sync:${providerId}`;
    // FIX CRIT-4 (2025-01-05): 60s was too short - nested folder fetching can take >60s
    // Lock expires mid-sync → concurrent sync starts → duplicate DB writes → P2002 errors
    const lockTtl = 300000; // 5 minutes - safe margin for large mailboxes

    await this.redisLock.withLock(lockKey, lockTtl, async () => {
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider) {
        throw new Error(`Provider ${providerId} not found`);
      }

      if (provider.providerType === 'imap') {
        await this.syncImapFolders(tenantId, providerId);
      } else if (provider.providerType === 'google') {
        await this.syncGmailFolders(tenantId, providerId);
      } else if (provider.providerType === 'microsoft') {
        await this.syncMicrosoftFolders(tenantId, providerId);
      } else {
        throw new Error(`Unsupported provider type: ${provider.providerType}`);
      }
    });
  }

  /**
   * Synchronize folders from IMAP server to database
   */
  async syncImapFolders(
    tenantId: string,
    providerId: string,
  ): Promise<Folder[]> {
    this.logger.log(
      `Starting IMAP folder sync for provider ${providerId} (tenant: ${tenantId})`,
    );

    try {
      // Get provider config
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider) {
        throw new Error(`Provider ${providerId} not found`);
      }

      if (provider.providerType !== 'imap') {
        throw new Error(
          `Provider ${providerId} is not an IMAP provider`,
        );
      }

      // Decrypt IMAP credentials
      const imapCreds = this.providerTokenService.getImapCredentials(provider);

      // List folders from IMAP server
      const imapFolders = await this.imapService.listFolders({
        host: imapCreds.host,
        port: imapCreds.port,
        username: imapCreds.username,
        password: imapCreds.password,
        useTls: imapCreds.useTls,
      });

      this.logger.log(
        `Found ${imapFolders.length} folders on IMAP server for provider ${providerId}`,
      );

      // Parse folder information
      const folderInfos = this.parseImapFolders(imapFolders);

      // Sync folders to database
      const syncedFolders = await this.syncFoldersToDatabase(
        tenantId,
        providerId,
        folderInfos,
      );

      // Update last synced timestamp
      await this.prisma.providerConfig.update({
        where: { id: providerId },
        data: { lastSyncedAt: new Date() },
      });

      this.logger.log(
        `Synced ${syncedFolders.length} folders for provider ${providerId}`,
      );

      return syncedFolders;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Error syncing IMAP folders for provider ${providerId}: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  /**
   * Parse IMAP folder list response
   */
  private parseImapFolders(imapFolders: any[]): FolderInfo[] {
    const folderInfos: FolderInfo[] = [];

    for (const folder of imapFolders) {
      // folder.path is the full path
      // folder.delimiter is the delimiter (usually "/")
      // folder.attributes is an array of attributes

      const path = folder.path || folder.name;
      if (!path) {
        this.logger.warn(`Skipping IMAP folder with no path or name: ${JSON.stringify(folder)}`);
        continue;
      }
      const delimiter = folder.delimiter || '/';
      const attributes = folder.attributes || [];
      const syncToken = folder.uidNext ? String(folder.uidNext) : undefined;

      // Extract folder name from path
      const parts = path.split(delimiter);
      const name = parts[parts.length - 1] || path;

      // Determine parent folder path
      let parent: string | undefined;
      if (parts.length > 1) {
        parent = parts.slice(0, -1).join(delimiter);
      }

      // Determine special use based on folder name and attributes
      const specialUse = this.determineSpecialUse(path, name, attributes);

      // Check if folder is selectable
      const isSelectable = !attributes.some(
        (attr: string) =>
          attr === '\\Noselect' ||
          attr === '\\NonExistent' ||
          attr.toLowerCase() === '\\noselect',
      );

      folderInfos.push({
        path,
        externalId: path,
        name,
        delimiter,
        attributes,
        specialUse,
        parent,
        isSelectable,
        uidNext: folder.uidNext,
        uidValidity: folder.uidValidity,
        syncToken,
      });
    }

    return folderInfos;
  }

  /**
   * Determine special folder use based on path, name and attributes
   */
  private determineSpecialUse(
    path: string,
    name: string,
    attributes: string[],
  ): string | undefined {
    // Check IMAP special-use attributes (RFC 6154)
    const specialUseMap: Record<string, string> = {
      '\\All': 'ALL',
      '\\Archive': 'ARCHIVE',
      '\\Drafts': 'DRAFTS',
      '\\Flagged': 'FLAGGED',
      '\\Junk': 'JUNK',
      '\\Sent': 'SENT',
      '\\Trash': 'TRASH',
      '\\Important': 'IMPORTANT',
    };

    for (const attr of attributes) {
      if (specialUseMap[attr]) {
        return specialUseMap[attr];
      }
    }

    // Fallback: Use centralized heuristic matching from canonical.types
    return folderNameToCanonical(name);
  }

  /**
   * Sync folders to database
   */
  private async syncFoldersToDatabase(
    tenantId: string,
    providerId: string,
    folderInfos: FolderInfo[],
  ): Promise<Folder[]> {
    const syncedFolders: Folder[] = [];

    // Get existing folders from database
    const existingFolders = await this.prisma.folder.findMany({
      where: { providerId, tenantId },
    });

    const existingPaths = new Set(existingFolders.map((f) => f.path));
    const newPaths = new Set(folderInfos.map((f) => f.path));

    // Delete folders that no longer exist on server
    const deletedPaths = Array.from(existingPaths).filter(
      (path) => !newPaths.has(path),
    );

    if (deletedPaths.length > 0) {
      this.logger.log(`Deleting ${deletedPaths.length} removed folders`);
      await this.prisma.folder.deleteMany({
        where: {
          providerId,
          path: { in: deletedPaths },
        },
      });
    }

    // Build a map of path to parent folder ID
    const pathToIdMap = new Map<string, string>();

    // Performance optimization: First pass with parallel folder upserts in batches
    // HIGH-2 FIX (2025-01-05): Add P2002 retry for parallel upserts
    const folderChunks = chunk(folderInfos, PARALLEL_FOLDER_BATCH_SIZE);
    const MAX_UPSERT_RETRIES = 3;

    for (const folderChunk of folderChunks) {
      const upsertPromises = folderChunk.map(async (folderInfo) => {
        const level = folderInfo.path.split(folderInfo.delimiter).length - 1;

        // HIGH-2 FIX: Wrap individual upsert with P2002 retry logic
        let retryCount = 0;
        while (true) {
          try {
            const folder = await this.prisma.folder.upsert({
              where: {
                providerId_path: {
                  providerId,
                  path: folderInfo.path,
                },
              },
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
                isSelectable: !folderInfo.attributes.some(
                  (attr) =>
                    attr === '\\Noselect' ||
                    attr === '\\NonExistent' ||
                    attr.toLowerCase() === '\\noselect',
                ),
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
                isSelectable: !folderInfo.attributes.some(
                  (attr) =>
                    attr === '\\Noselect' ||
                    attr === '\\NonExistent' ||
                    attr.toLowerCase() === '\\noselect',
                ),
                syncToken: folderInfo.syncToken ?? undefined,
                uidNext: folderInfo.uidNext ?? undefined,
                uidValidity: folderInfo.uidValidity ?? undefined,
                lastSyncedAt: new Date(),
              },
            });

            return { folderInfo, folder };
          } catch (error: unknown) {
            // HIGH-2 FIX: Handle P2002 unique constraint violation
            const isPrismaError = error && typeof error === 'object' && 'code' in error;
            const errorCode = isPrismaError ? (error as { code: string }).code : null;

            // FIX: Also retry on P2034 (deadlock/write conflict)
            if ((errorCode === 'P2002' || errorCode === 'P2034') && retryCount < MAX_UPSERT_RETRIES) {
              retryCount++;
              this.logger.warn(
                `${errorCode} on folder ${folderInfo.path} (attempt ${retryCount}/${MAX_UPSERT_RETRIES}), retrying...`
              );
              await new Promise(resolve => setTimeout(resolve, 50 * retryCount));
              continue;
            }
            throw error;
          }
        }
      });

      const results = await Promise.all(upsertPromises);
      for (const { folderInfo, folder } of results) {
        pathToIdMap.set(folderInfo.path, folder.id);
        syncedFolders.push(folder);
      }
    }

    // Performance optimization: Second pass with parallel parent relationship updates
    const foldersWithParents = folderInfos.filter(
      (f) => f.parent && pathToIdMap.has(f.parent),
    );
    const parentUpdateChunks = chunk(foldersWithParents, PARALLEL_FOLDER_BATCH_SIZE);

    for (const parentChunk of parentUpdateChunks) {
      const updatePromises = parentChunk.map(async (folderInfo) => {
        const parentId = pathToIdMap.get(folderInfo.parent!);
        const folderId = pathToIdMap.get(folderInfo.path);

        if (folderId && parentId) {
          // FIX: Add P2002/P2034 retry for parent updates
          let retryCount = 0;
          while (retryCount < MAX_UPSERT_RETRIES) {
            try {
              await this.prisma.folder.update({
                where: { id_tenantId: { id: folderId, tenantId } },
                data: { parentId },
              });
              break;
            } catch (error: unknown) {
              const isPrismaError = error && typeof error === 'object' && 'code' in error;
              const errorCode = isPrismaError ? (error as { code: string }).code : null;
              if ((errorCode === 'P2002' || errorCode === 'P2034') && retryCount < MAX_UPSERT_RETRIES - 1) {
                retryCount++;
                await new Promise(resolve => setTimeout(resolve, 50 * retryCount));
                continue;
              }
              throw error;
            }
          }
        }
      });

      await Promise.all(updatePromises);
    }

    return syncedFolders;
  }

  /**
   * Sync Gmail labels as folders
   */
  async syncGmailFolders(tenantId: string, providerId: string): Promise<void> {
    this.logger.log(`Starting Gmail folder (labels) sync for provider ${providerId}`);

    try {
      const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

      // Create OAuth2 client with access token
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
      const labels = labelsResponse.data.labels || [];
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });
      const syncToken =
        (provider?.metadata as any)?.lastSyncToken ??
        (provider?.metadata as any)?.historyId ??
        undefined;

      this.logger.log(`Found ${labels.length} Gmail labels for provider ${providerId}`);

      const existingFolders = await (this.prisma as any).folder.findMany({
        where: { providerId, tenantId },
      });

      const SYSTEM_FOLDER_LABEL_IDS = new Set(['INBOX', 'SENT', 'DRAFT', 'TRASH', 'SPAM']);
      const SKIP_LABEL_IDS = new Set([
        'CATEGORY_PERSONAL',
        'UNREAD',
        'STARRED',
        'IMPORTANT',
        'CHAT',
        'MUTED',
        'YELLOW_STAR',
        'BLUE_STAR',
        'GREEN_STAR',
        'RED_STAR',
        'ORANGE_STAR',
        'PURPLE_STAR',
      ]);

      const shouldSyncLabel = (label: { id?: string | null; name?: string | null; type?: string | null }) => {
        if (!label.id || !label.name) return false;
        if (SKIP_LABEL_IDS.has(label.id)) return false;
        const isCategory = label.id.startsWith('CATEGORY_');
        if (label.type === 'system' && !SYSTEM_FOLDER_LABEL_IDS.has(label.id) && !isCategory) {
          return false;
        }
        return true;
      };

      const existingPaths = new Set<string>(existingFolders.map((f: any) => f.path as string));
      const newPaths = new Set<string>(
        labels
          .filter((l) => shouldSyncLabel(l as any))
          .map((label) => this.gmailFolderService.getFolderPathForLabel(label.id!, label.name!)),
      );

      const deletedPaths: string[] = [];
      existingPaths.forEach((path) => {
        if (!newPaths.has(path)) {
          deletedPaths.push(path);
        }
      });

      if (deletedPaths.length > 0) {
        this.logger.log(`Deleting ${deletedPaths.length} removed Gmail labels`);
        await (this.prisma as any).folder.deleteMany({
          where: { providerId, path: { in: deletedPaths } },
        });
      }

      for (const label of labels) {
        if (!shouldSyncLabel(label)) continue;

        const folderPath = this.gmailFolderService.getFolderPathForLabel(label.id!, label.name!);
        const folderName = folderPath;
        const specialUse = this.gmailFolderService.getSpecialUseForLabel(label.id!);
        const isSelectable = label.type !== 'system' || specialUse !== undefined;
        const isSystem = isSystemFolder(specialUse ?? '');

        // FIX: Add P2002/P2034 retry for Gmail label upserts
        let retryCount = 0;
        const MAX_RETRIES = 3;
        while (retryCount < MAX_RETRIES) {
          try {
            await (this.prisma as any).folder.upsert({
              where: { providerId_path: { providerId, path: folderPath } },
              create: {
                tenantId,
                providerId,
                externalId: label.id!,
                path: folderPath,
                name: folderName,
                delimiter: '/',
                specialUse,
                isSystem,
                isSelectable,
                totalCount: label.messagesTotal || 0,
                unreadCount: label.messagesUnread || 0,
                level: 0,
                syncToken,
              },
              update: {
                name: folderName,
                specialUse,
                externalId: label.id!,
                isSystem,
                isSelectable,
                totalCount: label.messagesTotal || 0,
                unreadCount: label.messagesUnread || 0,
                lastSyncedAt: new Date(),
                syncToken: syncToken ?? undefined,
              },
            });
            break;
          } catch (error: unknown) {
            const isPrismaError = error && typeof error === 'object' && 'code' in error;
            const errorCode = isPrismaError ? (error as { code: string }).code : null;
            if ((errorCode === 'P2002' || errorCode === 'P2034') && retryCount < MAX_RETRIES - 1) {
              retryCount++;
              await new Promise(resolve => setTimeout(resolve, 50 * retryCount));
              continue;
            }
            throw error;
          }
        }
      }

      this.logger.log(`Synced ${labels.length} Gmail labels as folders for provider ${providerId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error syncing Gmail folders for provider ${providerId}: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Sync Microsoft mail folders
   */
  async syncMicrosoftFolders(tenantId: string, providerId: string): Promise<void> {
    this.logger.log(`Starting Microsoft folder sync for provider ${providerId}`);

    try {
      const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

      const { folders, deltaLink } = await this.fetchMicrosoftFolders(accessToken);
      this.logger.log(`Found ${folders.length} Microsoft folders for provider ${providerId}`);

      const existingFolders = await (this.prisma as any).folder.findMany({
        where: { providerId, tenantId },
      });

      const existingPaths = new Set<string>(existingFolders.map((f: any) => f.path as string));
      const newPaths = new Set<string>(
        folders
          .filter((f: any) => f.displayName)
          .map((f: any) => {
            const specialUse = this.determineMicrosoftFolderType(f.displayName as string);
            return specialUse || (f.displayName as string);
          }),
      );

      const deletedPaths: string[] = [];
      existingPaths.forEach((path) => {
        if (!newPaths.has(path)) {
          deletedPaths.push(path);
        }
      });

      if (deletedPaths.length > 0) {
        this.logger.log(`Deleting ${deletedPaths.length} removed Microsoft folders`);
        await (this.prisma as any).folder.deleteMany({
          where: { providerId, path: { in: deletedPaths } },
        });
      }

      // Performance optimization: Parallel folder upserts in batches
      const validFolders = folders.filter((f) => f.id && f.displayName);
      const folderChunks = chunk(validFolders, PARALLEL_FOLDER_BATCH_SIZE);
      const MAX_UPSERT_RETRIES = 3;

      for (const folderChunk of folderChunks) {
        const upsertPromises = folderChunk.map(async (folder) => {
          const specialUse = this.determineMicrosoftFolderType(folder.displayName);
          const folderPath = specialUse || folder.displayName;

          // FIX: Add P2002/P2034 retry wrapper for upsert operations
          let retryCount = 0;
          while (retryCount < MAX_UPSERT_RETRIES) {
            try {
              // Use canonical path for known system folders; keep displayName for custom folders.
              await (this.prisma as any).folder.upsert({
                where: { providerId_path: { providerId, path: folderPath } },
                create: {
                  tenantId,
                  providerId,
                  externalId: folder.id,
                  path: folderPath,
                  name: folder.displayName,
                  delimiter: '/',
                  specialUse,
                  isSelectable: true,
                  totalCount: folder.totalItemCount || 0,
                  unreadCount: folder.unreadItemCount || 0,
                  level: folder.parentFolderId ? 1 : 0,
                  syncToken: deltaLink,
                  lastSyncedAt: new Date(),
                },
                update: {
                  name: folder.displayName,
                  externalId: folder.id,
                  specialUse,
                  totalCount: folder.totalItemCount || 0,
                  unreadCount: folder.unreadItemCount || 0,
                  lastSyncedAt: new Date(),
                  syncToken: deltaLink ?? undefined,
                },
              });
              break; // Success, exit retry loop
            } catch (error: unknown) {
              const isPrismaError = error && typeof error === 'object' && 'code' in error;
              const errorCode = isPrismaError ? (error as { code: string }).code : null;
              // FIX: Retry on P2002 (unique constraint) and P2034 (deadlock/write conflict)
              if ((errorCode === 'P2002' || errorCode === 'P2034') && retryCount < MAX_UPSERT_RETRIES - 1) {
                retryCount++;
                this.logger.warn(
                  `${errorCode} on Microsoft folder ${folderPath} (attempt ${retryCount}/${MAX_UPSERT_RETRIES}), retrying...`
                );
                await new Promise(resolve => setTimeout(resolve, 50 * retryCount));
                continue;
              }
              throw error;
            }
          }
        });

        await Promise.all(upsertPromises);
      }

      this.logger.log(`Synced ${validFolders.length} Microsoft folders for provider ${providerId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error syncing Microsoft folders for provider ${providerId}: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  private determineMicrosoftFolderType(folderName: string): string | undefined {
    // metadata-based detection is handled by the driver, but here we deal with display names
    // Use the centralized heuristic from canonical.types (Common with IMAP)
    const canonical = folderNameToCanonical(folderName);
    // Only return specialUse for known system folders, not custom folders
    // This ensures custom folders have specialUse = null/undefined
    return isSystemFolder(canonical) ? canonical : undefined;
  }

  private async fetchMicrosoftFolders(
    accessToken: string,
  ): Promise<{ folders: any[]; deltaLink?: string }> {
    const headers = { Authorization: `Bearer ${accessToken}` };
    let url = `${this.GRAPH_API_BASE}/me/mailFolders/delta`;
    const folders: any[] = [];
    let deltaLink: string | undefined;

    while (url) {
      const response = await axios.get(url, { headers });
      const value = response.data.value || [];
      folders.push(...value);
      deltaLink = response.data['@odata.deltaLink'] || deltaLink;
      url = response.data['@odata.nextLink'] || '';
    }

    return { folders, deltaLink };
  }

  /**
   * Get all folders for a provider
   */
  async getFolders(
    tenantId: string,
    providerId: string,
  ): Promise<Folder[]> {
    return this.prisma.folder.findMany({
      where: { tenantId, providerId },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Get folder by path
   */
  async getFolderByPath(
    providerId: string,
    path: string,
  ): Promise<Folder | null> {
    return this.prisma.folder.findUnique({
      where: {
        providerId_path: {
          providerId,
          path,
        },
      },
    });
  }

  /**
   * Update folder counts (total and unread)
   */
  async updateFolderCounts(
    providerId: string,
    folderPath: string,
    tenantId?: string,
  ): Promise<{
    folderId: string;
    folderName: string;
    totalCount: number;
    unreadCount: number;
    tenantId?: string;
  } | null> {
    const folder = await this.prisma.folder.findUnique({
      where: {
        providerId_path: {
          providerId,
          path: folderPath,
        },
      },
      select: {
        id: true,
        name: true,
        path: true,
        tenantId: true,
        totalCount: true,
        unreadCount: true,
        specialUse: true,
      },
    });

    if (!folder) {
      this.logger.warn(
        `Folder not found: ${folderPath} (provider: ${providerId})`,
      );
      return null;
    }

    const folderKeys = this.getFolderKeys(folder);

    const emailWhereBase = {
      providerId,
      folder: { in: folderKeys },
      ...(tenantId && { tenantId }),
    };

    const totalCount = await this.prisma.email.count({
      where: emailWhereBase,
    });

    // Count unread emails in folder
    const unreadCount = await this.prisma.email.count({
      where: {
        ...emailWhereBase,
        isRead: false,
      },
    });

    // Skip DB + realtime if counts unchanged (debounce)
    if (folder.totalCount === totalCount && folder.unreadCount === unreadCount) {
      return null;
    }

    await this.prisma.folder.update({
      where: { id_tenantId: { id: folder.id, tenantId: folder.tenantId } },
      data: {
        totalCount,
        unreadCount,
      },
    });

    return {
      folderId: folder.id,
      folderName: folder.name,
      totalCount,
      unreadCount,
      tenantId: folder.tenantId ?? tenantId,
    };
  }

  /**
   * Update all folder counts for a provider
   * Performance fix (N1-3): Uses groupBy to batch count queries instead of N+1 pattern
   * Reduces from 4N+1 queries to ~5 queries regardless of folder count
   */
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

    // Fetch all folders in one query
    const folders = await this.prisma.folder.findMany({
      where: { providerId },
      select: {
        id: true,
        name: true,
        path: true,
        tenantId: true,
        totalCount: true,
        unreadCount: true,
        specialUse: true,
      },
    });

    if (folders.length === 0) {
      this.logger.debug(`No folders found for provider ${providerId}`);
      return;
    }

    // Build a map of all folder keys to folder IDs for matching
    const folderKeyMap = new Map<string, typeof folders[0]>();
    for (const folder of folders) {
      const keys = this.getFolderKeys(folder);
      for (const key of keys) {
        folderKeyMap.set(key.toUpperCase(), folder);
      }
    }

    // Get all counts grouped by folder in 2 queries (total and unread)
    // Note: Prisma groupBy requires exact match, so we group by folder field
    const totalCounts = await this.prisma.email.groupBy({
      by: ['folder'],
      where: { providerId },
      _count: { id: true },
    });

    const unreadCounts = await this.prisma.email.groupBy({
      by: ['folder'],
      where: { providerId, isRead: false },
      _count: { id: true },
    });

    // Build count maps
    const totalCountMap = new Map(
      totalCounts.map((c) => [c.folder.toUpperCase(), c._count.id]),
    );
    const unreadCountMap = new Map(
      unreadCounts.map((c) => [c.folder.toUpperCase(), c._count.id]),
    );

    // Aggregate counts per folder (handling multiple folder keys)
    const folderCounts = new Map<string, { total: number; unread: number }>();
    for (const folder of folders) {
      const keys = this.getFolderKeys(folder);
      let total = 0;
      let unread = 0;
      for (const key of keys) {
        total += totalCountMap.get(key.toUpperCase()) || 0;
        unread += unreadCountMap.get(key.toUpperCase()) || 0;
      }
      folderCounts.set(folder.id, { total, unread });
    }

    // Batch update all folders that changed
    const updates: { id: string; tenantId: string; totalCount: number; unreadCount: number }[] = [];
    const changedFolders: typeof folders = [];

    for (const folder of folders) {
      const counts = folderCounts.get(folder.id) || { total: 0, unread: 0 };
      if (folder.totalCount !== counts.total || folder.unreadCount !== counts.unread) {
        updates.push({
          id: folder.id,
          tenantId: folder.tenantId,
          totalCount: counts.total,
          unreadCount: counts.unread,
        });
        changedFolders.push({ ...folder, totalCount: counts.total, unreadCount: counts.unread });
      }
    }

    // Batch update in a transaction
    // FIX Phase 1.5: Chunk updates to prevent unbounded transaction array
    // Large transactions can cause memory issues and timeouts
    const TRANSACTION_BATCH_SIZE = 50;
    if (updates.length > 0) {
      // Process in batches to avoid transaction size limits
      for (let i = 0; i < updates.length; i += TRANSACTION_BATCH_SIZE) {
        const batch = updates.slice(i, i + TRANSACTION_BATCH_SIZE);
        await this.prisma.$transaction(
          batch.map((u) =>
            this.prisma.folder.update({
              where: { id_tenantId: { id: u.id, tenantId: u.tenantId } },
              data: { totalCount: u.totalCount, unreadCount: u.unreadCount },
            }),
          ),
        );
      }
    }

    // Emit realtime events for changed folders
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

    this.logger.log(
      `Updated counts for ${updates.length}/${folders.length} folders (provider: ${providerId})`,
    );
  }

  /**
   * Resolve folder keys used for counting/filtering.
   * Returns BOTH the original folder name AND normalized specialUse to match
   * emails stored with either the display name or the normalized key.
   */
  private getFolderKeys(folder: {
    name: string;
    path?: string | null;
    specialUse?: string | null;
  }): string[] {
    const keys = new Set<string>();

    // Always include the original folder name (emails are stored with display name)
    keys.add(folder.name);
    keys.add(folder.name.toUpperCase());

    if (folder.path) {
      keys.add(folder.path);
      keys.add(folder.path.toUpperCase());
    }

    // Also include the normalized specialUse if present
    if (folder.specialUse) {
      keys.add(folder.specialUse.replace('\\', '').toUpperCase());
    }

    // Also include the normalized version of the folder name
    // Uses folderNameToCanonical from canonical.types.ts (75+ folder names, 5 languages)
    const normalized = folderNameToCanonical(folder.name);
    keys.add(normalized);

    return Array.from(keys);
  }

  // ========== FOLDER AUDIT ==========

  /**
   * Audit folder sync status between database and provider
   * Returns discrepancies and sync recommendations
   */
  async auditFolderSync(
    tenantId: string,
    providerId: string,
  ): Promise<{
    dbFolderCount: number;
    serverFolderCount: number;
    inSync: boolean;
    onlyInDb: string[];
    onlyOnServer: string[];
    recommendations: string[];
  }> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    this.logger.log(`Auditing folder sync for provider ${providerId} (${provider.email})`);

    // Get folders from database
    const dbFolders = await this.prisma.folder.findMany({
      where: { providerId, tenantId },
      select: { path: true, name: true, specialUse: true },
    });
    const dbPaths = new Set(dbFolders.map((f) => f.path));

    // Get folders from server
    let serverPaths: Set<string>;
    let serverFolders: { path: string; name: string }[] = [];

    if (provider.providerType === 'imap') {
      const imapCreds = this.providerTokenService.getImapCredentials(provider);
      const imapFolders = await this.imapService.listFolders({
        host: imapCreds.host,
        port: imapCreds.port,
        username: imapCreds.username,
        password: imapCreds.password,
        useTls: imapCreds.useTls,
      });
      serverFolders = imapFolders.map((f) => ({ path: f.path, name: f.name }));
      serverPaths = new Set(serverFolders.map((f) => f.path));
    } else if (provider.providerType === 'google') {
      const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
      const labels = labelsResponse.data.labels || [];
      serverFolders = labels
        .filter((label): label is { id: string; name: string } => !!label.id && !!label.name)
        .map((label) => ({
          path: this.gmailFolderService.getFolderPathForLabel(label.id, label.name),
          name: label.name,
        }));
      serverPaths = new Set(serverFolders.map((f) => f.path));
    } else if (provider.providerType === 'microsoft') {
      const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);
      const { folders } = await this.fetchMicrosoftFolders(accessToken);
      serverFolders = folders
        .filter((folder: any) => !!folder.displayName)
        .map((folder: any) => {
          const displayName = folder.displayName as string;
          const specialUse = this.determineMicrosoftFolderType(displayName);
          return {
            path: specialUse || displayName,
            name: displayName,
          };
        });
      serverPaths = new Set(serverFolders.map((f) => f.path));
    } else {
      this.logger.warn(`Audit for ${provider.providerType} not implemented`);
      serverPaths = dbPaths;
    }

    // Find discrepancies
    const onlyInDb = Array.from(dbPaths).filter((p) => !serverPaths.has(p));
    const onlyOnServer = Array.from(serverPaths).filter((p) => !dbPaths.has(p));
    const inSync = onlyInDb.length === 0 && onlyOnServer.length === 0;

    // Generate recommendations
    const recommendations: string[] = [];
    if (onlyInDb.length > 0) {
      recommendations.push(
        `${onlyInDb.length} folder(s) exist in database but not on server. Run folder sync to clean up.`,
      );
      this.logger.warn(`Orphaned DB folders: ${onlyInDb.join(', ')}`);
    }
    if (onlyOnServer.length > 0) {
      recommendations.push(
        `${onlyOnServer.length} folder(s) exist on server but not in database. Run folder sync to add.`,
      );
      this.logger.warn(`Missing server folders: ${onlyOnServer.join(', ')}`);
    }
    if (inSync) {
      recommendations.push('All folders are in sync.');
    }

    return {
      dbFolderCount: dbFolders.length,
      serverFolderCount: serverPaths.size,
      inSync,
      onlyInDb,
      onlyOnServer,
      recommendations,
    };
  }

  /**
   * Clean up orphaned folders (exist in DB but not on server)
   */
  async cleanupOrphanedFolders(
    tenantId: string,
    providerId: string,
  ): Promise<{ deletedCount: number; deletedPaths: string[] }> {
    const audit = await this.auditFolderSync(tenantId, providerId);

    if (audit.onlyInDb.length === 0) {
      return { deletedCount: 0, deletedPaths: [] };
    }

    this.logger.log(`Cleaning up ${audit.onlyInDb.length} orphaned folders`);

    await this.prisma.folder.deleteMany({
      where: {
        providerId,
        tenantId,
        path: { in: audit.onlyInDb },
      },
    });

    return {
      deletedCount: audit.onlyInDb.length,
      deletedPaths: audit.onlyInDb,
    };
  }

  // ========== FOLDER CRUD OPERATIONS ==========
  // RC-A8: All CRUD operations protected by Redis locks

  /**
   * Create a new folder on the mail server and in database
   * RC-A8: Protected by Redis lock to prevent concurrent folder operations
   */
  async createFolder(
    tenantId: string,
    providerId: string,
    name: string,
    parentPath?: string,
  ): Promise<{ id: string; path: string; name: string }> {
    const lockKey = `folder-crud:${providerId}`;
    const lockTtl = 30000; // 30 seconds

    return this.redisLock.withLock(lockKey, lockTtl, async () => {
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider) {
        throw new Error(`Provider ${providerId} not found`);
      }

      this.logger.log(`Creating folder "${name}" for provider ${providerId} (type: ${provider.providerType})`);

      let result: { externalId: string; path: string };

      if (provider.providerType === 'imap') {
        result = await this.createImapFolder(providerId, name, parentPath);
      } else if (provider.providerType === 'google') {
        result = await this.createGmailLabel(providerId, name);
      } else if (provider.providerType === 'microsoft') {
        result = await this.createMicrosoftFolder(providerId, name, parentPath);
      } else {
        throw new Error(`Unsupported provider type: ${provider.providerType}`);
      }

      // Save to database
      const folder = await this.prisma.folder.create({
        data: {
          tenantId,
          providerId,
          externalId: result.externalId,
          path: result.path,
          name,
          delimiter: '/',
          isSelectable: true,
          level: parentPath ? 1 : 0,
        },
      });

      this.logger.log(`Created folder "${name}" with id ${folder.id}`);
      return { id: folder.id, path: result.path, name };
    });
  }

  /**
   * Rename a folder on the mail server and in database
   * RC-A8: Protected by Redis lock to prevent concurrent folder operations
   */
  async renameFolder(
    tenantId: string,
    providerId: string,
    folderPath: string,
    newName: string,
  ): Promise<{ id: string; path: string; name: string }> {
    const lockKey = `folder-crud:${providerId}`;
    const lockTtl = 30000; // 30 seconds

    return this.redisLock.withLock(lockKey, lockTtl, async () => {
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider) {
        throw new Error(`Provider ${providerId} not found`);
      }

      const folder = await this.prisma.folder.findUnique({
        where: { providerId_path: { providerId, path: folderPath } },
      });

      if (!folder) {
        throw new Error(`Folder not found: ${folderPath}`);
      }

      this.logger.log(`Renaming folder "${folder.name}" to "${newName}" for provider ${providerId}`);

      let newPath: string;

      if (provider.providerType === 'imap') {
        newPath = await this.renameImapFolder(providerId, folderPath, newName);
      } else if (provider.providerType === 'google') {
        await this.renameGmailLabel(providerId, folder.externalId || folderPath, newName);
        newPath = folder.path; // Gmail label IDs don't change on rename
      } else if (provider.providerType === 'microsoft') {
        await this.renameMicrosoftFolder(providerId, folder.externalId || folderPath, newName);
        newPath = folder.path; // Microsoft folder IDs don't change on rename
      } else {
        throw new Error(`Unsupported provider type: ${provider.providerType}`);
      }

      // Update database
      const updatedFolder = await this.prisma.folder.update({
        where: { id_tenantId: { id: folder.id, tenantId: folder.tenantId } },
        data: {
          name: newName,
          path: newPath,
        },
      });

      this.logger.log(`Renamed folder to "${newName}" with path ${newPath}`);
      return { id: updatedFolder.id, path: newPath, name: newName };
    });
  }

  /**
   * Delete a folder from the mail server and database
   *
   * FIX 1.1: Added safeguard to move emails to INBOX before deletion
   * to prevent orphaned emails (emails.folder pointing to non-existent folder)
   * RC-A8: Protected by Redis lock to prevent concurrent folder operations
   */
  async deleteFolder(
    tenantId: string,
    providerId: string,
    folderPath: string,
  ): Promise<void> {
    const lockKey = `folder-crud:${providerId}`;
    const lockTtl = 30000; // 30 seconds

    await this.redisLock.withLock(lockKey, lockTtl, async () => {
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider) {
        throw new Error(`Provider ${providerId} not found`);
      }

      const folder = await this.prisma.folder.findUnique({
        where: { providerId_path: { providerId, path: folderPath } },
      });

      if (!folder) {
        throw new Error(`Folder not found: ${folderPath}`);
      }

      // Prevent deletion of system folders
      // FIX 3.6: Use CORE_SYSTEM_FOLDERS constant for consistency
      if (folder.specialUse && CORE_SYSTEM_FOLDERS.includes(folder.specialUse)) {
        throw new Error(`Cannot delete system folder: ${folder.specialUse}`);
      }

      this.logger.log(`Deleting folder "${folder.name}" for provider ${providerId}`);

      // FIX 1.1: Move all emails from this folder to INBOX before deletion
      // This prevents orphaned emails with folder paths that don't exist
      const emailsInFolder = await this.prisma.email.count({
        where: { providerId, folder: folderPath },
      });

      if (emailsInFolder > 0) {
        this.logger.log(
          `Moving ${emailsInFolder} emails from folder "${folder.name}" to TRASH before deletion`,
        );
        await this.prisma.email.updateMany({
          where: { providerId, folder: folderPath },
          // FIX CRIT-5 (2025-01-05): Move to TRASH not INBOX - prevents spam flooding inbox
          data: { folder: 'TRASH' },
        });
        this.logger.log(`Moved ${emailsInFolder} emails to TRASH`);
      }

      if (provider.providerType === 'imap') {
        await this.deleteImapFolder(providerId, folderPath);
      } else if (provider.providerType === 'google') {
        await this.deleteGmailLabel(providerId, folder.externalId || folderPath);
      } else if (provider.providerType === 'microsoft') {
        await this.deleteMicrosoftFolder(providerId, folder.externalId || folderPath);
      } else {
        throw new Error(`Unsupported provider type: ${provider.providerType}`);
      }

      // Delete from database
      await this.prisma.folder.delete({ where: { id_tenantId: { id: folder.id, tenantId: folder.tenantId } } });

      this.logger.log(`Deleted folder "${folder.name}"`);
    });
  }

  // ========== IMAP FOLDER OPERATIONS ==========

  private async createImapFolder(
    providerId: string,
    name: string,
    parentPath?: string,
  ): Promise<{ externalId: string; path: string }> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    const imapCreds = this.providerTokenService.getImapCredentials(provider);
    const client = this.imapService.createClient({
      host: imapCreds.host,
      port: imapCreds.port,
      username: imapCreds.username,
      password: imapCreds.password,
      useTls: imapCreds.useTls,
    });

    const fullPath = parentPath ? `${parentPath}/${name}` : name;

    // Local pre-check to avoid server call on duplicates
    const existing = await this.prisma.folder.findFirst({
      where: { providerId, path: fullPath },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('A folder with this name already exists on the mail server');
    }

    try {
      await client.connect();
      this.logger.log(`Creating IMAP folder "${fullPath}" on server...`);
      const result = await client.mailboxCreate(fullPath);
      this.logger.log(`IMAP folder "${fullPath}" created successfully, path: ${result.path}`);
      return { externalId: result.path, path: result.path };
    } catch (error: any) {
      const message = String(error?.message || '').toLowerCase();
      this.logger.error(`Failed to create IMAP folder "${fullPath}": ${error?.message || error}`);
      if (message.includes('exists') || message.includes('already')) {
        throw new ConflictException('A folder with this name already exists on the mail server');
      }
      if (message.includes('permission') || message.includes('denied')) {
        throw new Error('Permission denied: Cannot create folder on this mail server');
      }
      throw error;
    } finally {
      await client.logout();
    }
  }

  private async renameImapFolder(
    providerId: string,
    oldPath: string,
    newName: string,
  ): Promise<string> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    const imapCreds = this.providerTokenService.getImapCredentials(provider);
    const client = this.imapService.createClient({
      host: imapCreds.host,
      port: imapCreds.port,
      username: imapCreds.username,
      password: imapCreds.password,
      useTls: imapCreds.useTls,
    });

    try {
      await client.connect();
      this.logger.log(`IMAP connected for rename operation`);

      // Build new path: replace last segment with new name
      const parts = oldPath.split('/');
      parts[parts.length - 1] = newName;
      const newPath = parts.join('/');

      this.logger.log(`IMAP mailboxRename: "${oldPath}" -> "${newPath}"`);
      const result = await client.mailboxRename(oldPath, newPath);
      this.logger.log(`IMAP mailboxRename result: ${JSON.stringify(result)}`);
      return result.newPath || newPath;
    } catch (error: any) {
      const message = String(error?.message || error || '').toLowerCase();
      this.logger.warn(`IMAP rename folder error for "${oldPath}": ${error?.message || error}`);

      // If folder doesn't exist on server, create it with new name instead
      if (message.includes('not exist') || message.includes('no such') || message.includes('nonexistent')) {
        this.logger.log(`Folder "${oldPath}" does not exist on IMAP server, creating new folder "${newName}"`);
        const parts = oldPath.split('/');
        parts[parts.length - 1] = newName;
        const newPath = parts.join('/');
        try {
          await client.mailboxCreate(newPath);
          return newPath;
        } catch (createError: any) {
          this.logger.error(`Failed to create folder "${newPath}": ${createError?.message || createError}`);
          // Return the new path anyway - DB will be updated
          return newPath;
        }
      }

      // Provide user-friendly error messages for other errors
      if (message.includes('permission') || message.includes('denied')) {
        throw new Error('Permission denied: Cannot rename this folder');
      }
      if (message.includes('already exist')) {
        throw new ConflictException('A folder with this name already exists');
      }
      throw error;
    } finally {
      await client.logout();
    }
  }

  private async deleteImapFolder(providerId: string, path: string): Promise<void> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    const imapCreds = this.providerTokenService.getImapCredentials(provider);
    const client = this.imapService.createClient({
      host: imapCreds.host,
      port: imapCreds.port,
      username: imapCreds.username,
      password: imapCreds.password,
      useTls: imapCreds.useTls,
    });

    try {
      await client.connect();
      this.logger.log(`IMAP connected for delete operation`);
      this.logger.log(`IMAP mailboxDelete: "${path}"`);
      await client.mailboxDelete(path);
      this.logger.log(`IMAP mailboxDelete completed successfully for "${path}"`);
    } catch (error: any) {
      const message = String(error?.message || error || '').toLowerCase();
      this.logger.warn(`IMAP delete folder error for "${path}": ${error?.message || error}`);

      // If folder doesn't exist on server, that's OK - we still delete from DB
      if (message.includes('not exist') || message.includes('no such') || message.includes('nonexistent')) {
        this.logger.log(`Folder "${path}" does not exist on IMAP server, will delete from database only`);
        return; // Allow database deletion to proceed
      }

      // Provide user-friendly error messages for other errors
      if (message.includes('permission') || message.includes('denied')) {
        throw new Error('Permission denied: Cannot delete this folder');
      }
      if (message.includes('not empty') || message.includes('has children')) {
        throw new Error('Folder is not empty. Please delete or move all emails first.');
      }
      if (message.includes('cannot delete') || message.includes('not allowed')) {
        throw new Error('This folder cannot be deleted');
      }
      throw error;
    } finally {
      await client.logout();
    }
  }

  // ========== GMAIL LABEL OPERATIONS ==========

  /**
   * FIX 1.2: Added validation to prevent creating labels with reserved system folder names
   */
  private async createGmailLabel(
    providerId: string,
    name: string,
  ): Promise<{ externalId: string; path: string }> {
    // FIX 1.2: Validate that label name doesn't conflict with reserved system folder names
    const RESERVED_NAMES = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'JUNK', 'ARCHIVE', 'ALL', 'FLAGGED', 'IMPORTANT'];
    const normalizedName = name.toUpperCase().trim();

    if (RESERVED_NAMES.includes(normalizedName)) {
      throw new ConflictException(
        `Cannot create label with reserved system folder name: "${name}". Please choose a different name.`,
      );
    }

    // Also check for CATEGORY_ prefix (Gmail internal categories)
    if (normalizedName.startsWith('CATEGORY_')) {
      throw new ConflictException(
        `Cannot create label with CATEGORY_ prefix: "${name}". This prefix is reserved for Gmail categories.`,
      );
    }

    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    try {
      const response = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });

      const labelId = response.data.id!;
      return { externalId: labelId, path: labelId };
    } catch (error: any) {
      const status = error?.code || error?.response?.status;
      if (status === 409) {
        // Gmail returns 409 for duplicate label names
        throw new ConflictException('A label with this name already exists on Gmail');
      }
      throw error;
    }
  }

  private async renameGmailLabel(
    providerId: string,
    labelId: string,
    newName: string,
  ): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    await gmail.users.labels.update({
      userId: 'me',
      id: labelId,
      requestBody: { name: newName },
    });
  }

  private async deleteGmailLabel(providerId: string, labelId: string): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    await gmail.users.labels.delete({
      userId: 'me',
      id: labelId,
    });
  }

  // ========== MICROSOFT FOLDER OPERATIONS ==========

  private async createMicrosoftFolder(
    providerId: string,
    name: string,
    parentFolderId?: string,
  ): Promise<{ externalId: string; path: string }> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    const url = parentFolderId
      ? `${this.GRAPH_API_BASE}/me/mailFolders/${parentFolderId}/childFolders`
      : `${this.GRAPH_API_BASE}/me/mailFolders`;

    try {
      const response = await axios.post(
        url,
        { displayName: name },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
      );

      const folderId = response.data.id;
      return { externalId: folderId, path: folderId };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        // Microsoft Graph returns 409 on name conflicts; surface a clear conflict error.
        throw new ConflictException('A folder with this name already exists on Microsoft 365');
      }
      throw error;
    }
  }

  private async renameMicrosoftFolder(
    providerId: string,
    folderId: string,
    newName: string,
  ): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    await axios.patch(
      `${this.GRAPH_API_BASE}/me/mailFolders/${folderId}`,
      { displayName: newName },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
    );
  }

  private async deleteMicrosoftFolder(providerId: string, folderId: string): Promise<void> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(providerId);

    await axios.delete(`${this.GRAPH_API_BASE}/me/mailFolders/${folderId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
}
