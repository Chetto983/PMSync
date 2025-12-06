import { Injectable, Logger } from '@nestjs/common';
import { gmail_v1 } from 'googleapis';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CryptoService } from '../../../../common/services/crypto.service';
import { EmailEmbeddingJob, EmailEmbeddingQueueService } from '../../../ai/services/email-embedding.queue';
import { EmbeddingsService } from '../../../ai/services/embeddings.service';
import { GmailAttachmentHandler } from './gmail-attachment-handler';
import { GmailMessageParser, ParsedGmailMessage } from './gmail-message-parser';
import { mergeEmailStatusMetadata } from '../../utils/email-metadata.util';
import { shouldExcludeFolderWithLookup } from '../../utils/folder-exclusion.util';

/**
 * Gmail-specific batch processing service
 * Handles fetching and processing multiple Gmail messages efficiently
 *
 * Architectural pattern: Pluggable adapter (inspired by Mail-0/Zero)
 * - Provider-specific batch operations
 * - Clear separation from core sync logic
 * - Injectable dependencies for testability
 */
@Injectable()
export class GmailBatchProcessor {
  private readonly logger = new Logger(GmailBatchProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly gmailMessageParser: GmailMessageParser,
    private readonly gmailAttachmentHandler: GmailAttachmentHandler,
    private readonly emailEmbeddingQueue: EmailEmbeddingQueueService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  /**
   * Fetch Gmail messages in batch (batchGet if available, otherwise parallel get)
   *
   * @param gmail - Gmail API client
   * @param ids - Array of message IDs to fetch
   * @param format - Message format (full, metadata, minimal, raw)
   * @param withRetry - Retry wrapper function from BaseEmailSyncService
   * @param extractErrorMessage - Error message extractor from BaseEmailSyncService
   * @returns Array of Gmail messages
   */
  async fetchMessagesBatch(
    gmail: gmail_v1.Gmail,
    ids: string[],
    format: gmail_v1.Params$Resource$Users$Messages$Get['format'],
    withRetry: <T>(fn: () => Promise<T>) => Promise<T>,
    extractErrorMessage: (error: unknown) => string,
  ): Promise<gmail_v1.Schema$Message[]> {
    if (!ids.length) return [];

    const batchGet = (gmail.users.messages as any)?.batchGet;
    if (typeof batchGet === 'function') {
      try {
        const batchResponse = await withRetry<any>(() =>
          batchGet.call(gmail.users.messages, {
            userId: 'me',
            ids,
            format,
          }),
        );

        const responses = batchResponse.data.responses || [];
        return responses
          .map((r: { message?: gmail_v1.Schema$Message }) => r.message)
          .filter(
            (msg: gmail_v1.Schema$Message | undefined | null): msg is gmail_v1.Schema$Message =>
              !!msg?.id,
          );
      } catch (error) {
        this.logger.warn(
          `Gmail batchGet failed, falling back to parallel gets: ${extractErrorMessage(error)}`,
        );
      }
    }

    const chunkResponses = await Promise.all(
      ids.map((id) =>
        withRetry(() =>
          gmail.users.messages
            .get({ userId: 'me', id, format })
            .then((res) => res.data)
            .catch(() => null),
        ),
      ),
    );
    return chunkResponses.filter((msg): msg is gmail_v1.Schema$Message => !!msg?.id);
  }

  /**
   * Process a batch of Gmail messages (parse + persist + attachments + embeddings)
   *
   * @param messages - Gmail API message objects
   * @param providerId - Provider config ID
   * @param tenantId - Tenant ID
   * @param truncateText - Text truncation function from BaseEmailSyncService
   * @param createGmailClient - Gmail client factory from GoogleSyncService
   * @returns Number of processed and created messages
   */
  async processMessagesBatch(
    messages: gmail_v1.Schema$Message[],
    providerId: string,
    tenantId: string,
    truncateText: (text: string, maxLength: number) => string,
    createGmailClient: (accessToken: string) => gmail_v1.Gmail,
  ): Promise<{ processed: number; created: number }> {
    const parsed = messages
      .map((m) => this.gmailMessageParser.parseGmailMessage(m, truncateText))
      .filter((m): m is NonNullable<typeof m> => !!m);

    return this.processParsedMessagesBatch(parsed, providerId, tenantId, createGmailClient);
  }

  /**
   * Process parsed messages batch (persist + attachments + embeddings)
   * Handles database upserts, attachment processing, and embedding queueing
   *
   * @param mapped - Parsed Gmail messages
   * @param providerId - Provider config ID
   * @param tenantId - Tenant ID
   * @param createGmailClient - Gmail client factory from GoogleSyncService
   * @returns Number of processed and created messages
   */
  async processParsedMessagesBatch(
    mapped: ParsedGmailMessage[],
    providerId: string,
    tenantId: string,
    createGmailClient: (accessToken: string) => gmail_v1.Gmail,
  ): Promise<{ processed: number; created: number }> {
    if (!mapped.length) {
      return { processed: 0, created: 0 };
    }

    const safeMapped = mapped;

    const externalIds = safeMapped.map((m) => m.externalId);
    const existing = await this.prisma.email.findMany({
      where: {
        providerId,
        externalId: { in: externalIds },
      },
      select: {
        id: true,
        externalId: true,
        metadata: true,
      },
    });
    const existingMap = new Map(existing.map((e) => [e.externalId, e]));

    const creates = safeMapped.filter((m) => !existingMap.has(m.externalId));
    const updates = safeMapped.filter((m) => existingMap.has(m.externalId));

    if (creates.length) {
      await this.prisma.email.createMany({
        data: creates.map((m) => ({
          tenantId,
          providerId,
          externalId: m.externalId,
          threadId: m.threadId,
          messageId: m.messageIdHeader,
          inReplyTo: m.inReplyTo,
          references: m.references,
          from: m.from,
          to: m.to,
          cc: m.cc,
          bcc: m.bcc,
          subject: m.subject,
          bodyText: m.bodyText,
          bodyHtml: m.bodyHtml,
          snippet: m.snippet,
          folder: m.folder,
          labels: m.labels,
          isRead: m.isRead,
          isStarred: m.isStarred,
          isDeleted: m.isDeleted,
          sentAt: m.sentAt,
          receivedAt: m.receivedAt,
          size: m.size,
          headers: m.headers,
          metadata: mergeEmailStatusMetadata(null, m.metadataStatus),
        })),
        skipDuplicates: true,
      });
    }

    if (updates.length) {
      await Promise.all(
        updates.map(async (m) => {
          const existingEmail = existingMap.get(m.externalId);
          if (!existingEmail) return;

          const metadata = mergeEmailStatusMetadata(
            existingEmail.metadata as Record<string, any> | null,
            m.metadataStatus,
          );

          await this.prisma.email.update({
            where: { id: existingEmail.id },
            data: {
              labels: m.labels,
              folder: m.folder,
              isRead: m.isRead,
              isStarred: m.isStarred,
              isDeleted: m.isDeleted,
              metadata,
            },
          });
        }),
      );
    }

    // Fetch persisted records to drive embedding enqueue and attachment processing
    const persisted = await this.prisma.email.findMany({
      where: {
        providerId,
        externalId: { in: externalIds },
      },
      select: {
        id: true,
        externalId: true,
        receivedAt: true,
      },
    });
    const persistedMap = new Map(persisted.map((p) => [p.externalId, p]));

    // Get Gmail client for attachment downloads (if there are any attachments)
    const hasAttachments = mapped.some((m) => m.attachments.length > 0);
    let gmail: gmail_v1.Gmail | null = null;

    if (hasAttachments) {
      try {
        const provider = await this.prisma.providerConfig.findUnique({
          where: { id: providerId },
        });

        if (provider?.accessToken && provider.tokenEncryptionIv) {
          const accessToken = this.crypto.decrypt(
            provider.accessToken,
            provider.tokenEncryptionIv,
          );
          gmail = createGmailClient(accessToken);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.error(
          `Failed to create Gmail client for attachments: ${error.message}`,
        );
      }
    }

    const embeddingJobs: EmailEmbeddingJob[] = [];
    const attachmentPromises: Promise<void>[] = [];

    for (const m of mapped) {
      const persistedEmail = persistedMap.get(m.externalId);
      if (!persistedEmail) continue;

      // Check if folder should be excluded from embedding using specialUse lookup
      const isExcludedFolder = await shouldExcludeFolderWithLookup(this.prisma, providerId, m.folder);

      // Enqueue embedding job (skip for excluded folders like spam, trash, archive)
      if (!isExcludedFolder) {
        const alreadyEmbedded = await this.embeddingsService.hasEmbeddingForEmail(
          tenantId,
          persistedEmail.id,
        );
        if (!alreadyEmbedded) {
          embeddingJobs.push({
            tenantId,
            providerId,
            emailId: persistedEmail.id,
            subject: m.subject,
            snippet: m.snippet,
            bodyText: m.bodyText,
            bodyHtml: m.bodyHtml,
            from: m.from,
            receivedAt: persistedEmail.receivedAt,
          });
        }
      }

      // Process attachments if any
      if (m.attachments.length > 0 && gmail) {
        attachmentPromises.push(
          this.gmailAttachmentHandler.processEmailAttachments(
            gmail,
            persistedEmail.id,
            m.externalId,
            m.attachments,
            tenantId,
            providerId,
          ),
        );
      }
    }

    // Process attachments and embeddings in parallel
    const results = await Promise.allSettled([
      ...attachmentPromises,
      embeddingJobs.length > 0
        ? this.emailEmbeddingQueue.enqueueMany(embeddingJobs)
        : Promise.resolve(),
    ]);

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Failed to process attachment or embedding (index ${index}): ${result.reason}`,
        );
      }
    });

    return {
      processed: mapped.length,
      created: creates.length,
    };
  }
}
