/**
 * EmailCrudService - Single email CRUD operations
 * Extracted from emails.service.ts for maintainability (<450 lines)
 *
 * Responsibilities:
 * - Get single/multiple emails by ID
 * - List emails with pagination and filters
 * - Update email flags (read, starred, flagged, folder)
 * - Delete single email (soft/hard)
 * - Draft operations (save, get, delete)
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { EmailSyncBackService } from './email-sync-back.service';
import { KnowledgeBaseService } from '../../ai/services/knowledge-base.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { StorageService } from './storage.service';
import { EmailFolderService, EmailListFilters } from './email-folder.service';

export interface EmailListParams {
  tenantId: string;
  providerId?: string;
  page?: number;
  limit?: number;
  maxLimit?: number;
  filters?: EmailListFilters;
}

@Injectable()
export class EmailCrudService {
  private readonly logger = new Logger(EmailCrudService.name);

  constructor(
    private prisma: PrismaService,
    private emailSyncBack: EmailSyncBackService,
    private knowledgeBaseService: KnowledgeBaseService,
    private realtimeEvents: RealtimeEventsService,
    private storageService: StorageService,
    private folderService: EmailFolderService,
  ) {}

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

    const { where, fromVip } = await this.folderService.buildEmailWhere({
      tenantId,
      providerId,
      folder: filters.folder,
      specialUse: filters.specialUse,
      filters,
      excludeTrashSpam: filters.excludeTrashSpam,
    });

    // VIP filter: Get emails from VIP contacts
    if (fromVip) {
      // Get all VIP contact emails for this tenant
      const vipContacts = await this.prisma.contact.findMany({
        where: { tenantId, isVip: true, isDeleted: false },
        select: { emails: true },
      });

      // Extract email addresses from VIP contacts
      const vipEmails: string[] = [];
      for (const contact of vipContacts) {
        if (contact.emails && Array.isArray(contact.emails)) {
          for (const emailObj of contact.emails as Array<{ value?: string }>) {
            if (emailObj.value) {
              vipEmails.push(emailObj.value.toLowerCase());
            }
          }
        }
      }

      // If no VIP emails, return empty result
      if (vipEmails.length === 0) {
        return {
          emails: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        };
      }

      // Add VIP filter into AND to avoid clobbering existing OR conditions (was BUG-2)
      const vipCondition: Prisma.EmailWhereInput = {
        OR: vipEmails.map((vipEmail) => ({
          from: { contains: vipEmail, mode: 'insensitive' as const },
        })),
      };
      const existing = where.AND;
      const prev = Array.isArray(existing) ? existing : existing ? [existing] : [];
      where.AND = [...prev, vipCondition];
    }

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
          snippet: true,
          folder: true,
          labels: true,
          isRead: true,
          isStarred: true,
          isFlagged: true,
          sentAt: true,
          receivedAt: true,
          size: true,
          aiPriority: true,
          aiPriorityReason: true,
          aiSentiment: true,
          aiLabels: true,
          isAutoTriaged: true,
          autoTriagedAt: true,
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
        where: { id_tenantId: { id, tenantId } },
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

    // Emit realtime update event with appropriate reason
    let reason: 'read-status-updated' | 'starred-updated' | 'flagged-updated' | 'folder-updated' | 'message-processed' = 'message-processed';
    if (data.isRead !== undefined) {
      reason = 'read-status-updated';
    } else if (data.isStarred !== undefined) {
      reason = 'starred-updated';
    } else if (data.isFlagged !== undefined) {
      reason = 'flagged-updated';
    } else if (data.folder !== undefined) {
      reason = 'folder-updated';
    }

    this.realtimeEvents.emitEmailUpdate(tenantId, {
      emailId: updated.id,
      providerId: updated.providerId,
      folder: targetFolder,
      sourceFolder:
        data.folder && data.folder !== originalFolder ? originalFolder : undefined,
      threadId: updated.threadId ?? undefined,
      updates: data,
      reason,
    });

    // Update folder counts if isRead changed or folder changed
    if (data.isRead !== undefined || data.folder) {
      const affectedFolders: string[] = [targetFolder];
      if (data.folder && data.folder !== originalFolder) {
        affectedFolders.push(originalFolder);
      }

      this.folderService.updateFolderCounts(tenantId, updated.providerId, affectedFolders).catch((error) => {
        this.logger.error(`Failed to update folder counts: ${error.message}`);
      });
    }

    // Sync changes back to provider (async, don't wait)
    this.syncChangesToProvider(updated, data).catch((error) => {
      this.logger.error(`Failed to sync email update to provider: ${error.message}`);
    });

    return updated;
  }

  /**
   * Delete email - Sync to provider, provider handles folder move
   * FIX (RC-NEW-3): Uses FOR UPDATE lock to prevent TOCTOU race condition
   */
  async deleteEmail(id: string, tenantId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
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

      // If already deleted, permanent delete
      if (email.isDeleted) {
        await this.knowledgeBaseService.deleteEmbeddingsForEmail(tenantId, id);
        await tx.email.delete({ where: { id_tenantId: { id, tenantId } } });
        return { action: 'hard_delete' as const, email };
      }

      // Get trash folder path for this provider
      const trashFolder = await this.folderService.getTrashFolderPath(email.providerId);

      // Soft delete: Mark deleted and move to trash folder
      await tx.email.update({
        where: { id_tenantId: { id, tenantId } },
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

  // ============================================================================
  // DRAFT OPERATIONS
  // ============================================================================

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
      return this.prisma.email.findFirst({ where: { id: dto.id, tenantId } });
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
   */
  async deleteDraft(id: string, tenantId: string) {
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
      return;
    }

    const s3Keys = draft.attachments
      .filter((a) => a.storagePath)
      .map((a) => a.storagePath!);

    await this.prisma.email.delete({
      where: { id_tenantId: { id, tenantId } },
    });

    if (s3Keys.length > 0) {
      try {
        const result = await this.storageService.deleteObjects(s3Keys);
        if (result.failed > 0) {
          this.logger.warn(
            `Draft ${id}: ${result.failed}/${s3Keys.length} S3 objects failed to delete`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Draft ${id}: S3 cleanup failed - ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Sync email changes back to provider
   */
  private async syncChangesToProvider(
    email: { id: string; externalId: string; providerId: string; tenantId: string; folder: string },
    changes: { isRead?: boolean; isStarred?: boolean; isFlagged?: boolean; folder?: string },
  ) {
    const operations = [];

    if (changes.isRead !== undefined) {
      operations.push({
        emailId: email.id,
        externalId: email.externalId,
        providerId: email.providerId,
        tenantId: email.tenantId,
        operation: changes.isRead ? ('markRead' as const) : ('markUnread' as const),
        sourceFolder: email.folder,
      });
    }

    if (changes.isStarred !== undefined) {
      operations.push({
        emailId: email.id,
        externalId: email.externalId,
        providerId: email.providerId,
        tenantId: email.tenantId,
        operation: changes.isStarred ? ('star' as const) : ('unstar' as const),
        sourceFolder: email.folder,
      });
    }

    if (changes.isFlagged !== undefined) {
      operations.push({
        emailId: email.id,
        externalId: email.externalId,
        providerId: email.providerId,
        tenantId: email.tenantId,
        operation: changes.isFlagged ? ('flag' as const) : ('unflag' as const),
        sourceFolder: email.folder,
      });
    }

    if (changes.folder) {
      operations.push({
        emailId: email.id,
        externalId: email.externalId,
        providerId: email.providerId,
        tenantId: email.tenantId,
        operation: 'moveToFolder' as const,
        sourceFolder: email.folder,
        folder: changes.folder,
      });
    }

    if (operations.length > 0) {
      await this.emailSyncBack.syncOperationsBatch(operations);
    }
  }

  /**
   * Ensure providers belong to tenant and are active + email-capable.
   */
  async ensureProvidersActive(tenantId: string, providerIds: string[]) {
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
