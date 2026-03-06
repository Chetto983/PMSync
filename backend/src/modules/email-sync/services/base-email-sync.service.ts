import { Logger, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { SyncJobData, SyncJobResult } from '../interfaces/sync-job.interface';
import { IEmailDriver } from '../drivers/interfaces/email-driver.interface';
import { CanonicalMessage, AttachmentMeta } from '../drivers/interfaces/canonical.types';
// Phase 45-03: EmailEmbeddingQueueService removed -- embedding enqueue via domain event
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { SyncMessageProcessorService } from './sync-message-processor.service';
import {
  SyncOrchestrationService,
  FullSyncConfig,
  OrchestrationContext,
  IncrementalHookResult,
} from './sync-orchestration.service';
import { SyncTokenService } from './sync-token.service';
import { MessageProcessorContext } from '../interfaces/sync-context.interface';
import { EmailSyncedEvent } from '../../../common/events/email.events';

/**
 * Abstract base class for email sync services (Google, Microsoft, IMAP)
 * Provides common functionality and enforces implementation of provider-specific methods
 *
 * Phase 6 Refactor: Now delegates to extracted services:
 * - SyncOrchestrationService: Full/incremental sync orchestration
 * - SyncMessageProcessorService: Message upsert, batch, deletion
 * - SyncTokenService: OAuth token lifecycle management
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

  // Phase 32: EventEmitter2 for domain events (scaffolding -- set via setter to avoid breaking child constructors)
  protected eventEmitter: EventEmitter2 | null = null;

  // CRIT-3 FIX: Token refresh threshold (refresh if less than 2 min remaining)
  protected readonly TOKEN_REFRESH_THRESHOLD_MS = 2 * 60 * 1000;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly realtimeEvents: RealtimeEventsService,
    protected readonly config: ConfigService,
    // Phase 6: Extracted services
    protected readonly syncOrchestration: SyncOrchestrationService,
    protected readonly messageProcessor: SyncMessageProcessorService,
    protected readonly tokenService: SyncTokenService,
  ) {}

  /**
   * Set the Redis lock service (injected by child classes)
   * This is optional - if not set, locking is skipped
   */
  setRedisLockService(redisLock: RedisLockService): void {
    this.redisLock = redisLock;
    // Also set on message processor
    this.messageProcessor.setRedisLockService(redisLock);
  }

  /**
   * Phase 32: Set EventEmitter2 for domain events (injected by child classes)
   * Scaffolding -- emits EmailSyncedEvent after successful sync
   */
  setEventEmitter(eventEmitter: EventEmitter2): void {
    this.eventEmitter = eventEmitter;
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
      // P0-5 FIX: Pass tenantId for tenant isolation enforcement
      const { provider, credentials, driverType } = await this.getDriverCredentials(providerId, tenantId);

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
        const metadata = provider.metadata || {};
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

            const folderMap = new Map(folderCounts.map((f) => [f.folder, f._count]));
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

        // Phase 32: Emit EmailSyncedEvent (scaffolding -- no consumer yet, future modules can subscribe)
        if (this.eventEmitter && messagesProcessed > 0) {
          try {
            this.eventEmitter.emit(
              EmailSyncedEvent.eventName,
              new EmailSyncedEvent(tenantId, userId || '', providerId, providerId, new Date()),
            );
          } catch (err) {
            this.logger.error(`Failed to emit EmailSyncedEvent: ${err}`);
          }
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
  // P0-5 FIX: Added optional tenantId for tenant isolation enforcement
  protected abstract getDriverCredentials(providerId: string, tenantId?: string): Promise<{
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
  ): IncrementalHookResult {
    // Default: process all changes
    if (changesResult.changes.length === 0) {
      return { skipProcessing: true, logMessage: 'No changes detected' };
    }
    return { skipProcessing: false };
  }

  // Phase 45-03: getEmbeddingQueue() removed -- embedding enqueue via domain event (email.indexed)

  /**
   * Process attachments for a message - must be implemented by each provider
   * This handles provider-specific attachment download and storage logic
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
  // Delegated Methods (Phase 6 Extraction)
  // ============================================

  /**
   * Build context for message processor operations
   */
  private buildMessageProcessorContext(
    tenantId: string,
    providerId: string,
    userId?: string,
  ): MessageProcessorContext {
    return {
      tenantId,
      providerId,
      userId,
      processAttachments: (driver, emailId, tid, pid, externalMessageId, attachments) =>
        this.processAttachmentsForMessage(driver, emailId, tid, pid, externalMessageId, attachments),
    };
  }

  /**
   * Full sync using driver - delegates to SyncOrchestrationService
   * FOLDER-FIX: Syncs ALL important folders, not just INBOX
   * DEDUP-FIX: Cross-folder deduplication
   * CRIT-3 FIX: Mid-sync token refresh
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
    const config: FullSyncConfig = {
      fullSyncMaxMessages: this.fullSyncMaxMessages,
      batchSize: this.batchSize,
      getListMessagesOptions: () => this.getListMessagesOptions(),
    };

    const context: OrchestrationContext = {
      providerId,
      tenantId,
      tokenExpiresAt: initialTokenExpiresAt,
      userId,
      getDriverCredentials: (pid) => this.getDriverCredentials(pid),
      createDriver: (type, creds) => this.createDriver(type, creds),
      messageProcessorContext: this.buildMessageProcessorContext(tenantId, providerId, userId),
    };

    return this.syncOrchestration.executeFullSync(initialDriver, config, context);
  }

  /**
   * Incremental sync using driver - delegates to SyncOrchestrationService
   * CRIT-3 FIX: Mid-sync token refresh
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
    const context: OrchestrationContext = {
      providerId,
      tenantId,
      tokenExpiresAt: initialTokenExpiresAt,
      userId,
      getDriverCredentials: (pid) => this.getDriverCredentials(pid),
      createDriver: (type, creds) => this.createDriver(type, creds),
      messageProcessorContext: this.buildMessageProcessorContext(tenantId, providerId, userId),
    };

    return this.syncOrchestration.executeIncrementalSync(
      initialDriver,
      lastSyncToken,
      context,
      (changesResult, token) => this.onIncrementalChanges(changesResult, token),
    );
  }

  /**
   * Upsert a message - delegates to SyncMessageProcessorService
   */
  protected async upsertMessageFromDriver(
    driver: IEmailDriver,
    canonicalMsg: CanonicalMessage,
    providerId: string,
    tenantId: string,
    userId?: string,
  ): Promise<{ wasNew: boolean; conflictDetected?: boolean }> {
    const context = this.buildMessageProcessorContext(tenantId, providerId, userId);
    return this.messageProcessor.upsertMessage(driver, canonicalMsg, providerId, tenantId, context);
  }

  /**
   * Process batch of messages - delegates to SyncMessageProcessorService
   */
  protected async processMessagesBatch(
    driver: IEmailDriver,
    messages: CanonicalMessage[],
    providerId: string,
    tenantId: string,
    userId?: string,
  ): Promise<{ processed: number; newCount: number }> {
    const context = this.buildMessageProcessorContext(tenantId, providerId, userId);
    return this.messageProcessor.processBatch(driver, messages, providerId, tenantId, context);
  }

  /**
   * Handle message deletion - delegates to SyncMessageProcessorService
   */
  protected async handleMessageDeletion(
    messageId: string,
    providerId: string,
    tenantId: string,
  ): Promise<{ needsReconciliation: boolean; folder?: string }> {
    return this.messageProcessor.handleDeletion(messageId, providerId, tenantId);
  }

  /**
   * Check if token is expiring soon - delegates to SyncTokenService
   */
  protected isTokenExpiringSoon(tokenExpiresAt: Date | null | undefined): boolean {
    return this.tokenService.isTokenExpiringSoon(tokenExpiresAt);
  }

  /**
   * Refresh driver if token expiring - delegates to SyncTokenService
   */
  protected async refreshDriverIfNeeded(
    currentDriver: IEmailDriver,
    providerId: string,
    tokenExpiresAt: Date | null | undefined,
  ): Promise<{ driver: IEmailDriver; tokenExpiresAt: Date | null | undefined }> {
    return this.tokenService.refreshDriverIfNeeded(
      currentDriver,
      providerId,
      tokenExpiresAt,
      (pid) => this.getDriverCredentials(pid),
      (type, creds) => this.createDriver(type, creds),
    );
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Truncate text to a maximum length
   */
  protected truncateText(text: string | undefined, maxLength: number): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Sleep for a specified duration (useful for retry delays)
   */
  protected async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Extract error message from various error formats
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
