/**
 * EmailSearchService - Email search, stats, and conversation queries
 * Extracted from emails.service.ts for maintainability (<400 lines)
 *
 * Responsibilities:
 * - Full-text search across emails
 * - Email statistics by folder/status
 * - Conversation/thread queries
 * - Attachment download URL generation
 *
 * Note: This service is READ-ONLY (no mutations)
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { emailSearchSelect } from '../../../common/utils';
import { StorageService } from './storage.service';
import { EmailFolderService } from './email-folder.service';

@Injectable()
export class EmailSearchService {
  private readonly logger = new Logger(EmailSearchService.name);

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    private folderService: EmailFolderService,
  ) {}

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
    const { where: baseWhere } = await this.folderService.buildEmailWhere({
      tenantId,
      providerId,
      excludeTrashSpam: true,
      filters: { search: query },
    });

    const emails = await this.prisma.email.findMany({
      where: baseWhere,
      orderBy: { receivedAt: 'desc' },
      take: limit,
      select: emailSearchSelect,
    });

    return emails;
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
      // Exclude TRASH and SPAM from unread count
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
}
