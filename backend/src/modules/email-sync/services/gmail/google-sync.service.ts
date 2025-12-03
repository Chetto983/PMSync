import { Injectable, Logger } from '@nestjs/common';
import { gmail_v1, google } from 'googleapis';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CryptoService } from '../../../../common/services/crypto.service';
import { SyncJobData, SyncJobResult } from '../../interfaces/sync-job.interface';
import { EmailEmbeddingQueueService } from '../../../ai/services/email-embedding.queue';
import { EmbeddingsService } from '../../../ai/services/embeddings.service';
import { KnowledgeBaseService } from '../../../ai/services/knowledge-base.service';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { EmailEventReason } from '../../../realtime/types/realtime.types';
import { mergeEmailStatusMetadata } from '../../utils/email-metadata.util';
import { ConfigService } from '@nestjs/config';
import { ProviderTokenService } from '../provider-token.service';
import { RetryService } from '../../../../common/services/retry.service';
import { AttachmentStorageService } from '../../../email/services/attachment.storage';
import { StorageService } from '../../../email/services/storage.service';
import { BaseEmailSyncService } from '../base-email-sync.service';
import { GmailAttachmentHandler } from './gmail-attachment-handler';
import { GmailFolderService } from './gmail-folder.service';
import { GmailMessageParser } from './gmail-message-parser';
import { GmailBatchProcessor } from './gmail-batch-processor';

@Injectable()
export class GoogleSyncService extends BaseEmailSyncService {
  protected readonly logger = new Logger(GoogleSyncService.name);
  private GMAIL_HISTORY_MAX_PAGES: number;
  private suppressMessageEvents = false;

  constructor(
    prisma: PrismaService,
    realtimeEvents: RealtimeEventsService,
    config: ConfigService,
    private crypto: CryptoService,
    private emailEmbeddingQueue: EmailEmbeddingQueueService,
    private embeddingsService: EmbeddingsService,
    private knowledgeBaseService: KnowledgeBaseService,
    private providerTokenService: ProviderTokenService,
    private retryService: RetryService,
    private attachmentStorage: AttachmentStorageService,
    private storage: StorageService,
    private gmailAttachmentHandler: GmailAttachmentHandler,
    private gmailFolderService: GmailFolderService,
    private gmailMessageParser: GmailMessageParser,
    private gmailBatchProcessor: GmailBatchProcessor,
  ) {
    super(prisma, realtimeEvents, config);
  }

  onModuleInit() {
    super.onModuleInit(); // Load base configuration

    // Gmail-specific configuration overrides
    this.batchSize = this.config.get<number>('GMAIL_BATCH_GET_SIZE', 100);
    this.fullSyncMaxMessages = this.config.get<number>('GMAIL_FULL_MAX_MESSAGES', 200);
    this.retryMaxAttempts = this.config.get<number>('GMAIL_RETRY_MAX_ATTEMPTS', 3);
    this.retry429DelayMs = this.config.get<number>('GMAIL_RETRY_429_DELAY_MS', 2000);
    this.retry5xxDelayMs = this.config.get<number>('GMAIL_RETRY_5XX_DELAY_MS', 2000);

    // Gmail-only configuration
    this.GMAIL_HISTORY_MAX_PAGES = this.config.get<number>('GMAIL_HISTORY_MAX_PAGES', 25);
    this.suppressMessageEvents = this.config.get<boolean>('REALTIME_SUPPRESS_MESSAGE_EVENTS', false);
  }

  async syncProvider(jobData: SyncJobData): Promise<SyncJobResult> {
    const { providerId, email, syncType } = jobData;

    this.logger.log(`Starting ${syncType} Gmail sync for ${email}`);

    try {
      const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
        providerId,
      );

      // Create Gmail client
      const gmail = this.createGmailClient(accessToken);

      // Get last sync token from metadata (for incremental sync)
      const metadata = (provider.metadata as any) || {};
      const lastHistoryId = metadata.lastSyncToken;

      let messagesProcessed = 0;
      let newMessages = 0;
      let newHistoryId: string | undefined;
      let metadataUpdates: Record<string, any> | undefined;

      if (syncType === 'incremental' && lastHistoryId) {
        // Incremental sync using historyId
        const historyResult = await this.syncIncremental(
          gmail,
          lastHistoryId,
          providerId,
          provider.tenantId,
        );
        messagesProcessed = historyResult.messagesProcessed;
        newMessages = historyResult.newMessages;
        newHistoryId = historyResult.newHistoryId;
        metadataUpdates = historyResult.metadata;
      } else {
        // Full sync - fetch recent messages
        const fullResult = await this.syncFull(
          gmail,
          email,
          providerId,
          provider.tenantId,
        );
        messagesProcessed = fullResult.messagesProcessed;
        newMessages = fullResult.newMessages;
        newHistoryId = fullResult.historyId;
      }

      if (this.suppressMessageEvents && messagesProcessed > 0) {
        this.realtimeEvents.emitEmailBatchProcessed(provider.tenantId, {
          providerId,
          processed: messagesProcessed,
          created: newMessages,
          syncType,
        });
        this.realtimeEvents.emitSyncStatus(provider.tenantId, {
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
        lastSyncToken: newHistoryId,
        metadata: metadataUpdates,
      };
    } catch (error) {
      this.logger.error(`Gmail sync failed for ${email}:`, error);
      throw error;
    }
  }

  private createGmailClient(accessToken: string): gmail_v1.Gmail {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    return this.retryService.withRetry(fn, {
      maxAttempts: this.retryMaxAttempts,
      delay429Ms: this.retry429DelayMs,
      delay5xxMs: this.retry5xxDelayMs,
      loggerName: 'Gmail',
    });
  }

  /**
   * Incremental sync using Gmail History API
   */
  private async syncIncremental(
    gmail: gmail_v1.Gmail,
    startHistoryId: string,
    providerId: string,
    tenantId: string,
  ): Promise<{
    messagesProcessed: number;
    newMessages: number;
    newHistoryId: string;
    metadata?: Record<string, any>;
  }> {
    this.logger.debug(`Incremental sync from historyId: ${startHistoryId}`);

    try {
      // Get profile to obtain the latest historyId
      const profile = await gmail.users.getProfile({ userId: 'me' });
      const currentHistoryId = profile.data.historyId!;

      if (currentHistoryId === startHistoryId) {
        return {
          messagesProcessed: 0,
          newMessages: 0,
          newHistoryId: currentHistoryId,
        };
      }

      let messagesProcessed = 0;
      let newMessages = 0;
      let pageToken: string | undefined;
      let pagesFetched = 0;
      const MAX_PAGES = this.GMAIL_HISTORY_MAX_PAGES;
      const addedMessageIds = new Set<string>();
      const labelRefreshIds = new Set<string>();
      const deletedMessageIds = new Set<string>();
      let truncated = false;

      do {
        const historyResponse = await gmail.users.history.list({
          userId: 'me',
          startHistoryId,
          pageToken,
          historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
          maxResults: 500,
        });

        const history = historyResponse.data.history || [];

        for (const record of history) {
          if (record.messagesAdded) {
            for (const added of record.messagesAdded) {
              const messageId = added.message?.id;
              if (!messageId) {
                continue;
              }
              addedMessageIds.add(messageId);
            }
          }

          if (record.labelsAdded) {
            for (const labelChange of record.labelsAdded) {
              const messageId = labelChange.message?.id;
              if (!messageId) {
                continue;
              }
              labelRefreshIds.add(messageId);
            }
          }

          if (record.labelsRemoved) {
            for (const labelChange of record.labelsRemoved) {
              const messageId = labelChange.message?.id;
              if (!messageId) {
                continue;
              }
              labelRefreshIds.add(messageId);
            }
          }

          if (record.messagesDeleted) {
            for (const deleted of record.messagesDeleted) {
              const messageId = deleted.message?.id;
              if (!messageId) {
                continue;
              }
              deletedMessageIds.add(messageId);
            }
          }
        }

        pageToken = historyResponse.data.nextPageToken ?? undefined;
        pagesFetched += 1;
      } while (pageToken && pagesFetched < MAX_PAGES);

      if (pageToken) {
        this.logger.warn(
          `Gmail history pagination truncated after ${pagesFetched} pages for provider ${providerId}.`,
        );
        truncated = true;
      }

      // Process added messages in batches
      const addedIds = Array.from(addedMessageIds);
      for (let i = 0; i < addedIds.length; i += this.batchSize) {
        const chunkIds = addedIds.slice(i, i + this.batchSize);
        if (!chunkIds.length) continue;

        const batchGet = (gmail.users.messages as any)?.batchGet;
        let fullMessages: gmail_v1.Schema$Message[] = [];

        if (typeof batchGet === 'function') {
          const batchResponse = await batchGet.call(gmail.users.messages, {
            userId: 'me',
            ids: chunkIds,
            format: 'full',
          });

          const responses = batchResponse.data.responses || [];
          fullMessages = responses
            .map((r: { message?: gmail_v1.Schema$Message }) => r.message)
            .filter(
              (msg: gmail_v1.Schema$Message | undefined | null): msg is gmail_v1.Schema$Message =>
                !!msg?.id,
            );
        } else {
          const chunkResponses = await Promise.all(
            chunkIds.map((id) =>
              gmail.users.messages
                .get({ userId: 'me', id, format: 'full' })
                .then((res) => res.data)
                .catch(() => null),
            ),
          );
          fullMessages = chunkResponses.filter((msg): msg is gmail_v1.Schema$Message => !!msg?.id);
        }

        if (fullMessages.length) {
          const batchResult = await this.gmailBatchProcessor.processMessagesBatch(
            fullMessages,
            providerId,
            tenantId,
            this.truncateText.bind(this),
            this.createGmailClient.bind(this),
          );
          messagesProcessed += batchResult.processed;
          newMessages += batchResult.created;
        }
      }

      // Process label changes
      await Promise.allSettled(
        Array.from(labelRefreshIds).map((id) =>
          this.refreshMessageMetadata(gmail, id, providerId, tenantId).then(() => {
            messagesProcessed++;
          }),
        ),
      );

      await Promise.allSettled(
        Array.from(deletedMessageIds).map((id) =>
          this.handleMessageDeletion(gmail, id, providerId, tenantId).then(() => {
            messagesProcessed++;
          }),
        ),
      );

      return {
        messagesProcessed,
        newMessages,
        newHistoryId: currentHistoryId,
        metadata: truncated ? { historyTruncated: true, backfillRequired: true } : undefined,
      };
    } catch (error) {
      this.logger.error('Incremental sync error:', error);
      throw error;
    }
  }

  /**
   * Full sync - fetch the most recent messages up to configured cap
   */
  private async syncFull(
    gmail: gmail_v1.Gmail,
    email: string,
    providerId: string,
    tenantId: string,
  ): Promise<{
    messagesProcessed: number;
    newMessages: number;
    historyId: string;
  }> {
    this.logger.debug(`Full sync - fetching latest Gmail messages (limit ${this.fullSyncMaxMessages})`);

    try {
      // Get profile for historyId
      const profile = await gmail.users.getProfile({ userId: 'me' });
      const historyId = profile.data.historyId!;

      // List newest messages (all folders) up to the configured cap
      const remaining = this.fullSyncMaxMessages;
      const messagesResponse = await gmail.users.messages.list({
        userId: 'me',
        maxResults: Math.min(500, remaining), // Gmail API max per request
      });

      let messages = messagesResponse.data.messages || [];
      let pageToken = messagesResponse.data.nextPageToken;

      // Fetch additional pages if needed (up to configured total)
      while (pageToken && messages.length < this.fullSyncMaxMessages) {
        const nextResponse = await gmail.users.messages.list({
          userId: 'me',
          maxResults: Math.min(500, this.fullSyncMaxMessages - messages.length),
          pageToken,
        });

        messages = [...messages, ...(nextResponse.data.messages || [])];
        pageToken = nextResponse.data.nextPageToken;

        if (!pageToken || messages.length >= this.fullSyncMaxMessages) {
          break;
        }
      }

      this.logger.debug(`Found ${messages.length} Gmail messages from the most recent pages`);

      let messagesProcessed = 0;
      let newMessages = 0;

      for (let i = 0; i < messages.length; i += this.batchSize) {
        const chunkIds = messages.slice(i, i + this.batchSize).map((m) => m.id!).filter(Boolean);
        if (!chunkIds.length) continue;

        const fullMessages = await this.gmailBatchProcessor.fetchMessagesBatch(
          gmail,
          chunkIds,
          'full',
          this.withRetry.bind(this),
          this.extractErrorMessage.bind(this),
        );

        if (fullMessages.length) {
          const batchResult = await this.gmailBatchProcessor.processMessagesBatch(
            fullMessages,
            providerId,
            tenantId,
            this.truncateText.bind(this),
            this.createGmailClient.bind(this),
          );
          messagesProcessed += batchResult.processed;
          newMessages += batchResult.created;
        }
      }

      return {
        messagesProcessed,
        newMessages,
        historyId,
      };
    } catch (error) {
      this.logger.error('Full sync error:', error);
      throw error;
    }
  }




  /**
   * Refresh Gmail message metadata when labels change.
   */
  private async refreshMessageMetadata(
    gmail: gmail_v1.Gmail,
    messageId: string,
    providerId: string,
    tenantId: string,
  ): Promise<void> {
    const existing = await this.prisma.email.findUnique({
      where: {
        providerId_externalId: {
          providerId,
          externalId: messageId,
        },
      },
      select: {
        id: true,
        folder: true,
        isDeleted: true,
        labels: true,
        metadata: true,
      },
    });

    if (!existing) {
      return;
    }

    try {
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
      });

      const labelIds = response.data.labelIds ?? [];
      const folder = this.gmailFolderService.determineFolderFromLabels(labelIds, existing.folder);
      const isDeleted = labelIds.includes('TRASH');
      const isRead = !labelIds.includes('UNREAD');
      const isStarred = labelIds.includes('STARRED');
      const isFlagged = labelIds.includes('IMPORTANT');
      const metadata = mergeEmailStatusMetadata(existing.metadata as Record<string, any> | null, isDeleted ? 'deleted' : 'active');

      try {
        const updatedEmail = await this.prisma.email.update({
          where: { id: existing.id },
          data: {
            labels: labelIds,
            folder,
            isDeleted,
            isRead,
            isStarred,
            isFlagged,
            metadata,
          },
          include: {
            emailLabels: {
              include: {
                label: true,
              },
            },
          },
        });

        // Emit WebSocket event with full email object so frontend can update immediately
        this.realtimeEvents.emitEmailUpdate(tenantId, {
          emailId: updatedEmail.id,
          providerId: updatedEmail.providerId,
          folder: updatedEmail.folder,
          reason: 'labels-updated',
          email: updatedEmail as any,
        });
      } catch (updateError) {
        const message = updateError instanceof Error ? updateError.message : String(updateError);
        this.logger.warn(
          `Failed to update Gmail message ${messageId} after label change: ${message}`,
        );
      }
    } catch (error) {
      if (this.isNotFoundError(error)) {
        await this.enforceTrashState(existing, tenantId);

        this.notifyGmailMailboxChange(tenantId, providerId, 'message-deleted', {
          emailId: existing.id,
          externalId: messageId,
        });
      } else {
        const message = this.extractErrorMessage(error);
        this.logger.warn(`Failed to refresh Gmail message ${messageId}: ${message}`);
      }
    }
  }

  private async handleMessageDeletion(
    gmail: gmail_v1.Gmail,
    messageId: string,
    providerId: string,
    tenantId: string,
  ): Promise<void> {
    const existing = await this.prisma.email.findUnique({
      where: {
        providerId_externalId: {
          providerId,
          externalId: messageId,
        },
      },
      select: {
        id: true,
        folder: true,
        isDeleted: true,
        labels: true,
        metadata: true,
      },
    });

    if (!existing) {
      return;
    }

    try {
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
      });

      const labelIds = response.data.labelIds ?? [];
      const labelsWithTrash = Array.from(new Set([...labelIds, 'TRASH']));
      const isRead = !labelsWithTrash.includes('UNREAD');
      const isStarred = labelsWithTrash.includes('STARRED');
      const metadata = mergeEmailStatusMetadata(existing.metadata as Record<string, any> | null, 'deleted');

      try {
        await this.prisma.email.update({
          where: { id: existing.id },
          data: {
            labels: labelsWithTrash,
            folder: 'TRASH',
            isDeleted: true,
            isRead,
            isStarred,
            metadata,
          },
        });
      } catch (updateError) {
        const message = updateError instanceof Error ? updateError.message : String(updateError);
        this.logger.warn(
          `Failed to mark Gmail message ${messageId} as deleted: ${message}`,
        );
      }
    } catch (error) {
      if (this.isNotFoundError(error)) {
        await this.enforceTrashState(existing, tenantId);
      } else {
        const message = this.extractErrorMessage(error);
        this.logger.warn(`Error while handling Gmail deletion for ${messageId}: ${message}`);
      }
    }
  }

  private async enforceTrashState(
    existing: {
      id: string;
      folder: string;
      isDeleted: boolean;
      labels: string[] | null;
      metadata: any;
    },
    tenantId: string,
    forceHardDelete = false,
  ): Promise<void> {
    const currentLabels = Array.isArray(existing.labels) ? existing.labels : [];

    if (forceHardDelete || existing.folder === 'TRASH' || existing.isDeleted) {
      await this.removeEmailPermanently(existing.id, tenantId);
      return;
    }

    const updatedLabels = currentLabels.includes('TRASH')
      ? currentLabels
      : [...currentLabels, 'TRASH'];
    const metadata = mergeEmailStatusMetadata(existing.metadata, 'deleted');

    try {
      await this.prisma.email.update({
        where: { id: existing.id },
        data: {
          isDeleted: true,
          folder: 'TRASH',
          labels: updatedLabels,
          metadata,
        },
      });
    } catch (error) {
      const message = this.extractErrorMessage(error);
      this.logger.warn(
        `Failed to soft-delete Gmail message ${existing.id} locally: ${message}`,
      );
    }
  }

  private async removeEmailPermanently(emailId: string, tenantId: string): Promise<void> {
    // 1. Get attachments BEFORE deleting email
    const attachments = await this.prisma.emailAttachment.findMany({
      where: { emailId },
      select: { storagePath: true, storageType: true },
    });

    // 2. Delete embeddings
    try {
      await this.knowledgeBaseService.deleteEmbeddingsForEmail(tenantId, emailId);
    } catch (error) {
      const message = this.extractErrorMessage(error);
      this.logger.warn(
        `Failed to delete embeddings for email ${emailId} during hard-delete: ${message}`,
      );
    }

    // 3. Delete email from database (cascade deletes EmailAttachment records)
    try {
      await this.prisma.email.delete({
        where: { id: emailId },
      });
    } catch (error) {
      const message = this.extractErrorMessage(error);
      this.logger.warn(`Failed to remove email ${emailId} from database: ${message}`);
      throw error; // Re-throw to prevent S3 cleanup if DB deletion failed
    }

    // 4. Delete S3 files (after DB deletion)
    const s3Keys = attachments
      .filter((a) => a.storageType === 's3' && a.storagePath)
      .map((a) => a.storagePath!);

    if (s3Keys.length > 0) {
      try {
        const result = await this.storage.deleteObjects(s3Keys);
        this.logger.debug(
          `Deleted ${result.deleted} S3 objects for email ${emailId} (${result.failed} failed)`,
        );
      } catch (error) {
        const message = this.extractErrorMessage(error);
        this.logger.error(`Failed to delete S3 objects for email ${emailId}: ${message}`);
        // Don't throw - email already deleted from DB
      }
    }
  }

  private async applyStatusMetadata(
    emailId: string,
    existing: Record<string, any> | null | undefined,
    status: 'deleted' | 'active',
  ): Promise<void> {
    const next = mergeEmailStatusMetadata(existing, status);
    const shouldUpdate =
      !existing ||
      existing.status !== next.status ||
      existing.deletedAt !== next.deletedAt;

    if (!shouldUpdate) {
      return;
    }

    try {
      await this.prisma.email.update({
        where: { id: emailId },
        data: {
          metadata: next,
        },
      });
    } catch (error) {
      const message = this.extractErrorMessage(error);
      this.logger.warn(`Failed to update metadata for email ${emailId}: ${message}`);
    }
  }


  /**
   * Process a single Gmail message and persist it locally.
   * Kept for incremental/webhook paths when batch data is not available.
   */
  private async processMessage(
    gmail: gmail_v1.Gmail,
    messageId: string,
    providerId: string,
    tenantId: string,
  ): Promise<boolean> {
    try {
      const messages = await this.gmailBatchProcessor.fetchMessagesBatch(
        gmail,
        [messageId],
        'full',
        this.withRetry.bind(this),
        this.extractErrorMessage.bind(this),
      );
      if (!messages.length) return false;

      const result = await this.gmailBatchProcessor.processMessagesBatch(
        messages,
        providerId,
        tenantId,
        this.truncateText.bind(this),
        this.createGmailClient.bind(this),
      );
      return result.processed > 0;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        this.logger.verbose(
          `Gmail returned 404 for message ${messageId}; marking local record as deleted if present.`,
        );
        await this.handleMissingRemoteMessage(providerId, tenantId, messageId);
        return true;
      }

      this.logger.error(`Failed to process message ${messageId}:`, error);
      return false;
    }
  }

  private async handleMissingRemoteMessage(
    providerId: string,
    tenantId: string,
    messageId: string,
  ): Promise<void> {
    const existing = await this.prisma.email.findUnique({
      where: {
        providerId_externalId: {
          providerId,
          externalId: messageId,
        },
      },
      select: {
        id: true,
        folder: true,
        isDeleted: true,
        labels: true,
        metadata: true,
      },
    });

    if (!existing) {
      return;
    }

    await this.enforceTrashState(existing, tenantId, true);

    this.notifyGmailMailboxChange(tenantId, providerId, 'message-deleted', {
      emailId: existing.id,
      externalId: messageId,
    });
  }

  private notifyGmailMailboxChange(
    tenantId: string,
    providerId: string,
    reason: EmailEventReason,
    payload?: { emailId?: string; externalId?: string; folder?: string },
  ): void {
    // Gmail-specific wrapper with suppressMessageEvents support
    this.realtimeEvents.notifyMailboxChange(tenantId, providerId, reason, payload, {
      suppressMessageEvents: this.suppressMessageEvents,
    });
  }
}
