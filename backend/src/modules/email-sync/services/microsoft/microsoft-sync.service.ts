import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { URLSearchParams } from 'url';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CryptoService } from '../../../../common/services/crypto.service';
import { SyncJobData, SyncJobResult } from '../../interfaces/sync-job.interface';
import { EmailEmbeddingQueueService } from '../../../ai/services/email-embedding.queue';
import { EmbeddingsService } from '../../../ai/services/embeddings.service';
import { KnowledgeBaseService } from '../../../ai/services/knowledge-base.service';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { EmailEventReason } from '../../../realtime/types/realtime.types';
import { ConfigService } from '@nestjs/config';
import { ProviderTokenService } from '../provider-token.service';
import { mergeEmailStatusMetadata } from '../../utils/email-metadata.util';
import { RetryService } from '../../../../common/services/retry.service';
import { AttachmentStorageService } from '../../../email/services/attachment.storage';
import { StorageService } from '../../../email/services/storage.service';
import { BaseEmailSyncService } from '../base-email-sync.service';
import { MicrosoftAttachmentHandler } from './microsoft-attachment-handler';
import { MicrosoftFolderService } from './microsoft-folder.service';
import { MicrosoftMessageParser } from './microsoft-message-parser';
import { MicrosoftBatchProcessor } from './microsoft-batch-processor';


interface MicrosoftMessage {
  id: string;
  subject: string;
  from: { emailAddress: { address: string; name: string } };
  toRecipients: { emailAddress: { address: string; name: string } }[];
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments?: boolean;
}

interface MicrosoftDeltaResponse<T = Partial<MicrosoftMessage>> {
  value?: T[];
  '@odata.deltaLink'?: string;
  '@odata.nextLink'?: string;
}

type MicrosoftDeltaItem = Partial<MicrosoftMessage> & {
  id?: string;
  '@removed'?: {
    reason?: string;
  };
};

type MicrosoftSyncMode = 'delta' | 'timestamp';

interface MicrosoftIncrementalDeltaResult {
  messagesProcessed: number;
  newMessages: number;
  newDeltaLink: string;
  latestReceivedDate?: string;
}

interface MicrosoftIncrementalTimestampResult {
  messagesProcessed: number;
  newMessages: number;
  newTimestamp: string;
}

interface MicrosoftFullSyncInitResult {
  messagesProcessed: number;
  newMessages: number;
  syncToken: string;
  mode: MicrosoftSyncMode;
  latestTimestamp?: string;
}

@Injectable()
export class MicrosoftSyncService extends BaseEmailSyncService {
  protected readonly logger = new Logger(MicrosoftSyncService.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
  private suppressMessageEvents = false;

  constructor(
    prisma: PrismaService,
    realtimeEvents: RealtimeEventsService,
    config: ConfigService,
    private crypto: CryptoService,
    private emailEmbeddingQueue: EmailEmbeddingQueueService,
    private embeddingsService: EmbeddingsService,
    private knowledgeBaseService: KnowledgeBaseService,
    private readonly providerTokenService: ProviderTokenService,
    private retryService: RetryService,
    private attachmentStorage: AttachmentStorageService,
    private storage: StorageService,
    private microsoftAttachmentHandler: MicrosoftAttachmentHandler,
    private microsoftFolderService: MicrosoftFolderService,
    private microsoftMessageParser: MicrosoftMessageParser,
    private microsoftBatchProcessor: MicrosoftBatchProcessor,
  ) {
    super(prisma, realtimeEvents, config);
  }

  onModuleInit() {
    super.onModuleInit(); // Load base configuration

    // Microsoft-specific configuration overrides
    this.batchSize = this.config.get<number>('MS_BATCH_FETCH_SIZE', 20);
    this.fullSyncMaxMessages = this.config.get<number>('MS_FULL_MAX_MESSAGES', 200);
    this.retryMaxAttempts = this.config.get<number>('MS_RETRY_MAX_ATTEMPTS', 3);
    this.retry429DelayMs = this.config.get<number>('MS_RETRY_429_DELAY_MS', 2000);
    this.retry5xxDelayMs = this.config.get<number>('MS_RETRY_5XX_DELAY_MS', 2000);

    // Microsoft-only configuration
    this.suppressMessageEvents = this.config.get<boolean>('REALTIME_SUPPRESS_MESSAGE_EVENTS', false);
  }

  async syncProvider(jobData: SyncJobData): Promise<SyncJobResult> {
    const { providerId, email, syncType, lastSyncedAt } = jobData;

    this.logger.log(`Starting ${syncType} Microsoft sync for ${email}`);

    try {
      const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
        providerId,
      );

      // Get tracking metadata
      const metadata = (provider.metadata as any) || {};
      const lastDeltaLink =
        typeof metadata.lastSyncToken === 'string' ? (metadata.lastSyncToken as string) : undefined;
      const deltaMode: MicrosoftSyncMode | undefined = metadata.microsoftDeltaMode;
      const lastTimestamp =
        typeof metadata.microsoftLastSyncTimestamp === 'string'
          ? (metadata.microsoftLastSyncTimestamp as string)
          : undefined;
      const lastSyncedIso = this.normalizeTimestamp(lastSyncedAt);

      let messagesProcessed = 0;
      let newMessages = 0;
      let metadataUpdates: Record<string, any> = {};
      let incrementalHandled = false;
      let shouldRunFull = syncType === 'full';

      if (!shouldRunFull && syncType === 'incremental') {
        const canUseDelta =
          deltaMode !== 'timestamp' &&
          !!lastDeltaLink &&
          lastDeltaLink.includes('graph.microsoft.com');

        if (canUseDelta) {
          this.logger.log(`Using incremental delta sync for ${email}`);

          try {
            const deltaResult = await this.syncIncremental(
              accessToken,
              lastDeltaLink,
              providerId,
              provider.tenantId,
            );

            messagesProcessed = deltaResult.messagesProcessed;
            newMessages = deltaResult.newMessages;
            metadataUpdates = {
              lastSyncToken: deltaResult.newDeltaLink,
              microsoftDeltaMode: 'delta' as MicrosoftSyncMode,
              microsoftDeltaModeReason: null,
            };

            if (deltaResult.latestReceivedDate) {
              metadataUpdates.microsoftLastSyncTimestamp = deltaResult.latestReceivedDate;
            }

            incrementalHandled = true;
          } catch (deltaError) {
            if (this.isDeltaUnsupportedError(deltaError)) {
              this.logger.warn(
                `Microsoft delta sync is not supported for ${email}; switching to timestamp-based incremental sync.`,
              );
              incrementalHandled = false; // will try timestamp mode below
              shouldRunFull = false;
              metadataUpdates = {
                ...metadataUpdates,
                microsoftDeltaMode: 'timestamp',
                microsoftDeltaModeReason: 'delta-unsupported',
              };
            } else {
              this.logger.warn(
                `Delta sync failed for ${email}, fallback to timestamp/full: ${
                  deltaError instanceof Error ? deltaError.message : String(deltaError)
                }`,
              );
              incrementalHandled = false;
              shouldRunFull = false;
              // Reset delta link to force re-initialization on next full
              metadataUpdates = {
                ...metadataUpdates,
                lastSyncToken: undefined,
                microsoftDeltaMode: 'timestamp',
                microsoftDeltaModeReason: 'delta-failed',
              };
            }
          }
        }

        if (!shouldRunFull && !incrementalHandled) {
          const sinceTimestamp =
            lastTimestamp ||
            (lastDeltaLink && !lastDeltaLink.includes('graph.microsoft.com')
              ? lastDeltaLink
              : lastSyncedIso);

          if (sinceTimestamp) {
            this.logger.log(`Using incremental timestamp sync for ${email} since ${sinceTimestamp}`);

            const timestampResult = await this.syncIncrementalByTimestamp(
              accessToken,
              sinceTimestamp,
              providerId,
              provider.tenantId,
            );

            messagesProcessed = timestampResult.messagesProcessed;
            newMessages = timestampResult.newMessages;
            metadataUpdates = {
              lastSyncToken: timestampResult.newTimestamp,
              microsoftDeltaMode: 'timestamp' as MicrosoftSyncMode,
              microsoftLastSyncTimestamp: timestampResult.newTimestamp,
              microsoftDeltaModeReason:
                metadataUpdates.microsoftDeltaModeReason ?? 'timestamp-incremental',
            };

            incrementalHandled = true;
          } else {
            shouldRunFull = true;
          }
        }
      }

      if (!incrementalHandled) {
        this.logger.log(
          `Running full Microsoft sync for ${email} (this may take a while for large mailboxes)`,
        );

        const fullResult = await this.syncFullAndInitializeDelta(
          accessToken,
          email,
          providerId,
          provider.tenantId,
        );

        messagesProcessed = fullResult.messagesProcessed;
        newMessages = fullResult.newMessages;
        metadataUpdates = {
          lastSyncToken: fullResult.syncToken,
          microsoftDeltaMode: fullResult.mode,
          microsoftDeltaModeReason: null,
        };

        if (fullResult.latestTimestamp) {
          metadataUpdates.microsoftLastSyncTimestamp = fullResult.latestTimestamp;
        }
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
        lastSyncToken: metadataUpdates.lastSyncToken,
        metadata: metadataUpdates,
      };
    } catch (error) {
      this.logger.error(`Microsoft sync failed for ${email}:`, error);
      throw error;
    }
  }

  /**
   * Incremental sync using Microsoft Graph Delta API
   */
  private async syncIncremental(
    accessToken: string,
    deltaLink: string,
    providerId: string,
    tenantId: string,
  ): Promise<MicrosoftIncrementalDeltaResult> {
    this.logger.debug(`Incremental sync using deltaLink`);

    try {
      let nextLink: string | undefined = deltaLink;
      let newDeltaLink: string | undefined;
      let messagesProcessed = 0;
      let newMessages = 0;
      let latestReceivedDate: string | undefined;
      let page = 0;
      const maxPages = 25;

      while (nextLink) {
        if (page++ >= maxPages) {
          this.logger.warn(
            `Delta pagination exceeded ${maxPages} pages for provider ${providerId}; stop processing early.`,
          );
          break;
        }

        const response: AxiosResponse<MicrosoftDeltaResponse<MicrosoftDeltaItem>> =
          await axios.get<MicrosoftDeltaResponse<MicrosoftDeltaItem>>(nextLink, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

        const items = response.data.value ?? [];
        const toProcessIds: string[] = [];

        for (const item of items) {
          const messageId = item?.id;
          const itemReceived = item?.receivedDateTime;

          if (item && item['@removed']) {
            if (messageId) {
              await this.handleRemoteRemoval(providerId, tenantId, messageId);
              messagesProcessed++;
            }
            continue;
          }

          if (!messageId) {
            continue;
          }

          toProcessIds.push(messageId);

          if (itemReceived) {
            if (!latestReceivedDate) {
              latestReceivedDate = itemReceived;
            } else if (new Date(itemReceived).getTime() > new Date(latestReceivedDate).getTime()) {
              latestReceivedDate = itemReceived;
            }
          }
        }

        if (toProcessIds.length) {
          for (let i = 0; i < toProcessIds.length; i += this.batchSize) {
            const chunk = toProcessIds.slice(i, i + this.batchSize);
            const messages = await this.microsoftBatchProcessor.fetchMessagesBatch(
              accessToken,
              chunk,
              this.batchSize,
              this.msRequestWithRetry.bind(this),
              this.extractErrorMessage.bind(this),
            );
            if (!messages.length) continue;
            const result = await this.microsoftBatchProcessor.processMessagesBatch(
              messages,
              providerId,
              tenantId,
              accessToken,
              this.truncateText.bind(this),
            );
            messagesProcessed += result.processed;
            newMessages += result.created;
          }
        }

        const delta = response.data['@odata.deltaLink'];
        const next = response.data['@odata.nextLink'];

        if (delta) {
          newDeltaLink = delta;
        }

        nextLink = next || undefined;

        if (!nextLink) {
          break;
        }
      }

      return {
        messagesProcessed,
        newMessages,
        newDeltaLink: newDeltaLink || deltaLink,
        latestReceivedDate,
      };
    } catch (error) {
      this.logger.error('Incremental sync error:', error);
      throw error;
    }
  }

  private async syncIncrementalByTimestamp(
    accessToken: string,
    sinceTimestamp: string,
    providerId: string,
    tenantId: string,
  ): Promise<MicrosoftIncrementalTimestampResult> {
    this.logger.debug(`Incremental sync using timestamp since ${sinceTimestamp}`);

    let sinceDate = new Date(sinceTimestamp);
    if (Number.isNaN(sinceDate.getTime())) {
      this.logger.warn(
        `Invalid timestamp "${sinceTimestamp}" provided for incremental sync; defaulting to epoch.`,
      );
      sinceDate = new Date(0);
    }
    const sinceIso = sinceDate.toISOString();

    const params = new URLSearchParams({
      $filter: `receivedDateTime ge ${sinceIso}`,
      $orderby: 'receivedDateTime asc',
      $top: '50',
    });

    let nextLink: string | undefined = `${this.GRAPH_API_BASE}/me/messages?${params.toString()}`;
    let page = 0;
    const maxPages = 25;

    let messagesProcessed = 0;
    let newMessages = 0;
    let latestTimestamp = sinceIso;
    const toProcessIds: string[] = [];

    while (nextLink) {
      if (page++ >= maxPages) {
        this.logger.warn(
          `Timestamp pagination exceeded ${maxPages} pages for provider ${providerId}; stopping early.`,
        );
        break;
      }

      const response: AxiosResponse<MicrosoftDeltaResponse<MicrosoftMessage>> =
        await axios.get<MicrosoftDeltaResponse<MicrosoftMessage>>(nextLink, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

      const messages = response.data.value ?? [];

      for (const message of messages) {
        if (!message?.id) {
          continue;
        }

        toProcessIds.push(message.id);

        if (message.receivedDateTime) {
          latestTimestamp = message.receivedDateTime;
        }
      }

      const next = response.data['@odata.nextLink'];
      nextLink = next || undefined;

      if (!nextLink) {
        break;
      }
    }

    if (toProcessIds.length) {
      for (let i = 0; i < toProcessIds.length; i += this.batchSize) {
        const chunk = toProcessIds.slice(i, i + this.batchSize);
        const messages = await this.microsoftBatchProcessor.fetchMessagesBatch(
          accessToken,
          chunk,
          this.batchSize,
          this.msRequestWithRetry.bind(this),
          this.extractErrorMessage.bind(this),
        );
        if (!messages.length) continue;
        const result = await this.microsoftBatchProcessor.processMessagesBatch(
          messages,
          providerId,
          tenantId,
          accessToken,
          this.truncateText.bind(this),
        );
        messagesProcessed += result.processed;
        newMessages += result.created;
      }
    }

    if (messagesProcessed === 0 && newMessages === 0) {
      latestTimestamp = new Date().toISOString();
    }

    return {
      messagesProcessed,
      newMessages,
      newTimestamp: latestTimestamp,
    };
  }

  /**
   * Full sync - fetch the most recent messages up to FULL_MAX_MESSAGES
   */
  private async syncFull(
    accessToken: string,
    email: string,
    providerId: string,
    tenantId: string,
  ): Promise<{
    messagesProcessed: number;
    newMessages: number;
    latestReceivedDate?: string;
  }> {
    this.logger.debug(`Full sync - fetching latest Microsoft messages (limit ${this.fullSyncMaxMessages})`);

    try {
      // Fetch newest messages with pagination until FULL_MAX_MESSAGES
      const params = new URLSearchParams({
        $orderby: 'receivedDateTime desc',
        $top: '50', // keep lower to stay within FULL_MAX_MESSAGES cap with fewer pages
      });

      let messagesUrl: string | undefined = `${this.GRAPH_API_BASE}/me/messages?${params.toString()}`;
      let allMessages: MicrosoftMessage[] = [];
      let page = 0;
      const maxPages = 10; // safety guard

      // Fetch all pages up to limit
      while (messagesUrl && page < maxPages && allMessages.length < this.fullSyncMaxMessages) {
        const messagesResponse: AxiosResponse<MicrosoftDeltaResponse<MicrosoftMessage>> = await axios.get(messagesUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const messages: MicrosoftMessage[] = messagesResponse.data.value || [];
        allMessages = [...allMessages, ...messages];

        this.logger.debug(`Fetched page ${page + 1}: ${messages.length} messages (total: ${allMessages.length})`);

        // Check for next page
        messagesUrl = messagesResponse.data['@odata.nextLink'];
        page++;

        if (allMessages.length >= this.fullSyncMaxMessages) {
          break;
        }
      }

      this.logger.debug(`Found ${allMessages.length} Microsoft messages from most recent pages`);

      let messagesProcessed = 0;
      let newMessages = 0;

      const ids = allMessages.map((m) => m.id).filter((id): id is string => !!id);
      for (let i = 0; i < ids.length; i += this.batchSize) {
        const chunk = ids.slice(i, i + this.batchSize);
        if (!chunk.length) continue;

        const messages = await this.microsoftBatchProcessor.fetchMessagesBatch(
          accessToken,
          chunk,
          this.batchSize,
          this.msRequestWithRetry.bind(this),
          this.extractErrorMessage.bind(this),
        );
        if (!messages.length) continue;

        const result = await this.microsoftBatchProcessor.processMessagesBatch(
          messages,
          providerId,
          tenantId,
          accessToken,
          this.truncateText.bind(this),
        );
        messagesProcessed += result.processed;
        newMessages += result.created;
      }

      const latestReceivedDate = allMessages.length > 0 ? allMessages[0].receivedDateTime : undefined;

      if (latestReceivedDate) {
        this.logger.debug(`Most recent message timestamp: ${latestReceivedDate}`);
      }

      return {
        messagesProcessed,
        newMessages,
        latestReceivedDate,
      };
    } catch (error) {
      this.logger.error('Full sync error:', error);
      throw error;
    }
  }

  private async syncFullAndInitializeDelta(
    accessToken: string,
    email: string,
    providerId: string,
    tenantId: string,
  ): Promise<MicrosoftFullSyncInitResult> {
    const fullResult = await this.syncFull(accessToken, email, providerId, tenantId);

    let syncToken: string;
    let mode: MicrosoftSyncMode = 'delta';
    let latestTimestamp = fullResult.latestReceivedDate;

    try {
      syncToken = await this.initializeDeltaLink(accessToken);
      this.logger.debug('Initialized Microsoft delta link after full sync');
    } catch (error) {
      mode = 'timestamp';
      const errorMessage = this.extractErrorMessage(error);

      if (this.isDeltaUnsupportedError(error)) {
        this.logger.warn(
          'Microsoft account does not support change tracking; using timestamp fallback for incremental sync.',
        );
      } else {
        this.logger.warn(
          `Failed to initialize delta link via Microsoft Graph (reason: ${errorMessage}); falling back to timestamp tracking.`,
        );
      }

      if (!latestTimestamp) {
        latestTimestamp = new Date().toISOString();
      }
      syncToken = latestTimestamp;
    }

    return {
      messagesProcessed: fullResult.messagesProcessed,
      newMessages: fullResult.newMessages,
      syncToken,
      mode,
      latestTimestamp,
    };
  }

  private isDeltaUnsupportedError(error: any): boolean {
    const message: string | undefined =
      error?.response?.data?.error?.message || error?.message || error?.toString?.();
    const code: string | undefined = error?.response?.data?.error?.code;

    if (typeof message === 'string' && message.toLowerCase().includes('change tracking is not supported')) {
      return true;
    }

    if (typeof code === 'string' && code.toLowerCase().includes('changetracking')) {
      return true;
    }

    return false;
  }

  private normalizeTimestamp(timestamp?: Date | string): string | undefined {
    if (!timestamp) {
      return undefined;
    }

    if (timestamp instanceof Date) {
      return timestamp.toISOString();
    }

    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }

    return parsed.toISOString();
  }

  private async initializeDeltaLink(accessToken: string): Promise<string> {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };

    let requestUrl = `${this.GRAPH_API_BASE}/me/messages/delta?$select=id&$top=50`;
    let page = 0;
    const maxPages = 50;

    while (true) {
      if (page++ >= maxPages) {
        throw new Error(
          `Delta initialization exceeded ${maxPages} pages without receiving a delta link`,
        );
      }

      const response: AxiosResponse<MicrosoftDeltaResponse> =
        await axios.get<MicrosoftDeltaResponse>(requestUrl, { headers });
      const deltaLink = response.data['@odata.deltaLink'];
      const nextLink = response.data['@odata.nextLink'];

      if (deltaLink) {
        return deltaLink;
      }

      if (!nextLink) {
        throw new Error('Delta initialization ended without delta or next links from Microsoft Graph');
      }

      requestUrl = nextLink;
    }
  }


  private async msRequestWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    return this.retryService.withRetry(fn, {
      maxAttempts: this.retryMaxAttempts,
      delay429Ms: this.retry429DelayMs,
      delay5xxMs: this.retry5xxDelayMs,
      loggerName: 'MicrosoftGraph',
    });
  }

  /**
   * Batch update read/unread state via Graph /$batch and reflect locally.
   */
  private async batchUpdateReadState(
    accessToken: string,
    providerId: string,
    tenantId: string,
    messageIds: string[],
    isRead: boolean,
  ): Promise<void> {
    if (!messageIds.length) return;

    const chunkSize = Math.min(this.batchSize, 20);
    for (let i = 0; i < messageIds.length; i += chunkSize) {
      const slice = messageIds.slice(i, i + chunkSize);
      const requests = slice.map((id, idx) => ({
        id: `${idx}`,
        method: 'PATCH',
        url: `/me/messages/${id}`,
        body: { isRead },
        headers: { 'Content-Type': 'application/json' },
      }));

      await this.msRequestWithRetry(() =>
        axios.post(
          `${this.GRAPH_API_BASE}/$batch`,
          { requests },
          { headers: { Authorization: `Bearer ${accessToken}` } },
        ),
      );

      await this.prisma.email.updateMany({
        where: {
          providerId,
          tenantId,
          externalId: { in: slice },
        },
        data: {
          isRead,
          metadata: mergeEmailStatusMetadata(null, 'active'),
        },
      });
    }
  }

  /**
   * Batch move messages to another folder via Graph /$batch and reflect locally.
   */
  private async batchMoveMessages(
    accessToken: string,
    providerId: string,
    tenantId: string,
    messageIds: string[],
    destinationFolderId: string,
    destinationFolderName?: string,
  ): Promise<void> {
    if (!messageIds.length || !destinationFolderId) return;

    const chunkSize = Math.min(this.batchSize, 20);
    for (let i = 0; i < messageIds.length; i += chunkSize) {
      const slice = messageIds.slice(i, i + chunkSize);
      const requests = slice.map((id, idx) => ({
        id: `${idx}`,
        method: 'POST',
        url: `/me/messages/${id}/move`,
        body: { destinationId: destinationFolderId },
        headers: { 'Content-Type': 'application/json' },
      }));

      await this.msRequestWithRetry(() =>
        axios.post(
          `${this.GRAPH_API_BASE}/$batch`,
          { requests },
          { headers: { Authorization: `Bearer ${accessToken}` } },
        ),
      );

      await this.prisma.email.updateMany({
        where: {
          providerId,
          tenantId,
          externalId: { in: slice },
        },
        data: {
          folder: destinationFolderName ?? destinationFolderId,
          metadata: mergeEmailStatusMetadata(null, 'active'),
        },
      });
    }
  }

  /**
   * Process a single Microsoft message
   */
  private async processMessage(
    messageId: string,
    accessToken: string,
    providerId: string,
    tenantId: string,
  ): Promise<boolean> {
    try {
      const messages = await this.microsoftBatchProcessor.fetchMessagesBatch(
        accessToken,
        [messageId],
        this.batchSize,
        this.msRequestWithRetry.bind(this),
        this.extractErrorMessage.bind(this),
      );
      if (!messages.length) return false;

      const result = await this.microsoftBatchProcessor.processMessagesBatch(
        messages,
        providerId,
        tenantId,
        accessToken,
        this.truncateText.bind(this),
      );
      return result.processed > 0;
    } catch (error) {
      const message = this.extractErrorMessage(error);
      this.logger.error(`Failed to process Microsoft message ${messageId}: ${message}`);
      return false;
    }
  }

  private async handleRemoteRemoval(
    providerId: string,
    tenantId: string,
    externalId: string,
  ): Promise<void> {
    const affected = await this.prisma.email.findMany({
      where: {
        providerId,
        externalId,
      },
      select: {
        id: true,
      },
    });

    if (affected.length === 0) {
      return;
    }

    // Hard delete: remove emails permanently from database
    for (const record of affected) {
      try {
        await this.removeEmailPermanently(record.id, tenantId);
        this.notifyMicrosoftMailboxChange(tenantId, providerId, 'message-deleted', {
          emailId: record.id,
          externalId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to remove Microsoft email ${record.id} (external: ${externalId}): ${message}`,
        );
      }
    }
  }

  /**
   * Permanently remove an email from the database
   * Includes cleanup of attachments, embeddings, and S3 storage
   */
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
      const message = error instanceof Error ? error.message : String(error);
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
      const message = error instanceof Error ? error.message : String(error);
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
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to delete S3 objects for email ${emailId}: ${message}`);
        // Don't throw - email already deleted from DB
      }
    }
  }

  /**
   * Sync Microsoft mail folders
   */
  async syncMicrosoftFolders(tenantId: string, providerId: string): Promise<void> {
    return this.microsoftFolderService.syncMicrosoftFolders(tenantId, providerId);
  }

  private notifyMicrosoftMailboxChange(
    tenantId: string,
    providerId: string,
    reason: EmailEventReason,
    payload?: { emailId?: string; externalId?: string; folder?: string },
  ): void {
    // Microsoft-specific wrapper with suppressMessageEvents support
    this.realtimeEvents.notifyMailboxChange(tenantId, providerId, reason, payload, {
      suppressMessageEvents: this.suppressMessageEvents,
    });
  }
}
