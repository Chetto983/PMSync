import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../../../prisma/prisma.service';
import { EmailEmbeddingJob, EmailEmbeddingQueueService } from '../../../ai/services/email-embedding.queue';
import { EmbeddingsService } from '../../../ai/services/embeddings.service';
import { MicrosoftAttachmentHandler } from './microsoft-attachment-handler';
import { MicrosoftMessageParser, ParsedMicrosoftMessage } from './microsoft-message-parser';
import { mergeEmailStatusMetadata } from '../../utils/email-metadata.util';
import { shouldExcludeFolderWithLookup } from '../../utils/folder-exclusion.util';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';

/**
 * Microsoft-specific batch processing service
 * Handles fetching and processing multiple Microsoft messages efficiently
 *
 * Architectural pattern: Pluggable adapter (inspired by Mail-0/Zero)
 * - Provider-specific batch operations
 * - Clear separation from core sync logic
 * - Injectable dependencies for testability
 */
@Injectable()
export class MicrosoftBatchProcessor {
  private readonly logger = new Logger(MicrosoftBatchProcessor.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

  constructor(
    private readonly prisma: PrismaService,
    private readonly microsoftMessageParser: MicrosoftMessageParser,
    private readonly microsoftAttachmentHandler: MicrosoftAttachmentHandler,
    private readonly emailEmbeddingQueue: EmailEmbeddingQueueService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  /**
   * Fetch Microsoft messages in batch ($batch API or sequential fallback)
   *
   * @param accessToken - Microsoft access token
   * @param ids - Array of message IDs to fetch
   * @param batchSize - Batch size for chunking
   * @param msRequestWithRetry - Retry wrapper function from MicrosoftSyncService
   * @param extractErrorMessage - Error message extractor from BaseEmailSyncService
   * @returns Array of Microsoft messages
   */
  async fetchMessagesBatch(
    accessToken: string,
    ids: string[],
    batchSize: number,
    msRequestWithRetry: <T>(fn: () => Promise<T>) => Promise<T>,
    extractErrorMessage: (error: unknown) => string,
  ): Promise<any[]> {
    if (!ids.length) return [];

    const results: any[] = [];
    for (let i = 0; i < ids.length; i += batchSize) {
      const slice = ids.slice(i, i + batchSize);
      const requests = slice.map((id, idx) => ({
        id: `${idx}`,
        method: 'GET',
        url: `/me/messages/${id}`,
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'outlook.body-content-type="html"',
        },
      }));

      try {
        const resp = await msRequestWithRetry(() =>
          axios.post(
            `${this.GRAPH_API_BASE}/$batch`,
            { requests },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            },
          ),
        );
        const responses = resp.data?.responses ?? [];
        responses.forEach((r: any) => {
          if (r?.status === 200 && r.body?.id) {
            results.push(r.body);
          }
        });
      } catch (error) {
        this.logger.warn(
          `Microsoft batch fetch failed for ${slice.length} ids, fallback to sequential: ${extractErrorMessage(error)}`,
        );
        const sequential = await Promise.all(
          slice.map((id) =>
            axios
              .get(`${this.GRAPH_API_BASE}/me/messages/${id}`, {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  Prefer: 'outlook.body-content-type="html"',
                },
              })
              .then((res) => res.data)
              .catch(() => null),
          ),
        );
        sequential.filter(Boolean).forEach((m) => results.push(m));
      }
    }

    return results;
  }

  /**
   * Process a batch of Microsoft messages (parse + persist + attachments + embeddings)
   *
   * @param messages - Microsoft Graph API message objects
   * @param providerId - Provider config ID
   * @param tenantId - Tenant ID
   * @param accessToken - Microsoft access token (optional, for attachments)
   * @param truncateText - Text truncation function from BaseEmailSyncService
   * @param msRequestWithRetry - Optional retry wrapper for Microsoft API calls
   * @returns Number of processed and created messages
   */
  async processMessagesBatch(
    messages: any[],
    providerId: string,
    tenantId: string,
    accessToken: string | undefined,
    truncateText: (text: string, maxLength: number) => string,
    msRequestWithRetry?: <T>(fn: () => Promise<T>) => Promise<T>,
  ): Promise<{ processed: number; created: number }> {
    const parsed: ParsedMicrosoftMessage[] = [];

    for (const msg of messages) {
      const mapped = await this.microsoftMessageParser.parseMicrosoftMessage(
        msg,
        providerId,
        truncateText,
      );
      if (mapped) {
        parsed.push(mapped);
      }
    }

    return this.processParsedMessagesBatch(parsed, providerId, tenantId, accessToken, msRequestWithRetry);
  }

  /**
   * Process parsed messages batch (persist + attachments + embeddings)
   * Handles database upserts, attachment processing, and embedding queueing
   *
   * @param mapped - Parsed Microsoft messages
   * @param providerId - Provider config ID
   * @param tenantId - Tenant ID
   * @param accessToken - Microsoft access token (optional, for attachments)
   * @param msRequestWithRetry - Optional retry wrapper for Microsoft API calls (defaults to no-retry passthrough)
   * @returns Number of processed and created messages
   */
  async processParsedMessagesBatch(
    mapped: ParsedMicrosoftMessage[],
    providerId: string,
    tenantId: string,
    accessToken?: string,
    msRequestWithRetry: <T>(fn: () => Promise<T>) => Promise<T> = async (fn) => fn(),
  ): Promise<{ processed: number; created: number }> {
    if (!mapped.length) return { processed: 0, created: 0 };

    const externalIds = mapped.map((m) => m.externalId);
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
    const creates = mapped.filter((m) => !existingMap.has(m.externalId));
    const updates = mapped.filter((m) => existingMap.has(m.externalId));

    if (creates.length) {
      await this.prisma.email.createMany({
        data: creates.map((m) => ({
          tenantId,
          providerId,
          externalId: m.externalId,
          threadId: m.threadId,
          messageId: m.messageIdHeader ?? undefined,
          inReplyTo: null,
          references: null,
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
          isFlagged: m.isFlagged,
          isDeleted: m.isDeleted,
          sentAt: m.sentAt,
          receivedAt: m.receivedAt,
          size: m.size,
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

          // Update email and fetch full object with emailLabels
          const updatedEmail = await this.prisma.email.update({
            where: { id: existingEmail.id },
            data: {
              labels: m.labels,
              folder: m.folder,
              isRead: m.isRead,
              isStarred: m.isStarred,
              isFlagged: m.isFlagged,
              isDeleted: m.isDeleted,
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

      // Process attachments if any and accessToken is available
      if (m.hasAttachments && accessToken) {
        attachmentPromises.push(
          this.microsoftAttachmentHandler.processMicrosoftAttachments(
            accessToken,
            persistedEmail.id,
            m.externalId,
            tenantId,
            providerId,
            msRequestWithRetry,
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

    return { processed: mapped.length, created: creates.length };
  }
}
