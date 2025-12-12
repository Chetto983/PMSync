import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { SyncJobData, SyncJobResult } from '../../interfaces/sync-job.interface';
import { EmailEmbeddingQueueService } from '../../../ai/services/email-embedding.queue';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { ConfigService } from '@nestjs/config';
import { ProviderTokenService } from '../provider-token.service';
import { BaseEmailSyncService } from '../base-email-sync.service';
import { EmailDriverFactory } from '../../drivers/driver.factory';
import { MicrosoftDriver } from '../../drivers/microsoft/microsoft.driver';
import { CanonicalMessage } from '../../drivers/interfaces/canonical.types';

/**
 * MicrosoftSyncService - Driver-based implementation
 *
 * This service uses the MicrosoftDriver abstraction for all Microsoft Graph operations.
 * Legacy direct Graph API code has been removed.
 *
 * Microsoft Graph API Best Practices (2025):
 * - Rate limit: 10,000 requests/10 min per app (Sept 2025 reduction)
 * - Delta query for incremental sync (deltaLink tokens)
 * - Batch requests: Max 20 per batch
 * - Handle 429 with Retry-After header (ResilienceService)
 * - Handle 410 Gone for expired delta tokens
 */
@Injectable()
export class MicrosoftSyncService extends BaseEmailSyncService {
  protected readonly logger = new Logger(MicrosoftSyncService.name);

  constructor(
    prisma: PrismaService,
    realtimeEvents: RealtimeEventsService,
    config: ConfigService,
    private emailEmbeddingQueue: EmailEmbeddingQueueService,
    private providerTokenService: ProviderTokenService,
    private driverFactory: EmailDriverFactory,
  ) {
    super(prisma, realtimeEvents, config);
  }

  onModuleInit() {
    super.onModuleInit(); // Load base configuration

    // Microsoft-specific configuration overrides
    this.batchSize = this.config.get<number>('MS_BATCH_FETCH_SIZE', 20);
    this.fullSyncMaxMessages = this.config.get<number>('MS_FULL_MAX_MESSAGES', 200);
  }

  async syncProvider(jobData: SyncJobData): Promise<SyncJobResult> {
    const { providerId, email, syncType, tenantId } = jobData;

    this.logger.log(`Starting ${syncType} Microsoft sync for ${email} (driver mode)`);

    try {
      // Get provider and access token
      const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
        providerId,
      );

      // Create connected driver
      const driver = await this.driverFactory.createConnectedDriver('microsoft', {
        type: 'oauth2',
        accessToken,
        emailHint: provider.email,
      }) as MicrosoftDriver;

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
      this.logger.error(`Microsoft sync failed for ${email}:`, error);
      throw error;
    }
  }

  /**
   * Full sync using MicrosoftDriver
   */
  private async syncFullWithDriver(
    driver: MicrosoftDriver,
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
      });

      // Process messages in this page
      for (const message of result.messages) {
        const upsertResult = await this.upsertMessageFromDriver(message, providerId, tenantId);
        messagesProcessed++;
        if (upsertResult.wasNew) {
          newMessages++;
        }
      }

      fetchedCount += result.messages.length;
      pageToken = result.nextPageToken;

      // Stop if we've reached the limit or no more pages
      if (fetchedCount >= this.fullSyncMaxMessages || !pageToken) {
        break;
      }
    } while (pageToken);

    // Get current sync token (delta link)
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
   * Incremental sync using MicrosoftDriver
   */
  private async syncIncrementalWithDriver(
    driver: MicrosoftDriver,
    lastSyncToken: string,
    providerId: string,
    tenantId: string,
  ): Promise<{
    messagesProcessed: number;
    newMessages: number;
    newSyncToken: string;
  }> {
    this.logger.debug(`Incremental sync with driver from token: ${lastSyncToken.substring(0, 50)}...`);

    let messagesProcessed = 0;
    let newMessages = 0;
    const processedIds = new Set<string>();

    // Get changes since last sync (delta query)
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
            const upsertResult = await this.upsertMessageFromDriver(message, providerId, tenantId);
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
      `Incremental sync complete: ${messagesProcessed} processed, ${newMessages} new, newToken: ${changesResult.newSyncToken.substring(0, 50)}...`,
    );

    return {
      messagesProcessed,
      newMessages,
      newSyncToken: changesResult.newSyncToken,
    };
  }

  /**
   * Upsert a message from driver canonical format into database
   */
  private async upsertMessageFromDriver(
    canonicalMsg: CanonicalMessage,
    providerId: string,
    tenantId: string,
  ): Promise<{ wasNew: boolean }> {
    // Check if message already exists
    const existing = await this.prisma.email.findFirst({
      where: { providerId, externalId: canonicalMsg.id },
      select: { id: true },
    });

    if (existing) {
      // Update existing message
      await this.prisma.email.update({
        where: { id: existing.id },
        data: {
          subject: canonicalMsg.subject || '(No Subject)',
          from: canonicalMsg.from.email,
          to: canonicalMsg.to?.map((r) => r.email) || [],
          cc: canonicalMsg.cc?.map((r) => r.email) || [],
          bcc: canonicalMsg.bcc?.map((r) => r.email) || [],
          bodyText: canonicalMsg.bodyText || '',
          bodyHtml: canonicalMsg.bodyHtml || '',
          snippet: canonicalMsg.snippet || '',
          receivedAt: canonicalMsg.receivedAt,
          isRead: canonicalMsg.isRead ?? false,
          isStarred: canonicalMsg.isStarred ?? false,
          isFlagged: canonicalMsg.isFlagged ?? false,
          folder: canonicalMsg.folder,
          labels: canonicalMsg.labels || [],
        },
      });

      return { wasNew: false };
    } else {
      // Create new message
      const createdEmail = await this.prisma.email.create({
        data: {
          tenantId,
          providerId,
          externalId: canonicalMsg.id,
          subject: canonicalMsg.subject || '(No Subject)',
          from: canonicalMsg.from.email,
          to: canonicalMsg.to?.map((r) => r.email) || [],
          cc: canonicalMsg.cc?.map((r) => r.email) || [],
          bcc: canonicalMsg.bcc?.map((r) => r.email) || [],
          bodyText: canonicalMsg.bodyText || '',
          bodyHtml: canonicalMsg.bodyHtml || '',
          snippet: canonicalMsg.snippet || '',
          receivedAt: canonicalMsg.receivedAt,
          sentAt: canonicalMsg.sentAt || canonicalMsg.receivedAt,
          isRead: canonicalMsg.isRead ?? false,
          isStarred: canonicalMsg.isStarred ?? false,
          isFlagged: canonicalMsg.isFlagged ?? false,
          isDeleted: false,
          folder: canonicalMsg.folder,
          labels: canonicalMsg.labels || [],
          threadId: canonicalMsg.threadId || null,
        },
      });

      // Queue for embeddings
      await this.emailEmbeddingQueue.enqueue({
        emailId: createdEmail.id,
        tenantId,
        subject: createdEmail.subject,
        snippet: createdEmail.snippet || '',
      });

      // Emit realtime event
      this.realtimeEvents.emitEmailNew(tenantId, {
        emailId: createdEmail.id,
        providerId,
        folder: createdEmail.folder,
        reason: 'message-processed',
      });

      return { wasNew: true };
    }
  }

  /**
   * Handle message deletion
   */
  private async handleMessageDeletion(
    messageId: string,
    providerId: string,
    tenantId: string,
  ): Promise<void> {
    const existing = await this.prisma.email.findFirst({
      where: { providerId, externalId: messageId },
      select: { id: true, folder: true },
    });

    if (!existing) {
      return; // Message not in our database
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
  }
}
