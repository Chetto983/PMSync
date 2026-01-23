/**
 * Folder Action Executor - Handles folder CRUD operations.
 * Phase 9a: Extracted from action-executor.service.ts (2026-01-23)
 *
 * Static methods to avoid additional DI complexity.
 * Dependencies passed via FolderExecutorDeps interface.
 */
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { FolderSyncService } from '../../../../email-sync/services/folder-sync.service';
import { AgentAction } from '../../interfaces/agent-action.interface';
import { AgentContext } from '../../interfaces/agent-context.interface';
import { ActionExecutionResult } from '../action-executor.service';
import { getLocale, actionSummaries as t } from '../../locales/action-summaries';
import { AiError, AiErrorCode } from '../../../errors';

/** Dependencies required for folder executor methods */
export interface FolderExecutorDeps {
  folderSyncService: FolderSyncService | null;
  prisma: PrismaService;
  logger: Logger;
  resolveProviderId: (
    tenantId: string,
    providerId: string | undefined,
    type: 'email' | 'calendar',
  ) => Promise<string>;
}

/**
 * Static executor for folder-related actions.
 * Keeps ActionExecutorService as thin orchestrator.
 */
export class FolderExecutor {
  /**
   * Create a new folder in the email provider.
   */
  static async executeCreateFolder(
    action: AgentAction,
    context: AgentContext,
    deps: FolderExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { name, providerId, parentPath } = action.payload;

    if (!deps.folderSyncService) {
      deps.logger.warn('FolderSyncService not available');
      throw new AiError('Folder service not available', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    if (!name) {
      throw new AiError('Folder name is required', AiErrorCode.INVALID_INPUT);
    }

    // Resolve provider (use provided or find default)
    const actualProviderId = await deps.resolveProviderId(context.tenantId, providerId, 'email');

    const result = await deps.folderSyncService.createFolder(
      context.tenantId,
      actualProviderId,
      name,
      parentPath,
    );

    deps.logger.log(`Created folder "${name}" with id ${result.id}`);

    const lang = getLocale(context.preferences?.language);

    return {
      success: true,
      data: { folderId: result.id, folderPath: result.path, folderName: result.name },
      summary: t.folderCreated[lang](name),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  /**
   * Rename an existing folder.
   */
  static async executeRenameFolder(
    action: AgentAction,
    context: AgentContext,
    deps: FolderExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { folderPath, newName, providerId } = action.payload;

    if (!deps.folderSyncService) {
      deps.logger.warn('FolderSyncService not available');
      throw new AiError('Folder service not available', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    if (!folderPath || !newName) {
      throw new AiError('Folder path and new name are required', AiErrorCode.INVALID_INPUT);
    }

    // Resolve provider (use provided or find default)
    const actualProviderId = await deps.resolveProviderId(context.tenantId, providerId, 'email');

    const result = await deps.folderSyncService.renameFolder(
      context.tenantId,
      actualProviderId,
      folderPath,
      newName,
    );

    deps.logger.log(`Renamed folder to "${newName}" (path: ${result.path})`);

    const lang = getLocale(context.preferences?.language);

    return {
      success: true,
      data: { folderId: result.id, folderPath: result.path, folderName: result.name },
      summary: t.folderRenamed[lang](newName),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }

  /**
   * Delete a folder from the email provider.
   */
  static async executeDeleteFolder(
    action: AgentAction,
    context: AgentContext,
    deps: FolderExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const { folderPath, providerId } = action.payload;

    if (!deps.folderSyncService) {
      deps.logger.warn('FolderSyncService not available');
      throw new AiError('Folder service not available', AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    if (!folderPath) {
      throw new AiError('Folder path is required', AiErrorCode.INVALID_INPUT);
    }

    // Resolve provider (use provided or find default)
    const actualProviderId = await deps.resolveProviderId(context.tenantId, providerId, 'email');

    await deps.folderSyncService.deleteFolder(
      context.tenantId,
      actualProviderId,
      folderPath,
    );

    deps.logger.log(`Deleted folder at path "${folderPath}"`);

    const lang = getLocale(context.preferences?.language);

    return {
      success: true,
      data: { folderPath, deleted: true },
      summary: t.folderDeleted[lang](folderPath),
      executionTimeMs: 0, // Overwritten by execute()
    };
  }
}
