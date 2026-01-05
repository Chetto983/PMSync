import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { SyncJobData, SyncJobResult } from '../interfaces/sync-job.interface';
import { IEmailDriver } from '../drivers/interfaces/email-driver.interface';
import { CanonicalMessage, AttachmentMeta } from '../drivers/interfaces/canonical.types';
import { EmailEmbeddingQueueService } from '../../ai/services/email-embedding.queue';
import { isJunkFolder, isRecentEmail as isRecentEmailHelper } from '../../email/email.helpers';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { FollowUpService } from '../../ai/voltagent/services/follow-up.service';
import { WritingStyleService } from '../../ai/voltagent/services/writing-style.service';

/**
 * Abstract base class for email sync services (Google, Microsoft, IMAP)
 * Provides common functionality and enforces implementation of provider-specific methods
 *
 * Features:
 * - Folder name normalization with i18n support
 * - HTML to plain text conversion
 * - WebSocket/SSE notifications
 * - Retry configuration
 * - Common error handling
 * - Sync statistics calculation
 * - CRIT-3 FIX: Mid-sync token refresh for long-running operations
 */
export abstract class BaseEmailSyncService implements OnModuleInit {
  protected abstract readonly logger: Logger;

  // Configuration properties (initialized in onModuleInit)
  protected batchSize: number;
  protected retryMaxAttempts: number;
  protected retry429DelayMs: number;
  protected retry5xxDelayMs: number;
  protected fullSyncMaxMessages: number;

  // RACE CONDITION FIX: Redis lock service for distributed locking
  protected redisLock: RedisLockService | null = null;

  // CRIT-3 FIX: Token refresh threshold (refresh if less than 2 min remaining)
  protected readonly TOKEN_REFRESH_THRESHOLD_MS = 2 * 60 * 1000;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly realtimeEvents: RealtimeEventsService,
    protected readonly config: ConfigService,
    protected readonly followUpService: FollowUpService,
    protected readonly writingStyleService: WritingStyleService,
  ) { }

  /**
   * Set the Redis lock service (injected by child classes)
   * This is optional - if not set, locking is skipped
   */
  setRedisLockService(redisLock: RedisLockService): void {
    this.redisLock = redisLock;
  }

  /**
   * Initialize configuration from environment variables
   * Child classes should call super.onModuleInit() and then override with provider-specific config
   */
  onModuleInit() {
    // Default batch size (providers can override)
    this.batchSize = this.config.get<number>('SYNC_BATCH_SIZE', 500);

    // Retry configuration
    this.retryMaxAttempts = this.config.get<number>('RETRY_MAX_ATTEMPTS', 3);
    this.retry429DelayMs = this.config.get<number>('RETRY_429_DELAY_MS', 2000);
    this.retry5xxDelayMs = this.config.get<number>('RETRY_5XX_DELAY_MS', 2000);

    // Full sync limits
    this.fullSyncMaxMessages = this.config.get<number>('FULL_SYNC_MAX_MESSAGES', 1000);
  }

  /**
   * Main sync entry point - orchestrates the sync process
   * Providers only need to implement getDriverCredentials() and getEmbeddingQueue()
   */
  async syncProvider(jobData: SyncJobData): Promise<SyncJobResult> {
    const { providerId, email, syncType, tenantId } = jobData;

    this.logger.log(`Starting ${syncType} sync for ${email} (driver mode)`);

    try {
      // Get provider credentials (provider-specific)
      const { provider, credentials, driverType } = await this.getDriverCredentials(providerId);

      // Create connected driver
      let driver = await this.createDriver(driverType, credentials);
      // CRIT-3 FIX: Track token expiry for mid-sync refresh
      const tokenExpiresAt = provider.tokenExpiresAt;
      const userId = provider.userId; // Extract userId for follow-up service

      if (!driver.isConnected()) {
        throw new Error('Driver failed to connect');
      }

      try {
        // Hook for provider-specific pre-sync logic (e.g., capability checks)
        await this.onBeforeSync(driver, provider);

        // Get last sync token from metadata
        const metadata = (provider.metadata) || {};
        const lastSyncToken = metadata.lastSyncToken;

        let messagesProcessed = 0;
        let newMessages = 0;
        let newSyncToken: string | undefined;

        if (syncType === 'incremental' && lastSyncToken) {
          // Incremental sync using driver
          // CRIT-3 FIX: Pass token expiry for mid-sync refresh
          const result = await this.syncIncrementalWithDriver(
            driver,
            lastSyncToken,
            providerId,
            tenantId,
            tokenExpiresAt,
            userId,
          );
          messagesProcessed = result.messagesProcessed;
          newMessages = result.newMessages;
          newSyncToken = result.newSyncToken;
          driver = result.driver; // Use potentially refreshed driver for disconnect

          // IMAP-SYNC-FIX: If incremental sync found nothing, check if we need full sync
          // This handles stale tokens, servers without CONDSTORE, and the legacy single-folder sync bug
          if (messagesProcessed === 0 && newMessages === 0) {
            // Check email counts per folder to detect missing folder syncs
            const folderCounts = await this.prisma.email.groupBy({
              by: ['folder'],
              where: { providerId },
              _count: true,
            });

            const folderMap = new Map(folderCounts.map(f => [f.folder, f._count]));
            const inboxCount = folderMap.get('INBOX') || 0;
            const sentCount = folderMap.get('SENT') || 0;
            const draftsCount = folderMap.get('DRAFTS') || 0;

            // Force full sync if:
            // 1. INBOX has emails but SENT folder is completely empty (legacy bug)
            // 2. Or overall email count is very low (new provider)
            const totalCount = folderCounts.reduce((sum, f) => sum + f._count, 0);
            const needsFullSync = (inboxCount > 0 && sentCount === 0) || totalCount < 3;

            if (needsFullSync) {
              this.logger.warn(
                `Incremental sync found 0 changes - DB has INBOX:${inboxCount}, SENT:${sentCount}, DRAFTS:${draftsCount} - forcing full sync to repair`,
              );
              const fullResult = await this.syncFullWithDriver(
                driver,
                providerId,
                tenantId,
                tokenExpiresAt,
                userId,
              );
              messagesProcessed = fullResult.messagesProcessed;
              newMessages = fullResult.newMessages;
              newSyncToken = fullResult.syncToken;
              driver = fullResult.driver;
            }
          }
        } else {
          // Full sync using driver
          // CRIT-3 FIX: Pass token expiry for mid-sync refresh
          const result = await this.syncFullWithDriver(
            driver,
            providerId,
            tenantId,
            tokenExpiresAt,
            userId,
          );
          messagesProcessed = result.messagesProcessed;
          newMessages = result.newMessages;
          newSyncToken = result.syncToken;
          driver = result.driver; // Use potentially refreshed driver for disconnect
        }

        // Emit realtime events
        if (messagesProcessed > 0) {
          this.realtimeEvents.emitEmailBatchProcessed(tenantId, {
            providerId,
            processed: messagesProcessed,
            created: newMessages,
            syncType,
          });
          this.realtimeEvents.emitSyncStatus(tenantId, {
            providerId,
            status: 'in_progress',
            processed: messagesProcessed,
          });
        }

        return {
          success: true,
          providerId,
          email,
          messagesProcessed,
          newMessages,
          syncDuration: 0, // Will be set by worker
          lastSyncToken: newSyncToken,
        };
      } finally {
        await driver.disconnect();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Sync failed for ${email}: ${errorMessage}`);
      if (errorStack) {
        this.logger.error(`Stack trace: ${errorStack}`);
      }
      throw error;
    }
  }

  /**
   * Get driver credentials for connecting to provider
   * Must be implemented by each provider (Google, Microsoft, IMAP)
   */
  protected abstract getDriverCredentials(providerId: string): Promise<{
    provider: any;
    credentials: any;
    driverType: 'google' | 'microsoft' | 'imap';
  }>;

  /**
   * Create and connect driver - can be overridden by providers
   */
  protected abstract createDriver(driverType: string, credentials: any): Promise<IEmailDriver>;

  /**
   * Hook for provider-specific pre-sync logic (e.g., capability checks)
   * Override in providers that need to do something before sync starts
   */
  protected async onBeforeSync(_driver: IEmailDriver, _provider: any): Promise<void> {
    // Default: no-op. Providers can override for capability checks, etc.
  }

  /**
   * CRIT-3 FIX: Check if token is about to expire and needs refresh
   * Compares current time against token expiry with threshold buffer
   */
  protected isTokenExpiringSoon(tokenExpiresAt: Date | null | undefined): boolean {
    if (!tokenExpiresAt) {
      return false; // Can't check without expiry time
    }
    const now = Date.now();
    const expiresAt = new Date(tokenExpiresAt).getTime();
    return now >= expiresAt - this.TOKEN_REFRESH_THRESHOLD_MS;
  }

  /**
   * CRIT-3 FIX: Refresh driver with new credentials if token is expiring
   * Returns new driver if refreshed, or existing driver if still valid
   */
  protected async refreshDriverIfNeeded(
    currentDriver: IEmailDriver,
    providerId: string,
    tokenExpiresAt: Date | null | undefined,
  ): Promise<{ driver: IEmailDriver; tokenExpiresAt: Date | null | undefined }> {
    if (!this.isTokenExpiringSoon(tokenExpiresAt)) {
      return { driver: currentDriver, tokenExpiresAt };
    }

    this.logger.log(`CRIT-3: Token expiring soon, refreshing driver for provider ${providerId}`);

    try {
      // Disconnect old driver
      await currentDriver.disconnect();

      // Get fresh credentials (will trigger token refresh via ProviderTokenService)
      const { provider, credentials, driverType } = await this.getDriverCredentials(providerId);

      // Create new driver with fresh token
      const newDriver = await this.createDriver(driverType, credentials);

      if (!newDriver.isConnected()) {
        throw new Error('New driver failed to connect');
      }

      this.logger.log(`CRIT-3: Driver refreshed successfully for provider ${providerId}`);
      return { driver: newDriver, tokenExpiresAt: provider.tokenExpiresAt };
    } catch (error) {
      this.logger.error(
        `CRIT-3: Failed to refresh driver: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Return existing driver - let it fail naturally if token is expired
      return { driver: currentDriver, tokenExpiresAt };
    }
  }

  /**
   * Get additional listMessages options for provider
   * Override to add provider-specific options (e.g., includeBody for IMAP)
   */
  protected getListMessagesOptions(): Record<string, any> {
    return {};
  }

  /**
   * Hook for provider-specific incremental sync processing
   * Called after getting changes, before processing. Can modify results.
   * Override in providers that need special handling (e.g., Microsoft delta token expiration)
   */
  protected onIncrementalChanges(
    changesResult: { changes: Array<{ type: string; messageId: string }>; newSyncToken: string },
    _lastSyncToken: string,
  ): { skipProcessing: boolean; logMessage?: string } {
    // Default: process all changes
    if (changesResult.changes.length === 0) {
      return { skipProcessing: true, logMessage: 'No changes detected' };
    }
    return { skipProcessing: false };
  }

  /**
   * Full sync using driver - shared implementation
   * DC-2 consolidation: Removes ~55 lines × 3 providers = ~165 lines
   * CRIT-3 FIX: Accepts tokenExpiresAt and refreshes driver mid-sync if needed
   * FOLDER-FIX: Now syncs ALL important folders, not just INBOX
   * DEDUP-FIX: Cross-folder deduplication to prevent duplicate emails (2025-01-04)
   */
  protected async syncFullWithDriver(
    initialDriver: IEmailDriver,
    providerId: string,
    tenantId: string,
    initialTokenExpiresAt?: Date | null,
    userId?: string,
  ): Promise<{
    messagesProcessed: number;
    newMessages: number;
    syncToken: string;
    driver: IEmailDriver;
  }> {
    // FOLDER-FIX: Sync all important folders, not just INBOX
    const foldersToSync = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'ARCHIVE'];
    const messagesPerFolder = Math.ceil(this.fullSyncMaxMessages / foldersToSync.length);

    this.logger.debug(
      `Full sync with driver - fetching ${messagesPerFolder} messages from each folder: ${foldersToSync.join(', ')}`,
    );

    let messagesProcessed = 0;
    let newMessages = 0;

    // CRIT-3 FIX: Track mutable driver and token expiry for mid-sync refresh
    let driver = initialDriver;
    let tokenExpiresAt = initialTokenExpiresAt;

    // DEDUP-FIX: Track processed externalIds across ALL folders to prevent duplicates
    // Critical for MS Graph where message IDs are globally unique (unlike IMAP UIDs)
    // Same email moved between folders should UPDATE not INSERT
    const processedExternalIds = new Set<string>();

    // FOLDER-FIX: Iterate through all folders
    for (const folder of foldersToSync) {
      let pageToken: string | undefined;
      let fetchedCount = 0;

      this.logger.debug(`Syncing folder: ${folder}`);

      try {
        // List messages from current folder
        do {
          // CRIT-3 FIX: Check if token needs refresh before each batch
          const refreshResult = await this.refreshDriverIfNeeded(driver, providerId, tokenExpiresAt);
          driver = refreshResult.driver;
          tokenExpiresAt = refreshResult.tokenExpiresAt;

          const result = await driver.listMessages({
            folder,
            pageSize: Math.min(this.batchSize, messagesPerFolder - fetchedCount),
            pageToken,
            ...this.getListMessagesOptions(),
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
          const batchResult = await this.processMessagesBatch(
            driver,
            dedupedMessages,
            providerId,
            tenantId,
            userId,
          );
          messagesProcessed += batchResult.processed;
          newMessages += batchResult.newCount;

          fetchedCount += result.messages.length;
          pageToken = result.nextPageToken;

          // Stop if we've reached the limit for this folder or no more pages
          if (fetchedCount >= messagesPerFolder || !pageToken) {
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
   * DC-3 consolidation: Removes ~70 lines × 3 providers = ~210 lines
   * CRIT-3 FIX: Accepts tokenExpiresAt and refreshes driver mid-sync if needed
   */
  protected async syncIncrementalWithDriver(
    initialDriver: IEmailDriver,
    lastSyncToken: string,
    providerId: string,
    tenantId: string,
    initialTokenExpiresAt?: Date | null,
    userId?: string,
  ): Promise<{
    messagesProcessed: number;
    newMessages: number;
    newSyncToken: string;
    driver: IEmailDriver;
  }> {
    this.logger.debug(`Incremental sync with driver from token: ${lastSyncToken.substring(0, 20)}...`);

    let messagesProcessed = 0;
    let newMessages = 0;
    const processedIds = new Set<string>();

    // CRIT-3 FIX: Track mutable driver and token expiry for mid-sync refresh
    let driver = initialDriver;
    let tokenExpiresAt = initialTokenExpiresAt;

    // Get changes since last sync (method may not be available on all drivers)
    if (!driver.getChangesSince) {
      throw new Error('Driver does not support getChangesSince - cannot complete incremental sync');
    }
    const changesResult = await driver.getChangesSince(lastSyncToken);

    // Provider-specific handling (e.g., Microsoft delta token expiration)
    const hookResult = this.onIncrementalChanges(changesResult, lastSyncToken);
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
        const refreshResult = await this.refreshDriverIfNeeded(driver, providerId, tokenExpiresAt);
        driver = refreshResult.driver;
        tokenExpiresAt = refreshResult.tokenExpiresAt;
      }

      try {
        if (change.type === 'deleted') {
          // Handle deletion
          await this.handleMessageDeletion(change.messageId, providerId, tenantId);
          messagesProcessed++;
        } else if (change.type === 'added' || change.type === 'modified') {
          // Fetch and upsert the message
          const message = await driver.getMessage(change.messageId);
          if (message) {
            const upsertResult = await this.upsertMessageFromDriver(driver, message, providerId, tenantId, userId);
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

  /**
   * Get the email embedding queue service - must be provided by child classes
   * This allows the base class to queue new messages for embedding generation
   */
  protected abstract getEmbeddingQueue(): EmailEmbeddingQueueService;

  /**
   * Process attachments for a message - must be implemented by each provider
   * This handles provider-specific attachment download and storage logic
   *
   * @param driver - The connected email driver
   * @param emailId - Database email ID
   * @param tenantId - Tenant ID for storage
   * @param providerId - Provider ID for reference
   * @param externalMessageId - Provider's message ID
   * @param attachments - Attachment metadata from the message
   */
  protected abstract processAttachmentsForMessage(
    driver: IEmailDriver,
    emailId: string,
    tenantId: string,
    providerId: string,
    externalMessageId: string,
    attachments: AttachmentMeta[],
  ): Promise<void>;

  // ============================================
  // Shared Message Processing Methods
  // ============================================

  /**
   * Parse IMAP external ID to extract folder and UID
   * AUDIT FIX #1: Supports folder:uid format and special markers
   *
   * @param externalId The external ID to parse
   * @returns Object with folder, uid (if valid), and special marker type
   */
  protected parseImapExternalId(externalId: string): {
    folder: string | null;
    uid: number | null;
    isSpecialMarker: boolean;
    markerType: 'NEW' | 'EXPUNGE' | 'FLAGS' | null;
  } {
    const lastColon = externalId.lastIndexOf(':');

    if (lastColon <= 0) {
      // Legacy format: just UID
      const uid = parseInt(externalId, 10);
      return {
        folder: null,
        uid: isNaN(uid) ? null : uid,
        isSpecialMarker: false,
        markerType: null,
      };
    }

    const folder = externalId.substring(0, lastColon);
    const uidPart = externalId.substring(lastColon + 1);

    // Check for special markers
    if (uidPart.startsWith('__NEW__')) {
      return { folder, uid: null, isSpecialMarker: true, markerType: 'NEW' };
    }
    if (uidPart.startsWith('__EXPUNGE__')) {
      return { folder, uid: null, isSpecialMarker: true, markerType: 'EXPUNGE' };
    }
    if (uidPart.startsWith('__FLAGS__')) {
      return { folder, uid: null, isSpecialMarker: true, markerType: 'FLAGS' };
    }

    // Normal folder:uid format
    const uid = parseInt(uidPart, 10);
    return {
      folder,
      uid: isNaN(uid) ? null : uid,
      isSpecialMarker: false,
      markerType: null,
    };
  }

  /**
   * Handle message deletion - mark as deleted in database and emit events
   * This is identical across all providers and has been moved to base class
   *
   * Phase 4 Deduplication: Removes ~30 lines of duplicate code per provider
   * AUDIT FIX #1: Now handles folder:uid format for IMAP
   *
   * @param messageId - External message ID from provider
   * @param providerId - Provider ID
   * @param tenantId - Tenant ID
   * @returns Object indicating if reconciliation is needed
   */
  protected async handleMessageDeletion(
    messageId: string,
    providerId: string,
    tenantId: string,
  ): Promise<{ needsReconciliation: boolean; folder?: string }> {
    // AUDIT FIX #1: Parse the messageId to handle folder:uid format
    const parsed = this.parseImapExternalId(messageId);

    // Special markers indicate reconciliation is needed
    if (parsed.isSpecialMarker && parsed.markerType === 'EXPUNGE') {
      this.logger.debug(`IMAP deletion reconciliation needed for folder: ${parsed.folder}`);
      return { needsReconciliation: true, folder: parsed.folder || undefined };
    }

    // Build query based on format
    // Try to match both folder:uid format and just uid for backwards compatibility
    const existing = await this.prisma.email.findFirst({
      where: {
        providerId,
        OR: [
          // Match full folder:uid format (new)
          { externalId: messageId },
          // Match just the UID part for backwards compatibility
          ...(parsed.uid !== null ? [{ externalId: parsed.uid.toString() }] : []),
          // Match folder:uid format if we have both parts
          ...(parsed.folder && parsed.uid !== null
            ? [{ externalId: `${parsed.folder}:${parsed.uid}` }]
            : []),
        ],
      },
      select: { id: true, folder: true, externalId: true },
    });

    if (!existing) {
      this.logger.debug(`Message not found for deletion: ${messageId}`);
      return { needsReconciliation: false };
    }

    // Mark as deleted or move to trash
    await this.prisma.email.update({
      where: { id: existing.id },
      data: {
        isDeleted: true,
        folder: 'TRASH',
      },
    });

    // Emit realtime event
    this.realtimeEvents.emitEmailDelete(tenantId, {
      emailId: existing.id,
      providerId,
      folder: existing.folder,
      reason: 'message-deleted',
    });

    return { needsReconciliation: false };
  }

  /**
   * Upsert a message from driver canonical format into database
   * This is nearly identical across all providers - only attachment processing differs
   *
   * RACE CONDITION FIX RC-1: Uses distributed Redis lock to prevent duplicate upserts
   * RACE CONDITION FIX RC-2: Uses optimistic locking to preserve user mutations
   *
   * Phase 4 Deduplication: Removes ~90 lines of duplicate code per provider
   *
   * @param driver - The connected email driver
   * @param canonicalMsg - Message in canonical format
   * @param providerId - Provider ID
   * @param tenantId - Tenant ID
   * @returns Object indicating if the message was new
   */
  protected async upsertMessageFromDriver(
    driver: IEmailDriver,
    canonicalMsg: CanonicalMessage,
    providerId: string,
    tenantId: string,
    userId?: string,
  ): Promise<{ wasNew: boolean; conflictDetected?: boolean }> {
    // RC-1 FIX: Create unique lock key for this message
    const lockKey = `email:upsert:${providerId}:${canonicalMsg.id}:${canonicalMsg.folder}`;
    const lockTtlMs = 5000; // 5 second timeout

    // Execute upsert with distributed lock (if available)
    const executeUpsert = async (): Promise<{ wasNew: boolean; conflictDetected?: boolean }> => {
      // RC-2 FIX: Check for recent user modifications before overwriting
      const existing = await this.prisma.email.findUnique({
        where: {
          providerId_externalId_folder: {
            providerId,
            externalId: canonicalMsg.id,
            folder: canonicalMsg.folder,
          },
        },
        select: {
          id: true,
          version: true,
          userModifiedAt: true,
          isRead: true,
          isStarred: true,
          isFlagged: true,
          folder: true,
          labels: true,
        },
      });

      // Common data for both create and update
      const baseUpdateData = {
        subject: canonicalMsg.subject || '(No Subject)',
        from: canonicalMsg.from.email,
        to: canonicalMsg.to?.map((r) => r.email) || [],
        cc: canonicalMsg.cc?.map((r) => r.email) || [],
        bcc: canonicalMsg.bcc?.map((r) => r.email) || [],
        bodyText: canonicalMsg.bodyText || '',
        bodyHtml: canonicalMsg.bodyHtml || '',
        snippet: canonicalMsg.snippet || '',
        receivedAt: canonicalMsg.receivedAt,
      };

      // RC-2 FIX: If user recently modified the email, preserve their changes
      // User modifications within the last 5 minutes take precedence
      const userModifiedRecently =
        existing?.userModifiedAt &&
        Date.now() - existing.userModifiedAt.getTime() < 5 * 60 * 1000;

      const updateData = userModifiedRecently
        ? {
          ...baseUpdateData,
          // Preserve user's state changes when they modified recently
          // Only update content fields, not state fields
        }
        : {
          ...baseUpdateData,
          isRead: canonicalMsg.isRead ?? false,
          isStarred: canonicalMsg.isStarred ?? false,
          isFlagged: canonicalMsg.isFlagged ?? false,
          labels: canonicalMsg.labels || [],
          folder: canonicalMsg.folder,
        };

      let result;
      let wasNew: boolean;

      if (existing) {
        // RC-6 FIX: Use conditional update with userModifiedAt check
        // This prevents overwriting user modifications that occurred after our read
        // The WHERE clause ensures update only succeeds if userModifiedAt hasn't changed
        const originalUserModifiedAt = existing.userModifiedAt;

        if (userModifiedRecently) {
          // User modified recently - only update content fields (already handled in updateData)
          result = await this.prisma.email.update({
            where: { id: existing.id },
            data: {
              ...updateData,
              version: { increment: 1 },
            },
          });
          this.logger.debug(
            `Preserved user modifications for email ${existing.id} (modified ${Math.round((Date.now() - existing.userModifiedAt!.getTime()) / 1000)}s ago)`,
          );
        } else {
          // No recent user modification at check time - use conditional update
          // This ensures we don't overwrite changes made between check and update
          const conditionalUpdate = await this.prisma.$executeRaw`
            UPDATE "emails"
            SET
              "subject" = ${updateData.subject},
              "from" = ${updateData.from},
              "to" = ${updateData.to},
              "cc" = ${updateData.cc},
              "bcc" = ${updateData.bcc},
              "bodyText" = ${updateData.bodyText},
              "bodyHtml" = ${updateData.bodyHtml},
              "snippet" = ${updateData.snippet},
              "receivedAt" = ${updateData.receivedAt},
              "isRead" = ${(updateData as any).isRead ?? existing.isRead},
              "isStarred" = ${(updateData as any).isStarred ?? existing.isStarred},
              "isFlagged" = ${(updateData as any).isFlagged ?? existing.isFlagged},
              "labels" = ${(updateData as any).labels ?? existing.labels},
              "folder" = ${(updateData as any).folder ?? existing.folder},
              "version" = "version" + 1,
              "updatedAt" = NOW()
            WHERE "id" = ${existing.id}
              AND (
                "userModifiedAt" IS NULL
                OR "userModifiedAt" = ${originalUserModifiedAt}
              )
          `;

          if (conditionalUpdate === 0) {
            // User modified email during sync - skip update to preserve their changes
            this.logger.debug(
              `RC-6: User modified email ${existing.id} during sync, preserving user state`,
            );
            // Re-fetch to return current state
            result = await this.prisma.email.findUnique({
              where: { id: existing.id },
            });
            if (!result) {
              throw new Error(`Email ${existing.id} was deleted during sync`);
            }
            return { wasNew: false, conflictDetected: true };
          }

          // Update succeeded - fetch the updated record
          result = await this.prisma.email.findUnique({
            where: { id: existing.id },
          });
          if (!result) {
            throw new Error(`Email ${existing.id} was deleted during sync`);
          }
        }
        wasNew = false;
      } else {
        // Create new record
        result = await this.prisma.email.create({
          data: {
            tenantId,
            providerId,
            externalId: canonicalMsg.id,
            ...baseUpdateData,
            isRead: canonicalMsg.isRead ?? false,
            isStarred: canonicalMsg.isStarred ?? false,
            isFlagged: canonicalMsg.isFlagged ?? false,
            labels: canonicalMsg.labels || [],
            sentAt: canonicalMsg.sentAt || canonicalMsg.receivedAt,
            isDeleted: false,
            folder: canonicalMsg.folder,
            threadId: canonicalMsg.threadId || null,
            version: 1,
          },
        });
        wasNew = true;
      }

      // Process attachments using provider-specific implementation
      if (canonicalMsg.hasAttachments && canonicalMsg.attachments.length > 0) {
        await this.processAttachmentsForMessage(
          driver,
          result.id,
          tenantId,
          providerId,
          canonicalMsg.id,
          canonicalMsg.attachments,
        );
      }

      // Only queue embeddings and emit events for new messages
      if (wasNew) {
        // Queue for embeddings (skip SPAM/TRASH - they're junk)
        if (!isJunkFolder(result.folder)) {
          await this.getEmbeddingQueue().enqueue({
            emailId: result.id,
            tenantId,
            subject: result.subject,
            snippet: result.snippet || '',
          });
        }

        // Emit realtime event
        this.realtimeEvents.emitEmailNew(tenantId, {
          emailId: result.id,
          providerId,
          folder: result.folder,
          reason: 'message-processed',
        });

        // TRIGGER FOLLOW-UP ANALYSIS (only for recent emails to avoid storm on full sync)
        // FIX (2025-01-05): Added recency check - old emails during full sync don't need AI analysis
        if (userId && !isJunkFolder(result.folder) && isRecentEmailHelper(result.receivedAt)) {
          this.followUpService
            .analyzeAndCreateFollowUp(
              tenantId,
              userId,
              result.id,
              result.bodyText || '',
              result.subject,
            )
            .catch((err) => {
              // FIX CRIT-3 (2025-01-05): Proper error handling for AI feature failures
              // Changed from warn to error for monitoring visibility
              this.logger.error(
                `Follow-up analysis failed for email ${result.id} in ${result.folder}: ${err.message}`,
                err.stack,
              );
              // Note: Fire-and-forget is intentional - AI features shouldn't block sync
              // TODO: Consider adding retry queue for failed AI analyses
            });
        }
      }

      return { wasNew, conflictDetected: userModifiedRecently ?? false };
    };

    // RC-9 FIX: Execute with MANDATORY distributed lock
    // Lock is now required to prevent race conditions in multi-worker environments
    if (!this.redisLock) {
      // Log error and execute without lock as fallback (should not happen in production)
      this.logger.error(
        `RC-9: RedisLockService not available for email upsert. This may cause race conditions.`,
      );
      return executeUpsert();
    }

    try {
      return await this.redisLock.withLock(lockKey, lockTtlMs, executeUpsert);
    } catch (lockError) {
      // Lock acquisition failed - log warning and execute without lock
      // This is graceful degradation for transient Redis issues
      this.logger.warn(
        `RC-9: Lock acquisition failed for ${lockKey}, proceeding with caution: ${lockError instanceof Error ? lockError.message : String(lockError)
        }`,
      );
      return executeUpsert();
    }
  }

  /**
   * Process a batch of messages using transaction for DB operations
   * Performance fix (N1-4/N1-5): Reduces DB round-trips by batching upserts
   *
   * Phase 4 Deduplication: Removes ~90 lines of duplicate code per provider
   *
   * @param driver - The connected email driver
   * @param messages - Array of messages in canonical format
   * @param providerId - Provider ID
   * @param tenantId - Tenant ID
   * @returns Object with processed count and new message count
   */
  protected async processMessagesBatch(
    driver: IEmailDriver,
    messages: CanonicalMessage[],
    providerId: string,
    tenantId: string,
    userId?: string,
  ): Promise<{ processed: number; newCount: number }> {
    if (messages.length === 0) {
      return { processed: 0, newCount: 0 };
    }

    // BUG FIX B-5: Query existing emails to check userModifiedAt
    // This prevents overwriting user's flag changes during full sync
    const externalIds = messages.map((m) => m.id);
    const existingEmails = await this.prisma.email.findMany({
      where: {
        providerId,
        externalId: { in: externalIds },
      },
      select: {
        externalId: true,
        folder: true,
        userModifiedAt: true,
      },
    });

    // Build lookup map: `externalId:folder` -> userModifiedAt
    const userModifiedMap = new Map<string, Date | null>();
    for (const email of existingEmails) {
      userModifiedMap.set(`${email.externalId}:${email.folder}`, email.userModifiedAt);
    }

    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;

    // Prepare all upsert operations
    const upsertOps = messages.map((msg) => {
      // BUG FIX B-5: Check if user modified this email recently
      const userModifiedAt = userModifiedMap.get(`${msg.id}:${msg.folder}`);
      const userModifiedRecently = userModifiedAt && (now - userModifiedAt.getTime()) < FIVE_MINUTES;

      // Base update data (content fields only)
      const baseUpdateData = {
        subject: msg.subject || '(No Subject)',
        from: msg.from.email,
        to: msg.to?.map((r) => r.email) || [],
        cc: msg.cc?.map((r) => r.email) || [],
        bcc: msg.bcc?.map((r) => r.email) || [],
        bodyText: msg.bodyText || '',
        bodyHtml: msg.bodyHtml || '',
        snippet: msg.snippet || '',
        receivedAt: msg.receivedAt,
      };

      // Only include state fields if user didn't modify recently
      const updateData = userModifiedRecently
        ? baseUpdateData
        : {
          ...baseUpdateData,
          isRead: msg.isRead ?? false,
          isStarred: msg.isStarred ?? false,
          isFlagged: msg.isFlagged ?? false,
          labels: msg.labels || [],
        };

      return this.prisma.email.upsert({
        where: {
          providerId_externalId_folder: {
            providerId,
            externalId: msg.id,
            folder: msg.folder,
          },
        },
        update: { ...updateData, folder: msg.folder },
        create: {
          tenantId,
          providerId,
          externalId: msg.id,
          ...baseUpdateData,
          isRead: msg.isRead ?? false,
          isStarred: msg.isStarred ?? false,
          isFlagged: msg.isFlagged ?? false,
          labels: msg.labels || [],
          sentAt: msg.sentAt || msg.receivedAt,
          isDeleted: false,
          folder: msg.folder,
          threadId: msg.threadId || null,
        },
      });
    });

    // HIGH-1 FIX (2025-01-05): Query existing emails BEFORE upsert for reliable wasNew detection
    // The timestamp comparison (createdAt vs updatedAt) is unreliable due to:
    // 1. Database clock skew
    // 2. Race conditions between createdAt and updatedAt
    // 3. Arbitrary 1-second threshold may not work in all environments
    const existingEmailIds = new Set(
      (await this.prisma.email.findMany({
        where: {
          providerId,
          externalId: { in: messages.map(m => m.id) },
        },
        select: { externalId: true },
      })).map(e => e.externalId)
    );

    // Execute all upserts in a single transaction with P2002/P2034 retry logic
    // Per Prisma best practices: handle P2002 (unique constraint) and P2034 (deadlock) and retry
    // See: https://github.com/prisma/prisma/issues/3242
    // P2034: Transaction failed due to a write conflict or deadlock
    const MAX_RETRIES = 3;
    let retryCount = 0;
    let results: Awaited<ReturnType<typeof this.prisma.email.upsert>>[];

    while (true) {
      try {
        results = await this.prisma.$transaction(upsertOps);
        break; // Success - exit retry loop
      } catch (error: unknown) {
        const isPrismaError = error && typeof error === 'object' && 'code' in error;
        const errorCode = isPrismaError ? (error as { code: string }).code : null;
        const isRetryable = errorCode === 'P2002' || errorCode === 'P2034';

        if (isRetryable && retryCount < MAX_RETRIES) {
          retryCount++;
          const errorType = errorCode === 'P2002' ? 'unique constraint' : 'deadlock/write conflict';
          this.logger.warn(
            `${errorCode} ${errorType} error on batch upsert (attempt ${retryCount}/${MAX_RETRIES}). ` +
            `Retrying in ${100 * retryCount}ms...`,
          );
          // Exponential backoff: 100ms, 200ms, 300ms
          await new Promise((resolve) => setTimeout(resolve, 100 * retryCount));
          continue;
        }

        // Non-retryable error or max retries exceeded
        this.logger.error(
          `Batch upsert failed after ${retryCount} retries: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    }

    // Track new messages and process post-upsert operations
    let newCount = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const msg = messages[i];
      // HIGH-1 FIX: Use pre-query Set instead of unreliable timestamp comparison
      const wasNew = !existingEmailIds.has(msg.id);

      if (wasNew) {
        newCount++;

        // Queue for embeddings (skip SPAM/TRASH)
        if (!isJunkFolder(result.folder)) {
          await this.getEmbeddingQueue().enqueue({
            emailId: result.id,
            tenantId,
            subject: result.subject,
            snippet: result.snippet || '',
          });
        }

        // Emit realtime event
        this.realtimeEvents.emitEmailNew(tenantId, {
          emailId: result.id,
          providerId,
          folder: result.folder,
          reason: 'message-processed',
        });

        // TRIGGER FOLLOW-UP ANALYSIS (only for recent emails to avoid storm on full sync)
        // FIX (2025-01-05): Added recency check - old emails during full sync don't need AI analysis
        if (userId && !isJunkFolder(result.folder) && isRecentEmailHelper(result.receivedAt)) {
          this.followUpService
            .analyzeAndCreateFollowUp(
              tenantId,
              userId,
              result.id,
              result.bodyText || '',
              result.subject,
            )
            .catch((err) => {
              // FIX CRIT-3 (2025-01-05): Proper error handling for AI feature failures
              // Changed from warn to error for monitoring visibility
              this.logger.error(
                `Follow-up analysis failed for email ${result.id} in ${result.folder}: ${err.message}`,
                err.stack,
              );
              // Note: Fire-and-forget is intentional - AI features shouldn't block sync
              // TODO: Consider adding retry queue for failed AI analyses
            });
        }


        // TRIGGER WRITING STYLE LEARNING
        if (userId && result.folder === 'SENT' && (result.bodyText && result.bodyText.length > 50)) {
          this.writingStyleService
            .learnFromEmail(tenantId, userId, result.bodyText)
            .catch((err) =>
              this.logger.warn(`Writing style learning failed for ${result.id}: ${err.message}`),
            );
        }
      }

      // Process attachments (must be sequential - involves external API calls)
      if (msg.hasAttachments && msg.attachments.length > 0) {
        await this.processAttachmentsForMessage(
          driver,
          result.id,
          tenantId,
          providerId,
          msg.id,
          msg.attachments,
        );
      }
    }

    return { processed: results.length, newCount };
  }

  // ============================================
  // Folder Name Normalization
  // ============================================

  // NOTE: normalizeFolderName DELETED - use folderNameToCanonical from canonical.types.ts
  // Consolidated in Phase 3 (2025-01-05) - canonical version has 75+ folder names in 5 languages




  // NOTE: isNotFoundError, isRateLimitError, isServerError DELETED
  // Use imports from common/utils/error.utils if needed
  // Consolidated in Phase 4 (2025-01-05) - these were DEAD CODE (never called)

  /**
   * Truncate text to a maximum length
   *
   * @param text - The text to truncate
   * @param maxLength - Maximum length (including ellipsis)
   * @returns Truncated text with '...' if truncated
   */
  protected truncateText(text: string | undefined, maxLength: number): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }





  /**
   * Sleep for a specified duration (useful for retry delays)
   *
   * @param ms - Milliseconds to sleep
   */
  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract error message from various error formats
   *
   * @param error - The error object
   * @returns Human-readable error message
   */
  protected extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    const errorObj = error as any;
    return (
      errorObj?.message ??
      errorObj?.error?.message ??
      errorObj?.response?.data?.error?.message ??
      'Unknown error'
    );
  }
}
