import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { EmailSyncBackService } from './email-sync-back.service';
import { KnowledgeBaseService } from '../../ai/services/knowledge-base.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { StorageService } from './storage.service';
import { EmailFolderService, EmailListFilters, EmailWhereResult } from './email-folder.service';

// Re-export interfaces for backward compatibility
export type { EmailListFilters } from './email-folder.service';

export interface EmailListParams {
  tenantId: string;
  providerId?: string;
  page?: number;
  limit?: number;
  maxLimit?: number;
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
    private storageService: StorageService,
    private folderService: EmailFolderService,
  ) {}

  /** Maximum emails per bulk operation to prevent DoS */
  private readonly MAX_BULK_EMAILS = 1000;

  /**
   * Validate bulk operation input size
   * @throws BadRequestException if array exceeds limit
   */
  private validateBulkInput(ids: string[], operationName: string): void {
    if (!ids || ids.length === 0) {
      throw new BadRequestException(`${operationName}: No IDs provided`);
    }
    if (ids.length > this.MAX_BULK_EMAILS) {
      throw new BadRequestException(
        `${operationName}: Maximum ${this.MAX_BULK_EMAILS} items per operation (received ${ids.length})`,
      );
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
      maxLimit,
    } = params;

    // CRITICAL FIX: Input validation
    if (page < 1) {
      throw new BadRequestException('Page must be >= 1');
    }
    const effectiveMaxLimit = typeof maxLimit === 'number' && maxLimit > 0 ? maxLimit : 100;
    if (limit < 1 || limit > effectiveMaxLimit) {
      throw new BadRequestException(`Limit must be between 1 and ${effectiveMaxLimit}`);
    }

    const skip = (page - 1) * limit;

    const { where } = await this.folderService.buildEmailWhere({
      tenantId,
      providerId,
      folder: filters.folder,
      specialUse: filters.specialUse,
      filters,
      excludeTrashSpam: filters.excludeTrashSpam,
    });

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
          // PERFORMANCE: bodyHtml/bodyText removed from list - use getEmailById for full content
          // bodyHtml: true,  // Can be 100KB+ per email - fetch on detail view only
          // bodyText: true,  // Can be large - fetch on detail view only
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
              contentId: true,
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
   * RFC 6154: includeDeleted allows retrieving soft-deleted emails (for trash folder)
   */
  async getEmailById(id: string, tenantId: string, includeDeleted = false) {
    const email = await this.prisma.email.findFirst({
      where: {
        id,
        tenantId,
        // Only filter by isDeleted if not explicitly including deleted emails
        ...(includeDeleted ? {} : { isDeleted: false }),
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
            contentId: true,
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
   * FIX (RC-NEW-1): Uses FOR UPDATE lock to prevent lost updates from concurrent modifications
   */
  async updateEmail(
    id: string,
    tenantId: string,
    data: { isRead?: boolean; isStarred?: boolean; isFlagged?: boolean; folder?: string },
  ) {
    // Use transaction with row-level lock to prevent TOCTOU race condition
    const { updated, originalFolder } = await this.prisma.$transaction(async (tx) => {
      // Lock the row with FOR UPDATE to prevent concurrent modifications
      const emails = await tx.$queryRaw<
        Array<{ id: string; providerId: string; folder: string; externalId: string }>
      >`
        SELECT id, "providerId", folder, "externalId"
        FROM "emails"
        WHERE id = ${id} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;

      if (!emails.length) {
        throw new NotFoundException('Email not found');
      }

      const email = emails[0];
      await this.ensureProvidersActive(tenantId, [email.providerId]);

      // Update within the same transaction
      const updatedEmail = await tx.email.update({
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

      return { updated: updatedEmail, originalFolder: email.folder };
    });

    const targetFolder = data.folder ?? originalFolder;

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
      if (data.folder && data.folder !== originalFolder) {
        affectedFolders.push(originalFolder);
      }

      // Update folder counts (async, don't wait)
      this.folderService.updateFolderCounts(tenantId, updated.providerId, affectedFolders).catch((error) => {
        this.logger.error(`Failed to update folder counts: ${error.message}`);
      });
    }

    // Sync changes back to provider (async, don't wait)
    this.syncChangesToProvider(updated, data).catch((error) => {
      this.logger.error(`Failed to sync email update to provider: ${error.message}`);
    });

    // Return the already-complete email (no duplicate query needed)
    return updated;
  }

  /**
   * Sync email changes back to provider
   */
  private async syncChangesToProvider(
    email: { id: string; externalId: string; providerId: string; tenantId: string; folder: string },
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
   * FIX (RC-NEW-3): Uses FOR UPDATE lock to prevent TOCTOU race condition
   */
  async deleteEmail(id: string, tenantId: string) {
    // Use transaction with row-level lock to prevent race condition
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock the row with FOR UPDATE to prevent concurrent modifications
      const emails = await tx.$queryRaw<
        Array<{
          id: string;
          externalId: string;
          providerId: string;
          tenantId: string;
          folder: string;
          isDeleted: boolean;
        }>
      >`
        SELECT id, "externalId", "providerId", "tenantId", folder, "isDeleted"
        FROM "emails"
        WHERE id = ${id} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;

      if (!emails.length) {
        throw new NotFoundException('Email not found');
      }

      const email = emails[0];

      // If already deleted, permanent delete (within same transaction)
      if (email.isDeleted) {
        await this.knowledgeBaseService.deleteEmbeddingsForEmail(tenantId, id);
        await tx.email.delete({ where: { id } });
        return { action: 'hard_delete' as const, email };
      }

      // Get trash folder path for this provider (locale-aware)
      const trashFolder = await this.folderService.getTrashFolderPath(email.providerId);

      // Soft delete: Mark deleted and move to trash folder
      await tx.email.update({
        where: { id },
        data: { isDeleted: true, folder: trashFolder },
      });

      await this.knowledgeBaseService.deleteEmbeddingsForEmail(tenantId, id);

      return { action: 'soft_delete' as const, email, trashFolder };
    });

    const { action, email } = result;

    // Sync to provider (fire-and-forget, outside transaction)
    if (action === 'hard_delete') {
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

      this.realtimeEvents.emitEmailDelete(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        reason: 'message-deleted',
      });

      this.folderService.updateFolderCounts(tenantId, email.providerId, [email.folder]).catch((error) => {
        this.logger.error(`Failed to update folder counts: ${error.message}`);
      });
    } else {
      const { trashFolder } = result as { trashFolder: string; action: 'soft_delete'; email: typeof email };
      const originalFolder = email.folder;

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

      this.realtimeEvents.emitEmailDelete(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: originalFolder,
        reason: 'message-deleted',
      });

      this.folderService.updateFolderCounts(tenantId, email.providerId, [originalFolder, trashFolder]).catch((error) => {
        this.logger.error(`Failed to update folder counts: ${error.message}`);
      });
    }

    return { success: true };
  }

  /**
   * Get email statistics
   * Returns counts for smart filters (unread, starred, today, thisWeek, attachments, important)
   * IMPORTANT: Unread count excludes TRASH and SPAM folders (RFC 6154 specialUse)
   */
  async getStats(tenantId: string, providerId?: string) {
    const [{ where }, { where: whereExcludingTrashSpam }] = await Promise.all([
      this.folderService.buildEmailWhere({ tenantId, providerId }),
      this.folderService.buildEmailWhere({ tenantId, providerId, excludeTrashSpam: true }),
    ]);

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
      // CRITICAL: Exclude TRASH and SPAM from unread count
      this.prisma.email.count({ where: { ...whereExcludingTrashSpam, isRead: false } }),
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
    const draftsFolder = await this.folderService.getDraftsFolderPath(provider.id);
    // RACE CONDITION FIX RC-6: Use UUID instead of Date.now() to prevent collisions
    // Date.now() can produce same value for concurrent requests in same millisecond
    const draftExternalId = dto.id ?? `draft-${randomUUID()}`;
    const createData: Prisma.EmailUncheckedCreateInput = {
      id: dto.id ?? undefined,
      tenantId,
      providerId: provider.id,
      externalId: draftExternalId,
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
      const { id: _id, ...updateData } = createData;
      const result = await this.prisma.email.updateMany({
        where: { id: dto.id, tenantId, isDraft: true },
        data: updateData,
      });
      if (result.count === 0) {
        throw new NotFoundException('Draft not found');
      }
      return this.prisma.email.findUnique({ where: { id: dto.id } });
    }

    return this.prisma.email.create({ data: createData });
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
   * Delete draft with proper S3 attachment cleanup
   * EMAIL-1.2 FIX: Get attachments before deletion, then clean up S3
   */
  async deleteDraft(id: string, tenantId: string) {
    // Get draft with attachments BEFORE deletion (to get S3 keys)
    const draft = await this.prisma.email.findFirst({
      where: { id, tenantId, isDraft: true },
      include: {
        attachments: {
          where: { storageType: 's3' },
          select: { storagePath: true },
        },
      },
    });

    if (!draft) {
      // Draft doesn't exist or doesn't belong to tenant - nothing to delete
      return;
    }

    // Collect S3 keys for cleanup
    const s3Keys = draft.attachments
      .filter((a) => a.storagePath)
      .map((a) => a.storagePath!);

    // Delete email from database (cascades to attachments table)
    await this.prisma.email.delete({
      where: { id },
    });

    // Clean up S3 files after DB deletion (best effort - orphans tracked by cleanup service)
    if (s3Keys.length > 0) {
      try {
        const result = await this.storageService.deleteObjects(s3Keys);
        if (result.failed > 0) {
          this.logger.warn(
            `Draft ${id}: ${result.failed}/${s3Keys.length} S3 objects failed to delete`,
          );
        }
      } catch (error) {
        // Log but don't fail - orphaned S3 keys will be cleaned up by scheduled job
        this.logger.warn(
          `Draft ${id}: S3 cleanup failed - ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  }

  /**
   * Mark multiple emails as read/unread - syncs to provider
   */
  async bulkUpdateRead(
    emailIds: string[],
    tenantId: string,
    isRead: boolean,
  ) {
    this.validateBulkInput(emailIds, 'bulkUpdateRead');

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
      this.folderService.updateFolderCounts(tenantId, providerId, Array.from(folders)).catch((error) => {
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
    // Use buildEmailWhere with excludeTrashSpam=true for cached folder lookup
    const { where: baseWhere } = await this.folderService.buildEmailWhere({
      tenantId,
      providerId,
      excludeTrashSpam: true,
      filters: { search: query },
    });

    const where = baseWhere;

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

    const { isTrashView, folderValues, excludedFolderPaths } = await this.folderService.buildEmailWhere({
      tenantId,
      providerId,
      folder,
      defaultExcludeTrashSpam: true,
    });

    const whereSql = this.folderService.buildConversationWhereSql({
      tenantId,
      providerId,
      isTrashView,
      folderValues,
      excludedFolderPaths,
    });

    const [conversationGroups, totalRows] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          threadKey: string;
          latestReceivedAt: Date;
          emailCount: number;
          hasUnread: boolean;
          hasStarred: boolean;
          hasFlagged: boolean;
        }>
      >`
        SELECT
          COALESCE("threadId", id::text) AS "threadKey",
          MAX("receivedAt") AS "latestReceivedAt",
          COUNT(*)::int AS "emailCount",
          BOOL_OR(NOT "isRead") AS "hasUnread",
          BOOL_OR("isStarred") AS "hasStarred",
          BOOL_OR("isFlagged") AS "hasFlagged"
        FROM "emails"
        WHERE ${whereSql}
        GROUP BY "threadKey"
        ORDER BY "latestReceivedAt" DESC
        LIMIT ${limit} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total
        FROM (
          SELECT COALESCE("threadId", id::text) AS "threadKey"
          FROM "emails"
          WHERE ${whereSql}
          GROUP BY "threadKey"
        ) grouped
      `,
    ]);

    const total = totalRows[0]?.total ?? 0;
    if (conversationGroups.length === 0) {
      return {
        conversations: [],
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    const threadKeys = conversationGroups.map((row) => row.threadKey);
    const latestEmailsByThread = await this.prisma.$queryRaw<
      Array<{ threadKey: string; emailId: string }>
    >`
      SELECT DISTINCT ON (COALESCE("threadId", id::text))
        COALESCE("threadId", id::text) AS "threadKey",
        id AS "emailId"
      FROM "emails"
      WHERE ${whereSql}
        AND COALESCE("threadId", id::text) IN (${Prisma.join(threadKeys)})
      ORDER BY COALESCE("threadId", id::text), "receivedAt" DESC, id DESC
    `;

    const latestByThread = new Map(
      latestEmailsByThread.map((row) => [row.threadKey, row.emailId]),
    );
    const latestEmailIds = Array.from(
      new Set(latestEmailsByThread.map((row) => row.emailId)),
    );

    const latestEmails = await this.prisma.email.findMany({
      where: {
        tenantId,
        id: { in: latestEmailIds },
      },
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

    const latestEmailMap = new Map(latestEmails.map((email) => [email.id, email]));

    const conversations = conversationGroups.flatMap((group) => {
      const latestEmailId = latestByThread.get(group.threadKey);
      const latestEmail = latestEmailId ? latestEmailMap.get(latestEmailId) : undefined;
      if (!latestEmail) {
        return [];
      }

      return [
        {
          threadId: group.threadKey,
          subject: latestEmail.subject,
          from: latestEmail.from,
          to: latestEmail.to,
          snippet: latestEmail.snippet,
          folder: latestEmail.folder,
          labels: latestEmail.labels,
          emailLabels: latestEmail.emailLabels,
          isRead: !group.hasUnread,
          isStarred: group.hasStarred,
          isFlagged: group.hasFlagged,
          receivedAt: latestEmail.receivedAt,
          sentAt: latestEmail.sentAt,
          emailCount: group.emailCount,
          latestEmailId: latestEmail.id,
        },
      ];
    });

    return {
      conversations,
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
   * RFC 6154: includeDeleted allows retrieving soft-deleted emails (for trash folder)
   */
  async getThread(threadId: string, tenantId: string, includeDeleted = false) {
    const emails = await this.prisma.email.findMany({
      where: {
        tenantId,
        OR: [
          { threadId },
          { id: threadId }, // In case threadId is actually an email ID
        ],
        // Only filter by isDeleted if not explicitly including deleted emails
        ...(includeDeleted ? {} : { isDeleted: false }),
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
   * - Not deleted: mark isDeleted and move to trash folder
   */
  async bulkDelete(emailIds: string[], tenantId: string) {
    this.validateBulkInput(emailIds, 'bulkDelete');

    const emails = await this.prisma.email.findMany({
      where: { id: { in: emailIds }, tenantId },
      select: { id: true, externalId: true, providerId: true, tenantId: true, folder: true, isDeleted: true },
    });

    await this.knowledgeBaseService.deleteEmbeddingsForEmails(
      tenantId,
      emails.map((email) => email.id),
    );

    await this.ensureProvidersActive(tenantId, Array.from(new Set(emails.map((e) => e.providerId))));

    // Split: already deleted = hard delete, not deleted = soft delete
    const toHardDelete = emails.filter((e) => e.isDeleted);
    const toSoftDelete = emails.filter((e) => !e.isDeleted);

    this.logger.debug(`[bulkDelete] Processing ${toSoftDelete.length} soft, ${toHardDelete.length} hard deletes`);

    // Get trash folder paths for each provider (locale-aware)
    const providerTrashFolders = new Map<string, string>();
    const uniqueProviderIds = Array.from(new Set(toSoftDelete.map((e) => e.providerId)));
    for (const providerId of uniqueProviderIds) {
      const trashFolder = await this.folderService.getTrashFolderPath(providerId);
      providerTrashFolders.set(providerId, trashFolder);
    }

    // CRITICAL FIX: Wrap all database operations in transaction for atomicity
    const { softDeleteCount, hardDeleteCount } = await this.prisma.$transaction(async (tx) => {
      let softCount = 0;
      let hardCount = 0;

      // Soft delete - mark isDeleted and move to trash folder
      // Group by provider since each may have different trash folder name
      for (const [providerId, trashFolder] of providerTrashFolders) {
        const emailsForProvider = toSoftDelete.filter((e) => e.providerId === providerId);
        if (emailsForProvider.length > 0) {
          const result = await tx.email.updateMany({
            where: { id: { in: emailsForProvider.map((e) => e.id) }, tenantId },
            data: { isDeleted: true, folder: trashFolder },
          });
          softCount += result.count;
        }
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

    // Track affected folders for count updates (both source and trash folders)
    const affectedFolders = new Map<string, Set<string>>();
    for (const email of emails) {
      if (!affectedFolders.has(email.providerId)) {
        affectedFolders.set(email.providerId, new Set());
      }
      affectedFolders.get(email.providerId)!.add(email.folder);
      // Also add trash folder if this was a soft delete
      const trashFolder = providerTrashFolders.get(email.providerId);
      if (trashFolder && !email.isDeleted) {
        affectedFolders.get(email.providerId)!.add(trashFolder);
      }
    }

    for (const [providerId, folders] of affectedFolders.entries()) {
      this.folderService.updateFolderCounts(tenantId, providerId, Array.from(folders)).catch((error) => {
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
    this.validateBulkInput(emailIds, 'bulkUpdateStarred');

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
      data: {
        isStarred,
        isFlagged: isStarred
      },
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
    this.validateBulkInput(emailIds, 'bulkUpdateFlagged');

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
    // UNIFICATION FIX: Update both isFlagged and isStarred to ensure UI consistency
    // Frontend checks (isStarred || isFlagged || isImportant), so we must sync them.
    const result = await this.prisma.email.updateMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      data: {
        isFlagged,
        isStarred: isFlagged
      },
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
    this.validateBulkInput(emailIds, 'bulkMoveToFolder');

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
      this.folderService.updateFolderCounts(tenantId, providerId, Array.from(folders)).catch((error) => {
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
    this.validateBulkInput(emailIds, 'bulkAddLabels');
    this.validateBulkInput(labelIds, 'bulkAddLabels (labels)');

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
      // BUG FIX B-4: Include email id in select for tenant-safe filtering
      // Get emails for provider validation AND to filter to only tenant's emails
      this.prisma.email.findMany({
        where: { id: { in: emailIds }, tenantId },
        select: { id: true, providerId: true },
      }),
    ]);

    if (labels.length !== labelIds.length) {
      throw new NotFoundException('One or more labels not found');
    }

    // BUG FIX B-4: Only use email IDs that were found in tenant-scoped query
    // This prevents cross-tenant label manipulation if foreign emailIds are passed
    const validatedEmailIds = emails.map((e) => e.id);
    if (validatedEmailIds.length === 0) {
      throw new NotFoundException('No valid emails found for this tenant');
    }

    await this.ensureProvidersActive(
      tenantId,
      Array.from(new Set(emails.map((email) => email.providerId))),
    );

    // Create email-label associations
    // BUG FIX B-3: EmailLabel schema has no tenantId field - removed from createMany data
    // BUG FIX B-4: Use validatedEmailIds (tenant-safe) instead of original emailIds
    const emailLabelPairs = validatedEmailIds.flatMap((emailId) =>
      labelIds.map((labelId) => ({
        emailId,
        labelId,
      }))
    );

    // Use createMany with skipDuplicates to avoid conflicts
    const result = await this.prisma.emailLabel.createMany({
      data: emailLabelPairs,
      skipDuplicates: true,
    });

    // Return updated emails with all relationships
    // BUG FIX B-4: Use validatedEmailIds for consistency
    const updatedEmails = await this.getEmailsByIds(validatedEmailIds, tenantId);

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
    this.validateBulkInput(emailIds, 'bulkRemoveLabels');
    this.validateBulkInput(labelIds, 'bulkRemoveLabels (labels)');

    // BUG FIX B-4: Include email id in select for tenant-safe filtering
    const emails = await this.prisma.email.findMany({
      where: { id: { in: emailIds }, tenantId },
      select: { id: true, providerId: true },
    });

    // BUG FIX B-4: Only use email IDs that were found in tenant-scoped query
    const validatedEmailIds = emails.map((e) => e.id);
    if (validatedEmailIds.length === 0) {
      return { deleted: 0, emails: [] };
    }

    await this.ensureProvidersActive(
      tenantId,
      Array.from(new Set(emails.map((email) => email.providerId))),
    );

    // BUG FIX B-4: Use validatedEmailIds (tenant-safe) instead of original emailIds
    const result = await this.prisma.emailLabel.deleteMany({
      where: {
        emailId: { in: validatedEmailIds },
        labelId: { in: labelIds },
      },
    });

    // Return updated emails with all relationships
    // BUG FIX B-4: Use validatedEmailIds for consistency
    const updatedEmails = await this.getEmailsByIds(validatedEmailIds, tenantId);

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
}
