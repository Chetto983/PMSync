import { Injectable, Logger } from '@nestjs/common';
import { IEmailDriver } from '../drivers/interfaces/email-driver.interface';
//import { CanonicalMessage } from '../drivers/interfaces/canonical.types';
import { SyncMessageProcessorService } from './sync-message-processor.service';
import { SyncTokenService, GetDriverCredentialsCallback, CreateDriverCallback } from './sync-token.service';
import { MessageProcessorContext } from '../interfaces/sync-context.interface';

/**
 * Configuration for full sync operation
 */
export interface FullSyncConfig {
  fullSyncMaxMessages: number;
  batchSize: number;
  getListMessagesOptions: () => Record<string, any>;
}

/**
 * Context for sync orchestration (token refresh callbacks)
 */
export interface OrchestrationContext {
  providerId: string;
  tenantId: string;
  tokenExpiresAt?: Date | null;
  userId?: string;
  getDriverCredentials: GetDriverCredentialsCallback;
  createDriver: CreateDriverCallback;
  messageProcessorContext: MessageProcessorContext;
  /** IF-H2: Callback to clear stale sync token when 404/410 detected */
  clearSyncToken?: () => Promise<void>;
}

/**
 * Result from full sync operation
 */
export interface FullSyncResult {
  messagesProcessed: number;
  newMessages: number;
  syncToken: string;
  driver: IEmailDriver;
}

/**
 * Result from incremental sync operation
 */
export interface IncrementalSyncResult {
  messagesProcessed: number;
  newMessages: number;
  newSyncToken: string;
  driver: IEmailDriver;
}

/**
 * Hook result for provider-specific incremental handling
 */
export interface IncrementalHookResult {
  skipProcessing: boolean;
  logMessage?: string;
}

/**
 * SyncOrchestrationService
 *
 * Orchestrates full and incremental sync operations.
 * Extracted from base-email-sync.service.ts (Phase 6 Plan 02).
 *
 * Key features:
 * - FOLDER-FIX: Syncs ALL important folders (INBOX, SENT, DRAFTS, TRASH, ARCHIVE)
 * - DEDUP-FIX: Cross-folder deduplication to prevent duplicate emails
 * - CRIT-3 FIX: Mid-sync token refresh for long-running operations
 */
@Injectable()
export class SyncOrchestrationService {
  private readonly logger = new Logger(SyncOrchestrationService.name);
  private static readonly FULL_SYNC_FOLDER_WEIGHTS = [
    { folder: 'INBOX', weight: 0.60 },
    { folder: 'SENT', weight: 0.20 },
    { folder: 'ARCHIVE', weight: 0.15 },
    { folder: 'DRAFTS', weight: 0.04 },
    { folder: 'TRASH', weight: 0.01 },
  ] as const;

  constructor(
    private readonly messageProcessor: SyncMessageProcessorService,
    private readonly tokenService: SyncTokenService,
  ) {}

  private buildFolderBudgets(maxMessages: number): Array<{ folder: string; budget: number }> {
    const weightedBudgets = SyncOrchestrationService.FULL_SYNC_FOLDER_WEIGHTS.map(
      ({ folder, weight }) => ({
        folder,
        rawBudget: maxMessages * weight,
        budget: Math.floor(maxMessages * weight),
      }),
    );

    let allocated = weightedBudgets.reduce((sum, item) => sum + item.budget, 0);
    let remainder = Math.max(0, maxMessages - allocated);

    weightedBudgets
      .sort((a, b) => (b.rawBudget - b.budget) - (a.rawBudget - a.budget))
      .forEach((item) => {
        if (remainder <= 0) {
          return;
        }
        item.budget += 1;
        allocated += 1;
        remainder -= 1;
      });

    return weightedBudgets
      .filter((item) => item.budget > 0)
      .map(({ folder, budget }) => ({ folder, budget }));
  }

  /**
   * Full sync using driver - shared implementation
   * FOLDER-FIX: Syncs ALL important folders, not just INBOX
   * DEDUP-FIX: Cross-folder deduplication to prevent duplicate emails
   * CRIT-3 FIX: Refreshes driver mid-sync if token expiring
   *
   * @param initialDriver - Connected email driver
   * @param config - Full sync configuration
   * @param context - Orchestration context with callbacks
   * @returns FullSyncResult with processed counts and sync token
   */
  async executeFullSync(
    initialDriver: IEmailDriver,
    config: FullSyncConfig,
    context: OrchestrationContext,
  ): Promise<FullSyncResult> {
    // FOLDER-FIX: Sync all important folders, but bias the budget toward user-visible mail.
    const folderBudgets = this.buildFolderBudgets(config.fullSyncMaxMessages);
    const foldersToSync = folderBudgets.map(({ folder }) => folder);

    this.logger.debug(
      `Full sync with driver - folder budgets: ${folderBudgets.map(({ folder, budget }) => `${folder}:${budget}`).join(', ')}`,
    );

    let messagesProcessed = 0;
    let newMessages = 0;

    // CRIT-3 FIX: Track mutable driver and token expiry for mid-sync refresh
    let driver = initialDriver;
    let tokenExpiresAt = context.tokenExpiresAt;

    // DEDUP-FIX: Track processed externalIds across ALL folders
    // Critical for MS Graph where message IDs are globally unique (unlike IMAP UIDs)
    // Same email moved between folders should UPDATE not INSERT
    const processedExternalIds = new Set<string>();

    // FOLDER-FIX: Iterate through all folders
    for (const { folder, budget } of folderBudgets) {
      let pageToken: string | undefined;
      let fetchedCount = 0;

      this.logger.debug(`Syncing folder: ${folder} (budget: ${budget})`);

      try {
        // List messages from current folder
        do {
          // CRIT-3 FIX: Check if token needs refresh before each batch
          const refreshResult = await this.tokenService.refreshDriverIfNeeded(
            driver,
            context.providerId,
            tokenExpiresAt,
            context.getDriverCredentials,
            context.createDriver,
          );
          driver = refreshResult.driver;
          tokenExpiresAt = refreshResult.tokenExpiresAt;

          const result = await driver.listMessages({
            folder,
            pageSize: Math.min(config.batchSize, budget - fetchedCount),
            pageToken,
            ...config.getListMessagesOptions(),
          });

          // DEDUP-FIX: Filter out messages already processed in previous folders
          // For MS Graph, same email can appear in multiple folders with same ID
          // For IMAP, UIDs are per-folder but messageId/externalId might be shared
          const dedupedMessages = result.messages.filter((msg) => {
            if (processedExternalIds.has(msg.id)) {
              this.logger.debug(
                `DEDUP-FIX: Skipping duplicate message ${msg.id} (already processed in another folder)`,
              );
              return false;
            }
            // Mark as processed for subsequent folders
            processedExternalIds.add(msg.id);
            return true;
          });

          // Performance fix (N1-4/N1-5): Process messages in batch using transaction
          const batchResult = await this.messageProcessor.processBatch(
            driver,
            dedupedMessages,
            context.providerId,
            context.tenantId,
            context.messageProcessorContext,
          );
          messagesProcessed += batchResult.processed;
          newMessages += batchResult.newCount;

          fetchedCount += result.messages.length;
          pageToken = result.nextPageToken;

          // Stop if we've reached the limit for this folder or no more pages
          if (fetchedCount >= budget || !pageToken) {
            break;
          }
        } while (pageToken);

        this.logger.debug(`Folder ${folder}: synced ${fetchedCount} messages`);
      } catch (folderError) {
        // Some folders may not exist on all providers (e.g., ARCHIVE on some IMAP servers)
        // Log warning and continue with other folders
        this.logger.warn(
          `Failed to sync folder ${folder}: ${folderError instanceof Error ? folderError.message : String(folderError)}`,
        );
      }
    }

    // Get current sync token (method may not be available on all drivers)
    if (!driver.getInitialSyncToken) {
      throw new Error('Driver does not support getInitialSyncToken - cannot complete full sync');
    }
    const syncToken = await driver.getInitialSyncToken();

    this.logger.debug(
      `Full sync complete: ${messagesProcessed} processed, ${newMessages} new across ${foldersToSync.length} folders, syncToken: ${syncToken}`,
    );

    return {
      messagesProcessed,
      newMessages,
      syncToken,
      driver,
    };
  }

  /**
   * Incremental sync using driver - shared implementation
   * CRIT-3 FIX: Refreshes driver mid-sync if token expiring
   *
   * @param initialDriver - Connected email driver
   * @param lastSyncToken - Last sync token for delta detection
   * @param context - Orchestration context with callbacks
   * @param onIncrementalChanges - Hook for provider-specific handling
   * @returns IncrementalSyncResult with processed counts and new sync token
   */
  async executeIncrementalSync(
    initialDriver: IEmailDriver,
    lastSyncToken: string,
    context: OrchestrationContext,
    onIncrementalChanges: (
      changesResult: { changes: Array<{ type: string; messageId: string }>; newSyncToken: string },
      lastSyncToken: string,
    ) => IncrementalHookResult,
  ): Promise<IncrementalSyncResult> {
    this.logger.debug(`Incremental sync with driver from token: ${lastSyncToken.substring(0, 20)}...`);

    let messagesProcessed = 0;
    let newMessages = 0;
    const processedIds = new Set<string>();

    // CRIT-3 FIX: Track mutable driver and token expiry for mid-sync refresh
    let driver = initialDriver;
    let tokenExpiresAt = context.tokenExpiresAt;

    // Get changes since last sync (method may not be available on all drivers)
    if (!driver.getChangesSince) {
      throw new Error('Driver does not support getChangesSince - cannot complete incremental sync');
    }

    let changesResult: Awaited<ReturnType<NonNullable<IEmailDriver['getChangesSince']>>>;
    try {
      changesResult = await driver.getChangesSince(lastSyncToken);
    } catch (syncTokenError) {
      // IF-H2: Handle invalid/expired sync tokens (404 historyId, 410 Gone delta)
      const errMsg = syncTokenError instanceof Error ? syncTokenError.message : String(syncTokenError);
      const isTokenInvalid = /404|410|Gone|notFound|historyId|invalid.*token|expired.*token/i.test(errMsg);

      if (isTokenInvalid && context.clearSyncToken) {
        this.logger.warn(
          `[IF-H2] Sync token invalid for provider ${context.providerId}: ${errMsg} — clearing token, next sync will be full`,
        );
        await context.clearSyncToken();
        // Return empty result — the next scheduled sync will run as full sync (no token)
        return { messagesProcessed: 0, newMessages: 0, newSyncToken: '', driver };
      }
      throw syncTokenError;
    }

    // Provider-specific handling (e.g., Microsoft delta token expiration)
    const hookResult = onIncrementalChanges(changesResult, lastSyncToken);
    if (hookResult.skipProcessing) {
      if (hookResult.logMessage) {
        this.logger.debug(hookResult.logMessage);
      }
      return {
        messagesProcessed: 0,
        newMessages: 0,
        newSyncToken: changesResult.newSyncToken,
        driver,
      };
    }

    this.logger.debug(`Found ${changesResult.changes.length} changes`);

    // CRIT-3 FIX: Batch counter for periodic token refresh check
    let batchCounter = 0;
    const TOKEN_CHECK_INTERVAL = 50; // Check every 50 changes

    // Process each change
    for (const change of changesResult.changes) {
      // Skip if already processed (deduplication)
      if (processedIds.has(change.messageId)) {
        continue;
      }
      processedIds.add(change.messageId);

      // CRIT-3 FIX: Periodically check if token needs refresh
      batchCounter++;
      if (batchCounter % TOKEN_CHECK_INTERVAL === 0) {
        const refreshResult = await this.tokenService.refreshDriverIfNeeded(
          driver,
          context.providerId,
          tokenExpiresAt,
          context.getDriverCredentials,
          context.createDriver,
        );
        driver = refreshResult.driver;
        tokenExpiresAt = refreshResult.tokenExpiresAt;
      }

      try {
        if (change.type === 'deleted') {
          // Handle deletion
          await this.messageProcessor.handleDeletion(
            change.messageId,
            context.providerId,
            context.tenantId,
          );
          messagesProcessed++;
        } else if (change.type === 'added' || change.type === 'modified') {
          // Fetch and upsert the message
          const message = await driver.getMessage(change.messageId);
          if (message) {
            const upsertResult = await this.messageProcessor.upsertMessage(
              driver,
              message,
              context.providerId,
              context.tenantId,
              context.messageProcessorContext,
            );
            messagesProcessed++;
            if (upsertResult.wasNew) {
              newMessages++;
            }
          }
        }
      } catch (error) {
        this.logger.warn(
          `Failed to process change for message ${change.messageId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Continue processing other changes
      }
    }

    this.logger.debug(
      `Incremental sync complete: ${messagesProcessed} processed, ${newMessages} new, newToken: ${changesResult.newSyncToken.substring(0, 20)}...`,
    );

    return {
      messagesProcessed,
      newMessages,
      newSyncToken: changesResult.newSyncToken,
      driver,
    };
  }
}
