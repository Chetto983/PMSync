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
import { Injectable, Logger, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma, ProviderConfig } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CryptoService } from '../../../common/services/crypto.service';
import { validatePagination, buildPaginationMeta, emailListSelect, emailLabelsInclude } from '../../../common/utils';
import { EmailSyncBackService } from './email-sync-back.service';
import { KnowledgeBaseService } from '../../ai/services/knowledge-base.service';
import { EmailEmbeddingQueueService } from '../../ai/services/email-embedding.queue';
import { TriageFeedbackService } from '../../ai/services/triage-feedback.service';
import { TriagePromotionQueueService } from '../../ai/services/triage-promotion.queue';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { StorageService } from './storage.service';
import { EmailFolderService, EmailListFilters } from './email-folder.service';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { EmailDriverFactory } from '../../email-sync/drivers/driver.factory';
import type { DriverCredentials } from '../../email-sync/drivers/interfaces/email-driver.interface';
import type { ComposeMessage } from '../../email-sync/drivers/interfaces/canonical.types';

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
    private emailEmbeddingQueue: EmailEmbeddingQueueService,
    private realtimeEvents: RealtimeEventsService,
    private storageService: StorageService,
    private folderService: EmailFolderService,
    private providerTokenService: ProviderTokenService,
    private driverFactory: EmailDriverFactory,
    private crypto: CryptoService,
    @Optional() private readonly triageFeedbackService?: TriageFeedbackService,
    @Optional() private readonly triagePromotionQueue?: TriagePromotionQueueService,
  ) {}

  /**
   * Get paginated list of emails with filters
   * CRITICAL FIX: Added input validation for pagination params
   */
  async listEmails(params: EmailListParams) {
    const { tenantId, providerId, filters = {} } = params;
    const { page, limit, skip } = validatePagination({
      page: params.page,
      limit: params.limit,
      maxLimit: params.maxLimit,
    });

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
        select: emailListSelect,
      }),
    ]);

    return {
      emails,
      pagination: buildPaginationMeta(page, limit, total),
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
        ...emailLabelsInclude,
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
        ...emailLabelsInclude,
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
    data: { isRead?: boolean; isStarred?: boolean; isFlagged?: boolean; folder?: string; aiLabels?: string[] },
  ) {
    // Use transaction with row-level lock to prevent TOCTOU race condition
    const { updated, originalFolder, oldAiLabels } = await this.prisma.$transaction(async (tx) => {
      // Lock the row with FOR UPDATE to prevent concurrent modifications.
      // Phase 147 D-01: include `aiLabels` so we can snapshot the pre-update value
      // for the auto-diff feedback capture that fires after the transaction commits.
      const emails = await tx.$queryRaw<
        Array<{ id: string; providerId: string; folder: string; externalId: string; labels: string[]; aiLabels: string[] }>
      >`
        SELECT id, "providerId", folder, "externalId", labels, "aiLabels"
        FROM "emails"
        WHERE id = ${id} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;

      if (!emails.length) {
        throw new NotFoundException('Email not found');
      }

      const email = emails[0];
      await this.ensureProvidersActive(tenantId, [email.providerId]);

      // T-0204: When folder changes, update labels[] to stay in sync
      // This prevents drift between Email.folder and Email.labels[]
      const updateData: typeof data & { labels?: string[] } = { ...data };
      if (data.folder && data.folder !== email.folder) {
        updateData.labels = this.updateLabelsForFolderChange(
          email.labels || [],
          email.folder,
          data.folder,
        );
      }

      // Update within the same transaction
      const updatedEmail = await tx.email.update({
        where: { id_tenantId: { id, tenantId } },
        data: updateData,
        include: {
          provider: {
            select: {
              id: true,
              email: true,
              providerType: true,
            },
          },
          attachments: true,
          ...emailLabelsInclude,
        },
      });

      return {
        updated: updatedEmail,
        originalFolder: email.folder,
        oldAiLabels: email.aiLabels ? [...email.aiLabels] : [],
      };
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

    // Phase 147 D-01: auto-diff triage feedback capture.
    // Fire-and-forget — NEVER await, NEVER block the API response, NEVER place
    // inside the transaction (a feedback DB failure must not roll back the email update).
    if (data.aiLabels !== undefined && this.triageFeedbackService) {
      this.triageFeedbackService
        .captureLabelDiff(tenantId, id, oldAiLabels, data.aiLabels ?? [])
        .catch((err) =>
          this.logger.warn(
            `Triage feedback capture failed for ${id}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );

      // Phase 147 D-06 trigger 1: debounced promotion enqueue.
      if (this.triagePromotionQueue) {
        this.triagePromotionQueue
          .enqueueDebounced(tenantId)
          .catch((err) =>
            this.logger.warn(
              `Triage promotion enqueue failed for tenant=${tenantId}: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
      }
    }

    return updated;
  }

  /**
   * Phase 147 D-01 explicit path.
   * Records an explicit `signal='correction'` feedback row for a single AI-label
   * swap, then enqueues a debounced promotion run. Awaited so the API response
   * is only returned after the row is persisted; enqueue is fast, 5min BullMQ
   * dedup still collapses bursts.
   */
  async correctTriage(
    id: string,
    tenantId: string,
    dto: { type: 'label_correction'; oldValue?: string; newValue: string },
  ): Promise<{ ok: true }> {
    // Defense-in-depth tenant check on top of TenantGuard.
    const email = await this.prisma.email.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!email) throw new NotFoundException(`Email ${id} not found`);

    if (!this.triageFeedbackService) {
      this.logger.warn(`triageFeedbackService unavailable for correctTriage(${id})`);
      return { ok: true };
    }

    await this.triageFeedbackService.recordFeedback({
      tenantId,
      emailId: id,
      type: dto.type,
      signal: 'correction',
      oldValue: dto.oldValue ?? null,
      newValue: dto.newValue,
    });

    if (this.triagePromotionQueue) {
      await this.triagePromotionQueue.enqueueDebounced(tenantId);
    }

    return { ok: true };
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
      select: {
        id: true,
        email: true,
        providerType: true,
        imapHost: true,
        imapPort: true,
        imapUseTls: true,
        smtpHost: true,
        smtpPort: true,
        smtpUseTls: true,
        smtpPassword: true,
        smtpEncryptionIv: true,
        imapPassword: true,
        imapEncryptionIv: true,
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found or not active for this tenant');
    }

    const currentDraft = dto.id
      ? await this.prisma.email.findFirst({
          where: { id: dto.id, tenantId, isDraft: true },
          select: { id: true, externalId: true },
        })
      : null;

    if (dto.id && !currentDraft) {
      throw new NotFoundException('Draft not found');
    }

    const providerDraftId = await this.saveDraftToProvider(tenantId, provider, dto, currentDraft?.externalId, currentDraft?.id);
    const draftAttachments = dto.attachments ?? [];
    const draftsFolder = await this.folderService.getDraftsFolderPath(provider.id);
    const draftExternalId =
      providerDraftId || currentDraft?.externalId || dto.id || `draft-${randomUUID()}`;
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
      return this.prisma.email.findFirst({
        where: { id: dto.id, tenantId },
        include: emailLabelsInclude,
      });
    }

    return this.prisma.email.create({ data: createData, include: emailLabelsInclude });
  }

  /**
   * Get draft by ID
   */
  async getDraft(id: string, tenantId: string) {
    const draft = await this.prisma.email.findFirst({
      where: { id, tenantId, isDraft: true },
      include: emailLabelsInclude,
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
        provider: true,
      },
    });

    if (!draft) {
      return;
    }

    // Delete draft from provider (fire-and-forget -- don't block local cleanup)
    if (draft.externalId && draft.provider) {
      try {
        const providerType =
          draft.provider.providerType === 'generic' ? 'imap' : draft.provider.providerType;
        const accessToken =
          providerType === 'imap'
            ? this.getSmtpPassword(draft.provider)
            : (await this.providerTokenService.getProviderWithToken(draft.provider.id, tenantId))
                .accessToken;

        const credentials: DriverCredentials =
          providerType === 'imap'
            ? {
                type: 'basic',
                username: draft.provider.email,
                password: accessToken,
                imapHost: draft.provider.imapHost || undefined,
                imapPort: draft.provider.imapPort || undefined,
                imapTls: draft.provider.imapUseTls ?? true,
                smtpHost: draft.provider.smtpHost || undefined,
                smtpPort: draft.provider.smtpPort || undefined,
                smtpTls: draft.provider.smtpUseTls ?? true,
              }
            : {
                type: 'oauth2',
                accessToken,
                emailHint: draft.provider.email,
              };

        const driver = await this.driverFactory.createConnectedDriver(
          providerType as 'google' | 'microsoft' | 'imap',
          credentials,
        );
        try {
          await driver.deleteMessage(draft.externalId, true);
          this.logger.debug(
            `Draft ${id}: deleted from provider (externalId=${draft.externalId})`,
          );
        } finally {
          try {
            await driver.disconnect();
          } catch {
            // ignore disconnect errors
          }
        }
      } catch (error) {
        this.logger.warn(
          `Draft ${id}: provider delete failed - ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    const s3Keys = draft.attachments
      .filter((a) => a.storagePath)
      .map((a) => a.storagePath!);

    // E2 FIX: Cancel any queued embedding job before hard-deleting the draft
    // DB cascade handles existing embeddings, but in-flight queue jobs could fail
    await this.emailEmbeddingQueue.removeJobForEmail(id);

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

  private async saveDraftToProvider(
    tenantId: string,
    provider: Pick<
      ProviderConfig,
      | 'id'
      | 'email'
      | 'providerType'
      | 'imapHost'
      | 'imapPort'
      | 'imapUseTls'
      | 'smtpHost'
      | 'smtpPort'
      | 'smtpUseTls'
      | 'smtpPassword'
      | 'smtpEncryptionIv'
      | 'imapPassword'
      | 'imapEncryptionIv'
    >,
    dto: {
      id?: string;
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
    existingExternalId?: string | null,
    existingDraftId?: string,
  ): Promise<string | null> {
    const providerType = provider.providerType === 'generic' ? 'imap' : provider.providerType;
    let driver: Awaited<ReturnType<EmailDriverFactory['createConnectedDriver']>> | null = null;

    try {
      const accessToken =
        providerType === 'imap'
          ? this.getSmtpPassword(provider)
          : (await this.providerTokenService.getProviderWithToken(provider.id, tenantId)).accessToken;

      const credentials: DriverCredentials =
        providerType === 'imap'
          ? {
              type: 'basic',
              username: provider.email,
              password: accessToken,
              imapHost: provider.imapHost || undefined,
              imapPort: provider.imapPort || undefined,
              imapTls: provider.imapUseTls ?? true,
              smtpHost: provider.smtpHost || undefined,
              smtpPort: provider.smtpPort || undefined,
              smtpTls: provider.smtpUseTls ?? true,
            }
          : {
              type: 'oauth2',
              accessToken,
              emailHint: provider.email,
            };

      driver = await this.driverFactory.createConnectedDriver(
        providerType as 'google' | 'microsoft' | 'imap',
        credentials,
      );

      const composeMessage: ComposeMessage = {
        to: (dto.to ?? []).map((email) => ({ email })),
        cc: dto.cc?.map((email) => ({ email })),
        bcc: dto.bcc?.map((email) => ({ email })),
        subject: dto.subject ?? '',
        bodyHtml: dto.bodyHtml ?? '',
        bodyText: dto.bodyText ?? '',
        threadId: dto.threadId,
        inReplyTo: dto.inReplyTo,
        references: dto.references,
        attachments: dto.attachments?.map((attachment, index) => ({
          id: `draft-att-${index}`,
          filename: attachment.filename,
          mimeType: attachment.contentType,
          size: attachment.size ?? 0,
          isInline: false,
          content: this.normalizeDraftAttachmentContent(attachment.contentBase64),
        })),
      };

      const reusableExternalId =
        existingExternalId &&
        existingExternalId !== existingDraftId &&
        !existingExternalId.startsWith('draft-')
          ? existingExternalId
          : undefined;

      return await driver.saveDraft(composeMessage, reusableExternalId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to sync draft to provider ${provider.id}: ${message}`);
      throw new BadRequestException(`Failed to sync draft to provider: ${message}`);
    } finally {
      if (driver) {
        try {
          await driver.disconnect();
        } catch (error) {
          this.logger.warn(
            `Failed to disconnect draft driver for ${provider.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  }

  private normalizeDraftAttachmentContent(contentBase64?: string): string {
    if (!contentBase64) return '';
    return contentBase64.includes(',') ? contentBase64.split(',')[1] || '' : contentBase64;
  }

  private getSmtpPassword(
    provider: Pick<
      ProviderConfig,
      'id' | 'smtpPassword' | 'smtpEncryptionIv' | 'imapPassword' | 'imapEncryptionIv'
    >,
  ): string {
    if (provider.smtpPassword && provider.smtpEncryptionIv) {
      return this.crypto.decrypt(provider.smtpPassword, provider.smtpEncryptionIv);
    }
    if (provider.imapPassword && provider.imapEncryptionIv) {
      return this.crypto.decrypt(provider.imapPassword, provider.imapEncryptionIv);
    }
    throw new BadRequestException(
      `SMTP password not configured for provider ${provider.id}. Please update provider settings.`,
    );
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

  /**
   * T-0204: Update Email.labels[] to match a folder change.
   * Removes the old folder's system label and adds the new one,
   * preserving custom labels (Label_*) and non-folder system labels.
   */
  private updateLabelsForFolderChange(
    currentLabels: string[],
    oldFolder: string,
    newFolder: string,
  ): string[] {
    // Map folder names to Gmail label IDs
    const folderToLabel: Record<string, string> = {
      INBOX: 'INBOX',
      SENT: 'SENT',
      TRASH: 'TRASH',
      SPAM: 'SPAM',
      DRAFTS: 'DRAFT',
      PROMOTIONS: 'CATEGORY_PROMOTIONS',
      SOCIAL: 'CATEGORY_SOCIAL',
      UPDATES: 'CATEGORY_UPDATES',
      FORUMS: 'CATEGORY_FORUMS',
    };

    const oldLabel = folderToLabel[oldFolder.toUpperCase()];
    const newLabel = folderToLabel[newFolder.toUpperCase()];

    const updated = new Set(currentLabels);

    // Remove old folder label
    if (oldLabel) {
      updated.delete(oldLabel);
    }

    // Add new folder label (ARCHIVE has no Gmail label — just remove INBOX)
    if (newLabel) {
      updated.add(newLabel);
    }

    return Array.from(updated);
  }
}
