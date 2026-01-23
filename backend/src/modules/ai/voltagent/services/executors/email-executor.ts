/**
 * Email Action Executor - Handles single email operations.
 * Phase 9d: Extracted from action-executor.service.ts (2026-01-23)
 *
 * Static methods to avoid additional DI complexity.
 * Dependencies passed via EmailExecutorDeps interface.
 */
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { EmailSendService } from '../../../../email/services/email-send.service';
import { EmailSyncBackService } from '../../../../email/services/email-sync-back.service';
import { AgentAction, AgentActionType } from '../../interfaces/agent-action.interface';
import { AgentContext } from '../../interfaces/agent-context.interface';
import { ActionExecutionResult } from '../action-executor.service';
import { getLocale, actionSummaries as t } from '../../locales/action-summaries';
import { AiError, AiErrorCode } from '../../../errors';
import { EXCLUDE_JUNK_FOLDERS } from '../../../../email/email.helpers';

/** Dependencies required for email executor methods */
export interface EmailExecutorDeps {
  emailSendService: EmailSendService | null;
  emailSyncBackService: EmailSyncBackService | null;
  prisma: PrismaService;
  logger: Logger;
  resolveProviderId: (
    tenantId: string,
    providerId: string | undefined,
    type: 'email' | 'calendar',
  ) => Promise<string>;
}

/**
 * Static executor for single email operations.
 * Keeps ActionExecutorService as thin orchestrator.
 */
export class EmailExecutor {
  /**
   * Send a new email.
   */
  static async executeSendEmail(
    action: AgentAction,
    context: AgentContext,
    deps: EmailExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { to, cc, bcc, subject, body, providerId } = action.payload;

    if (!deps.emailSendService) {
      deps.logger.error('EmailSendService not available');
      throw new AiError('Email service is not available. Please try again later.', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    // Resolve provider (use provided or find default)
    const actualProviderId = await deps.resolveProviderId(context.tenantId, providerId, 'email');

    // Send email via EmailSendService
    const result = await deps.emailSendService.sendEmail({
      tenantId: context.tenantId,
      providerId: actualProviderId,
      to: Array.isArray(to) ? to : [to],
      cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
      bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined,
      subject: subject || '(No subject)',
      bodyHtml: body || '',
      bodyText: body?.replace(/<[^>]*>/g, '') || '',
    });

    deps.logger.log(`Email sent successfully, messageId: ${result.messageId}`);

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

  /**
   * Reply to an email.
   */
  static async executeReplyEmail(
    action: AgentAction,
    context: AgentContext,
    deps: EmailExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { emailId, body } = action.payload;

    if (!deps.emailSendService) {
      deps.logger.error('EmailSendService not available');
      throw new AiError('Email service is not available. Please try again later.', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    // Get the original email to reply to
    const originalEmail = await deps.prisma.email.findUnique({
      where: { id_tenantId: { id: emailId, tenantId: context.tenantId } },
    });

    if (!originalEmail) {
      throw new AiError('Original email not found', AiErrorCode.INVALID_INPUT);
    }

    // Send reply
    const result = await deps.emailSendService.sendEmail({
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

  /**
   * Forward an email.
   */
  static async executeForwardEmail(
    action: AgentAction,
    context: AgentContext,
    deps: EmailExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { emailId, to, body } = action.payload;

    if (!deps.emailSendService) {
      deps.logger.error('EmailSendService not available');
      throw new AiError('Email service is not available. Please try again later.', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    // Get the original email to forward
    const originalEmail = await deps.prisma.email.findUnique({
      where: { id_tenantId: { id: emailId, tenantId: context.tenantId } },
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

    const result = await deps.emailSendService.sendEmail({
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

  /**
   * Delete an email.
   */
  static async executeDeleteEmail(
    action: AgentAction,
    context: AgentContext,
    deps: EmailExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { emailId, permanent } = action.payload;

    // Get email info for summary and sync
    const email = await deps.prisma.email.findFirst({
      where: { id: emailId, tenantId: context.tenantId },
      select: { id: true, subject: true, from: true, externalId: true, providerId: true, folder: true },
    });

    if (!email) {
      throw new AiError('Email not found', AiErrorCode.INVALID_INPUT);
    }

    // Update local database (soft delete)
    await deps.prisma.email.update({
      where: { id_tenantId: { id: emailId, tenantId: context.tenantId } },
      data: { isDeleted: true, folder: 'TRASH' },
    });

    // Sync to email provider (Gmail/Microsoft/IMAP)
    if (deps.emailSyncBackService && email.externalId && email.providerId) {
      try {
        await deps.emailSyncBackService.syncOperationToProvider({
          emailId: email.id,
          externalId: email.externalId,
          providerId: email.providerId,
          tenantId: context.tenantId,
          operation: permanent ? 'hardDelete' : 'delete',
          sourceFolder: email.folder || 'INBOX',
        });
      } catch (syncError) {
        deps.logger.warn(
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

  /**
   * Archive an email.
   */
  static async executeArchiveEmail(
    action: AgentAction,
    context: AgentContext,
    deps: EmailExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { emailId } = action.payload;

    // Get email info for summary and sync
    const email = await deps.prisma.email.findFirst({
      where: { id: emailId, tenantId: context.tenantId },
      select: { id: true, subject: true, from: true, externalId: true, providerId: true, folder: true },
    });

    if (!email) {
      throw new AiError('Email not found', AiErrorCode.INVALID_INPUT);
    }

    // Update local database - move to archive folder
    await deps.prisma.email.update({
      where: { id_tenantId: { id: emailId, tenantId: context.tenantId } },
      data: { folder: 'ARCHIVE' },
    });

    // Sync to email provider (Gmail/Microsoft/IMAP)
    if (deps.emailSyncBackService && email.externalId && email.providerId) {
      try {
        await deps.emailSyncBackService.syncOperationToProvider({
          emailId: email.id,
          externalId: email.externalId,
          providerId: email.providerId,
          tenantId: context.tenantId,
          operation: 'moveToFolder',
          folder: 'ARCHIVE',
          sourceFolder: email.folder || 'INBOX',
        });
      } catch (syncError) {
        deps.logger.warn(
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

  /**
   * Mark email as read/unread.
   */
  static async executeMarkEmail(
    action: AgentAction,
    context: AgentContext,
    deps: EmailExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { emailId } = action.payload;
    const isRead = action.type === AgentActionType.MARK_READ;

    // Get email info for sync
    const email = await deps.prisma.email.findFirst({
      where: { id: emailId, tenantId: context.tenantId },
      select: { id: true, externalId: true, providerId: true, folder: true },
    });

    if (!email) {
      throw new AiError('Email not found', AiErrorCode.INVALID_INPUT);
    }

    // Update local database
    await deps.prisma.email.update({
      where: { id_tenantId: { id: emailId, tenantId: context.tenantId } },
      data: { isRead },
    });

    // Sync to email provider (Gmail/Microsoft/IMAP)
    if (deps.emailSyncBackService && email.externalId && email.providerId) {
      try {
        await deps.emailSyncBackService.syncOperationToProvider({
          emailId: email.id,
          externalId: email.externalId,
          providerId: email.providerId,
          tenantId: context.tenantId,
          operation: isRead ? 'markRead' : 'markUnread',
          sourceFolder: email.folder || 'INBOX',
        });
      } catch (syncError) {
        deps.logger.warn(
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

  /**
   * Star/unstar an email.
   */
  static async executeStarEmail(
    action: AgentAction,
    context: AgentContext,
    deps: EmailExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { emailId } = action.payload;
    const isStarred = action.type === AgentActionType.STAR_EMAIL;

    // Get email info for sync
    const email = await deps.prisma.email.findFirst({
      where: { id: emailId, tenantId: context.tenantId },
      select: { id: true, externalId: true, providerId: true, folder: true },
    });

    if (!email) {
      throw new AiError('Email not found', AiErrorCode.INVALID_INPUT);
    }

    // Update local database
    await deps.prisma.email.update({
      where: { id_tenantId: { id: emailId, tenantId: context.tenantId } },
      data: { isStarred },
    });

    // Sync to email provider (Gmail/Microsoft/IMAP)
    if (deps.emailSyncBackService && email.externalId && email.providerId) {
      try {
        await deps.emailSyncBackService.syncOperationToProvider({
          emailId: email.id,
          externalId: email.externalId,
          providerId: email.providerId,
          tenantId: context.tenantId,
          operation: isStarred ? 'star' : 'unstar',
          sourceFolder: email.folder || 'INBOX',
        });
      } catch (syncError) {
        deps.logger.warn(
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

  /**
   * Search emails.
   */
  static async executeSearchEmails(
    action: AgentAction,
    context: AgentContext,
    deps: EmailExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { query, limit = 20 } = action.payload;

    // Exclude SPAM and TRASH from search results - they're junk
    const emails = await deps.prisma.email.findMany({
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

  /**
   * Label an email.
   */
  static async executeLabelEmail(
    action: AgentAction,
    context: AgentContext,
    deps: EmailExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { emailId, labelIds, addLabels, removeLabels } = action.payload;

    // Get current email labels
    const email = await deps.prisma.email.findUnique({
      where: { id_tenantId: { id: emailId, tenantId: context.tenantId } },
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
    await deps.prisma.email.update({
      where: { id_tenantId: { id: emailId, tenantId: context.tenantId } },
      data: { labels: newLabels },
    });

    deps.logger.log(`Labeled email ${emailId} - added: ${labelsToAdd.join(',')}, removed: ${labelsToRemove.join(',')}`);

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

  /**
   * Get unread emails with optional filtering.
   */
  static async executeGetUnread(
    action: AgentAction,
    context: AgentContext,
    deps: EmailExecutorDeps,
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

    const emails = await deps.prisma.email.findMany({
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
   * Categorize an email with AI-suggested categories/labels.
   */
  static async executeCategorizeEmail(
    action: AgentAction,
    context: AgentContext,
    deps: EmailExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { emailId, categories, labels, category } = action.payload;

    // Get the email
    const email = await deps.prisma.email.findFirst({
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
    const updated = await deps.prisma.email.updateMany({
      where: { id: emailId, tenantId: context.tenantId },
      data: { labels: newLabels },
    });
    if (updated.count === 0) {
      throw new AiError('Email not found', AiErrorCode.INVALID_INPUT);
    }

    deps.logger.log(`Categorized email ${emailId} with: ${labelsToApply.join(', ')}`);

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
}
