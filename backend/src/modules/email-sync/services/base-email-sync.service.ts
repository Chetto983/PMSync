import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
import { decode } from 'he';
import { PrismaService } from '../../../prisma/prisma.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { SyncJobData, SyncJobResult } from '../interfaces/sync-job.interface';
import { IEmailDriver } from '../drivers/interfaces/email-driver.interface';
import { CanonicalMessage, AttachmentMeta } from '../drivers/interfaces/canonical.types';
import { EmailEmbeddingQueueService } from '../../ai/services/email-embedding.queue';
import { isJunkFolder } from '../../email/email.helpers';
import { RedisLockService } from '../../../common/services/redis-lock.service';

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

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly realtimeEvents: RealtimeEventsService,
    protected readonly config: ConfigService,
  ) {}

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
    this.batchSize = this.config.get<number>('SYNC_BATCH_SIZE', 100);

    // Retry configuration
    this.retryMaxAttempts = this.config.get<number>('RETRY_MAX_ATTEMPTS', 3);
    this.retry429DelayMs = this.config.get<number>('RETRY_429_DELAY_MS', 2000);
    this.retry5xxDelayMs = this.config.get<number>('RETRY_5XX_DELAY_MS', 2000);

    // Full sync limits
    this.fullSyncMaxMessages = this.config.get<number>('FULL_SYNC_MAX_MESSAGES', 200);
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
      const driver = await this.createDriver(driverType, credentials);

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
          const result = await this.syncIncrementalWithDriver(
            driver,
            lastSyncToken,
            providerId,
            tenantId,
          );
          messagesProcessed = result.messagesProcessed;
          newMessages = result.newMessages;
          newSyncToken = result.newSyncToken;
        } else {
          // Full sync using driver
          const result = await this.syncFullWithDriver(
            driver,
            providerId,
            tenantId,
          );
          messagesProcessed = result.messagesProcessed;
          newMessages = result.newMessages;
          newSyncToken = result.syncToken;
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
   */
  protected async syncFullWithDriver(
    driver: IEmailDriver,
    providerId: string,
    tenantId: string,
  ): Promise<{
    messagesProcessed: number;
    newMessages: number;
    syncToken: string;
  }> {
    this.logger.debug(`Full sync with driver - fetching latest ${this.fullSyncMaxMessages} messages`);

    let messagesProcessed = 0;
    let newMessages = 0;
    let pageToken: string | undefined;
    let fetchedCount = 0;

    // List messages from INBOX
    do {
      const result = await driver.listMessages({
        folder: 'INBOX',
        pageSize: Math.min(this.batchSize, this.fullSyncMaxMessages - fetchedCount),
        pageToken,
        ...this.getListMessagesOptions(),
      });

      // Performance fix (N1-4/N1-5): Process messages in batch using transaction
      const batchResult = await this.processMessagesBatch(
        driver,
        result.messages,
        providerId,
        tenantId,
      );
      messagesProcessed += batchResult.processed;
      newMessages += batchResult.newCount;

      fetchedCount += result.messages.length;
      pageToken = result.nextPageToken;

      // Stop if we've reached the limit or no more pages
      if (fetchedCount >= this.fullSyncMaxMessages || !pageToken) {
        break;
      }
    } while (pageToken);

    // Get current sync token (method may not be available on all drivers)
    if (!driver.getInitialSyncToken) {
      throw new Error('Driver does not support getInitialSyncToken - cannot complete full sync');
    }
    const syncToken = await driver.getInitialSyncToken();

    this.logger.debug(
      `Full sync complete: ${messagesProcessed} processed, ${newMessages} new, syncToken: ${syncToken}`,
    );

    return {
      messagesProcessed,
      newMessages,
      syncToken,
    };
  }

  /**
   * Incremental sync using driver - shared implementation
   * DC-3 consolidation: Removes ~70 lines × 3 providers = ~210 lines
   */
  protected async syncIncrementalWithDriver(
    driver: IEmailDriver,
    lastSyncToken: string,
    providerId: string,
    tenantId: string,
  ): Promise<{
    messagesProcessed: number;
    newMessages: number;
    newSyncToken: string;
  }> {
    this.logger.debug(`Incremental sync with driver from token: ${lastSyncToken.substring(0, 20)}...`);

    let messagesProcessed = 0;
    let newMessages = 0;
    const processedIds = new Set<string>();

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
      };
    }

    this.logger.debug(`Found ${changesResult.changes.length} changes`);

    // Process each change
    for (const change of changesResult.changes) {
      // Skip if already processed (deduplication)
      if (processedIds.has(change.messageId)) {
        continue;
      }
      processedIds.add(change.messageId);

      try {
        if (change.type === 'deleted') {
          // Handle deletion
          await this.handleMessageDeletion(change.messageId, providerId, tenantId);
          messagesProcessed++;
        } else if (change.type === 'added' || change.type === 'modified') {
          // Fetch and upsert the message
          const message = await driver.getMessage(change.messageId);
          if (message) {
            const upsertResult = await this.upsertMessageFromDriver(driver, message, providerId, tenantId);
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
        // Update existing record with version increment
        result = await this.prisma.email.update({
          where: { id: existing.id },
          data: {
            ...updateData,
            version: { increment: 1 },
          },
        });
        wasNew = false;

        if (userModifiedRecently) {
          this.logger.debug(
            `Preserved user modifications for email ${existing.id} (modified ${Math.round((Date.now() - existing.userModifiedAt!.getTime()) / 1000)}s ago)`,
          );
        }
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
      }

      return { wasNew, conflictDetected: userModifiedRecently ?? false };
    };

    // RC-1 FIX: Execute with distributed lock if available
    if (this.redisLock) {
      try {
        return await this.redisLock.withLock(lockKey, lockTtlMs, executeUpsert);
      } catch (lockError) {
        // If lock acquisition fails, log warning and execute without lock
        // This is a graceful degradation - better to process than to fail
        this.logger.warn(
          `Lock acquisition failed for ${lockKey}, proceeding without lock: ${
            lockError instanceof Error ? lockError.message : String(lockError)
          }`,
        );
        return executeUpsert();
      }
    }

    // No lock service available - execute without lock
    return executeUpsert();
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

    // Execute all upserts in a single transaction
    const results = await this.prisma.$transaction(upsertOps);

    // Track new messages and process post-upsert operations
    let newCount = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const msg = messages[i];
      const wasNew = Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000;

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

  /**
   * Normalize folder name to standard mailbox folders
   * Supports internationalization (English, Italian, German)
   * Returns UPPERCASE folder names to match database conventions
   *
   * @param folderName - The raw folder name from the provider
   * @returns Normalized folder name in UPPERCASE (e.g., 'INBOX', 'SENT', 'TRASH')
   */
  protected normalizeFolderName(folderName: string): string {
    const lowerName = folderName.toLowerCase().trim();

    // INBOX variations (English, Italian, German)
    if (lowerName === 'inbox' || lowerName === 'posta in arrivo' || lowerName === 'posteingang') {
      return 'INBOX';
    }

    // SENT variations
    if (
      lowerName === 'sent items' ||
      lowerName === 'sentitems' ||
      lowerName === 'sent' ||
      lowerName === 'sent mail' ||
      lowerName === 'posta inviata' ||
      lowerName === 'inviata' ||
      lowerName === 'elementi inviati'
    ) {
      return 'SENT';
    }

    // TRASH/DELETED variations
    if (
      lowerName === 'deleted items' ||
      lowerName === 'deleteditems' ||
      lowerName === 'trash' ||
      lowerName === 'deleted' ||
      lowerName === 'posta eliminata' ||
      lowerName === 'cestino' ||
      lowerName === 'eliminata'
    ) {
      return 'TRASH';
    }

    // DRAFTS variations
    if (lowerName === 'drafts' || lowerName === 'bozze' || lowerName === 'draft') {
      return 'DRAFTS';
    }

    // SPAM/JUNK variations
    if (
      lowerName === 'junk email' ||
      lowerName === 'junk' ||
      lowerName === 'spam' ||
      lowerName === 'posta indesiderata' ||
      lowerName === 'post indiserata'
    ) {
      return 'SPAM';
    }

    // ARCHIVE variations
    if (
      lowerName === 'archive' ||
      lowerName === 'archivia' ||
      lowerName === 'archivio' ||
      lowerName === 'archived' ||
      lowerName === 'all mail'
    ) {
      return 'ARCHIVE';
    }

    // IMPORTANT/STARRED variations
    if (lowerName === 'important' || lowerName === 'starred') {
      return 'IMPORTANT';
    }

    // Return original name in uppercase if no match
    return folderName.toUpperCase();
  }

  /**
   * Determine if a folder is a system folder
   *
   * @param folderName - The folder name to check (will be normalized)
   * @returns True if the folder is a standard system folder
   */
  protected isSystemFolder(folderName: string): boolean {
    const systemFolders = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'ARCHIVE'];
    return systemFolders.includes(this.normalizeFolderName(folderName));
  }

  /**
   * Notify about mailbox changes via WebSocket/SSE
   *
   * @param tenantId - The tenant ID to notify
   * @param providerId - The provider ID (email account)
   * @param reason - The type of change that occurred
   * @param payload - Additional metadata about the change
   */
  protected notifyMailboxChange(
    tenantId: string,
    providerId: string,
    reason: 'message-processed' | 'message-deleted' | 'sync-complete',
    payload?: { emailId?: string; externalId?: string; folder?: string },
  ): void {
    try {
      switch (reason) {
        case 'message-processed':
          this.realtimeEvents.emitEmailNew(tenantId, {
            providerId,
            reason: 'message-processed',
            ...payload,
          });
          break;
        case 'message-deleted':
          this.realtimeEvents.emitEmailUpdate(tenantId, {
            providerId,
            reason: 'message-deleted',
            ...payload,
          });
          break;
        case 'sync-complete':
          this.realtimeEvents.emitSyncStatus(tenantId, {
            providerId,
            status: 'completed',
          });
          break;
      }
    } catch (error) {
      this.logger.warn(`Failed to notify mailbox change: ${this.extractErrorMessage(error)}`);
    }
  }

  /**
   * Calculate sync statistics from before/after counts
   *
   * @param before - Counts before sync (emails, folders)
   * @param after - Counts after sync (emails, folders)
   * @returns The number of new emails and folders added
   */
  protected calculateSyncStats(
    before: { emails: number; folders: number },
    after: { emails: number; folders: number },
  ): {
    newEmails: number;
    newFolders: number;
  } {
    return {
      newEmails: Math.max(0, after.emails - before.emails),
      newFolders: Math.max(0, after.folders - before.folders),
    };
  }

  /**
   * Check if an error is a "not found" error (404, resource not found, etc.)
   *
   * @param error - The error to check
   * @returns True if the error indicates a resource was not found
   */
  protected isNotFoundError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('not found') ||
        message.includes('404') ||
        message.includes('does not exist') ||
        message.includes('deleted')
      );
    }

    // Check for HTTP status codes in error object
    const errorObj = error as any;
    const status = errorObj?.response?.status ?? errorObj?.status ?? errorObj?.statusCode;
    if (status === 404 || status === 410) {
      return true;
    }

    return false;
  }

  /**
   * Check if an error is a rate limit error (429)
   *
   * @param error - The error to check
   * @returns True if the error indicates rate limiting
   */
  protected isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('rate limit') || message.includes('429')) {
        return true;
      }
    }

    const errorObj = error as any;
    const status = errorObj?.response?.status ?? errorObj?.status ?? errorObj?.statusCode;
    return status === 429;
  }

  /**
   * Check if an error is a server error (5xx)
   *
   * @param error - The error to check
   * @returns True if the error is a server error
   */
  protected isServerError(error: unknown): boolean {
    const errorObj = error as any;
    const status = errorObj?.response?.status ?? errorObj?.status ?? errorObj?.statusCode;
    return typeof status === 'number' && status >= 500 && status < 600;
  }

  /**
   * Extract plain text from HTML content
   * Uses cheerio for robust HTML parsing and 'he' for proper entity decoding
   *
   * @param html - The HTML content to convert
   * @returns Plain text with normalized whitespace
   */
  protected extractPlainText(html: string | undefined): string {
    if (!html) return '';

    try {
      // Load HTML into cheerio
      const $ = cheerio.load(html);

      // Remove script and style tags
      $('script, style').remove();

      // Extract text content
      let text = $.text();

      // Decode HTML entities
      text = decode(text);

      // Normalize whitespace
      text = text.replace(/\s+/g, ' ').trim();

      return text;
    } catch (error) {
      // Fallback to basic regex if cheerio fails
      this.logger.warn(
        `Failed to parse HTML with cheerio, using fallback: ${this.extractErrorMessage(error)}`,
      );

      let text = html.replace(/<[^>]*>/g, ' ');
      text = decode(text);
      text = text.replace(/\s+/g, ' ').trim();

      return text;
    }
  }

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
   * Validate email address format
   *
   * @param email - The email address to validate
   * @returns True if the email format is valid
   */
  protected validateEmailAddress(email: string): boolean {
    if (!email) return false;

    // RFC 5322 simplified regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Format a date to ISO 8601 string
   *
   * @param date - The date to format (Date object, timestamp, or ISO string)
   * @returns ISO 8601 formatted string
   */
  protected formatTimestamp(date: Date | number | string): string {
    if (date instanceof Date) {
      return date.toISOString();
    }

    if (typeof date === 'number') {
      return new Date(date).toISOString();
    }

    // Already a string, validate and return
    try {
      return new Date(date).toISOString();
    } catch {
      return new Date().toISOString();
    }
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
