/**
 * Bulk Email Action Executor - Handles bulk email operations.
 * Phase 9d: Extracted from action-executor.service.ts (2026-01-23)
 *
 * Static methods to avoid additional DI complexity.
 * Dependencies passed via BulkEmailExecutorDeps interface.
 */
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { BulkOperationsQueueService } from '../../../../email-sync/services/bulk-operations-queue.service';
import { AgentAction } from '../../interfaces/agent-action.interface';
import { AgentContext } from '../../interfaces/agent-context.interface';
import { ActionExecutionResult } from '../action-executor.service';
import { getLocale, actionSummaries as t } from '../../locales/action-summaries';
import { AiError, AiErrorCode } from '../../../errors';

/** Dependencies required for bulk email executor methods */
export interface BulkEmailExecutorDeps {
  bulkOperationsQueue: BulkOperationsQueueService | null;
  prisma: PrismaService;
  logger: Logger;
}

/**
 * Static executor for bulk email operations.
 * Keeps ActionExecutorService as thin orchestrator.
 */
export class BulkEmailExecutor {
  /**
   * Get provider type for bulk operations.
   */
  private static async getProviderType(
    prisma: PrismaService,
    tenantId: string,
    providerId: string,
  ): Promise<'google' | 'microsoft' | 'imap'> {
    const provider = await prisma.providerConfig.findFirst({
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
   * Bulk delete emails or empty a folder.
   */
  static async executeBulkDeleteEmails(
    action: AgentAction,
    context: AgentContext,
    deps: BulkEmailExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { emailIds, folder, permanent, count } = action.payload;
    const lang = getLocale(context.preferences?.language);

    if (!deps.bulkOperationsQueue) {
      throw new AiError('Bulk operations service not available', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    if (!emailIds || emailIds.length === 0) {
      throw new AiError('No emails to delete', AiErrorCode.INVALID_INPUT);
    }

    // Get provider from first email
    const firstEmail = await deps.prisma.email.findFirst({
      where: { id: emailIds[0], tenantId: context.tenantId },
      select: { providerId: true },
    });

    if (!firstEmail) {
      throw new AiError('Emails not found', AiErrorCode.INVALID_INPUT);
    }

    const providerType = await BulkEmailExecutor.getProviderType(deps.prisma, context.tenantId, firstEmail.providerId);

    // Queue the bulk operation
    const jobId = await deps.bulkOperationsQueue.enqueueBulkOperation({
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
   * Bulk archive emails.
   */
  static async executeBulkArchiveEmails(
    action: AgentAction,
    context: AgentContext,
    deps: BulkEmailExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { emailIds, count } = action.payload;
    const lang = getLocale(context.preferences?.language);

    if (!deps.bulkOperationsQueue) {
      throw new AiError('Bulk operations service not available', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    if (!emailIds || emailIds.length === 0) {
      throw new AiError('No emails to archive', AiErrorCode.INVALID_INPUT);
    }

    // Get provider from first email
    const firstEmail = await deps.prisma.email.findFirst({
      where: { id: emailIds[0], tenantId: context.tenantId },
      select: { providerId: true },
    });

    if (!firstEmail) {
      throw new AiError('Emails not found', AiErrorCode.INVALID_INPUT);
    }

    const providerType = await BulkEmailExecutor.getProviderType(deps.prisma, context.tenantId, firstEmail.providerId);

    // Queue the bulk operation
    const jobId = await deps.bulkOperationsQueue.enqueueBulkOperation({
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
   * Bulk mark emails as read.
   */
  static async executeBulkMarkRead(
    action: AgentAction,
    context: AgentContext,
    deps: BulkEmailExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { emailIds, count } = action.payload;
    const lang = getLocale(context.preferences?.language);

    if (!deps.bulkOperationsQueue) {
      throw new AiError('Bulk operations service not available', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    if (!emailIds || emailIds.length === 0) {
      throw new AiError('No emails to mark as read', AiErrorCode.INVALID_INPUT);
    }

    // Get provider from first email
    const firstEmail = await deps.prisma.email.findFirst({
      where: { id: emailIds[0], tenantId: context.tenantId },
      select: { providerId: true },
    });

    if (!firstEmail) {
      throw new AiError('Emails not found', AiErrorCode.INVALID_INPUT);
    }

    const providerType = await BulkEmailExecutor.getProviderType(deps.prisma, context.tenantId, firstEmail.providerId);

    // Queue the bulk operation
    const jobId = await deps.bulkOperationsQueue.enqueueBulkOperation({
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
   * Bulk move emails to a folder.
   */
  static async executeBulkMoveEmails(
    action: AgentAction,
    context: AgentContext,
    deps: BulkEmailExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { emailIds, targetFolder, count } = action.payload;
    const lang = getLocale(context.preferences?.language);

    if (!deps.bulkOperationsQueue) {
      throw new AiError('Bulk operations service not available', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    if (!emailIds || emailIds.length === 0) {
      throw new AiError('No emails to move', AiErrorCode.INVALID_INPUT);
    }

    if (!targetFolder) {
      throw new AiError('Target folder is required', AiErrorCode.INVALID_INPUT);
    }

    // Get provider from first email
    const firstEmail = await deps.prisma.email.findFirst({
      where: { id: emailIds[0], tenantId: context.tenantId },
      select: { providerId: true },
    });

    if (!firstEmail) {
      throw new AiError('Emails not found', AiErrorCode.INVALID_INPUT);
    }

    const providerType = await BulkEmailExecutor.getProviderType(deps.prisma, context.tenantId, firstEmail.providerId);

    // Queue the bulk operation
    const jobId = await deps.bulkOperationsQueue.enqueueBulkOperation({
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
