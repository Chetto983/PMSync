/**
 * EmailFolderService - Folder utilities and query building
 * Extracted from emails.service.ts for maintainability (<500 lines)
 *
 * Responsibilities:
 * - Folder cache management (Redis)
 * - Building Prisma WHERE clauses for email queries
 * - Folder count updates with debouncing
 * - Special folder path resolution (Drafts, Trash)
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { withQueryTimeout } from '../../../common/utils';
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { CanonicalFolderType, isSystemFolder } from '../../email-sync/drivers/interfaces/canonical.types';

/**
 * Email list filter options
 */
export interface EmailListFilters {
  folder?: string;
  /** Filter by folder specialUse type (INBOX, SENT, TRASH, etc.) - for aggregation queries */
  specialUse?: string;
  isRead?: boolean;
  isStarred?: boolean;
  /** Filter by flagged/important status */
  isFlagged?: boolean;
  /** Filter emails that are starred OR flagged (combines both) */
  isImportant?: boolean;
  hasAttachments?: boolean;
  search?: string;
  from?: string;
  to?: string;
  subject?: string;
  labelIds?: string[];
  startDate?: Date;
  endDate?: Date;
  /** SECURITY: Exclude emails in TRASH, SPAM, and JUNK folders (for smart filters) */
  excludeTrashSpam?: boolean;
  /** Filter emails from VIP contacts only */
  fromVip?: boolean;
  /** Filter by AI-computed triage lane (action-now, waiting-on-reply, etc.) */
  lane?: string;
}

/**
 * Result of buildEmailWhere
 */
export interface EmailWhereResult {
  where: Prisma.EmailWhereInput;
  isTrashView: boolean;
  folderValues: string[];
  excludedFolderPaths: string[];
  /** If true, service should filter to emails from VIP contacts */
  fromVip?: boolean;
}

/**
 * Parameters for building email WHERE clause
 */
export interface BuildEmailWhereParams {
  tenantId: string;
  providerId?: string;
  folder?: string;
  specialUse?: string;
  filters?: EmailListFilters;
  excludeTrashSpam?: boolean;
  defaultExcludeTrashSpam?: boolean;
}

/**
 * Folder record structure from cache
 */
export interface FolderRecord {
  path: string;
  name: string;
  specialUse: string | null;
  externalId?: string | null;
}

@Injectable()
export class EmailFolderService {
  private readonly logger = new Logger(EmailFolderService.name);

  /** Redis-based distributed debounce config */
  private readonly FOLDER_UPDATE_DEBOUNCE_MS = 5000;

  /** Folder cache TTL (5 minutes) */
  private readonly FOLDER_CACHE_TTL = 300;

  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
    private redisLock: RedisLockService,
    private realtimeEvents: RealtimeEventsService,
  ) {}

  /**
   * PERFORMANCE: Get cached folder map for a tenant
   * Single query + cache replaces 3-4 sequential queries per email list request
   * Cache key includes tenantId for tenant isolation
   * Research: https://www.prisma.io/docs/orm/prisma-client/queries/query-optimization-performance
   */
  async getCachedFolderMap(
    tenantId: string,
    providerId?: string,
  ): Promise<Map<string, FolderRecord>> {
    const cacheKey = `folder-map:${tenantId}:${providerId || 'all'}`;

    // Try cache first
    const cached = await this.cacheService.get<FolderRecord[]>(cacheKey, {
      namespace: CacheNamespace.FOLDER_STRUCTURE,
    });

    let folders: FolderRecord[];

    if (cached) {
      folders = cached;
    } else {
      // Single query to get all folders
      folders = await this.prisma.folder.findMany({
        where: {
          tenantId,
          ...(providerId && { providerId }),
        },
        select: { path: true, name: true, specialUse: true, externalId: true },
      });

      // Cache for 5 minutes
      await this.cacheService.set(cacheKey, folders, {
        namespace: CacheNamespace.FOLDER_STRUCTURE,
        ttl: this.FOLDER_CACHE_TTL,
      });
    }

    // Build lookup map: specialUse (upper), path (upper), name (upper) -> folder
    const map = new Map<string, FolderRecord>();
    for (const folder of folders) {
      if (folder.specialUse) {
        map.set(folder.specialUse.toUpperCase(), folder);
      }
      if (folder.path) {
        map.set(folder.path.toUpperCase(), folder);
      }
      if (folder.name) {
        map.set(folder.name.toUpperCase(), folder);
      }
    }

    return map;
  }

  /**
   * Invalidate folder cache for a tenant (call after folder changes)
   */
  async invalidateFolderCache(tenantId: string, providerId?: string): Promise<void> {
    const cacheKey = `folder-map:${tenantId}:${providerId || 'all'}`;
    await this.cacheService.del(cacheKey, { namespace: CacheNamespace.FOLDER_STRUCTURE });
  }

  /**
   * Build Prisma WHERE clause for email queries
   * Uses cached folder map to avoid multiple DB queries
   */
  async buildEmailWhere(params: BuildEmailWhereParams): Promise<EmailWhereResult> {
    const {
      tenantId,
      providerId,
      folder,
      specialUse,
      filters,
      excludeTrashSpam,
      defaultExcludeTrashSpam,
    } = params;

    // PERFORMANCE: Single cached query replaces 3-4 sequential DB queries
    const folderMap = await this.getCachedFolderMap(tenantId, providerId);
    const providerType = providerId
      ? (
          await this.prisma.providerConfig.findUnique({
            where: { id: providerId },
            select: { providerType: true },
          })
        )?.providerType ?? null
      : null;

    let folderFilter: Prisma.EmailWhereInput | undefined;
    let folderValues: string[] = [];
    let isTrashView = false;

    if (specialUse) {
      const specialUseUpper = specialUse.toUpperCase();
      const folderRecord = folderMap.get(specialUseUpper);

      const folderPaths = new Set<string>();
      if (folderRecord) {
        if (folderRecord.path) folderPaths.add(folderRecord.path);
        if (folderRecord.name) folderPaths.add(folderRecord.name);
        if (folderRecord.specialUse) folderPaths.add(folderRecord.specialUse);
      }
      folderPaths.add(specialUseUpper);

      folderValues = Array.from(folderPaths);
      const labelToken =
        providerType === 'google' && folderRecord?.externalId
          ? folderRecord.externalId
          : specialUseUpper;
      const labelFilters: Prisma.EmailWhereInput[] = labelToken
        ? [{ labels: { has: labelToken } }]
        : [];

      folderFilter = {
        OR: [
          { folder: { in: folderValues, mode: 'insensitive' } },
          ...labelFilters,
        ],
      };
      isTrashView = specialUseUpper === 'TRASH';
    } else if (folder) {
      const folderUpper = folder.toUpperCase();
      const isCanonicalFolder = isSystemFolder(folderUpper as CanonicalFolderType);
      const folderRecord = folderMap.get(folderUpper);
      const googleLabelFilter =
        providerType === 'google' && folderRecord?.externalId
          ? { labels: { has: folderRecord.externalId } as Prisma.StringNullableListFilter }
          : null;

      if (isCanonicalFolder) {
        if (folderRecord) {
          const folderPaths = new Set<string>();
          if (folderRecord.path) folderPaths.add(folderRecord.path);
          if (folderRecord.name) folderPaths.add(folderRecord.name);
          folderPaths.add(folderUpper);
          folderValues = Array.from(folderPaths);
          folderFilter = googleLabelFilter
            ? {
                OR: [
                  { folder: { in: folderValues, mode: 'insensitive' } },
                  googleLabelFilter,
                ],
              }
            : { folder: { in: folderValues, mode: 'insensitive' } };
        } else {
          folderValues = [folderUpper];
          folderFilter = { folder: { equals: folderUpper, mode: 'insensitive' } };
        }
        isTrashView = folderUpper === 'TRASH';
      } else {
        folderValues = [folder];
        folderFilter = { folder: { equals: folder, mode: 'insensitive' } };

        if (folderRecord?.path || folderRecord?.name) {
          const folderPaths = new Set<string>();
          if (folderRecord.path) folderPaths.add(folderRecord.path);
          if (folderRecord.name) folderPaths.add(folderRecord.name);
          folderPaths.add(folder);
          folderValues = Array.from(folderPaths);
          folderFilter = googleLabelFilter
            ? {
                OR: [
                  {
                    folder: {
                      in: folderValues,
                      mode: 'insensitive',
                    },
                  },
                  googleLabelFilter,
                ],
              }
            : {
                folder: {
                  in: folderValues,
                  mode: 'insensitive',
                },
              };
        }
        isTrashView = folderRecord?.specialUse?.toUpperCase() === 'TRASH';
      }
    }

    const shouldExcludeTrashSpam =
      excludeTrashSpam ?? (!!defaultExcludeTrashSpam && !folder && !specialUse);

    // PERFORMANCE: Use cached map for excludeTrashSpam lookup
    let excludedFolderPaths: string[] = [];
    if (shouldExcludeTrashSpam) {
      const excludedTypes = ['TRASH', 'SPAM', 'JUNK'];
      const paths = new Set<string>();
      for (const type of excludedTypes) {
        const record = folderMap.get(type);
        if (record) {
          if (record.path) paths.add(record.path);
          if (record.name) paths.add(record.name);
          if (record.specialUse) paths.add(record.specialUse);
        }
      }
      excludedFolderPaths = Array.from(paths);
    }

    const andConditions: Prisma.EmailWhereInput[] = [];
    if (folderFilter) {
      andConditions.push(folderFilter);
    }
    if (shouldExcludeTrashSpam && excludedFolderPaths.length > 0) {
      andConditions.push({
        folder: { notIn: excludedFolderPaths, mode: 'insensitive' },
      });
    }

    const where: Prisma.EmailWhereInput = {
      tenantId,
      ...(providerId && { providerId }),
      ...(!isTrashView ? { isDeleted: false } : {}),
      ...(andConditions.length > 0 ? { AND: andConditions } : {}),
    };

    if (filters) {
      if (filters.isRead !== undefined) {
        where.isRead = filters.isRead;
      }
      if (filters.isStarred !== undefined) {
        where.isStarred = filters.isStarred;
      }
      if (filters.isFlagged !== undefined) {
        where.isFlagged = filters.isFlagged;
      }
      // Collect OR groups so they don't clobber each other (was BUG-1)
      const orGroups: Prisma.EmailWhereInput[] = [];

      if (filters.isImportant !== undefined) {
        orGroups.push({
          OR: [
            { isStarred: filters.isImportant },
            { isFlagged: filters.isImportant },
          ],
        });
      }
      if (filters.hasAttachments) {
        where.attachments = { some: {} };
      }
      if (filters.from) {
        where.from = { contains: filters.from, mode: 'insensitive' };
      }
      if (filters.to) {
        where.to = { has: filters.to };
      }
      if (filters.subject) {
        where.subject = { contains: filters.subject, mode: 'insensitive' };
      }
      if (filters.labelIds && filters.labelIds.length > 0) {
        where.emailLabels = { some: { labelId: { in: filters.labelIds } } };
      }
      if (filters.search) {
        orGroups.push({
          OR: [
            { subject: { contains: filters.search, mode: 'insensitive' } },
            { from: { contains: filters.search, mode: 'insensitive' } },
            { bodyText: { contains: filters.search, mode: 'insensitive' } },
          ],
        });
      }
      if (filters.startDate || filters.endDate) {
        where.receivedAt = {
          ...(filters.startDate && { gte: filters.startDate }),
          ...(filters.endDate && { lte: filters.endDate }),
        };
      }
      if (filters.lane) {
        where.aiLane = filters.lane;
      }
      // VIP filter is handled in emails.service.ts via the fromVip return value
      // since Email doesn't have a direct relation to Contact

      // Merge OR groups into AND so all conditions apply together
      if (orGroups.length > 0) {
        const existing = where.AND;
        const prev = Array.isArray(existing) ? existing : existing ? [existing] : [];
        where.AND = [...prev, ...orGroups];
      }
    }

    return {
      where,
      isTrashView,
      folderValues,
      excludedFolderPaths,
      fromVip: filters?.fromVip,
    };
  }

  /**
   * Build raw SQL WHERE clause for conversation queries
   */
  buildConversationWhereSql(params: {
    tenantId: string;
    providerId?: string;
    isTrashView: boolean;
    folderValues: string[];
    excludedFolderPaths: string[];
  }): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`"tenantId" = ${params.tenantId}`];

    if (params.providerId) {
      conditions.push(Prisma.sql`"providerId" = ${params.providerId}`);
    }
    if (!params.isTrashView) {
      conditions.push(Prisma.sql`"isDeleted" = false`);
    }

    if (params.folderValues.length > 0) {
      const normalized = Array.from(
        new Set(params.folderValues.map((value) => value.toLowerCase())),
      );
      conditions.push(Prisma.sql`LOWER("folder") IN (${Prisma.join(normalized)})`);
    }

    if (params.excludedFolderPaths.length > 0) {
      const normalized = Array.from(
        new Set(params.excludedFolderPaths.map((value) => value.toLowerCase())),
      );
      conditions.push(Prisma.sql`LOWER("folder") NOT IN (${Prisma.join(normalized)})`);
    }

    return Prisma.sql`${Prisma.join(conditions, ' AND ')}`;
  }

  /**
   * Queue folder counts for update (distributed debounce via Redis)
   */
  async updateFolderCounts(tenantId: string, providerId: string, folders: string[]): Promise<void> {
    const listKey = `folder_updates:${tenantId}:${providerId}`;
    const debounceLockKey = `folder_debounce:${tenantId}:${providerId}`;

    // Push folders to Redis List
    await this.cacheService.lpush(listKey, folders, { namespace: CacheNamespace.FOLDER_METADATA });

    // Try to acquire execution lock
    const lockId = await this.redisLock.acquireLock(debounceLockKey, this.FOLDER_UPDATE_DEBOUNCE_MS);

    if (lockId) {
      this.logger.debug(
        `Acquired folder update lock for ${tenantId}:${providerId}, scheduling run in ${this.FOLDER_UPDATE_DEBOUNCE_MS}ms`,
      );

      setTimeout(async () => {
        try {
          await this.executeFolderCountsUpdate(tenantId, providerId, listKey);
        } catch (e) {
          this.logger.error(`Error in scheduled folder update: ${e instanceof Error ? e.message : String(e)}`);
        }
      }, this.FOLDER_UPDATE_DEBOUNCE_MS);
    }
  }

  /**
   * Execute the actual folder count update (drains Redis list)
   */
  private async executeFolderCountsUpdate(tenantId: string, providerId: string, listKey: string): Promise<void> {
    const folders = await this.cacheService.lrange<string>(listKey, 0, -1, {
      namespace: CacheNamespace.FOLDER_METADATA,
    });

    await this.cacheService.del(listKey, { namespace: CacheNamespace.FOLDER_METADATA });

    if (!folders || folders.length === 0) return;

    const uniqueFolders = Array.from(new Set(folders));

    this.logger.debug(`Processing folder counts for ${uniqueFolders.length} folders (Tenant: ${tenantId})`);

    try {
      if (!(await this.realtimeEvents.hasTenantConnections(tenantId))) {
        this.logger.debug(`Skipping folder count update for inactive tenant: ${tenantId}`);
        return;
      }

      const providerType =
        (
          await this.prisma.providerConfig.findUnique({
            where: { id: providerId },
            select: { providerType: true },
          })
        )?.providerType ?? null;

      const folderRecords = await this.prisma.folder.findMany({
        where: {
          providerId,
          OR: [
            { path: { in: uniqueFolders, mode: 'insensitive' } },
            { name: { in: uniqueFolders, mode: 'insensitive' } },
            { specialUse: { in: uniqueFolders, mode: 'insensitive' } },
          ],
        },
        select: { id: true, path: true, name: true, specialUse: true, externalId: true },
      });

      const folderMap = new Map<string, (typeof folderRecords)[number]>();
      for (const folderRecord of folderRecords) {
        if (folderRecord.path) folderMap.set(folderRecord.path.toUpperCase(), folderRecord);
        if (folderRecord.name) folderMap.set(folderRecord.name.toUpperCase(), folderRecord);
        if (folderRecord.specialUse) folderMap.set(folderRecord.specialUse.toUpperCase(), folderRecord);
      }

      if (providerType === 'google') {
        // T-0203: Unified count path — use OR(labels, folder) matching buildEmailWhere
        // This ensures counts match what the email list displays, even if
        // Email.labels[] and Email.folder disagree for some records (C3 fix).
        const results = await Promise.all(
          uniqueFolders.map(async (folder) => {
            const folderKey = folder.toUpperCase();
            const folderRecord = folderMap.get(folderKey);
            const labelToken = folderRecord?.externalId;
            const isTrash =
              folderRecord?.specialUse?.toUpperCase() === 'TRASH' || folderKey === 'TRASH';

            // Build OR filter: match by labels[] OR folder field
            const folderConditions: Prisma.EmailWhereInput[] = [
              { folder: { equals: folder, mode: 'insensitive' } },
            ];
            if (labelToken) {
              folderConditions.push({ labels: { has: labelToken } });
            }

            const baseWhere: Prisma.EmailWhereInput = {
              tenantId,
              providerId,
              OR: folderConditions,
              ...(!isTrash ? { isDeleted: false } : {}),
            };

            const [totalCount, unreadCount] = await Promise.all([
              this.prisma.email.count({ where: baseWhere }),
              this.prisma.email.count({
                where: {
                  ...baseWhere,
                  isRead: false,
                },
              }),
            ]);

            return { folder, folderRecord, totalCount, unreadCount };
          }),
        );

        const timestamp = new Date().toISOString();
        for (const { folder, folderRecord, totalCount, unreadCount } of results) {
          this.realtimeEvents.emitFolderCountsUpdate(tenantId, {
            providerId,
            folderId: folderRecord?.id || folder,
            folderName: folderRecord?.name || folder,
            totalCount,
            unreadCount,
            timestamp,
          });
        }
        return;
      }

      // OPTIMIZATION: 2 groupBy queries instead of 2N individual COUNT queries
      // Resolve which folder values to query and build lookup structures
      const queryFolders = new Set<string>();
      const folderMeta = new Map<string, { folderRecord: (typeof folderRecords)[number] | undefined; queryFolder: string; isTrash: boolean }>();

      for (const folder of uniqueFolders) {
        const folderKey = folder.toUpperCase();
        const folderRecord = folderMap.get(folderKey);
        const queryFolder = folderRecord?.path || folderRecord?.name || folder;
        const isTrash = folderRecord?.specialUse?.toUpperCase() === 'TRASH' || folderKey === 'TRASH';
        queryFolders.add(queryFolder);
        folderMeta.set(folder, { folderRecord, queryFolder, isTrash });
      }

      // 2 groupBy queries total (down from 2*N individual counts)
      const queryFolderArray = Array.from(queryFolders);
      const groupByTimeout = 10_000;
      const [totalGroups, unreadGroups] = await withQueryTimeout(
        'folderCounts',
        Promise.all([
          this.prisma.email.groupBy({
            by: ['folder'],
            where: { tenantId, providerId, folder: { in: queryFolderArray, mode: 'insensitive' } },
            _count: { id: true },
          }),
          this.prisma.email.groupBy({
            by: ['folder'],
            where: { tenantId, providerId, folder: { in: queryFolderArray, mode: 'insensitive' }, isRead: false },
            _count: { id: true },
          }),
        ]),
        groupByTimeout,
      );

      // Also get counts excluding deleted emails (for non-Trash folders)
      const [totalNonDeleted, unreadNonDeleted] = await withQueryTimeout(
        'folderCountsNonDeleted',
        Promise.all([
          this.prisma.email.groupBy({
            by: ['folder'],
            where: { tenantId, providerId, folder: { in: queryFolderArray, mode: 'insensitive' }, isDeleted: false },
            _count: { id: true },
          }),
          this.prisma.email.groupBy({
            by: ['folder'],
            where: { tenantId, providerId, folder: { in: queryFolderArray, mode: 'insensitive' }, isDeleted: false, isRead: false },
            _count: { id: true },
          }),
        ]),
        groupByTimeout,
      );

      // Build case-insensitive lookup maps, summing across case variants
      const accumulate = (groups: { folder: string; _count: { id: number } }[]) => {
        const map = new Map<string, number>();
        for (const g of groups) {
          const key = g.folder.toUpperCase();
          map.set(key, (map.get(key) ?? 0) + g._count.id);
        }
        return map;
      };
      const allTotalMap = accumulate(totalGroups);
      const allUnreadMap = accumulate(unreadGroups);
      const nonDelTotalMap = accumulate(totalNonDeleted);
      const nonDelUnreadMap = accumulate(unreadNonDeleted);

      // Resolve counts per folder, using Trash-aware logic
      const results = uniqueFolders.map((folder) => {
        const meta = folderMeta.get(folder)!;
        const key = meta.queryFolder.toUpperCase();
        const totalCount = meta.isTrash
          ? (allTotalMap.get(key) ?? 0)
          : (nonDelTotalMap.get(key) ?? 0);
        const unreadCount = meta.isTrash
          ? (allUnreadMap.get(key) ?? 0)
          : (nonDelUnreadMap.get(key) ?? 0);
        return { folder, folderRecord: meta.folderRecord, totalCount, unreadCount };
      });

      const timestamp = new Date().toISOString();
      for (const { folder, folderRecord, totalCount, unreadCount } of results) {
        this.realtimeEvents.emitFolderCountsUpdate(tenantId, {
          providerId,
          folderId: folderRecord?.id || folder,
          folderName: folderRecord?.name || folder,
          totalCount,
          unreadCount,
          timestamp,
        });
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to update folder counts: ${errMsg}`);
    }
  }

  /**
   * Get the actual drafts folder path for a provider
   */
  async getDraftsFolderPath(providerId: string): Promise<string> {
    const folder = await this.prisma.folder.findFirst({
      where: {
        providerId,
        specialUse: 'DRAFTS',
      },
      select: { path: true, name: true },
    });
    return folder?.path || folder?.name || 'DRAFTS';
  }

  /**
   * Get the trash folder path for a provider
   * Uses specialUse='TRASH' to find the correct localized folder name
   */
  async getTrashFolderPath(providerId: string): Promise<string> {
    const folder = await this.prisma.folder.findFirst({
      where: {
        providerId,
        specialUse: { equals: 'TRASH', mode: 'insensitive' },
      },
      select: { path: true, name: true },
    });
    return folder?.path || folder?.name || 'TRASH';
  }

  /**
   * Check if a folder path has a specific specialUse type
   */
  async isFolderSpecialUse(providerId: string, folderPath: string, specialUseType: string): Promise<boolean> {
    const folder = await this.prisma.folder.findFirst({
      where: {
        providerId,
        path: { equals: folderPath, mode: 'insensitive' },
        specialUse: { equals: specialUseType, mode: 'insensitive' },
      },
      select: { id: true },
    });
    return !!folder;
  }
}
