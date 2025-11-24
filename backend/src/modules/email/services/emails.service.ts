import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { EmailSyncBackService } from './email-sync-back.service';
import { KnowledgeBaseService } from '../../ai/services/knowledge-base.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';

export interface EmailListFilters {
  folder?: string;
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

      // Get folder records to map path -> id
      const folderRecords = await this.prisma.folder.findMany({
        where: {
          providerId,
          path: { in: folders, mode: 'insensitive' },
        },
        select: { id: true, path: true, name: true },
      });

      // Create a map for quick lookup: path -> folder record
      const folderMap = new Map(
        folderRecords.map((f) => [f.path.toUpperCase(), f]),
      );

      for (const folder of folders) {
        const folderRecord = folderMap.get(folder.toUpperCase());

        // Count total and unread emails in this folder
        const [totalCount, unreadCount] = await Promise.all([
          this.prisma.email.count({
            where: {
              tenantId,
              providerId,
              folder: { equals: folder, mode: 'insensitive' },
              isDeleted: folder.toUpperCase() === 'TRASH' ? undefined : false,
            },
          }),
          this.prisma.email.count({
            where: {
              tenantId,
              providerId,
              folder: { equals: folder, mode: 'insensitive' },
              isDeleted: folder.toUpperCase() === 'TRASH' ? undefined : false,
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
   */
  async listEmails(params: EmailListParams) {
    const {
      tenantId,
      providerId,
      page = 1,
      limit = 50,
      filters = {},
    } = params;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.EmailWhereInput = {
      tenantId,
      ...(providerId && { providerId }),
      ...(filters.folder && { folder: { equals: filters.folder, mode: 'insensitive' } }),
      // Only show deleted emails if we're viewing the TRASH folder
      ...(!filters.folder || filters.folder.toUpperCase() !== 'TRASH' ? { isDeleted: false } : {}),
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

    // Debug: log what we're returning
    this.logger.debug(`[listEmails] Returning ${emails.length} emails (total: ${total}) for tenantId=${tenantId}, providerId=${providerId || 'all'}, folder=${filters.folder || 'none'}`);

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
   */
  async getEmailById(id: string, tenantId: string) {
    const email = await this.prisma.email.findFirst({
      where: { id, tenantId },
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

    // Update in database first
    const updated = await this.prisma.email.update({
      where: { id },
      data,
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

    // Return complete email with all relationships
    const [updatedEmail] = await this.getEmailsByIds([id], tenantId);
    return updatedEmail || updated;
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
        folder: changes.folder,
      });
    }

    // Sync all operations
    if (operations.length > 0) {
      await this.emailSyncBack.syncOperationsBatch(operations);
    }
  }

  /**
   * Delete email - Mark as deleted and move to TRASH
   * Syncs to provider immediately
   */
  async deleteEmail(id: string, tenantId: string) {
    const email = await this.prisma.email.findFirst({
      where: { id, tenantId },
    });

    if (!email) {
      throw new NotFoundException('Email not found');
    }

    // If the email is already in trash, perform a permanent delete
    if (email.folder === 'TRASH' && email.isDeleted) {
      await this.knowledgeBaseService.deleteEmbeddingsForEmail(tenantId, id);
      await this.prisma.email.delete({ where: { id } });

      this.emailSyncBack
        .syncOperationToProvider({
          emailId: email.id,
          externalId: email.externalId,
          providerId: email.providerId,
          tenantId: email.tenantId,
          operation: 'hardDelete',
        })
        .catch((error) => {
          this.logger.error(`Failed to sync permanent email deletion to provider: ${error.message}`);
        });

      this.logger.log(`Email ${id} permanently deleted and synced to provider`);
      return { success: true };
    }

    // Mark as deleted and move to TRASH folder
    await this.prisma.email.update({
      where: { id },
      data: {
        isDeleted: true,
        folder: 'TRASH',
      },
    });

    await this.knowledgeBaseService.deleteEmbeddingsForEmail(tenantId, id);

    // Sync delete to provider (async, don't wait)
    this.emailSyncBack
      .syncOperationToProvider({
        emailId: email.id,
        externalId: email.externalId,
        providerId: email.providerId,
        tenantId: email.tenantId,
        operation: 'delete',
        folder: 'TRASH',
      })
      .catch((error) => {
        this.logger.error(`Failed to sync email deletion to provider: ${error.message}`);
      });

    this.logger.log(`Email ${id} marked as deleted and synced to provider`);
    return { success: true };
  }

  /**
   * Get email statistics
   */
  async getStats(tenantId: string, providerId?: string) {
    const where: Prisma.EmailWhereInput = {
      tenantId,
      ...(providerId && { providerId }),
    };

    const [total, unread, starred, byFolder] = await Promise.all([
      this.prisma.email.count({ where }),
      this.prisma.email.count({ where: { ...where, isRead: false } }),
      this.prisma.email.count({ where: { ...where, isStarred: true } }),
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
    const draftAttachments = dto.attachments ?? [];
    const data: Prisma.EmailUncheckedCreateInput = {
      id: dto.id ?? undefined,
      tenantId,
      providerId: dto.providerId,
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
      folder: 'DRAFTS',
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
   */
  async searchEmails(
    tenantId: string,
    query: string,
    providerId?: string,
    limit: number = 20,
  ) {
    const where: Prisma.EmailWhereInput = {
      tenantId,
      ...(providerId && { providerId }),
      isDeleted: false,
      folder: { notIn: ['TRASH', 'SPAM'] },
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

    // Get all non-deleted emails
    const where: Prisma.EmailWhereInput = {
      tenantId,
      ...(providerId && { providerId }),
      isDeleted: false,
      // If folder is specified, filter by it; otherwise exclude TRASH and SPAM
      ...(folder
        ? { folder }
        : { folder: { notIn: ['TRASH', 'SPAM'] } }
      ),
    };

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
   */
  async bulkDelete(emailIds: string[], tenantId: string) {
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

    // Track affected folders per provider for count updates
    const affectedFolders = new Map<string, Set<string>>();
    emails.forEach((email) => {
      if (!affectedFolders.has(email.providerId)) {
        affectedFolders.set(email.providerId, new Set());
      }
      // Add both original folder and TRASH folder
      if (email.folder) {
        affectedFolders.get(email.providerId)!.add(email.folder);
      }
      affectedFolders.get(email.providerId)!.add('TRASH');
    });

    // Soft delete in database
    const result = await this.prisma.email.updateMany({
      where: {
        id: { in: emailIds },
        tenantId,
      },
      data: { isDeleted: true, folder: 'TRASH' },
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
      operation: 'delete' as const,
    }));

    this.emailSyncBack.syncOperationsBatch(operations).catch((error) => {
      this.logger.error(`Failed to sync bulk delete to provider: ${error.message}`);
    });

    // Get updated emails to emit WebSocket events
    const deletedEmails = await this.getEmailsByIds(emailIds, tenantId);

    // Emit realtime delete events for each email
    for (const email of deletedEmails) {
      this.realtimeEvents.emitEmailDelete(tenantId, {
        emailId: email.id,
        providerId: email.providerId,
        folder: email.folder,
        email: email,
        reason: 'message-deleted',
      });
    }

    return { deleted: result.count, emails: deletedEmails };
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
      },
    });

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
      },
    });

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
      data: { fromFolder: email.folder, toFolder: folder },
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
   */
  async bulkAddLabels(
    emailIds: string[],
    tenantId: string,
    labelIds: string[],
  ) {
    // Verify labels exist and belong to tenant
    const labels = await this.prisma.userLabel.findMany({
      where: {
        id: { in: labelIds },
        tenantId,
      },
      select: { id: true },
    });

    if (labels.length !== labelIds.length) {
      throw new NotFoundException('One or more labels not found');
    }

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
}
