import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SyncJobData, SyncJobResult } from '../../interfaces/sync-job.interface';
import { EmailEmbeddingQueueService } from '../../../ai/services/email-embedding.queue';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from '../../../../common/services/crypto.service';
import { BaseEmailSyncService } from '../base-email-sync.service';
import { EmailDriverFactory } from '../../drivers/driver.factory';
import { IMAPDriver } from '../../drivers/imap/imap.driver';
import { AttachmentMeta } from '../../drivers/interfaces/canonical.types';
import { IEmailDriver } from '../../drivers/interfaces/email-driver.interface';
import { ImapAttachmentHandler } from './imap-attachment-handler';

/**
 * ImapSyncService - Driver-based implementation
 *
 * This service uses the IMAPDriver abstraction for all IMAP operations.
 * Legacy direct ImapFlow code has been removed.
 *
 * IMAP Protocol Best Practices (2025):
 * - Use TLS encryption by default (port 993)
 * - CONDSTORE/QRESYNC for efficient incremental sync
 * - HIGHESTMODSEQ tracking for change detection
 * - Polling strategy (5-15 min intervals) for reliability
 * - Handle servers without CONDSTORE gracefully
 */
@Injectable()
export class ImapSyncService extends BaseEmailSyncService {
  protected readonly logger = new Logger(ImapSyncService.name);

  constructor(
    prisma: PrismaService,
    realtimeEvents: RealtimeEventsService,
    config: ConfigService,
    private emailEmbeddingQueue: EmailEmbeddingQueueService,
    private crypto: CryptoService,
    private driverFactory: EmailDriverFactory,
    private imapAttachmentHandler: ImapAttachmentHandler,
  ) {
    super(prisma, realtimeEvents, config);
  }

  onModuleInit() {
    super.onModuleInit(); // Load base configuration

    // IMAP-specific configuration overrides
    this.batchSize = this.config.get<number>('IMAP_BATCH_FETCH_SIZE', 100);
    this.fullSyncMaxMessages = this.config.get<number>('IMAP_FULL_MAX_MESSAGES', 500);
  }

  // ============================================
  // Abstract Method Implementations
  // ============================================

  /**
   * Provide the embedding queue service to the base class
   */
  protected getEmbeddingQueue(): EmailEmbeddingQueueService {
    return this.emailEmbeddingQueue;
  }

  /**
   * Process attachments for IMAP messages
   * Implements the abstract method from BaseEmailSyncService
   * Uses ImapAttachmentHandler for IMAP-specific handling
   */
  protected async processAttachmentsForMessage(
    driver: IEmailDriver,
    emailId: string,
    tenantId: string,
    providerId: string,
    externalMessageId: string,
    attachments: AttachmentMeta[],
  ): Promise<void> {
    // Cast to IMAPDriver and delegate to IMAP-specific handler
    const imapDriver = driver as IMAPDriver;
    await this.imapAttachmentHandler.processImapAttachments(
      imapDriver,
      emailId,
      externalMessageId,
      attachments,
      tenantId,
      providerId,
    );
  }

  // ============================================
  // Provider Sync Implementation
  // ============================================

  async syncProvider(jobData: SyncJobData): Promise<SyncJobResult> {
    const { providerId, email, syncType, tenantId } = jobData;

    this.logger.log(`Starting ${syncType} IMAP sync for ${email} (driver mode)`);

    try {
      // Get provider config
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: providerId },
      });

      if (!provider || !provider.imapPassword) {
        throw new Error('Provider not found or missing IMAP credentials');
      }

      // Decrypt IMAP password
      const imapPassword = this.crypto.decrypt(
        provider.imapPassword,
        provider.imapEncryptionIv!,
      );

      // Create connected driver
      const driver = await this.driverFactory.createConnectedDriver('imap', {
        type: 'basic',
        username: provider.imapUsername!,
        password: imapPassword,
        imapHost: provider.imapHost!,
        imapPort: provider.imapPort || 993,
        imapTls: provider.imapUseTls ?? true,
        smtpHost: provider.smtpHost || undefined,
        smtpPort: provider.smtpPort || undefined,
        smtpTls: provider.smtpUseTls ?? true,
      }) as IMAPDriver;

      if (!driver.isConnected()) {
        throw new Error('Driver failed to connect');
      }

      try {
        // Phase 5: Log server capabilities for monitoring
        const caps = driver.getCapabilities();
        if (!caps.condstore) {
          this.logger.warn(
            `IMAP server ${provider.imapHost} does not support CONDSTORE - using less efficient date-based sync`,
          );
        }

        // Get last sync token from metadata
        const metadata = (provider.metadata as any) || {};
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
      this.logger.error(`IMAP sync failed for ${email}: ${errorMessage}`);
      if (errorStack) {
        this.logger.error(`Stack trace: ${errorStack}`);
      }
      throw error;
    }
  }

  /**
   * Full sync using IMAPDriver
   */
  private async syncFullWithDriver(
    driver: IMAPDriver,
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
        includeBody: true,
      });

      // Performance fix (N1-5): Process messages in batch using transaction
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

    // Get current sync token (HIGHESTMODSEQ)
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
   * Incremental sync using IMAPDriver
   */
  private async syncIncrementalWithDriver(
    driver: IMAPDriver,
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

    // Get changes since last sync (CONDSTORE/QRESYNC)
    const changesResult = await driver.getChangesSince(lastSyncToken);

    if (changesResult.changes.length === 0) {
      this.logger.debug('No changes detected');
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

  // processMessagesBatch, upsertMessageFromDriver, and handleMessageDeletion
  // are now inherited from BaseEmailSyncService
}
