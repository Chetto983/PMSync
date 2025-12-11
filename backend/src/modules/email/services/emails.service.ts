import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { EmailSyncBackService } from './email-sync-back.service';
import { KnowledgeBaseService } from '../../ai/services/knowledge-base.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';

export interface EmailListFilters {
  folder?: string;
  /** Filter by folder specialUse type (INBOX, SENT, TRASH, etc.) - for aggregation queries */
  specialUse?: string;
  isRead?: boolean;
  isStarred?: boolean;
  hasAttachments?: boolean;
  search?: string;
  from?: string;
  to?: string;
  subject?: string;
  labelIds?: string[];
  startDate?: Date;
  endDate?: Date;
}

export interface EmailListParams {
  tenantId: string;
  providerId?: string;
  page?: number;
  limit?: number;
  filters?: EmailListFilters;
}

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  constructor(
    private prisma: PrismaService,
    private emailSyncBack: EmailSyncBackService,
    private knowledgeBaseService: KnowledgeBaseService,
    private realtimeEvents: RealtimeEventsService,
  ) {}

  /**
   * Get folder names by their RFC 6154 specialUse type
   * This is used to filter emails by folder type regardless of localized folder names.
   * Returns folder NAMES (not paths) because emails are stored with display name in `folder` field.
   */
  private async getFolderPathsBySpecialUse(
    tenantId: string,
    specialUseTypes: string[],
    providerId?: string,
  ): Promise<string[]> {
    const folders = await this.prisma.folder.findMany({
      where: {
        tenantId,
        ...(providerId && { providerId }),
        specialUse: { in: specialUseTypes, mode: 'insensitive' },
      },
      select: { name: true },
    });
    return folders.map((f) => f.name);
  }

  /**
   * Check if a folder path has a specific specialUse type
   */
  private async isFolderSpecialUse(
    providerId: string,
    folderPath: string,
    specialUseType: string,
  ): Promise<boolean> {
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

  /**
   * Recalculate and emit folder counts for affected folders
   * Only calculates if tenant has active WebSocket connections to avoid wasting resources
   */
  private async updateFolderCounts(
    tenantId: string,
    providerId: string,
    folders: string[],
  ) {
    try {
      // Skip calculation if no active WebSocket connections for this tenant
      // This avoids wasting resources on inactive tenants
      if (!this.realtimeEvents.hasTenantConnections(tenantId)) {
        this.logger.debug(`Skipping folder count update for inactive tenant: ${tenantId}`);
        return;
      }

      // Get folder records to map path -> id (include specialUse for trash detection)
      const folderRecords = await this.prisma.folder.findMany({
        where: {
          providerId,
          path: { in: folders, mode: 'insensitive' },
        },
        select: { id: true, path: true, name: true, specialUse: true },
      });

      // Create a map for quick lookup: path -> folder record
      const folderMap = new Map(
        folderRecords.map((f) => [f.path.toUpperCase(), f]),
      );

      for (const folder of folders) {
        const folderRecord = folderMap.get(folder.toUpperCase());
        // Check if folder is TRASH by specialUse attribute (locale-independent)
        const isTrashFolder = folderRecord?.specialUse?.toUpperCase() === 'TRASH';

        // Count total and unread emails in this folder
        const [totalCount, unreadCount] = await Promise.all([
          this.prisma.email.count({
            where: {
              tenantId,
              providerId,
              folder: { equals: folder, mode: 'insensitive' },
              isDeleted: isTrashFolder ? undefined : false,
            },
          }),
          this.prisma.email.count({
            where: {
              tenantId,
              providerId,
              folder: { equals: folder, mode: 'insensitive' },
              isDeleted: isTrashFolder ? undefined : false,
              isRead: false,
            },
          }),
        ]);

        // Emit websocket event with updated counts
        // Use folder ID if found, otherwise fall back to folder name
        this.realtimeEvents.emitFolderCountsUpdate(tenantId, {
          providerId,
          folderId: folderRecord?.id || folder,
          folderName: folderRecord?.name || folder,
          totalCount,
          unreadCount,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      this.logger.error(`Failed to update folder counts: ${error?.message || error}`);
    }
  }

  /**
   * Get paginated list of emails with filters
   * CRITICAL FIX: Added input validation for pagination params
   */
  async listEmails(params: EmailListParams) {
    const {
      tenantId,
      providerId,
      page = 1,
      limit = 50,
      filters = {},
    } = params;

    // CRITICAL FIX: Input validation
    if (page < 1) {
      throw new BadRequestException('Page must be >= 1');
    }
    if (limit < 1 || limit > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    const skip = (page - 1) * limit;

    // Build folder filter - supports both direct folder path and specialUse aggregation
    let folderFilter: Prisma.EmailWhereInput = {};
    let isTrashView = false;

    if (filters.specialUse) {
      // Aggregation query: find all folders with this specialUse type across providers
      const foldersWithSpecialUse = await this.prisma.folder.findMany({
        where: {
          tenantId,
          ...(providerId && { providerId }),
          specialUse: { equals: filters.specialUse, mode: 'insensitive' },
        },
        select: { path: true },
      });

      if (foldersWithSpecialUse.length > 0) {
        const folderPaths = foldersWithSpecialUse.map(f => f.path);
        folderFilter = { folder: { in: folderPaths, mode: 'insensitive' } };
        isTrashView = filters.specialUse.toUpperCase() === 'TRASH';
      }
    } else if (filters.folder) {
      folderFilter = { folder: { equals: filters.folder, mode: 'insensitive' } };
      isTrashView = filters.folder.toUpperCase() === 'TRASH';
    }

    // Build where clause
    const where: Prisma.EmailWhereInput = {
      tenantId,
      ...(providerId && { providerId }),
      ...folderFilter,
      // Only show deleted emails if we're viewing the TRASH folder
      ...(!isTrashView ? { isDeleted: false } : {}),
      ...(filters.isRead !== undefined && { isRead: filters.isRead }),
      ...(filters.isStarred !== undefined && { isStarred: filters.isStarred }),
      ...(filters.hasAttachments
        ? { attachments: { some: {} } }
        : undefined),
      ...(filters.from && { from: { contains: filters.from, mode: 'insensitive' } }),
      ...(filters.to && { to: { has: filters.to } }),
      ...(filters.subject && { subject: { contains: filters.subject, mode: 'insensitive' } }),
      ...(filters.labelIds && filters.labelIds.length > 0 && {
        emailLabels: { some: { labelId: { in: filters.labelIds } } },
      }),
      ...(filters.search && {
        OR: [
          { subject: { contains: filters.search, mode: 'insensitive' } },
          { from: { contains: filters.search, mode: 'insensitive' } },
          { bodyText: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
      // Date range filters - combine both conditions in single receivedAt object
      ...(filters.startDate || filters.endDate
        ? {
            receivedAt: {
              ...(filters.startDate && { gte: filters.startDate }),
              ...(filters.endDate && { lte: filters.endDate }),
            },
          }
        : {}),
    };

    // Get total count and emails
    const [total, emails] = await Promise.all([
      this.prisma.email.count({ where }),
      this.prisma.email.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          externalId: true,
          threadId: true,
          providerId: true,
          from: true,
          to: true,
          cc: true,
          bcc: true,
          subject: true,
          bodyHtml: true,
          bodyText: true,
          snippet: true,
          folder: true,
          labels: true,
          isRead: true,
          isStarred: true,
          isFlagged: true,
          sentAt: true,
          receivedAt: true,
          size: true,
          attachments: {
            select: {
              id: true,
              filename: true,
              size: true,
              mimeType: true,
              isInline: true,
            },
          },
          emailLabels: {
            select: {
              label: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                },
              },
            },
          },
          provider: {
            select: {
              id: true,
              email: true,
              providerType: true,
            },
          },
        },
      }),
    ]);

    // Debug: log what we're returning including body data
    this.logger.debug(`[listEmails] Returning ${emails.length} emails (total: ${total}) for tenantId=${tenantId}, providerId=${providerId || 'all'}, folder=${filters.folder || 'none'}`);
    if (emails.length > 0) {
      const firstEmail = emails[0] as any;
      this.logger.debug(`[listEmails] First email body data: id=${firstEmail.id}, bodyHtmlLen=${firstEmail.bodyHtml?.length || 0}, bodyTextLen=${firstEmail.bodyText?.length || 0}, snippetLen=${firstEmail.snippet?.length || 0}`)
    }

    return {
      emails,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get email by ID
   * CRITICAL FIX: Now filters by isDeleted to be consistent with other methods
   */
  async getEmailById(id: string, tenantId: string) {
    const email = await this.prisma.email.findFirst({
      where: {
        id,
        tenantId,
        isDeleted: false, // CRITICAL FIX: Exclude soft-deleted emails
      },
      include: {
        provider: {
          select: {
            id: true,
            email: true,
            providerType: true,
          },
        },
        attachments: true,
        emailLabels: {
          select: {
            label: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
      },
    });

    if (!email) {
      throw new NotFoundException('Email not found');
    }

    return email;
  }

  /**
   * Get multiple emails by IDs
   */
  async getEmailsByIds(ids: string[], tenantId: string) {
    const emails = await this.prisma.email.findMany({
      where: {
        id: { in: ids },
        tenantId,
      },
      include: {
        provider: {
          select: {
            id: true,
            email: true,
            providerType: true,
          },
        },
        attachments: {
          select: {
            id: true,
            filename: true,
            size: true,
            mimeType: true,
            isInline: true,
          },
        },
        emailLabels: {
          select: {
            label: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
      },
    });

    return emails;
  }

  /**
   * Update email flags - syncs back to provider
   */
  async updateEmail(
    id: string,
    tenantId: string,
    data: { isRead?: boolean; isStarred?: boolean; isFlagged?: boolean; folder?: string },
  ) {
    const email = await this.prisma.email.findFirst({
      where: { id, tenantId },
    });

    if (!email) {
      throw new NotFoundException('Email not found');
    }

    await this.ensureProvidersActive(tenantId, [email.providerId]);

    // PERFORMANCE FIX: Use include in update to avoid duplicate query
    const updated = await this.prisma.email.update({
      where: { id },
      data,
      include: {
        provider: {
          select: {
            id: true,
            email: true,
            providerType: true,
          },
        },
        attachments: true,
        emailLabels: {
          select: {
            label: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
      },
    });

    const targetFolder = data.folder ?? email.folder;

    // Emit realtime update event
    this.realtimeEvents.emitEmailUpdate(tenantId, {
      emailId: updated.id,
      providerId: updated.providerId,
      folder: targetFolder,
      updates: data,
      reason: 'message-processed',
    });

    // Update folder counts if isRead changed or folder changed
    if (data.isRead !== undefined || data.folder) {
      const affectedFolders: string[] = [targetFolder];
      // If folder changed, also update source folder
      if (data.folder && data.folder !== email.folder) {
        affectedFolders.push(email.folder);
      }

      // Update folder counts (async, don't wait)
      this.updateFolderCounts(tenantId, email.providerId, affectedFolders).catch((error) => {
        this.logger.error(`Failed to update folder counts: ${error.message}`);
      });
    }

    // Sync changes back to provider (async, don't wait)
    this.syncChangesToProvider(email, data).catch((error) => {
      this.logger.error(`Failed to sync email update to provider: ${error.message}`);
    });

    // Return the already-complete email (no duplicate query needed)
    return updated;
  }

  /**
   * Sync email changes back to provider
   */
  private async syncChangesToProvider(
    email: any,
    changes: { isRead?: boolean; isStarred?: boolean; isFlagged?: boolean; folder?: string },
  ) {
    const operations = [];

    // Handle read/unread
    if (changes.isRead !== undefined) {
      operations.push({
        emailId: email.id,
        externalId: email.externalId,
        providerId: email.providerId,
        tenantId: email.tenantId,
        operation: changes.isRead ? ('markRead' as const) : ('markUnread' as const),
        sourceFolder: email.folder, // Current folder for IMAP operations
      });
    }

    // Handle star/unstar
    if (changes.isStarred !== undefined) {
      operations.push({
        emailId: email.id,
        externalId: email.externalId,
        providerId: email.providerId,
        tenantId: email.tenantId,
        operation: changes.isStarred ? ('star' as const) : ('unstar' as const),
        sourceFolder: email.folder, // Current folder for IMAP operations
      });
    }

    // Handle flag/unflag (important)
    if (changes.isFlagged !== undefined) {
      operations.push({
        emailId: email.id,
        externalId: email.externalId,
        providerId: email.providerId,
        tenantId: email.tenantId,
        operation: changes.isFlagged ? ('flag' as const) : ('unflag' as const),
        sourceFolder: email.folder, // Current folder for IMAP operations
      });
    }

    // Handle folder move
    if (changes.folder) {
      operations.push({
        emailId: email.id,
        externalId: email.externalId,
        providerId: email.providerId,
        tenantId: email.tenantId,
        operation: 'moveToFolder' as const,
        sourceFolder: email.folder, // Where message is now on IMAP
        folder: changes.folder, // Target folder to move to
      });
    }

    // Sync all operations
    if (operations.length > 0) {
      await this.emailSyncBack.syncOperationsBatch(operations);
    }
  }

  /**
   * Delete email - Sync to provider, provider handles folder move
   * Next sync updates our DB with actual folder from provider
   */
  async deleteEmail(id: string, tenantId: string) {
    const email = await this.prisma.email.findFirst({
      where: { id, tenantId },
    });

    if (!email) {
      throw new NotFoundException('Email not found');
    }

    // If already deleted, permanent delete
    if (email.isDeleted) {
      // CRITICAL FIX: Wrap in transaction for atomicity
      await this.prisma.$transaction(async (tx) => {
        await this.knowledgeBaseService.deleteEmbeddingsForEmail(tenantId, id);
        await tx.email.delete({ where: { id } });
      });

      this.emailSyncBack
        .syncOperationToProvider({
          emailId: email.id,
          externalId: email.externalId,
          providerId: email.providerId,
          tenantId: email.tenantId,
          operation: 'hardDelete',
          sourceFolder: email.folder,
        })
        .catch((error) => {
          this.logger.error(`Failed to sync permanent delete: ${error.message}`);
        });

      // Emit WebSocket event for hard delete (CRITICAL FIX: was missing)
      this.realtimeEvents.emitEmailDelete(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        reason: 'message-deleted',
      });

      this.updateFolderCounts(tenantId, email.providerId, [email.folder]).catch((error) => {
        this.logger.error(`Failed to update folder counts: ${error.message}`);
      });

      return { success: true };
    }

    // Mark deleted for UI - provider moves to trash, sync updates folder
    await this.prisma.email.update({
      where: { id },
      data: { isDeleted: true },
    });

    await this.knowledgeBaseService.deleteEmbeddingsForEmail(tenantId, id);

    // Sync to provider - it handles the move to trash
    this.emailSyncBack
      .syncOperationToProvider({
        emailId: email.id,
        externalId: email.externalId,
        providerId: email.providerId,
        tenantId: email.tenantId,
        operation: 'delete',
        sourceFolder: email.folder,
      })
      .catch((error) => {
        this.logger.error(`Failed to sync delete: ${error.message}`);
      });

    // Emit WebSocket event for soft delete (CRITICAL FIX: was missing, only bulkDelete had this)
    this.realtimeEvents.emitEmailDelete(tenantId, {
      emailId: email.id,
      providerId: email.providerId,
      folder: email.folder,
      reason: 'message-deleted',
    });

    this.updateFolderCounts(tenantId, email.providerId, [email.folder]).catch((error) => {
      this.logger.error(`Failed to update folder counts: ${error.message}`);
    });

    return { success: true };
  }

  /**
   * Get email statistics
   * Returns counts for smart filters (unread, starred, today, thisWeek, attachments, important)
   */
  async getStats(tenantId: string, providerId?: string) {
    const where: Prisma.EmailWhereInput = {
      tenantId,
      isDeleted: false,
      ...(providerId && { providerId }),
    };

    // Calculate date ranges for smart filters
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const [total, unread, starred, important, today, thisWeek, attachments, byFolder] = await Promise.all([
      this.prisma.email.count({ where }),
      this.prisma.email.count({ where: { ...where, isRead: false } }),
      this.prisma.email.count({ where: { ...where, isStarred: true } }),
      this.prisma.email.count({ where: { ...where, OR: [{ isStarred: true }, { isFlagged: true }] } }),
      this.prisma.email.count({
        where: {
          ...where,
          receivedAt: { gte: startOfToday, lte: endOfToday },
        },
      }),
      this.prisma.email.count({
        where: {
          ...where,
          receivedAt: { gte: startOfWeek, lte: endOfWeek },
        },
      }),
      this.prisma.email.count({
        where: {
          ...where,
          attachments: { some: {} },
        },
      }),
      this.prisma.email.groupBy({
        by: ['folder'],
        where,
        _count: { id: true },
      }),
    ]);

    return {
      total,
      unread,
      starred,
      important,
      today,
      thisWeek,
      attachments,
      byFolder: byFolder.reduce((acc, item) => {
        acc[item.folder] = item._count.id;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  /**
   * Save or update a draft (autosave)
   */
  async saveDraft(
    tenantId: string,
    dto: {
      id?: string;
      providerId: string;
      threadId?: string;
      inReplyTo?: string;
      references?: string;
      to?: string[];
      cc?: string[];
      bcc?: string[];
      subject?: string;
      bodyHtml?: string;
      bodyText?: string;
      attachments?: {
        filename: string;
        contentType: string;
        size?: number;
        contentBase64?: string;
      }[];
    },
  ) {
    // Validate provider ownership
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        id: dto.providerId,
        tenantId,
        isActive: true,
        supportsEmail: true,
      },
      select: { id: true },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found or not active for this tenant');
    }

    const draftAttachments = dto.attachments ?? [];
    const draftsFolder = await this.getDraftsFolderPath(provider.id);
    const data: Prisma.EmailUncheckedCreateInput = {
      id: dto.id ?? undefined,
      tenantId,
      providerId: provider.id,
      externalId: dto.id ?? `draft-${Date.now()}`,
      threadId: dto.threadId ?? null,
      messageId: null,
      inReplyTo: dto.inReplyTo ?? null,
      references: dto.references ?? null,
      from: '',
      to: dto.to ?? [],
      cc: dto.cc ?? [],
      bcc: dto.bcc ?? [],
      replyTo: null,
      subject: dto.subject ?? '',
      bodyText: dto.bodyText ?? '',
      bodyHtml: dto.bodyHtml ?? '',
      snippet: null,
      folder: draftsFolder,
      labels: [],
      isRead: true,
      isStarred: false,
      isFlagged: false,
      isDraft: true,
      isDeleted: false,
      isArchived: false,
      sentAt: new Date(),
      receivedAt: new Date(),
      size: null,
      headers: Prisma.DbNull,
      metadata: {
        draftAttachments,
      },
      crossProviderLinkId: null,
    };

    if (dto.id) {
      await this.prisma.email.update({
        where: { id: dto.id },
        data,
      });
      return this.prisma.email.findUnique({ where: { id: dto.id } });
    }

    return this.prisma.email.create({ data });
  }

  /**
   * Get draft by ID
   */
  async getDraft(id: string, tenantId: string) {
    const draft = await this.prisma.email.findFirst({
      where: { id, tenantId, isDraft: true },
    });
    if (!draft) {
      throw new NotFoundException('Draft not found');
    }
    return draft;
  }

  /**
   * Delete draft
   */
  async deleteDraft(id: string, tenantId: string) {
    await this.prisma.email.deleteMany({
      where: { id, tenantId, isDraft: true },
    });
  }

  /**
   * Mark multiple emails as read/unread - syncs to provider
   */
  async bulkUpdateRead(
    emailIds: string[],
    tenantId: string,
    isRead: boolean,
  ) {
    // Get emails for syncing and folder tracking
    const emails = await this.prisma.email.findMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      select: {
        id: true,
        externalId: true,
        providerId: true,
        tenantId: true,
        folder: true,
      },
    });

    await this.ensureProvidersActive(
      tenantId,
      Array.from(new Set(emails.map((email) => email.providerId))),
    );

    // Track affected folders per provider for count updates
    const affectedFolders = new Map<string, Set<string>>();
    emails.forEach((email) => {
      if (!affectedFolders.has(email.providerId)) {
        affectedFolders.set(email.providerId, new Set());
      }
      if (email.folder) {
        affectedFolders.get(email.providerId)!.add(email.folder);
      }
    });

    // Update in database
    const result = await this.prisma.email.updateMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      data: { isRead },
    });

    // Update folder counts (async, don't wait - unread count changes)
    for (const [providerId, folders] of affectedFolders.entries()) {
      this.updateFolderCounts(tenantId, providerId, Array.from(folders)).catch((error) => {
        this.logger.error(`Failed to update folder counts: ${error.message}`);
      });
    }

    // Sync to provider (async, don't wait)
    const operations = emails.map((email) => ({
      emailId: email.id,
      externalId: email.externalId,
      providerId: email.providerId,
      tenantId: email.tenantId,
      operation: isRead ? ('markRead' as const) : ('markUnread' as const),
      sourceFolder: email.folder, // Current folder for IMAP operations
    }));

    this.emailSyncBack.syncOperationsBatch(operations).catch((error) => {
      this.logger.error(`Failed to sync bulk read update to provider: ${error.message}`);
    });

    // Return updated emails with all relationships
    const updatedEmails = await this.getEmailsByIds(emailIds, tenantId);

    // Emit realtime update events for each email
    for (const email of updatedEmails) {
      this.realtimeEvents.emitEmailUpdate(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        email: email,
        reason: 'read-status-updated',
      });
    }

    return { updated: result.count, emails: updatedEmails };
  }

  /**
   * Search emails
   * Excludes TRASH and SPAM folders using RFC 6154 specialUse attribute
   */
  async searchEmails(
    tenantId: string,
    query: string,
    providerId?: string,
    limit: number = 20,
  ) {
    // Get folder paths for TRASH and SPAM by their specialUse type (locale-independent)
    const excludedFolderPaths = await this.getFolderPathsBySpecialUse(
      tenantId,
      ['TRASH', 'SPAM', 'JUNK'],
      providerId,
    );

    const where: Prisma.EmailWhereInput = {
      tenantId,
      ...(providerId && { providerId }),
      isDeleted: false,
      // Exclude TRASH/SPAM folders by their actual paths (e.g., "Cestino", "Spam")
      ...(excludedFolderPaths.length > 0 && {
        folder: { notIn: excludedFolderPaths, mode: 'insensitive' },
      }),
      OR: [
        { subject: { contains: query, mode: 'insensitive' } },
        { from: { contains: query, mode: 'insensitive' } },
        { bodyText: { contains: query, mode: 'insensitive' } },
      ],
    };

    const emails = await this.prisma.email.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        providerId: true,
        from: true,
        subject: true,
        snippet: true,
        receivedAt: true,
        isRead: true,
      },
    });

    return emails;
  }

  /**
   * Get conversations - emails grouped by threadId from all folders
   * Excludes TRASH and SPAM folders using RFC 6154 specialUse attribute
   */
  async getConversations(params: {
    tenantId: string;
    providerId?: string;
    folder?: string;
    page?: number;
    limit?: number;
  }) {
    const { tenantId, providerId, folder, page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;

    // CANONICAL FOLDER ARCHITECTURE:
    // All emails now have canonical folder names (INBOX, SENT, TRASH, SPAM, etc.)
    // This enables simple folder matching across all providers without complex JOINs.

    // Check if we're viewing the TRASH folder (need to show isDeleted emails)
    const isTrashView = folder?.toUpperCase() === 'TRASH';

    // Build the WHERE clause
    const where: Prisma.EmailWhereInput = {
      tenantId,
      ...(providerId && { providerId }),
      // Only show deleted emails if we're viewing the TRASH folder
      ...(!isTrashView ? { isDeleted: false } : {}),
      // Folder filter - simple canonical name matching works across all providers
      ...(folder
        ? { folder: { equals: folder.toUpperCase(), mode: 'insensitive' } }
        : { folder: { notIn: ['TRASH', 'SPAM'], mode: 'insensitive' } }
      ),
    };

    // CRITICAL FIX: Check email count first to prevent memory bomb
    // Loading all emails into memory will crash on large mailboxes
    const MAX_EMAILS_FOR_GROUPING = 10000;
    const emailCount = await this.prisma.email.count({ where });

    if (emailCount > MAX_EMAILS_FOR_GROUPING) {
      throw new BadRequestException(
        `Too many emails (${emailCount}) to group into conversations. ` +
        `Please use folder filters to narrow down the results. Maximum: ${MAX_EMAILS_FOR_GROUPING}`,
      );
    }

    // Get emails grouped by thread - find the latest email in each thread
    const emails = await this.prisma.email.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      select: {
        id: true,
        externalId: true,
        threadId: true,
        from: true,
        to: true,
        subject: true,
        snippet: true,
        folder: true,
        labels: true,
        isRead: true,
        isStarred: true,
        isFlagged: true,
        receivedAt: true,
        sentAt: true,
        emailLabels: {
          select: {
            label: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
      },
    });

    // Group by threadId or messageId (for emails without threadId)
    const threadsMap = new Map<string, any[]>();
    for (const email of emails) {
      const key = email.threadId || email.id;
      if (!threadsMap.has(key)) {
        threadsMap.set(key, []);
      }
      threadsMap.get(key)!.push(email);
    }

    // Convert to array of conversations, sorted by most recent email
    const conversations = Array.from(threadsMap.values())
      .map((thread) => {
        // Sort emails in thread by date
        thread.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

        const latestEmail = thread[0];
        const hasUnread = thread.some((e) => !e.isRead);

        return {
          threadId: latestEmail.threadId || latestEmail.id,
          subject: latestEmail.subject,
          from: latestEmail.from,
          to: latestEmail.to,
          snippet: latestEmail.snippet,
          folder: latestEmail.folder,
          labels: latestEmail.labels,
          emailLabels: latestEmail.emailLabels,
          isRead: !hasUnread,
          isStarred: thread.some((e) => e.isStarred),
          isFlagged: thread.some((e) => e.isFlagged),
          receivedAt: latestEmail.receivedAt,
          sentAt: latestEmail.sentAt,
          emailCount: thread.length,
          latestEmailId: latestEmail.id,
        };
      })
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

    // Paginate
    const total = conversations.length;
    const paginatedConversations = conversations.slice(skip, skip + limit);

    return {
      conversations: paginatedConversations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all emails in a thread/conversation
   */
  async getThread(threadId: string, tenantId: string) {
    const emails = await this.prisma.email.findMany({
      where: {
        tenantId,
        OR: [
          { threadId },
          { id: threadId }, // In case threadId is actually an email ID
        ],
        isDeleted: false,
      },
      orderBy: { receivedAt: 'asc' },
      include: {
        attachments: true,
        emailLabels: {
          select: {
            label: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
      },
    });

    if (emails.length === 0) {
      throw new NotFoundException('Thread not found');
    }

    return emails;
  }

  /**
   * Get attachment download URL or file data
   */
  async getAttachmentDownloadUrl(
    emailId: string,
    attachmentId: string,
    tenantId: string,
  ) {
    // Verify email belongs to tenant
    const email = await this.prisma.email.findFirst({
      where: {
        id: emailId,
        tenantId,
        isDeleted: false,
      },
      include: {
        attachments: {
          where: {
            id: attachmentId,
          },
        },
      },
    });

    if (!email) {
      throw new NotFoundException('Email not found');
    }

    const attachment = email.attachments[0];
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    // Return attachment with storage information
    // The controller should handle actual file streaming based on storageType
    return {
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      storageType: attachment.storageType,
      storagePath: attachment.storagePath,
      isInline: attachment.isInline,
      contentId: attachment.contentId,
    };
  }

  /**
   * Bulk delete emails
   * - Already deleted: permanent delete from DB
   * - Not deleted: mark isDeleted, sync to provider (provider moves to trash)
   * Provider is source of truth - next sync updates folder from provider
   */
  async bulkDelete(emailIds: string[], tenantId: string) {
    const emails = await this.prisma.email.findMany({
      where: { id: { in: emailIds }, tenantId },
      select: { id: true, externalId: true, providerId: true, tenantId: true, folder: true, isDeleted: true },
    });

    await this.ensureProvidersActive(tenantId, Array.from(new Set(emails.map((e) => e.providerId))));

    // Split: already deleted = hard delete, not deleted = soft delete
    const toHardDelete = emails.filter((e) => e.isDeleted);
    const toSoftDelete = emails.filter((e) => !e.isDeleted);

    this.logger.log(`[BULK DELETE] ${toSoftDelete.length} soft delete, ${toHardDelete.length} hard delete`);

    // CRITICAL FIX: Wrap all database operations in transaction for atomicity
    const { softDeleteCount, hardDeleteCount } = await this.prisma.$transaction(async (tx) => {
      let softCount = 0;
      let hardCount = 0;

      // Soft delete - just mark isDeleted, provider handles folder move
      if (toSoftDelete.length > 0) {
        const result = await tx.email.updateMany({
          where: { id: { in: toSoftDelete.map((e) => e.id) }, tenantId },
          data: { isDeleted: true },
        });
        softCount = result.count;
      }

      // Hard delete - remove from DB
      if (toHardDelete.length > 0) {
        const result = await tx.email.deleteMany({
          where: { id: { in: toHardDelete.map((e) => e.id) }, tenantId },
        });
        hardCount = result.count;
      }

      return { softDeleteCount: softCount, hardDeleteCount: hardCount };
    });

    const totalDeleted = softDeleteCount + hardDeleteCount;

    // Track affected folders for count updates
    const affectedFolders = new Map<string, Set<string>>();
    for (const email of emails) {
      if (!affectedFolders.has(email.providerId)) {
        affectedFolders.set(email.providerId, new Set());
      }
      affectedFolders.get(email.providerId)!.add(email.folder);
    }

    for (const [providerId, folders] of affectedFolders.entries()) {
      this.updateFolderCounts(tenantId, providerId, Array.from(folders)).catch((error) => {
        this.logger.error(`Failed to update folder counts: ${error.message}`);
      });
    }

    // Sync to provider - it handles folder moves
    const operations = emails.map((email) => ({
      emailId: email.id,
      externalId: email.externalId,
      providerId: email.providerId,
      tenantId: email.tenantId,
      operation: email.isDeleted ? 'hardDelete' as const : 'delete' as const,
      sourceFolder: email.folder,
    }));

    this.emailSyncBack.syncOperationsBatch(operations).catch((error) => {
      this.logger.error(`[BULK DELETE] Sync failed: ${error.message}`);
    });

    // Emit realtime events
    for (const email of toSoftDelete) {
      this.realtimeEvents.emitEmailDelete(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        reason: 'message-deleted',
      });
    }
    for (const email of toHardDelete) {
      this.realtimeEvents.emitEmailDelete(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        reason: 'message-deleted',
      });
    }

    return { deleted: totalDeleted };
  }

  /**
   * Bulk update starred status
   */
  async bulkUpdateStarred(
    emailIds: string[],
    tenantId: string,
    isStarred: boolean,
  ) {
    // Get emails for syncing
    const emails = await this.prisma.email.findMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      select: {
        id: true,
        externalId: true,
        providerId: true,
        tenantId: true,
        folder: true, // Needed for IMAP sync-back
      },
    });

    await this.ensureProvidersActive(
      tenantId,
      Array.from(new Set(emails.map((email) => email.providerId))),
    );

    // Update in database
    const result = await this.prisma.email.updateMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      data: { isStarred },
    });

    // Sync to provider (async, don't wait)
    const operations = emails.map((email) => ({
      emailId: email.id,
      externalId: email.externalId,
      providerId: email.providerId,
      tenantId: email.tenantId,
      operation: isStarred ? ('star' as const) : ('unstar' as const),
      sourceFolder: email.folder, // Current folder for IMAP operations
    }));

    this.emailSyncBack.syncOperationsBatch(operations).catch((error) => {
      this.logger.error(`Failed to sync bulk starred update to provider: ${error.message}`);
    });

    // Return updated emails with all relationships
    const updatedEmails = await this.getEmailsByIds(emailIds, tenantId);

    // Emit realtime update events for each email
    for (const email of updatedEmails) {
      this.realtimeEvents.emitEmailUpdate(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        email: email,
        reason: 'starred-updated',
      });
    }

    return { updated: result.count, emails: updatedEmails };
  }

  /**
   * Bulk flag/unflag emails (mark as important)
   */
  async bulkUpdateFlagged(
    emailIds: string[],
    tenantId: string,
    isFlagged: boolean,
  ) {
    // Get emails for syncing
    const emails = await this.prisma.email.findMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      select: {
        id: true,
        externalId: true,
        providerId: true,
        tenantId: true,
        folder: true, // Needed for IMAP sync-back
      },
    });

    await this.ensureProvidersActive(
      tenantId,
      Array.from(new Set(emails.map((email) => email.providerId))),
    );

    // Update in database
    const result = await this.prisma.email.updateMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      data: { isFlagged },
    });

    // Sync to provider (async, don't wait)
    const operations = emails.map((email) => ({
      emailId: email.id,
      externalId: email.externalId,
      providerId: email.providerId,
      tenantId: email.tenantId,
      operation: isFlagged ? ('flag' as const) : ('unflag' as const),
      sourceFolder: email.folder, // Current folder for IMAP operations
    }));

    this.emailSyncBack.syncOperationsBatch(operations).catch((error) => {
      this.logger.error(`Failed to sync bulk flagged update to provider: ${error.message}`);
    });

    // Return updated emails with all relationships
    const updatedEmails = await this.getEmailsByIds(emailIds, tenantId);

    // Emit realtime update events for each email
    for (const email of updatedEmails) {
      this.realtimeEvents.emitEmailUpdate(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        email: email,
        reason: 'flagged-updated',
      });
    }

    return { updated: result.count, emails: updatedEmails };
  }

  /**
   * Bulk move emails to folder
   */
  async bulkMoveToFolder(
    emailIds: string[],
    tenantId: string,
    folder: string,
  ) {
    // Get emails for syncing and folder tracking
    const emails = await this.prisma.email.findMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      select: {
        id: true,
        externalId: true,
        providerId: true,
        tenantId: true,
        folder: true,
      },
    });

    await this.ensureProvidersActive(
      tenantId,
      Array.from(new Set(emails.map((email) => email.providerId))),
    );

    // Track affected folders per provider for count updates (both source and destination)
    const affectedFolders = new Map<string, Set<string>>();
    emails.forEach((email) => {
      if (!affectedFolders.has(email.providerId)) {
        affectedFolders.set(email.providerId, new Set());
      }
      // Add both source and destination folders
      if (email.folder) {
        affectedFolders.get(email.providerId)!.add(email.folder);
      }
      affectedFolders.get(email.providerId)!.add(folder);
    });

    // Update in database
    const result = await this.prisma.email.updateMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      data: { folder },
    });

    // Update folder counts (async, don't wait)
    for (const [providerId, folders] of affectedFolders.entries()) {
      this.updateFolderCounts(tenantId, providerId, Array.from(folders)).catch((error) => {
        this.logger.error(`Failed to update folder counts: ${error.message}`);
      });
    }

    // Sync to provider (async, don't wait)
    const operations = emails.map((email) => ({
      emailId: email.id,
      externalId: email.externalId,
      providerId: email.providerId,
      tenantId: email.tenantId,
      operation: 'moveToFolder' as const,
      sourceFolder: email.folder, // Where message is now on IMAP
      folder, // Target folder to move to
    }));

    this.emailSyncBack.syncOperationsBatch(operations).catch((error) => {
      this.logger.error(`Failed to sync bulk move to provider: ${error.message}`);
    });

    // Return updated emails with all relationships
    const updatedEmails = await this.getEmailsByIds(emailIds, tenantId);

    // Emit realtime update events for each email
    for (const email of updatedEmails) {
      this.realtimeEvents.emitEmailUpdate(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        email: email,
        reason: 'folder-updated',
      });
    }

    return { updated: result.count, emails: updatedEmails };
  }

  /**
   * Bulk add labels to emails
   * PERFORMANCE FIX: Parallelized labels and emails queries
   */
  async bulkAddLabels(
    emailIds: string[],
    tenantId: string,
    labelIds: string[],
  ) {
    // PERFORMANCE FIX: Parallelize the two independent queries
    const [labels, emails] = await Promise.all([
      // Verify labels exist and belong to tenant
      this.prisma.userLabel.findMany({
        where: {
          id: { in: labelIds },
          tenantId,
        },
        select: { id: true },
      }),
      // Get emails for provider validation
      this.prisma.email.findMany({
        where: { id: { in: emailIds }, tenantId },
        select: { providerId: true },
      }),
    ]);

    if (labels.length !== labelIds.length) {
      throw new NotFoundException('One or more labels not found');
    }

    await this.ensureProvidersActive(
      tenantId,
      Array.from(new Set(emails.map((email) => email.providerId))),
    );

    // Create email-label associations
    const emailLabelPairs = emailIds.flatMap((emailId) =>
      labelIds.map((labelId) => ({
        emailId,
        labelId,
        tenantId,
      }))
    );

    // Use createMany with skipDuplicates to avoid conflicts
    const result = await this.prisma.emailLabel.createMany({
      data: emailLabelPairs,
      skipDuplicates: true,
    });

    // Return updated emails with all relationships
    const updatedEmails = await this.getEmailsByIds(emailIds, tenantId);

    // Emit realtime update events for each email
    for (const email of updatedEmails) {
      this.realtimeEvents.emitEmailUpdate(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        email: email, // Send full email object
        reason: 'labels-updated',
      });
    }

    return { updated: result.count, emails: updatedEmails };
  }

  /**
   * Bulk remove labels from emails
   */
  async bulkRemoveLabels(
    emailIds: string[],
    tenantId: string,
    labelIds: string[],
  ) {
    const emails = await this.prisma.email.findMany({
      where: { id: { in: emailIds }, tenantId },
      select: { providerId: true },
    });
    await this.ensureProvidersActive(
      tenantId,
      Array.from(new Set(emails.map((email) => email.providerId))),
    );

    const result = await this.prisma.emailLabel.deleteMany({
      where: {
        emailId: { in: emailIds },
        labelId: { in: labelIds },
      },
    });

    // Return updated emails with all relationships
    const updatedEmails = await this.getEmailsByIds(emailIds, tenantId);

    // Emit realtime update events for each email
    for (const email of updatedEmails) {
      this.realtimeEvents.emitEmailUpdate(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        email: email, // Send full email object
        reason: 'labels-updated',
      });
    }

    return { deleted: result.count, emails: updatedEmails };
  }

  /**
   * Ensure providers belong to tenant and are active + email-capable.
   */
  private async ensureProvidersActive(tenantId: string, providerIds: string[]) {
    const uniqueIds = Array.from(new Set(providerIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return;
    }

    const providers = await this.prisma.providerConfig.findMany({
      where: {
        tenantId,
        id: { in: uniqueIds },
        isActive: true,
        supportsEmail: true,
      },
      select: { id: true },
    });

    if (providers.length !== uniqueIds.length) {
      throw new NotFoundException('Provider not found or inactive');
    }
  }

  /**
   * Get the actual drafts folder path for a provider
   */
  private async getDraftsFolderPath(providerId: string): Promise<string> {
    const folder = await this.prisma.folder.findFirst({
      where: {
        providerId,
        specialUse: 'DRAFTS',
      },
      select: { path: true, name: true },
    });
    return folder?.path || folder?.name || 'DRAFTS';
  }
}
