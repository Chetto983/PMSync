import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AgentAction, AgentActionType } from '../interfaces/agent-action.interface';
import { AgentContext } from '../interfaces/agent-context.interface';
import { EmailSendService } from '../../../email/services/email-send.service';
import { EmailSyncBackService } from '../../../email/services/email-sync-back.service';
import { CalendarService } from '../../../calendar/services/calendar.service';
import { FolderSyncService } from '../../../email-sync/services/folder-sync.service';
import { BulkOperationsQueueService } from '../../../email-sync/services/bulk-operations-queue.service';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { CorrelationContext } from '../../../../common/services/correlation-context.service';
import {
  getLocale,
  actionSummaries as t,
  formatDateForLocale,
} from '../locales/action-summaries';
import { EXCLUDE_JUNK_FOLDERS } from '../../../email/email.helpers';
import { AiError, AiErrorCode } from '../../errors';

/** Default TTL for idempotency keys (5 minutes) */
const IDEMPOTENCY_TTL_SECONDS = 300;

/**
 * Result of executing an action.
 */
export interface ActionExecutionResult {
  success: boolean;
  data?: Record<string, unknown>;
  summary?: string | string[];
  error?: string;
  executionTimeMs: number;
}

/**
 * ActionExecutorService executes approved actions by delegating
 * to the appropriate domain services (Email, Calendar, Contacts).
 *
 * This service acts as a bridge between the multi-agent system
 * and the existing application services.
 */
@Injectable()
export class ActionExecutorService {
  private readonly logger = new Logger(ActionExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly emailSendService: EmailSendService,
    @Optional() private readonly emailSyncBackService: EmailSyncBackService,
    @Optional() private readonly calendarService: CalendarService,
    @Optional() @Inject(forwardRef(() => FolderSyncService))
    private readonly folderSyncService: FolderSyncService,
    @Optional() private readonly bulkOperationsQueue: BulkOperationsQueueService,
    @Optional() private readonly cacheService?: CacheService,
  ) { }

  /**
   * Execute an action and return the result.
   * Routes to appropriate handler based on action type.
   *
   * Supports idempotency keys to prevent duplicate execution on retries.
   * If an action has an idempotencyKey and was already executed within
   * the TTL window, returns the cached result instead of re-executing.
   */
  async execute(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const startTime = Date.now();
    // Get correlation ID from context or global context
    const corrId = context.correlationId || CorrelationContext.getCorrelationId();
    const logPrefix = `[${corrId}] [tenant:${context.tenantId}]`;

    this.logger.log(
      `${logPrefix} Executing action ${action.type}`,
    );

    // Check idempotency key if provided
    if (action.idempotencyKey && this.cacheService) {
      const existingResult = await this.checkIdempotency(action.idempotencyKey);
      if (existingResult) {
        this.logger.log(
          `${logPrefix} Action ${action.type} skipped - idempotency key already executed`,
        );
        return existingResult;
      }
    }

    try {
      let result: ActionExecutionResult;

      // Route to appropriate executor based on action type
      switch (action.type) {
        // Email actions
        case AgentActionType.SEND_EMAIL:
          result = await this.executeSendEmail(action, context);
          break;
        case AgentActionType.REPLY_EMAIL:
          result = await this.executeReplyEmail(action, context);
          break;
        case AgentActionType.FORWARD_EMAIL:
          result = await this.executeForwardEmail(action, context);
          break;
        case AgentActionType.DELETE_EMAIL:
          result = await this.executeDeleteEmail(action, context);
          break;
        case AgentActionType.ARCHIVE_EMAIL:
          result = await this.executeArchiveEmail(action, context);
          break;
        case AgentActionType.MARK_READ:
        case AgentActionType.MARK_UNREAD:
          result = await this.executeMarkEmail(action, context);
          break;
        case AgentActionType.STAR_EMAIL:
        case AgentActionType.UNSTAR_EMAIL:
          result = await this.executeStarEmail(action, context);
          break;
        case AgentActionType.SEARCH_EMAILS:
          result = await this.executeSearchEmails(action, context);
          break;
        case AgentActionType.LABEL_EMAIL:
          result = await this.executeLabelEmail(action, context);
          break;

        // Calendar actions
        case AgentActionType.CREATE_EVENT:
          result = await this.executeCreateEvent(action, context);
          break;
        case AgentActionType.UPDATE_EVENT:
          result = await this.executeUpdateEvent(action, context);
          break;
        case AgentActionType.DELETE_EVENT:
          result = await this.executeDeleteEvent(action, context);
          break;
        case AgentActionType.GET_EVENTS:
          result = await this.executeGetEvents(action, context);
          break;
        case AgentActionType.CHECK_AVAILABILITY:
          result = await this.executeCheckAvailability(action, context);
          break;

        // Contact actions
        case AgentActionType.CREATE_CONTACT:
          result = await this.executeCreateContact(action, context);
          break;
        case AgentActionType.UPDATE_CONTACT:
          result = await this.executeUpdateContact(action, context);
          break;
        case AgentActionType.DELETE_CONTACT:
          result = await this.executeDeleteContact(action, context);
          break;
        case AgentActionType.SEARCH_CONTACTS:
          result = await this.executeSearchContacts(action, context);
          break;
        case AgentActionType.MERGE_CONTACTS:
          result = await this.executeMergeContacts(action, context);
          break;
        case AgentActionType.GET_CONTACT:
          result = await this.executeGetContact(action, context);
          break;

        // Additional email actions
        case AgentActionType.GET_UNREAD:
          result = await this.executeGetUnread(action, context);
          break;
        case AgentActionType.CATEGORIZE_EMAIL:
          result = await this.executeCategorizeEmail(action, context);
          break;

        // Additional calendar actions
        case AgentActionType.RESCHEDULE_EVENT:
          result = await this.executeRescheduleEvent(action, context);
          break;

        // Folder actions
        case AgentActionType.CREATE_FOLDER:
          result = await this.executeCreateFolder(action, context);
          break;
        case AgentActionType.RENAME_FOLDER:
          result = await this.executeRenameFolder(action, context);
          break;
        case AgentActionType.DELETE_FOLDER:
          result = await this.executeDeleteFolder(action, context);
          break;

        // Bulk email actions
        case AgentActionType.BULK_DELETE_EMAILS:
        case AgentActionType.EMPTY_FOLDER:
          result = await this.executeBulkDeleteEmails(action, context);
          break;
        case AgentActionType.BULK_ARCHIVE_EMAILS:
          result = await this.executeBulkArchiveEmails(action, context);
          break;
        case AgentActionType.BULK_MARK_READ:
          result = await this.executeBulkMarkRead(action, context);
          break;
        case AgentActionType.BULK_MOVE_EMAILS:
          result = await this.executeBulkMoveEmails(action, context);
          break;

        default:
          result = {
            success: false,
            error: `Unknown action type: ${action.type}`,
            executionTimeMs: Date.now() - startTime,
          };
      }

      result.executionTimeMs = Date.now() - startTime;
      this.logger.log(
        `${logPrefix} Action ${action.type} completed in ${result.executionTimeMs}ms, success: ${result.success}`,
      );

      // Store idempotency key if action succeeded and key was provided
      if (result.success && action.idempotencyKey && this.cacheService) {
        await this.storeIdempotencyResult(action.idempotencyKey, result);
      }

      return result;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`${logPrefix} Action ${action.type} failed: ${err.message}`, err.stack);
      return {
        success: false,
        error: err.message,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  // ===============================
  // IDEMPOTENCY HELPERS
  // ===============================

  /**
   * Check if an action with this idempotency key was already executed.
   * Returns the cached result if found, null otherwise.
   */
  private async checkIdempotency(
    idempotencyKey: string,
  ): Promise<ActionExecutionResult | null> {
    if (!this.cacheService) return null;

    try {
      const cached = await this.cacheService.get<ActionExecutionResult>(
        idempotencyKey,
        { namespace: CacheNamespace.ACTION_IDEMPOTENCY },
      );
      return cached ?? null;
    } catch (error) {
      // Log but don't fail - idempotency is best-effort
      this.logger.warn(
        `Failed to check idempotency key ${idempotencyKey}: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  /**
   * Store the result of an action execution for idempotency.
   */
  private async storeIdempotencyResult(
    idempotencyKey: string,
    result: ActionExecutionResult,
  ): Promise<void> {
    if (!this.cacheService) return;

    try {
      await this.cacheService.set(idempotencyKey, result, {
        namespace: CacheNamespace.ACTION_IDEMPOTENCY,
        ttl: IDEMPOTENCY_TTL_SECONDS,
      });
      this.logger.debug(`Stored idempotency key ${idempotencyKey} (TTL: ${IDEMPOTENCY_TTL_SECONDS}s)`);
    } catch (error) {
      // Log but don't fail - idempotency storage is best-effort
      this.logger.warn(
        `Failed to store idempotency key ${idempotencyKey}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Generate an idempotency key for an action based on its type and payload.
   * Use this helper to create consistent keys for actions.
   */
  static generateIdempotencyKey(
    tenantId: string,
    actionType: AgentActionType,
    payloadHash: string,
  ): string {
    return `${tenantId}:${actionType}:${payloadHash}`;
  }

  // ===============================
  // EMAIL ACTION EXECUTORS
  // ===============================

  private async executeSendEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { to, cc, bcc, subject, body, providerId } = action.payload;

    if (!this.emailSendService) {
      this.logger.error('EmailSendService not available');
      throw new AiError('Email service is not available. Please try again later.', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    // Find provider if not specified
    let actualProviderId = providerId;
    if (!actualProviderId) {
      const provider = await this.prisma.providerConfig.findFirst({
        where: { tenantId: context.tenantId, supportsEmail: true, isActive: true },
      });
      if (!provider) {
        throw new AiError('No email provider available', AiErrorCode.PROVIDER_UNAVAILABLE);
      }
      actualProviderId = provider.id;
    }

    // Send email via EmailSendService
    const result = await this.emailSendService.sendEmail({
      tenantId: context.tenantId,
      providerId: actualProviderId,
      to: Array.isArray(to) ? to : [to],
      cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
      bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined,
      subject: subject || '(No subject)',
      bodyHtml: body || '',
      bodyText: body?.replace(/<[^>]*>/g, '') || '',
    });

    this.logger.log(`Email sent successfully, messageId: ${result.messageId}`);

    const lang = getLocale(context.preferences?.language);
    const recipientList = Array.isArray(to) ? to.join(', ') : to;
    const subjectText = subject || t.emailSentNoSubject[lang];

    return {
      success: result.success,
      data: { messageId: result.messageId, to, subject },
      summary: t.emailSent[lang](recipientList, subjectText),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeReplyEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId, body } = action.payload;

    if (!this.emailSendService) {
      this.logger.error('EmailSendService not available');
      throw new AiError('Email service is not available. Please try again later.', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    // Get the original email to reply to
    const originalEmail = await this.prisma.email.findUnique({
      where: { id: emailId, tenantId: context.tenantId },
    });

    if (!originalEmail) {
      throw new AiError('Original email not found', AiErrorCode.INVALID_INPUT);
    }

    // Send reply
    const result = await this.emailSendService.sendEmail({
      tenantId: context.tenantId,
      providerId: originalEmail.providerId,
      threadId: originalEmail.threadId || undefined,
      to: [originalEmail.from],
      subject: originalEmail.subject?.startsWith('Re:')
        ? originalEmail.subject
        : `Re: ${originalEmail.subject || ''}`,
      bodyHtml: body || '',
      bodyText: body?.replace(/<[^>]*>/g, '') || '',
      inReplyTo: originalEmail.messageId || undefined,
      references: originalEmail.messageId || undefined,
    });

    const lang = getLocale(context.preferences?.language);

    return {
      success: result.success,
      data: { messageId: result.messageId, emailId, replyTo: originalEmail.from },
      summary: t.replySent[lang](originalEmail.from),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeForwardEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId, to, body } = action.payload;

    if (!this.emailSendService) {
      this.logger.error('EmailSendService not available');
      throw new AiError('Email service is not available. Please try again later.', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    // Get the original email to forward
    const originalEmail = await this.prisma.email.findUnique({
      where: { id: emailId, tenantId: context.tenantId },
    });

    if (!originalEmail) {
      throw new AiError('Original email not found', AiErrorCode.INVALID_INPUT);
    }

    // Build forwarded body with original email content
    const forwardedBody = `
      ${body || ''}
      <br/><br/>
      ---------- Forwarded message ----------<br/>
      From: ${originalEmail.from}<br/>
      Date: ${originalEmail.receivedAt}<br/>
      Subject: ${originalEmail.subject}<br/>
      <br/>
      ${originalEmail.bodyHtml || originalEmail.snippet || ''}
    `;

    const result = await this.emailSendService.sendEmail({
      tenantId: context.tenantId,
      providerId: originalEmail.providerId,
      to: Array.isArray(to) ? to : [to],
      subject: `Fwd: ${originalEmail.subject || ''}`,
      bodyHtml: forwardedBody,
      bodyText: forwardedBody.replace(/<[^>]*>/g, ''),
    });

    const lang = getLocale(context.preferences?.language);
    const recipientList = Array.isArray(to) ? to.join(', ') : to;

    return {
      success: result.success,
      data: { messageId: result.messageId, emailId, forwardedTo: to },
      summary: t.emailForwarded[lang](recipientList),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeDeleteEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId, permanent } = action.payload;

    // Get email info for summary and sync
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, tenantId: context.tenantId },
      select: { id: true, subject: true, from: true, externalId: true, providerId: true, folder: true },
    });

    if (!email) {
      throw new AiError('Email not found', AiErrorCode.INVALID_INPUT);
    }

    // Update local database (soft delete)
    await this.prisma.email.update({
      where: { id: emailId, tenantId: context.tenantId },
      data: { isDeleted: true, folder: 'TRASH' },
    });

    // Sync to email provider (Gmail/Microsoft/IMAP)
    if (this.emailSyncBackService && email.externalId && email.providerId) {
      try {
        await this.emailSyncBackService.syncOperationToProvider({
          emailId: email.id,
          externalId: email.externalId,
          providerId: email.providerId,
          tenantId: context.tenantId,
          operation: permanent ? 'hardDelete' : 'delete',
          sourceFolder: email.folder || 'INBOX',
        });
      } catch (syncError) {
        this.logger.warn(
          `Failed to sync delete to provider: ${syncError instanceof Error ? syncError.message : syncError}`,
        );
        // Don't fail the action - local state is updated, sync can retry
      }
    }

    const lang = getLocale(context.preferences?.language);
    const subjectText = email.subject || t.noSubject[lang];

    return {
      success: true,
      data: { emailId, deleted: true },
      summary: t.emailDeleted[lang](subjectText),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeArchiveEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId } = action.payload;

    // Get email info for summary and sync
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, tenantId: context.tenantId },
      select: { id: true, subject: true, from: true, externalId: true, providerId: true, folder: true },
    });

    if (!email) {
      throw new AiError('Email not found', AiErrorCode.INVALID_INPUT);
    }

    // Update local database - move to archive folder
    await this.prisma.email.update({
      where: { id: emailId, tenantId: context.tenantId },
      data: { folder: 'ARCHIVE' },
    });

    // Sync to email provider (Gmail/Microsoft/IMAP)
    if (this.emailSyncBackService && email.externalId && email.providerId) {
      try {
        await this.emailSyncBackService.syncOperationToProvider({
          emailId: email.id,
          externalId: email.externalId,
          providerId: email.providerId,
          tenantId: context.tenantId,
          operation: 'moveToFolder',
          folder: 'ARCHIVE',
          sourceFolder: email.folder || 'INBOX',
        });
      } catch (syncError) {
        this.logger.warn(
          `Failed to sync archive to provider: ${syncError instanceof Error ? syncError.message : syncError}`,
        );
        // Don't fail the action - local state is updated, sync can retry
      }
    }

    const lang = getLocale(context.preferences?.language);
    const subjectText = email.subject || t.noSubject[lang];

    return {
      success: true,
      data: { emailId, archived: true },
      summary: t.emailArchived[lang](subjectText),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeMarkEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId } = action.payload;
    const isRead = action.type === AgentActionType.MARK_READ;

    // Get email info for sync
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, tenantId: context.tenantId },
      select: { id: true, externalId: true, providerId: true, folder: true },
    });

    if (!email) {
      throw new AiError('Email not found', AiErrorCode.INVALID_INPUT);
    }

    // Update local database
    await this.prisma.email.update({
      where: { id: emailId, tenantId: context.tenantId },
      data: { isRead },
    });

    // Sync to email provider (Gmail/Microsoft/IMAP)
    if (this.emailSyncBackService && email.externalId && email.providerId) {
      try {
        await this.emailSyncBackService.syncOperationToProvider({
          emailId: email.id,
          externalId: email.externalId,
          providerId: email.providerId,
          tenantId: context.tenantId,
          operation: isRead ? 'markRead' : 'markUnread',
          sourceFolder: email.folder || 'INBOX',
        });
      } catch (syncError) {
        this.logger.warn(
          `Failed to sync read status to provider: ${syncError instanceof Error ? syncError.message : syncError}`,
        );
        // Don't fail the action - local state is updated, sync can retry
      }
    }

    const lang = getLocale(context.preferences?.language);

    return {
      success: true,
      data: { emailId, isRead },
      summary: isRead ? t.emailMarkedRead[lang] : t.emailMarkedUnread[lang],
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeStarEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId } = action.payload;
    const isStarred = action.type === AgentActionType.STAR_EMAIL;

    // Get email info for sync
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, tenantId: context.tenantId },
      select: { id: true, externalId: true, providerId: true, folder: true },
    });

    if (!email) {
      throw new AiError('Email not found', AiErrorCode.INVALID_INPUT);
    }

    // Update local database
    await this.prisma.email.update({
      where: { id: emailId, tenantId: context.tenantId },
      data: { isStarred },
    });

    // Sync to email provider (Gmail/Microsoft/IMAP)
    if (this.emailSyncBackService && email.externalId && email.providerId) {
      try {
        await this.emailSyncBackService.syncOperationToProvider({
          emailId: email.id,
          externalId: email.externalId,
          providerId: email.providerId,
          tenantId: context.tenantId,
          operation: isStarred ? 'star' : 'unstar',
          sourceFolder: email.folder || 'INBOX',
        });
      } catch (syncError) {
        this.logger.warn(
          `Failed to sync star status to provider: ${syncError instanceof Error ? syncError.message : syncError}`,
        );
        // Don't fail the action - local state is updated, sync can retry
      }
    }

    const lang = getLocale(context.preferences?.language);

    return {
      success: true,
      data: { emailId, isStarred },
      summary: isStarred ? t.emailStarred[lang] : t.emailUnstarred[lang],
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeSearchEmails(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { query, limit = 20 } = action.payload;

    // Exclude SPAM and TRASH from search results - they're junk
    const emails = await this.prisma.email.findMany({
      where: {
        tenantId: context.tenantId,
        folder: EXCLUDE_JUNK_FOLDERS,
        OR: [
          { subject: { contains: query, mode: 'insensitive' } },
          { snippet: { contains: query, mode: 'insensitive' } },
          { from: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { receivedAt: 'desc' },
      select: {
        id: true,
        subject: true,
        from: true,
        snippet: true,
        receivedAt: true,
        isRead: true,
        isStarred: true,
      },
    });

    const lang = getLocale(context.preferences?.language);
    const summary = emails.length === 0
      ? t.emailsSearchNotFound[lang](query)
      : t.emailsSearchFound[lang](emails.length, query);

    return {
      success: true,
      data: { emails, count: emails.length },
      summary,
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeLabelEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId, labelIds, addLabels, removeLabels } = action.payload;

    // Get current email labels
    const email = await this.prisma.email.findUnique({
      where: { id: emailId, tenantId: context.tenantId },
      select: { labels: true },
    });

    if (!email) {
      throw new AiError('Email not found', AiErrorCode.INVALID_INPUT);
    }

    // Determine labels to add/remove (labels is a String[] array)
    const labelsToAdd: string[] = addLabels || labelIds || [];
    const labelsToRemove: string[] = removeLabels || [];

    // Calculate new labels array
    let newLabels = [...(email.labels || [])];

    // Add new labels
    for (const label of labelsToAdd) {
      if (!newLabels.includes(label)) {
        newLabels.push(label);
      }
    }

    // Remove labels
    newLabels = newLabels.filter((l) => !labelsToRemove.includes(l));

    // Update email labels
    await this.prisma.email.update({
      where: { id: emailId, tenantId: context.tenantId },
      data: { labels: newLabels },
    });

    this.logger.log(`Labeled email ${emailId} - added: ${labelsToAdd.join(',')}, removed: ${labelsToRemove.join(',')}`);

    const lang = getLocale(context.preferences?.language);
    let summary: string;
    if (labelsToAdd.length > 0 && labelsToRemove.length > 0) {
      summary = t.labelsAddedAndRemoved[lang](labelsToAdd.join(', '), labelsToRemove.join(', '));
    } else if (labelsToAdd.length > 0) {
      summary = t.labelsAdded[lang](labelsToAdd.join(', '));
    } else {
      summary = t.labelsRemoved[lang](labelsToRemove.join(', '));
    }

    return {
      success: true,
      data: { emailId, labelsAdded: labelsToAdd, labelsRemoved: labelsToRemove, currentLabels: newLabels },
      summary,
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  // ===============================
  // CALENDAR ACTION EXECUTORS
  // ===============================

  private async executeCreateEvent(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { title, startTime, endTime, description, location, attendees, providerId, calendarId, isAllDay, timeZone } = action.payload;

    if (!this.calendarService) {
      this.logger.error('CalendarService not available');
      throw new AiError('Calendar service is not available. Please try again later.', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    // Find provider if not specified
    let actualProviderId = providerId;
    if (!actualProviderId) {
      const provider = await this.prisma.providerConfig.findFirst({
        where: { tenantId: context.tenantId, supportsCalendar: true, isActive: true },
      });
      if (!provider) {
        throw new AiError('No calendar provider available', AiErrorCode.PROVIDER_UNAVAILABLE);
      }
      actualProviderId = provider.id;
    }

    // Create event via CalendarService
    const event = await this.calendarService.createEvent(context.tenantId, {
      providerId: actualProviderId,
      calendarId: calendarId || 'primary',
      title,
      description,
      location,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      isAllDay: isAllDay || false,
      timeZone: timeZone || 'UTC',
      attendees: attendees?.map((a: string | { email: string }) => typeof a === 'string' ? { email: a } : a),
    });

    this.logger.log(`Created calendar event ${event.id}`);

    const lang = getLocale(context.preferences?.language);
    const dateStr = formatDateForLocale(new Date(startTime), lang);

    return {
      success: true,
      data: { eventId: event.id, externalId: event.externalId, title, startTime, endTime },
      summary: t.eventCreated[lang](title, dateStr),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeUpdateEvent(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { eventId, title, description, location, startTime, endTime, attendees } = action.payload;

    if (!this.calendarService) {
      this.logger.error('CalendarService not available');
      throw new AiError('Calendar service is not available. Please try again later.', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    // Update event via CalendarService
    const event = await this.calendarService.updateEvent(context.tenantId, eventId, {
      title,
      description,
      location,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      attendees: attendees?.map((a: string | { email: string }) => typeof a === 'string' ? { email: a } : a),
    });

    this.logger.log(`Updated calendar event ${eventId}`);

    const lang = getLocale(context.preferences?.language);
    const eventTitle = title || event.title || t.event[lang];

    return {
      success: true,
      data: { eventId, updated: true, event },
      summary: t.eventUpdated[lang](eventTitle),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeDeleteEvent(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { eventId } = action.payload;

    if (!this.calendarService) {
      this.logger.error('CalendarService not available');
      throw new AiError('Calendar service is not available. Please try again later.', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    // Get event info for summary before deleting
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, tenantId: context.tenantId },
      select: { title: true },
    });

    // Delete event via CalendarService
    await this.calendarService.deleteEvent(context.tenantId, eventId);

    this.logger.log(`Deleted calendar event ${eventId}`);

    const lang = getLocale(context.preferences?.language);
    const eventTitle = event?.title || t.event[lang];

    return {
      success: true,
      data: { eventId, deleted: true },
      summary: t.eventDeleted[lang](eventTitle),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeGetEvents(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { startDate, endDate } = action.payload;

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId: context.tenantId,
        startTime: startDate ? { gte: new Date(startDate) } : undefined,
        endTime: endDate ? { lte: new Date(endDate) } : undefined,
      },
      orderBy: { startTime: 'asc' },
      take: 50,
    });

    const lang = getLocale(context.preferences?.language);

    return {
      success: true,
      data: { events, count: events.length },
      summary: t.eventsFound[lang](events.length),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeCheckAvailability(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { date, startDate, endDate } = action.payload;

    const checkStart = new Date(startDate || date);
    const checkEnd = new Date(endDate || date);
    checkEnd.setHours(23, 59, 59);

    const busySlots = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId: context.tenantId,
        startTime: { lte: checkEnd },
        endTime: { gte: checkStart },
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
      },
      orderBy: { startTime: 'asc' },
    });

    const lang = getLocale(context.preferences?.language);
    const hasFreeTime = busySlots.length < 8;

    return {
      success: true,
      data: { busySlots, hasFreeTime },
      summary: hasFreeTime
        ? t.availabilityFree[lang](busySlots.length)
        : t.availabilityBusy[lang](busySlots.length),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  // ===============================
  // CONTACT ACTION EXECUTORS
  // ===============================

  private async executeCreateContact(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { name, firstName, lastName, email, phone, company, jobTitle, notes } = action.payload;

    // Check if tenant has contacts provider
    const provider = await this.prisma.providerConfig.findFirst({
      where: { tenantId: context.tenantId, supportsContacts: true },
    });

    if (!provider) {
      throw new Error('No provider available for contacts');
    }

    const displayName = name || `${firstName || ''} ${lastName || ''}`.trim();
    const contact = await this.prisma.contact.create({
      data: {
        tenantId: context.tenantId,
        displayName,
        firstName,
        lastName,
        emails: email ? [email] : [],
        phoneNumbers: phone ? [phone] : [],
        company,
        jobTitle,
        notes,
      },
    });

    const lang = getLocale(context.preferences?.language);

    return {
      success: true,
      data: { contactId: contact.id, contact },
      summary: t.contactCreated[lang](displayName),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeUpdateContact(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { contactId, ...updates } = action.payload;

    // Get contact info for summary
    const existingContact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId: context.tenantId },
      select: { displayName: true },
    });

    await this.prisma.contact.update({
      where: { id: contactId, tenantId: context.tenantId },
      data: {
        displayName: updates.name,
        firstName: updates.firstName,
        lastName: updates.lastName,
        emails: updates.email ? [updates.email] : undefined,
        phoneNumbers: updates.phone ? [updates.phone] : undefined,
        company: updates.company,
        jobTitle: updates.jobTitle,
        notes: updates.notes,
      },
    });

    const lang = getLocale(context.preferences?.language);
    const contactName = updates.name || existingContact?.displayName || t.contact[lang];

    return {
      success: true,
      data: { contactId, updated: true },
      summary: t.contactUpdated[lang](contactName),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeDeleteContact(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { contactId } = action.payload;

    // Get contact info for summary before deleting
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId: context.tenantId },
      select: { displayName: true },
    });

    await this.prisma.contact.delete({
      where: { id: contactId, tenantId: context.tenantId },
    });

    const lang = getLocale(context.preferences?.language);
    const contactName = contact?.displayName || t.contact[lang];

    return {
      success: true,
      data: { contactId, deleted: true },
      summary: t.contactDeleted[lang](contactName),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeSearchContacts(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { query, limit = 20 } = action.payload;

    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId: context.tenantId,
        OR: [
          { displayName: { contains: query, mode: 'insensitive' } },
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { company: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { displayName: 'asc' },
    });

    const lang = getLocale(context.preferences?.language);
    const summary = contacts.length === 0
      ? t.contactsSearchNotFound[lang](query)
      : t.contactsSearchFound[lang](contacts.length, query);

    return {
      success: true,
      data: { contacts, count: contacts.length },
      summary,
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeMergeContacts(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { contactIds, primaryId } = action.payload;

    if (!contactIds || contactIds.length < 2) {
      throw new AiError('Need at least 2 contacts to merge', AiErrorCode.INVALID_INPUT);
    }

    // Get all contacts to merge
    const contacts = await this.prisma.contact.findMany({
      where: {
        id: { in: contactIds },
        tenantId: context.tenantId,
      },
    });

    if (contacts.length < 2) {
      throw new AiError('Could not find enough contacts to merge', AiErrorCode.INVALID_INPUT);
    }

    // Determine primary contact (first one or specified)
    const primaryContactId = primaryId || contactIds[0];
    const primaryContact = contacts.find((c) => c.id === primaryContactId);
    const secondaryContacts = contacts.filter((c) => c.id !== primaryContactId);

    if (!primaryContact) {
      throw new AiError('Primary contact not found', AiErrorCode.INVALID_INPUT);
    }

    // Merge data from secondary contacts into primary
    // Note: emails and phoneNumbers are stored as Json arrays in Prisma
    const primaryEmails = Array.isArray(primaryContact.emails) ? primaryContact.emails as string[] : [];
    const primaryPhones = Array.isArray(primaryContact.phoneNumbers) ? primaryContact.phoneNumbers as string[] : [];

    const mergedEmails = new Set<string>(primaryEmails);
    const mergedPhones = new Set<string>(primaryPhones);
    let mergedNotes = primaryContact.notes || '';

    for (const contact of secondaryContacts) {
      // Merge emails
      const contactEmails = Array.isArray(contact.emails) ? contact.emails as string[] : [];
      contactEmails.forEach((e: string) => mergedEmails.add(e));

      // Merge phone numbers
      const contactPhones = Array.isArray(contact.phoneNumbers) ? contact.phoneNumbers as string[] : [];
      contactPhones.forEach((p: string) => mergedPhones.add(p));

      // Merge notes
      if (contact.notes) {
        mergedNotes += mergedNotes ? `\n\n--- Merged from ${contact.displayName} ---\n${contact.notes}` : contact.notes;
      }
    }

    // Update primary contact with merged data
    const updatedContact = await this.prisma.contact.update({
      where: { id: primaryContactId, tenantId: context.tenantId },
      data: {
        emails: Array.from(mergedEmails),
        phoneNumbers: Array.from(mergedPhones),
        notes: mergedNotes || undefined,
        // Keep primary contact's name, company, etc. - don't overwrite
      },
    });

    // Delete secondary contacts
    const secondaryIds = secondaryContacts.map((c) => c.id);
    await this.prisma.contact.deleteMany({
      where: {
        id: { in: secondaryIds },
        tenantId: context.tenantId,
      },
    });

    this.logger.log(`Merged ${contacts.length} contacts into ${primaryContactId}, deleted ${secondaryIds.length} duplicates`);

    const lang = getLocale(context.preferences?.language);

    return {
      success: true,
      data: {
        merged: true,
        primaryId: primaryContactId,
        mergedCount: secondaryIds.length,
        deletedIds: secondaryIds,
        updatedContact,
      },
      summary: t.contactsMerged[lang](contacts.length, updatedContact.displayName || t.contact[lang], secondaryIds.length),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  /**
   * Get a specific contact by ID, email, or name
   */
  private async executeGetContact(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { contactId, email, name } = action.payload;

    let contact;

    if (contactId) {
      // Direct lookup by ID
      contact = await this.prisma.contact.findFirst({
        where: { id: contactId, tenantId: context.tenantId },
        include: { providerContacts: true },
      });
    } else if (email) {
      // Lookup by email - emails is stored as Json array
      contact = await this.prisma.contact.findFirst({
        where: {
          tenantId: context.tenantId,
          emails: { array_contains: [email] },
        },
        include: { providerContacts: true },
      });

      // Fallback: Search in raw JSON if array_contains doesn't work
      if (!contact) {
        const contacts = await this.prisma.contact.findMany({
          where: { tenantId: context.tenantId },
          include: { providerContacts: true },
        });
        contact = contacts.find((c) => {
          const emails = Array.isArray(c.emails) ? (c.emails as unknown as string[]) : [];
          return emails.some((e) => String(e).toLowerCase() === email.toLowerCase());
        });
      }
    } else if (name) {
      // Lookup by name (partial match)
      contact = await this.prisma.contact.findFirst({
        where: {
          tenantId: context.tenantId,
          OR: [
            { displayName: { contains: name, mode: 'insensitive' } },
            { firstName: { contains: name, mode: 'insensitive' } },
            { lastName: { contains: name, mode: 'insensitive' } },
          ],
        },
        include: { providerContacts: true },
      });
    }

    const lang = getLocale(context.preferences?.language);

    if (!contact) {
      throw new AiError(t.contactNotFound[lang], AiErrorCode.INVALID_INPUT);
    }

    return {
      success: true,
      data: { contact },
      summary: t.contactFound[lang](contact.displayName || t.contact[lang]),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  /**
   * Get unread emails with optional filtering
   */
  private async executeGetUnread(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { limit = 10, providerId, folder } = action.payload;
    const lang = getLocale(context.preferences?.language);

    // Build where clause - exclude SPAM/TRASH by default unless user specifies a folder
    const whereClause: {
      tenantId: string;
      isRead: boolean;
      isDeleted: boolean;
      providerId?: string;
      folder?: string | { notIn: string[] };
    } = {
      tenantId: context.tenantId,
      isRead: false,
      isDeleted: false,
    };

    if (providerId) {
      whereClause.providerId = providerId;
    }

    if (folder) {
      // User explicitly requested a specific folder
      whereClause.folder = folder;
    } else {
      // Exclude SPAM and TRASH by default - they're junk
      whereClause.folder = EXCLUDE_JUNK_FOLDERS;
    }

    const emails = await this.prisma.email.findMany({
      where: whereClause,
      orderBy: { receivedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        subject: true,
        from: true,
        to: true,
        receivedAt: true,
        snippet: true,
        isStarred: true,
        labels: true,
        folder: true,
      },
    });

    const summary = emails.length === 0
      ? t.unreadEmailsFound[lang](0)
      : emails
        .slice(0, Math.min(5, emails.length))
        .map((email) => {
          const sender = email.from || t.unknownSender[lang];
          const subject = email.subject || t.noSubject[lang];
          return `${lang === 'it' ? 'Da' : 'From'}: ${sender} — ${subject}`;
        })
        .join('\n');

    return {
      success: true,
      data: { count: emails.length, emails, summary },
      summary,
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  /**
   * Categorize an email with AI-suggested categories/labels
   */
  private async executeCategorizeEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId, categories, labels, category } = action.payload;

    // Get the email
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, tenantId: context.tenantId },
    });

    if (!email) {
      throw new AiError('Email not found', AiErrorCode.INVALID_INPUT);
    }

    // Determine labels to apply (support both array and single category)
    const labelsToApply: string[] = labels || categories || (category ? [category] : []);

    if (labelsToApply.length === 0) {
      throw new AiError('No categories or labels provided', AiErrorCode.INVALID_INPUT);
    }

    // Get current labels and merge with new ones
    const currentLabels = Array.isArray(email.labels) ? (email.labels as unknown as string[]) : [];
    const newLabels = [...new Set([...currentLabels, ...labelsToApply])];

    // Update email with new labels (tenant-scoped)
    const updated = await this.prisma.email.updateMany({
      where: { id: emailId, tenantId: context.tenantId },
      data: { labels: newLabels },
    });
    if (updated.count === 0) {
      throw new AiError('Email not found', AiErrorCode.INVALID_INPUT);
    }

    this.logger.log(`Categorized email ${emailId} with: ${labelsToApply.join(', ')}`);

    const lang = getLocale(context.preferences?.language);

    return {
      success: true,
      data: {
        emailId,
        categorized: true,
        appliedCategories: labelsToApply,
        allLabels: newLabels,
      },
      summary: t.emailCategorized[lang](labelsToApply.join(', ')),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  /**
   * Reschedule a calendar event to a new time
   */
  private async executeRescheduleEvent(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { eventId, newStartTime, newEndTime, reason } = action.payload;

    if (!this.calendarService) {
      this.logger.error('CalendarService not available');
      throw new AiError('Calendar service is not available. Please try again later.', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    // Get the event to verify ownership and get provider info
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, tenantId: context.tenantId },
      include: { provider: true },
    });

    if (!event) {
      throw new AiError('Event not found', AiErrorCode.INVALID_INPUT);
    }

    // Calculate duration if only newStartTime is provided
    let endTime = newEndTime;
    if (!endTime && event.startTime && event.endTime) {
      const duration = new Date(event.endTime).getTime() - new Date(event.startTime).getTime();
      endTime = new Date(new Date(newStartTime).getTime() + duration).toISOString();
    }

    // Build update description with reschedule reason
    let newDescription = event.description || '';
    if (reason) {
      newDescription = newDescription
        ? `${newDescription}\n\n[Rescheduled: ${reason}]`
        : `[Rescheduled: ${reason}]`;
    }

    // Update event via CalendarService
    const updatedEvent = await this.calendarService.updateEvent(
      context.tenantId,
      eventId,
      {
        startTime: new Date(newStartTime),
        endTime: endTime ? new Date(endTime) : undefined,
        description: newDescription,
      },
    );

    this.logger.log(`Rescheduled event ${eventId} to ${newStartTime}`);

    const lang = getLocale(context.preferences?.language);
    const dateStr = formatDateForLocale(new Date(newStartTime), lang);
    const eventTitle = event.title || t.event[lang];

    return {
      success: true,
      data: {
        eventId,
        rescheduled: true,
        newStartTime,
        newEndTime: endTime,
        reason,
        event: updatedEvent,
      },
      summary: t.eventRescheduled[lang](eventTitle, dateStr),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  // ===============================
  // FOLDER ACTION EXECUTORS
  // ===============================

  private async executeCreateFolder(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { name, providerId, parentPath } = action.payload;

    if (!this.folderSyncService) {
      this.logger.warn('FolderSyncService not available');
      throw new AiError('Folder service not available', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    if (!name) {
      throw new AiError('Folder name is required', AiErrorCode.INVALID_INPUT);
    }

    // Find provider if not specified
    let actualProviderId = providerId;
    if (!actualProviderId) {
      const provider = await this.prisma.providerConfig.findFirst({
        where: { tenantId: context.tenantId, supportsEmail: true, isActive: true },
      });
      if (!provider) {
        throw new AiError('No email provider available', AiErrorCode.PROVIDER_UNAVAILABLE);
      }
      actualProviderId = provider.id;
    }

    const result = await this.folderSyncService.createFolder(
      context.tenantId,
      actualProviderId,
      name,
      parentPath,
    );

    this.logger.log(`Created folder "${name}" with id ${result.id}`);

    const lang = getLocale(context.preferences?.language);

    return {
      success: true,
      data: { folderId: result.id, folderPath: result.path, folderName: result.name },
      summary: t.folderCreated[lang](name),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeRenameFolder(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { folderPath, newName, providerId } = action.payload;

    if (!this.folderSyncService) {
      this.logger.warn('FolderSyncService not available');
      throw new AiError('Folder service not available', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    if (!folderPath || !newName) {
      throw new AiError('Folder path and new name are required', AiErrorCode.INVALID_INPUT);
    }

    // Find provider if not specified
    let actualProviderId = providerId;
    if (!actualProviderId) {
      const provider = await this.prisma.providerConfig.findFirst({
        where: { tenantId: context.tenantId, supportsEmail: true, isActive: true },
      });
      if (!provider) {
        throw new AiError('No email provider available', AiErrorCode.PROVIDER_UNAVAILABLE);
      }
      actualProviderId = provider.id;
    }

    const result = await this.folderSyncService.renameFolder(
      context.tenantId,
      actualProviderId,
      folderPath,
      newName,
    );

    this.logger.log(`Renamed folder to "${newName}" (path: ${result.path})`);

    const lang = getLocale(context.preferences?.language);

    return {
      success: true,
      data: { folderId: result.id, folderPath: result.path, folderName: result.name },
      summary: t.folderRenamed[lang](newName),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  private async executeDeleteFolder(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { folderPath, providerId } = action.payload;

    if (!this.folderSyncService) {
      this.logger.warn('FolderSyncService not available');
      throw new AiError('Folder service not available', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    if (!folderPath) {
      throw new AiError('Folder path is required', AiErrorCode.INVALID_INPUT);
    }

    // Find provider if not specified
    let actualProviderId = providerId;
    if (!actualProviderId) {
      const provider = await this.prisma.providerConfig.findFirst({
        where: { tenantId: context.tenantId, supportsEmail: true, isActive: true },
      });
      if (!provider) {
        throw new AiError('No email provider available', AiErrorCode.PROVIDER_UNAVAILABLE);
      }
      actualProviderId = provider.id;
    }

    await this.folderSyncService.deleteFolder(
      context.tenantId,
      actualProviderId,
      folderPath,
    );

    this.logger.log(`Deleted folder at path "${folderPath}"`);

    const lang = getLocale(context.preferences?.language);

    return {
      success: true,
      data: { folderPath, deleted: true },
      summary: t.folderDeleted[lang](folderPath),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  // ===============================
  // BULK EMAIL ACTION EXECUTORS
  // ===============================

  /**
   * Get provider type for bulk operations
   */
  private async getProviderType(
    tenantId: string,
    providerId: string,
  ): Promise<'google' | 'microsoft' | 'imap'> {
    const provider = await this.prisma.providerConfig.findFirst({
      where: { id: providerId, tenantId },
      select: { providerType: true },
    });

    if (!provider) {
      throw new AiError('Provider not found', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    // Map provider type to bulk operation type
    const typeMap: Record<string, 'google' | 'microsoft' | 'imap'> = {
      GOOGLE: 'google',
      MICROSOFT: 'microsoft',
      IMAP: 'imap',
    };

    return typeMap[provider.providerType] || 'imap';
  }

  /**
   * Bulk delete emails or empty a folder
   */
  private async executeBulkDeleteEmails(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailIds, folder, permanent, count } = action.payload;
    const lang = getLocale(context.preferences?.language);

    if (!this.bulkOperationsQueue) {
      throw new AiError('Bulk operations service not available', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    if (!emailIds || emailIds.length === 0) {
      throw new AiError('No emails to delete', AiErrorCode.INVALID_INPUT);
    }

    // Get provider from first email
    const firstEmail = await this.prisma.email.findFirst({
      where: { id: emailIds[0], tenantId: context.tenantId },
      select: { providerId: true },
    });

    if (!firstEmail) {
      throw new AiError('Emails not found', AiErrorCode.INVALID_INPUT);
    }

    const providerType = await this.getProviderType(context.tenantId, firstEmail.providerId);

    // Queue the bulk operation
    const jobId = await this.bulkOperationsQueue.enqueueBulkOperation({
      tenantId: context.tenantId,
      providerId: firstEmail.providerId,
      providerType,
      operation: permanent ? 'delete' : 'delete',
      emailIds,
      requestedAt: new Date().toISOString(),
      userId: context.userId,
      syncToProvider: true,
    });

    const emailCount = count || emailIds.length;
    const folderName = folder || 'selected';

    return {
      success: true,
      data: { jobId, emailCount, folder: folderName, queued: true },
      summary: t.bulkDeleteQueued?.[lang]
        ? t.bulkDeleteQueued[lang](emailCount, folderName)
        : `Queued deletion of ${emailCount} emails from ${folderName}. Job ID: ${jobId}`,
      executionTimeMs: 0,
    };
  }

  /**
   * Bulk archive emails
   */
  private async executeBulkArchiveEmails(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailIds, count } = action.payload;
    const lang = getLocale(context.preferences?.language);

    if (!this.bulkOperationsQueue) {
      throw new AiError('Bulk operations service not available', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    if (!emailIds || emailIds.length === 0) {
      throw new AiError('No emails to archive', AiErrorCode.INVALID_INPUT);
    }

    // Get provider from first email
    const firstEmail = await this.prisma.email.findFirst({
      where: { id: emailIds[0], tenantId: context.tenantId },
      select: { providerId: true },
    });

    if (!firstEmail) {
      throw new AiError('Emails not found', AiErrorCode.INVALID_INPUT);
    }

    const providerType = await this.getProviderType(context.tenantId, firstEmail.providerId);

    // Queue the bulk operation
    const jobId = await this.bulkOperationsQueue.enqueueBulkOperation({
      tenantId: context.tenantId,
      providerId: firstEmail.providerId,
      providerType,
      operation: 'archive',
      emailIds,
      requestedAt: new Date().toISOString(),
      userId: context.userId,
      syncToProvider: true,
    });

    const emailCount = count || emailIds.length;

    return {
      success: true,
      data: { jobId, emailCount, queued: true },
      summary: t.bulkArchiveQueued?.[lang]
        ? t.bulkArchiveQueued[lang](emailCount)
        : `Queued archiving of ${emailCount} emails. Job ID: ${jobId}`,
      executionTimeMs: 0,
    };
  }

  /**
   * Bulk mark emails as read
   */
  private async executeBulkMarkRead(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailIds, count } = action.payload;
    const lang = getLocale(context.preferences?.language);

    if (!this.bulkOperationsQueue) {
      throw new AiError('Bulk operations service not available', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    if (!emailIds || emailIds.length === 0) {
      throw new AiError('No emails to mark as read', AiErrorCode.INVALID_INPUT);
    }

    // Get provider from first email
    const firstEmail = await this.prisma.email.findFirst({
      where: { id: emailIds[0], tenantId: context.tenantId },
      select: { providerId: true },
    });

    if (!firstEmail) {
      throw new AiError('Emails not found', AiErrorCode.INVALID_INPUT);
    }

    const providerType = await this.getProviderType(context.tenantId, firstEmail.providerId);

    // Queue the bulk operation
    const jobId = await this.bulkOperationsQueue.enqueueBulkOperation({
      tenantId: context.tenantId,
      providerId: firstEmail.providerId,
      providerType,
      operation: 'mark-read',
      emailIds,
      requestedAt: new Date().toISOString(),
      userId: context.userId,
      syncToProvider: true,
    });

    const emailCount = count || emailIds.length;

    return {
      success: true,
      data: { jobId, emailCount, queued: true },
      summary: t.bulkMarkReadQueued?.[lang]
        ? t.bulkMarkReadQueued[lang](emailCount)
        : `Queued marking ${emailCount} emails as read. Job ID: ${jobId}`,
      executionTimeMs: 0,
    };
  }

  /**
   * Bulk move emails to a folder
   */
  private async executeBulkMoveEmails(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailIds, targetFolder, count } = action.payload;
    const lang = getLocale(context.preferences?.language);

    if (!this.bulkOperationsQueue) {
      throw new AiError('Bulk operations service not available', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    if (!emailIds || emailIds.length === 0) {
      throw new AiError('No emails to move', AiErrorCode.INVALID_INPUT);
    }

    if (!targetFolder) {
      throw new AiError('Target folder is required', AiErrorCode.INVALID_INPUT);
    }

    // Get provider from first email
    const firstEmail = await this.prisma.email.findFirst({
      where: { id: emailIds[0], tenantId: context.tenantId },
      select: { providerId: true },
    });

    if (!firstEmail) {
      throw new AiError('Emails not found', AiErrorCode.INVALID_INPUT);
    }

    const providerType = await this.getProviderType(context.tenantId, firstEmail.providerId);

    // Queue the bulk operation
    const jobId = await this.bulkOperationsQueue.enqueueBulkOperation({
      tenantId: context.tenantId,
      providerId: firstEmail.providerId,
      providerType,
      operation: 'move',
      emailIds,
      targetFolderId: targetFolder,
      requestedAt: new Date().toISOString(),
      userId: context.userId,
      syncToProvider: true,
    });

    const emailCount = count || emailIds.length;

    return {
      success: true,
      data: { jobId, emailCount, targetFolder, queued: true },
      summary: t.bulkMoveQueued?.[lang]
        ? t.bulkMoveQueued[lang](emailCount, targetFolder)
        : `Queued moving ${emailCount} emails to ${targetFolder}. Job ID: ${jobId}`,
      executionTimeMs: 0,
    };
  }
}
