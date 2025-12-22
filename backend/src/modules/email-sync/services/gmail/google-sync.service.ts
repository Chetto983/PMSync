import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SyncJobData, SyncJobResult } from '../../interfaces/sync-job.interface';
import { EmailEmbeddingQueueService } from '../../../ai/services/email-embedding.queue';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { ConfigService } from '@nestjs/config';
import { ProviderTokenService } from '../provider-token.service';
import { BaseEmailSyncService } from '../base-email-sync.service';
import { EmailDriverFactory } from '../../drivers/driver.factory';
import { GoogleDriver } from '../../drivers/google/google.driver';
import { AttachmentMeta } from '../../drivers/interfaces/canonical.types';
import { IEmailDriver } from '../../drivers/interfaces/email-driver.interface';
import { AttachmentStorageService } from '../../../email/services/attachment.storage';

/**
 * GoogleSyncService - Driver-based implementation
 *
 * This service uses the GoogleDriver abstraction for all Gmail operations.
 * Legacy direct Gmail API code has been removed.
 */
@Injectable()
export class GoogleSyncService extends BaseEmailSyncService {
  protected readonly logger = new Logger(GoogleSyncService.name);

  constructor(
    prisma: PrismaService,
    realtimeEvents: RealtimeEventsService,
    config: ConfigService,
    private emailEmbeddingQueue: EmailEmbeddingQueueService,
    private providerTokenService: ProviderTokenService,
    private driverFactory: EmailDriverFactory,
    private attachmentStorage: AttachmentStorageService,
  ) {
    super(prisma, realtimeEvents, config);
  }

  onModuleInit() {
    super.onModuleInit(); // Load base configuration

    // Gmail-specific configuration overrides
    this.batchSize = this.config.get<number>('GMAIL_BATCH_GET_SIZE', 100);
    this.fullSyncMaxMessages = this.config.get<number>('GMAIL_FULL_MAX_MESSAGES', 200);
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
   * Process attachments for Gmail messages
   * Implements the abstract method from BaseEmailSyncService
   */
  protected async processAttachmentsForMessage(
    driver: IEmailDriver,
    emailId: string,
    tenantId: string,
    providerId: string,
    externalMessageId: string,
    attachments: AttachmentMeta[],
  ): Promise<void> {
    // Cast to GoogleDriver for attachment fetching
    const googleDriver = driver as GoogleDriver;
    await this.processAttachments(googleDriver, emailId, tenantId, providerId, externalMessageId, attachments);
  }

  // ============================================
  // Provider Sync Implementation
  // ============================================

  async syncProvider(jobData: SyncJobData): Promise<SyncJobResult> {
    const { providerId, email, syncType, tenantId } = jobData;

    this.logger.log(`Starting ${syncType} Gmail sync for ${email} (driver mode)`);

    try {
      // Get provider and access token
      const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
        providerId,
      );

      // Create connected driver
      const driver = await this.driverFactory.createConnectedDriver('google', {
        type: 'oauth2',
        accessToken,
        emailHint: provider.email,
      }) as GoogleDriver;

      if (!driver.isConnected()) {
        throw new Error('Driver failed to connect');
      }

      try {
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
      this.logger.error(`Gmail sync failed for ${email}: ${errorMessage}`);
      if (errorStack) {
        this.logger.error(`Stack trace: ${errorStack}`);
      }
      throw error;
    }
  }

  /**
   * Full sync using GoogleDriver
   */
  private async syncFullWithDriver(
    driver: GoogleDriver,
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
        pageSize: Math.min(100, this.fullSyncMaxMessages - fetchedCount),
        pageToken,
      });

      // Performance fix (N1-4): Process messages in batch using transaction
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

    // Get current sync token
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
   * Incremental sync using GoogleDriver
   */
  private async syncIncrementalWithDriver(
    driver: GoogleDriver,
    lastSyncToken: string,
    providerId: string,
    tenantId: string,
  ): Promise<{
    messagesProcessed: number;
    newMessages: number;
    newSyncToken: string;
  }> {
    this.logger.debug(`Incremental sync with driver from token: ${lastSyncToken}`);

    let messagesProcessed = 0;
    let newMessages = 0;
    const processedIds = new Set<string>();

    // Get changes since last sync
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
      `Incremental sync complete: ${messagesProcessed} processed, ${newMessages} new, newToken: ${changesResult.newSyncToken}`,
    );

    return {
      messagesProcessed,
      newMessages,
      newSyncToken: changesResult.newSyncToken,
    };
  }

  // ============================================
  // Provider-Specific Attachment Processing
  // ============================================

  /**
   * Process attachments: download for embeddings or store metadata for on-demand
   * Uses strategy from AttachmentStorageService to determine handling
   */
  private async processAttachments(
    driver: GoogleDriver,
    emailId: string,
    tenantId: string,
    providerId: string,
    externalMessageId: string,
    attachments: AttachmentMeta[],
  ): Promise<void> {
    try {
      const attachmentRecords: Array<{
        emailId: string;
        filename: string;
        mimeType: string;
        size: number;
        contentId: string | null;
        storageType: string;
        storagePath: string | null;
        contentHash: string | null;
        isInline: boolean;
      }> = [];

      for (const att of attachments) {
        const metadata = {
          filename: att.filename,
          mimeType: att.mimeType,
          size: att.size,
          isInline: att.isInline,
          contentId: att.contentId,
          externalId: att.id,
          externalMessageId,
        };

        // Determine processing strategy
        const strategy = this.attachmentStorage.getProcessingStrategy(metadata);

        if (strategy === 'skip') {
          // Skip inline images (they're in the HTML body)
          this.logger.debug(`Skipping inline attachment ${att.filename}`);
          continue;
        }

        if (strategy === 'embeddings') {
          // Download and store for text extraction + embeddings
          try {
            const attachmentData = await driver.getAttachment(externalMessageId, att.id);
            const content = Buffer.from(attachmentData.content, 'base64');

            const uploaded = await this.attachmentStorage.uploadAttachment(
              tenantId,
              providerId,
              {
                filename: att.filename,
                content,
                contentType: att.mimeType,
              },
              emailId,
            );

            attachmentRecords.push({
              emailId,
              filename: uploaded.filename,
              mimeType: uploaded.mimeType,
              size: uploaded.size,
              contentId: att.contentId || null,
              storageType: uploaded.storageType,
              storagePath: uploaded.storagePath,
              contentHash: uploaded.contentHash,
              isInline: uploaded.isInline,
            });

            this.logger.debug(
              `Downloaded and stored ${att.filename} for embeddings (${(att.size / 1024).toFixed(1)}KB)`,
            );
          } catch (downloadError) {
            // Fall back to metadata-only if download fails
            this.logger.warn(
              `Failed to download ${att.filename}, storing metadata only: ${downloadError instanceof Error ? downloadError.message : String(downloadError)}`,
            );
            const stored = this.attachmentStorage.storeAttachmentMetadata(providerId, metadata);
            attachmentRecords.push({
              emailId,
              filename: stored.filename,
              mimeType: stored.mimeType,
              size: stored.size,
              contentId: stored.contentId || null,
              storageType: stored.storageType,
              storagePath: stored.storagePath || null,
              contentHash: null,
              isInline: stored.isInline,
            });
          }
        } else {
          // metadata-only: store reference for on-demand download
          const stored = this.attachmentStorage.storeAttachmentMetadata(providerId, metadata);
          attachmentRecords.push({
            emailId,
            filename: stored.filename,
            mimeType: stored.mimeType,
            size: stored.size,
            contentId: stored.contentId || null,
            storageType: stored.storageType,
            storagePath: stored.storagePath || null,
            contentHash: null,
            isInline: stored.isInline,
          });
        }
      }

      // Persist attachment records atomically
      if (attachmentRecords.length > 0) {
        await this.prisma.$transaction(async (tx) => {
          await tx.emailAttachment.deleteMany({ where: { emailId } });
          await tx.emailAttachment.createMany({ data: attachmentRecords });
        });

        this.logger.debug(
          `Persisted ${attachmentRecords.length} attachment records for email ${emailId}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to process attachments for email ${emailId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Don't fail the sync for attachment errors
    }
  }

  // handleMessageDeletion is now inherited from BaseEmailSyncService
}
