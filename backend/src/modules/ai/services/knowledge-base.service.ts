import { BadRequestException, Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { MistralService } from './mistral.service';
import { EmbeddingsService } from './embeddings.service';
import { EmailEmbeddingQueueService } from './email-embedding.queue';
import { HtmlContentExtractor } from './html-content-extractor';
// AttachmentContentExtractorService removed - using on-demand Mistral OCR via agent tool
import { AiError } from '../errors';

interface BackfillResult {
  processed: number;
  embedded: number; // Number of emails queued for embedding
  skipped: number;
  remaining: number;
}

interface BackfillOptions {
  limit?: number;
  batchSize?: number;
  includeDeleted?: boolean;
}

interface ListEmbeddingsResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

interface CreateEmailEmbeddingOptions {
  tenantId: string;
  providerId?: string;
  emailId: string;
  subject: string;
  snippet?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  from?: string | null;
  receivedAt?: Date | string | null;
}

/**
 * Result from composing email content for embedding
 * Includes attachment metadata for on-demand OCR (agent tool)
 */
interface EmailContentResult {
  /** Email body content (without attachment content) */
  content: string | null;
  /** Whether the email has attachments */
  hasAttachments: boolean;
  /** Number of attachments */
  attachmentCount: number;
  /** Attachment IDs for on-demand extraction */
  attachmentIds: string[];
}

interface KnowledgeBaseSearchOptions {
  tenantId: string;
  query?: string;
  emailId?: string;
  limit?: number;
}

export interface KnowledgeBaseSearchHit {
  id: string;
  subject: string | null;
  /** Snippet may be null if embedding content was not stored (GDPR compliance) */
  snippet: string | null;
  source: string | null;
  emailId: string | null;
  from: string | null;
  receivedAt: string | null;
  distance: number | null;
  score: number | null;
  metadata: Record<string, any> | null;
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  /**
   * Maximum characters per embedding chunk.
   * Configurable via AI_EMBEDDING_CHUNK_SIZE env var (default: 6000)
   *
   * Note: Mistral's mistral-embed model has an 8192 token limit.
   * Since tokens ≠ characters (worst case ~1 token per 2-3 chars for code/special chars),
   * we use 6000 chars as a safe default to stay well under the limit.
   */
  private readonly maxCharsPerChunk: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistralService: MistralService,
    private readonly embeddingsService: EmbeddingsService,
    @Inject(forwardRef(() => EmailEmbeddingQueueService))
    private readonly emailEmbeddingQueue: EmailEmbeddingQueueService,
    // AttachmentContentExtractorService removed - using on-demand Mistral OCR via agent tool
    private readonly configService: ConfigService,
  ) {
    this.maxCharsPerChunk = this.configService.get<number>('AI_EMBEDDING_CHUNK_SIZE', 6000);
  }

  async backfillEmailEmbeddingsForTenant(
    tenantId: string,
    options: BackfillOptions = {},
  ): Promise<BackfillResult> {
    const limit = options.limit && options.limit > 0 ? options.limit : 100;
    const requestedBatchSize = options.batchSize && options.batchSize > 0 ? options.batchSize : 10;
    const batchSize = Math.min(requestedBatchSize, 10);
    const includeDeleted = options.includeDeleted ?? false;

    let processed = 0;
    let enqueued = 0;
    let skipped = 0;

    while (processed < limit) {
      const batchCount = Math.min(batchSize, limit - processed);
      const emails = await this.fetchEmailsWithoutEmbeddings(tenantId, batchCount, includeDeleted);

      if (emails.length === 0) {
        break;
      }

      for (const email of emails) {
        processed += 1;
        const contentPreview = this.composeEmailEmbeddingContent(email);

        if (!contentPreview) {
          skipped += 1;
          continue;
        }

        try {
          await this.emailEmbeddingQueue.enqueue({
            tenantId,
            providerId: email.providerId,
            emailId: email.id,
            subject: email.subject,
            snippet: email.snippet,
            bodyText: email.bodyText,
            bodyHtml: email.bodyHtml,
            from: email.from,
            receivedAt: email.receivedAt,
          });
          enqueued += 1;
        } catch (error) {
          skipped += 1;
          const message = AiError.fromError(error).message;
          this.logger.error(`Failed to enqueue embedding job for email ${email.id}: ${message}`);
        }
      }

      if (processed < limit && emails.length === batchCount) {
        await this.pauseBetweenBackfillBatches();
      }
    }

    const remaining = await this.countEmailsWithoutEmbeddings(tenantId, includeDeleted);

    return {
      processed,
      embedded: enqueued,
      skipped,
      remaining,
    };
  }

  /**
   * Create embeddings for multiple emails in a single batch operation
   * This is more efficient than calling createEmbeddingForEmail multiple times
   * @param emailOptions Array of email options to create embeddings for
   * @returns Array of results indicating success/failure for each email
   */
  async createBulkEmbeddingsForEmails(
    emailOptions: CreateEmailEmbeddingOptions[],
  ): Promise<Array<{ emailId: string; success: boolean; error?: string }>> {
    if (!emailOptions || emailOptions.length === 0) {
      return [];
    }

    const client = await this.mistralService.createMistralClient();
    const results: Array<{ emailId: string; success: boolean; error?: string }> = [];

    // Prepare all chunks from all emails
    const allChunksData: Array<{
      emailId: string;
      tenantId: string;
      subject: string;
      from: string | null;
      receivedAt: string | undefined;
      chunkIndex: number;
      chunkCount: number;
      content: string;
      // Attachment metadata for on-demand OCR
      hasAttachments: boolean;
      attachmentCount: number;
      attachmentIds: string[];
    }> = [];

    // First, compose content and chunk all emails
    for (const options of emailOptions) {
      // Check if embedding already exists BEFORE doing expensive work (attachment extraction)
      if (
        options.emailId &&
        (await this.embeddingsService.hasEmbeddingForEmail(options.tenantId, options.emailId))
      ) {
        this.logger.verbose(
          `Embedding already exists for email ${options.emailId} (tenant ${options.tenantId}), skipping.`,
        );
        results.push({ emailId: options.emailId, success: false, error: 'Already exists' });
        continue;
      }

      // Compose email content with attachment metadata (no upfront extraction)
      const contentResult = await this.composeEmailEmbeddingContentWithAttachments(
        {
          id: options.emailId,
          subject: options.subject,
          snippet: options.snippet ?? null,
          bodyText: options.bodyText ?? null,
          bodyHtml: options.bodyHtml ?? null,
        },
        options.tenantId,
      );

      if (!contentResult.content) {
        this.logger.debug(
          `Skipping embedding for email ${options.emailId} (tenant ${options.tenantId}): empty content`,
        );
        results.push({ emailId: options.emailId, success: false, error: 'Empty content' });
        continue;
      }

      const chunks = this.chunkContentForEmbedding(contentResult.content);
      const receivedAtIso =
        options.receivedAt instanceof Date
          ? options.receivedAt.toISOString()
          : options.receivedAt || undefined;

      // Delete existing embeddings for this email
      await this.deleteEmbeddingsForEmail(options.tenantId, options.emailId);

      // Add chunks to the batch (with attachment metadata for on-demand OCR)
      for (const chunk of chunks) {
        allChunksData.push({
          emailId: options.emailId,
          tenantId: options.tenantId,
          subject: options.subject,
          from: options.from ?? null,
          receivedAt: receivedAtIso,
          chunkIndex: chunk.index,
          chunkCount: chunks.length,
          content: chunk.content,
          hasAttachments: contentResult.hasAttachments,
          attachmentCount: contentResult.attachmentCount,
          attachmentIds: contentResult.attachmentIds,
        });
      }
    }

    if (allChunksData.length === 0) {
      this.logger.debug('No chunks to process in bulk embeddings');
      return results;
    }

    try {
      // Generate embeddings for all chunks in a single bulk operation
      this.logger.debug(`Generating embeddings for ${allChunksData.length} chunks from ${emailOptions.length} emails`);
      const allContents = allChunksData.map((c) => c.content);
      const embeddings = await this.mistralService.generateBulkEmbeddings(allContents, client);

      // Save all embeddings
      for (let i = 0; i < allChunksData.length; i++) {
        const chunkData = allChunksData[i];
        const embedding = embeddings[i];

        try {
          await this.embeddingsService.saveEmbedding({
            tenantId: chunkData.tenantId,
            embedding,
            model: this.mistralService.getEmbeddingModel(),
            documentName: chunkData.subject,
            emailId: chunkData.emailId, // ✅ Direct indexed field
            metadata: {
              source: 'email',
              emailId: chunkData.emailId, // Keep for backward compat
              subject: chunkData.subject,
              from: chunkData.from,
              receivedAt: chunkData.receivedAt ?? null,
              chunkIndex: chunkData.chunkIndex,
              chunkCount: chunkData.chunkCount,
              // Attachment metadata for on-demand OCR (agent tool)
              hasAttachments: chunkData.hasAttachments,
              attachmentCount: chunkData.attachmentCount,
              attachmentIds: chunkData.attachmentIds,
            },
          });
        } catch (saveError) {
          const message = saveError instanceof Error ? saveError.message : String(saveError);
          this.logger.warn(
            `Failed to save embedding for chunk ${chunkData.chunkIndex + 1}/${chunkData.chunkCount} of email ${chunkData.emailId}: ${message}`,
          );
        }
      }

      // Mark all emails as successful
      const processedEmailIds = new Set(allChunksData.map((c) => c.emailId));
      for (const emailId of processedEmailIds) {
        if (!results.find((r) => r.emailId === emailId)) {
          results.push({ emailId, success: true });
        }
      }

      this.logger.log(
        `Successfully created embeddings for ${processedEmailIds.size} emails with ${allChunksData.length} total chunks`,
      );
    } catch (bulkError) {
      const message = bulkError instanceof Error ? bulkError.message : String(bulkError);
      this.logger.error(`Bulk embedding generation failed for batch: ${message}`);

      // Fall back to individual processing
      for (const options of emailOptions) {
        if (!results.find((r) => r.emailId === options.emailId)) {
          try {
            const success = await this.createEmbeddingForEmail(options);
            results.push({ emailId: options.emailId, success });
          } catch (error) {
            const errorMsg = AiError.fromError(error).message;
            results.push({ emailId: options.emailId, success: false, error: errorMsg });
          }
        }
      }
    }

    return results;
  }

  async createEmbeddingForEmail(options: CreateEmailEmbeddingOptions): Promise<boolean> {
    // Check if embedding already exists BEFORE doing expensive work (attachment extraction)
    if (
      options.emailId &&
      (await this.embeddingsService.hasEmbeddingForEmail(options.tenantId, options.emailId))
    ) {
      this.logger.verbose(
        `Embedding already exists for email ${options.emailId} (tenant ${options.tenantId}), skipping.`,
      );
      return false;
    }

    // Compose email content with attachment metadata (no upfront extraction)
    const contentResult = await this.composeEmailEmbeddingContentWithAttachments(
      {
        id: options.emailId,
        subject: options.subject,
        snippet: options.snippet ?? null,
        bodyText: options.bodyText ?? null,
        bodyHtml: options.bodyHtml ?? null,
      },
      options.tenantId,
    );

    if (!contentResult.content) {
      this.logger.debug(
        `Skipping embedding for email ${options.emailId} (tenant ${options.tenantId}): empty content`,
      );
      return false;
    }

    try {
      const chunks = this.chunkContentForEmbedding(contentResult.content);

      if (chunks.length > 1) {
        this.logger.debug(
          `Email ${options.emailId} (tenant ${options.tenantId}) split into ${chunks.length} chunks for embedding.`,
        );
      }

      const client = await this.mistralService.createMistralClient();
      await this.deleteEmbeddingsForEmail(options.tenantId, options.emailId);

      const receivedAtIso =
        options.receivedAt instanceof Date
          ? options.receivedAt.toISOString()
          : options.receivedAt || undefined;

      let successfulChunks = 0;

      try {
        // Use bulk embeddings for better performance - single API call for all chunks
        const chunkContents = chunks.map((chunk) => chunk.content);
        const embeddings = await this.mistralService.generateBulkEmbeddings(chunkContents, client);

        // Save all embeddings
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = embeddings[i];

          try {
            await this.embeddingsService.saveEmbedding({
              tenantId: options.tenantId,
              embedding,
              model: this.mistralService.getEmbeddingModel(),
              documentName: options.subject,
              emailId: options.emailId, // ✅ Direct indexed field
              metadata: {
                source: 'email',
                emailId: options.emailId, // Keep for backward compat
                subject: options.subject,
                from: options.from ?? null,
                receivedAt: receivedAtIso ?? null,
                chunkIndex: chunk.index,
                chunkCount: chunks.length,
                // Attachment metadata for on-demand OCR (agent tool)
                hasAttachments: contentResult.hasAttachments,
                attachmentCount: contentResult.attachmentCount,
                attachmentIds: contentResult.attachmentIds,
              },
            });

            successfulChunks += 1;
          } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : String(saveError);
            this.logger.warn(
              `Failed to save embedding for chunk ${chunk.index + 1}/${chunks.length} of email ${options.emailId} (tenant ${options.tenantId}): ${message}`,
            );
          }
        }
      } catch (bulkError) {
        // If bulk operation fails, fall back to individual processing
        const message = bulkError instanceof Error ? bulkError.message : String(bulkError);
        this.logger.warn(
          `Bulk embedding generation failed for email ${options.emailId} (tenant ${options.tenantId}): ${message}. Falling back to individual processing.`,
        );

        // Fallback: process chunks individually
        for (const chunk of chunks) {
          try {
            const embedding = await this.mistralService.generateEmbedding(chunk.content, client, { tenantId: options.tenantId });

            await this.embeddingsService.saveEmbedding({
              tenantId: options.tenantId,
              embedding,
              model: this.mistralService.getEmbeddingModel(),
              documentName: options.subject,
              emailId: options.emailId, // ✅ Direct indexed field
              metadata: {
                source: 'email',
                emailId: options.emailId, // Keep for backward compat
                subject: options.subject,
                from: options.from ?? null,
                receivedAt: receivedAtIso ?? null,
                chunkIndex: chunk.index,
                chunkCount: chunks.length,
                // Attachment metadata for on-demand OCR (agent tool)
                hasAttachments: contentResult.hasAttachments,
                attachmentCount: contentResult.attachmentCount,
                attachmentIds: contentResult.attachmentIds,
              },
            });

            successfulChunks += 1;
          } catch (chunkError) {
            const chunkMessage = chunkError instanceof Error ? chunkError.message : String(chunkError);
            this.logger.warn(
              `Failed embedding chunk ${chunk.index + 1}/${chunks.length} for email ${options.emailId} (tenant ${options.tenantId}): ${chunkMessage}`,
            );
          }
        }
      }

      return successfulChunks > 0;
    } catch (error) {
      const message = AiError.fromError(error).message;
      this.logger.warn(
        `Failed to create embedding for email ${options.emailId} (tenant ${options.tenantId}): ${message}`,
      );
      return false;
    }
  }

  async listEmbeddings<T = any>(
    tenantId: string,
    params: { limit?: number; offset?: number } = {},
  ): Promise<ListEmbeddingsResult<T>> {
    const limit = params.limit && params.limit > 0 && params.limit < 200 ? params.limit : 25;
    const offset = params.offset && params.offset >= 0 ? params.offset : 0;

    const embeddings = await this.prisma.embedding.findMany({
      where: { tenantId },
      select: {
        id: true,
        documentName: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });

    const total = await this.prisma.embedding.count({
      where: { tenantId },
    });

    return {
      items: embeddings as unknown as T[],
      total,
      limit,
      offset,
    };
  }

  async deleteEmbedding(tenantId: string, embeddingId: string): Promise<void> {
    const existing = await this.prisma.embedding.findFirst({
      where: {
        id: embeddingId,
        tenantId,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new Error('Embedding not found for this tenant');
    }

    await this.prisma.embedding.deleteMany({
      where: { id: embeddingId, tenantId },
    });
  }

  async deleteEmbeddingsForEmail(tenantId: string, emailId: string): Promise<number> {
    if (!emailId) {
      return 0;
    }
    return this.deleteEmbeddingsForEmails(tenantId, [emailId]);
  }

  async deleteEmbeddingsForEmails(tenantId: string, emailIds: string[]): Promise<number> {
    if (!emailIds || emailIds.length === 0) {
      return 0;
    }

    const batchSize = 50;
    let totalDeleted = 0;

    for (let i = 0; i < emailIds.length; i += batchSize) {
      const batch = emailIds.slice(i, i + batchSize).filter(Boolean);
      if (batch.length === 0) {
        continue;
      }

      // ✅ FIXED: Use indexed emailId field instead of slow JSONB metadata path
      // Before: metadata.path['emailId'] = O(n) full scan
      // After:  emailId field with @@index = O(log n)
      const result = await this.prisma.embedding.deleteMany({
        where: {
          tenantId,
          emailId: { in: batch },
        },
      });

      totalDeleted += result.count;
    }

    return totalDeleted;
  }

  async searchKnowledgeBase(options: KnowledgeBaseSearchOptions): Promise<{
    usedQuery: string;
    items: KnowledgeBaseSearchHit[];
  }> {
    const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 10) : 5;
    const trimmedQuery = options.query?.trim() ?? '';
    let searchText = trimmedQuery;

    if (!searchText && options.emailId) {
      const email = await this.prisma.email.findFirst({
        where: { id: options.emailId, tenantId: options.tenantId },
        select: {
          subject: true,
          snippet: true,
          bodyText: true,
          bodyHtml: true,
        },
      });

      if (email) {
        searchText =
          this.composeEmailEmbeddingContent({
            subject: email.subject ?? null,
            snippet: email.snippet,
            bodyText: email.bodyText,
            bodyHtml: email.bodyHtml,
          }) ?? '';
      }
    }

    if (!searchText) {
      throw new BadRequestException(
        'Provide a free-text query or an email with content to search the knowledge base.',
      );
    }

    // Generate embedding (caching is now handled internally by MistralService) - GDPR: tenant-isolated
    const client = await this.mistralService.createMistralClient();
    const embedding = await this.mistralService.generateEmbedding(searchText, client, { tenantId: options.tenantId });

    const matches = await this.embeddingsService.findSimilarContent(
      options.tenantId,
      embedding,
      limit,
    );

    if (!matches.length) {
      return {
        usedQuery: searchText,
        items: [],
      };
    }

    const items = await this.hydrateKnowledgeHits(matches, options.tenantId);

    return {
      usedQuery: searchText,
      items,
    };
  }


  /**
   * GDPR-compliant: Hydrate knowledge hits by fetching content from source tables.
   * Embeddings no longer store content - use emailId/contactId to JOIN.
   */
  private async hydrateKnowledgeHits(
    matches: Array<{
      id: string;
      documentName: string | null;
      metadata: any;
      distance?: number;
      emailId?: string | null;
      contactId?: string | null;
    }>,
    tenantId: string,
  ): Promise<KnowledgeBaseSearchHit[]> {
    const metadataList = matches.map((match) => this.normaliseMetadata(match.metadata));

    const emailIds = Array.from(
      new Set(
        metadataList
          .map((meta) => (this.isString(meta.emailId) ? (meta.emailId) : null))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const emailMap = await this.fetchEmailHydrationMap(tenantId, emailIds);

    return matches.map((match, index) => {
      const metadata = metadataList[index];
      const emailId = this.isString(metadata.emailId) ? (metadata.emailId) : null;
      const emailDetails = emailId ? emailMap.get(emailId) : undefined;

      const subject =
        (this.isString(metadata.subject) && metadata.subject.trim()) ||
        emailDetails?.subject ||
        match.documentName ||
        null;

      const from =
        (this.isString(metadata.from) && metadata.from.trim()) || emailDetails?.from || null;

      const receivedAt =
        (this.isString(metadata.receivedAt) && metadata.receivedAt) ||
        emailDetails?.receivedAt ||
        null;

      const source =
        (this.isString(metadata.source) && metadata.source) || (emailId ? 'email' : null);

      const distance =
        typeof match.distance === 'number' && Number.isFinite(match.distance)
          ? match.distance
          : null;
      const score =
        distance === null
          ? null
          : Number((1 - Math.min(Math.max(distance, 0), 1)).toFixed(3));

      // GDPR-compliant: Get snippet from source table (Email), not from embedding
      const snippet = emailDetails?.snippet
        ? this.truncateMemorySnippet(emailDetails.snippet)
        : null;

      return {
        id: match.id,
        subject,
        snippet,
        source,
        emailId,
        from,
        receivedAt,
        distance,
        score,
        metadata: Object.keys(metadata).length ? metadata : null,
      };
    });
  }

  /**
   * GDPR-compliant: Fetch email details including snippet for hydration.
   * Since embeddings no longer store content, we fetch it from the Email table.
   */
  private async fetchEmailHydrationMap(
    tenantId: string,
    emailIds: string[],
  ): Promise<Map<string, { subject: string | null; from: string | null; receivedAt: string | null; snippet: string | null }>> {
    if (!emailIds.length) {
      return new Map();
    }

    const rows = await this.prisma.email.findMany({
      where: {
        tenantId,
        id: {
          in: emailIds,
        },
      },
      select: {
        id: true,
        subject: true,
        from: true,
        receivedAt: true,
        snippet: true, // GDPR-compliant: Fetch content from source table
      },
    });

    return new Map(
      rows.map((row) => [
        row.id,
        {
          subject: row.subject,
          from: row.from,
          receivedAt: row.receivedAt ? row.receivedAt.toISOString() : null,
          snippet: row.snippet, // GDPR-compliant: Content from source table
        },
      ]),
    );
  }

  private normaliseMetadata(value: unknown): Record<string, any> {
    if (!value || typeof value !== 'object') {
      return {};
    }
    return value as Record<string, any>;
  }

  private truncateMemorySnippet(value: string, limit = 320): string {
    if (!value) {
      return '';
    }

    const normalised = value.replace(/\s+/g, ' ').trim();
    return normalised.length > limit ? `${normalised.slice(0, limit)}...` : normalised;
  }

  private isString(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
  }

  private async fetchEmailsWithoutEmbeddings(
    tenantId: string,
    limit: number,
    includeDeleted: boolean,
  ): Promise<
    Array<{
      id: string;
      providerId: string;
      subject: string;
      snippet: string | null;
      bodyText: string | null;
      bodyHtml: string | null;
      from: string | null;
      receivedAt: Date | null;
    }>
  > {
    const deletedCondition = includeDeleted
      ? Prisma.sql`TRUE`
      : Prisma.sql`e."isDeleted" = FALSE`;

    const rows = await this.prisma.$queryRaw<Array<any>>(
      Prisma.sql`
        SELECT
          e."id",
          e."providerId",
          e."subject",
          e."snippet",
          e."bodyText",
          e."bodyHtml",
          e."from",
          e."receivedAt"
        FROM "emails" e
        LEFT JOIN "embeddings" emb
          ON emb."emailId" = e."id" AND emb."tenantId" = e."tenantId"
        WHERE emb."id" IS NULL
          AND e."tenantId" = ${tenantId}
          AND ${deletedCondition}
        ORDER BY e."receivedAt" DESC NULLS LAST
        LIMIT ${limit};
      `,
    );

    return rows;
  }

  private async countEmailsWithoutEmbeddings(tenantId: string, includeDeleted: boolean): Promise<number> {
    const deletedCondition = includeDeleted
      ? Prisma.sql`TRUE`
      : Prisma.sql`e."isDeleted" = FALSE`;

    const result = await this.prisma.$queryRaw<Array<{ remaining: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS remaining
        FROM "emails" e
        LEFT JOIN "embeddings" emb
          ON emb."emailId" = e."id" AND emb."tenantId" = e."tenantId"
        WHERE emb."id" IS NULL
          AND e."tenantId" = ${tenantId}
          AND ${deletedCondition};
      `,
    );

    const remaining = result?.[0]?.remaining ?? BigInt(0);
    return Number(remaining);
  }

  private async pauseBetweenBackfillBatches(): Promise<void> {
    const pauseMs = 1000;
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }

  private composeEmailEmbeddingContent(email: {
    subject: string | null;
    snippet: string | null;
    bodyText: string | null;
    bodyHtml: string | null;
  }): string | null {
    const pieces: string[] = [];

    if (email.subject) {
      pieces.push(`Oggetto: ${email.subject}`);
    }

    // Priority: bodyHtml > bodyText > snippet
    // If HTML is available, use it (it's usually more complete)
    // bodyText is often a plain-text duplicate of bodyHtml
    if (email.bodyHtml) {
      // Use Readability to extract clean content from HTML
      const extracted = HtmlContentExtractor.extractMainContent(email.bodyHtml);
      if (extracted) {
        pieces.push(extracted);
      }
    } else if (email.bodyText?.trim()) {
      pieces.push(email.bodyText.trim());
    } else if (email.snippet) {
      pieces.push(email.snippet);
    }

    const combined = pieces.join('\n\n').trim();
    return combined.length > 0 ? combined : null;
  }

  /**
   * Compose email content for embedding WITH attachment metadata (no upfront extraction)
   *
   * COST-SAVING APPROACH:
   * - Only embeds email body (subject, body, snippet)
   * - Stores attachment metadata (hasAttachments, attachmentCount, attachmentIds)
   * - Agent uses on-demand Mistral OCR when it needs attachment content
   *
   * @returns EmailContentResult with content and attachment metadata
   */
  private async composeEmailEmbeddingContentWithAttachments(
    email: {
      id: string;
      subject: string | null;
      snippet: string | null;
      bodyText: string | null;
      bodyHtml: string | null;
    },
    tenantId: string,
  ): Promise<EmailContentResult> {
    const pieces: string[] = [];

    if (email.subject) {
      pieces.push(`Oggetto: ${email.subject}`);
    }

    // Email body (same as original method)
    if (email.bodyHtml) {
      const extracted = HtmlContentExtractor.extractMainContent(email.bodyHtml);
      if (extracted) pieces.push(extracted);
    } else if (email.bodyText?.trim()) {
      pieces.push(email.bodyText.trim());
    } else if (email.snippet) {
      pieces.push(email.snippet);
    }

    // Query attachment metadata (NO content extraction - on-demand via agent tool)
    let hasAttachments = false;
    let attachmentCount = 0;
    let attachmentIds: string[] = [];

    try {
      const attachments = await this.prisma.emailAttachment.findMany({
        where: {
          emailId: email.id,
          isInline: false, // Skip inline images
          email: { tenantId },
        },
        select: {
          id: true,
        },
      });

      attachmentCount = attachments.length;
      hasAttachments = attachmentCount > 0;
      attachmentIds = attachments.map((att) => att.id);

      if (hasAttachments) {
        this.logger.debug(
          `Email ${email.id} has ${attachmentCount} attachments (on-demand OCR available via agent tool)`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to query attachment metadata for email ${email.id}: ${AiError.fromError(error).message}`,
      );
      // Continue without attachment metadata (graceful degradation)
    }

    const combined = pieces.join('\n\n').trim();
    return {
      content: combined.length > 0 ? combined : null,
      hasAttachments,
      attachmentCount,
      attachmentIds,
    };
  }

  private chunkContentForEmbedding(content: string): Array<{ content: string; index: number }> {
    const maxChars = this.maxCharsPerChunk;

    if (content.length <= maxChars) {
      return [{ content, index: 0 }];
    }

    const chunks: Array<{ content: string; index: number }> = [];
    let start = 0;
    let index = 0;

    while (start < content.length) {
      let end = Math.min(start + maxChars, content.length);

      if (end < content.length) {
        const lastBreak = content.lastIndexOf('\n', end);
        if (lastBreak > start + maxChars * 0.5) {
          end = lastBreak;
        }
      }

      const chunkContent = content.slice(start, end).trim();
      if (chunkContent.length > 0) {
        chunks.push({ content: chunkContent, index });
        index += 1;
      }

      start = end;
    }

    return chunks;
  }

  // ============================================
  // AUDIT-11: Embedding TTL/Retention Management
  // ============================================

  /**
   * Default retention period for embeddings (90 days)
   * Can be overridden via environment variable EMBEDDING_RETENTION_DAYS
   */
  private static readonly DEFAULT_RETENTION_DAYS = 90;

  /**
   * Clean up old embeddings based on retention policy
   *
   * @param tenantId - Tenant to clean up (optional, null = all tenants)
   * @param retentionDays - Number of days to retain (default: 90)
   * @returns Number of embeddings deleted
   */
  async cleanupOldEmbeddings(
    tenantId?: string,
    retentionDays: number = KnowledgeBaseService.DEFAULT_RETENTION_DAYS,
  ): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const whereClause: { createdAt: { lt: Date }; tenantId?: string } = {
      createdAt: { lt: cutoffDate },
    };

    if (tenantId) {
      whereClause.tenantId = tenantId;
    }

    const result = await this.prisma.embedding.deleteMany({
      where: whereClause,
    });

    if (result.count > 0) {
      this.logger.log(
        `Cleaned up ${result.count} embeddings older than ${retentionDays} days` +
        (tenantId ? ` for tenant ${tenantId}` : ' (all tenants)'),
      );
    }

    return result.count;
  }

  /**
   * Get embedding statistics including age distribution
   *
   * @param tenantId - Tenant to get stats for (required)
   * @returns Embedding statistics
   */
  async getEmbeddingStats(tenantId: string): Promise<{
    total: number;
    byAge: {
      last24h: number;
      last7d: number;
      last30d: number;
      last90d: number;
      older: number;
    };
    oldestCreatedAt: Date | null;
    newestCreatedAt: Date | null;
  }> {
    const now = new Date();
    const d24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const d7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const d30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const d90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [total, last24h, last7d, last30d, last90d, oldest, newest] = await Promise.all([
      this.prisma.embedding.count({ where: { tenantId } }),
      this.prisma.embedding.count({ where: { tenantId, createdAt: { gte: d24h } } }),
      this.prisma.embedding.count({ where: { tenantId, createdAt: { gte: d7d } } }),
      this.prisma.embedding.count({ where: { tenantId, createdAt: { gte: d30d } } }),
      this.prisma.embedding.count({ where: { tenantId, createdAt: { gte: d90d } } }),
      this.prisma.embedding.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.embedding.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      total,
      byAge: {
        last24h,
        last7d,
        last30d,
        last90d,
        older: total - last90d,
      },
      oldestCreatedAt: oldest?.createdAt ?? null,
      newestCreatedAt: newest?.createdAt ?? null,
    };
  }

  /**
   * Bulk delete embeddings by email IDs with batching
   * More efficient than individual deletes for large cleanups
   *
   * @param tenantId - Tenant ID
   * @param emailIds - Array of email IDs to delete embeddings for
   * @param batchSize - Size of each delete batch (default: 100)
   * @returns Total number of embeddings deleted
   */
  async bulkDeleteEmbeddingsByEmailIds(
    tenantId: string,
    emailIds: string[],
    batchSize: number = 100,
  ): Promise<number> {
    if (!emailIds || emailIds.length === 0) {
      return 0;
    }

    let totalDeleted = 0;

    for (let i = 0; i < emailIds.length; i += batchSize) {
      const batch = emailIds.slice(i, i + batchSize).filter(Boolean);
      if (batch.length === 0) continue;

      // ✅ FIXED: Use indexed emailId field instead of slow JSONB metadata path
      const result = await this.prisma.embedding.deleteMany({
        where: { tenantId, emailId: { in: batch } },
      });

      totalDeleted += result.count;
    }

    if (totalDeleted > 0) {
      this.logger.log(
        `Bulk deleted ${totalDeleted} embeddings for ${emailIds.length} emails (tenant: ${tenantId})`,
      );
    }

    return totalDeleted;
  }

  // ============================================================================
  // CONTACT EMBEDDINGS
  // ============================================================================

  /**
   * Create embedding for a contact.
   * Content includes: displayName, company, jobTitle, notes, tags, emails, phones.
   */
  async createEmbeddingForContact(options: {
    tenantId: string;
    contactId: string;
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    department?: string | null;
    notes?: string | null;
    tags?: string[];
    emails?: { value: string; type?: string }[] | null;
    phoneNumbers?: { value: string; type?: string }[] | null;
  }): Promise<boolean> {
    // Check if embedding already exists
    if (await this.embeddingsService.hasEmbeddingForContact(options.tenantId, options.contactId)) {
      this.logger.verbose(
        `Embedding already exists for contact ${options.contactId} (tenant ${options.tenantId}), skipping.`,
      );
      return false;
    }

    const content = this.composeContactEmbeddingContent(options);

    if (!content) {
      this.logger.debug(
        `Skipping embedding for contact ${options.contactId} (tenant ${options.tenantId}): empty content`,
      );
      return false;
    }

    try {
      const chunks = this.chunkContentForEmbedding(content);

      if (chunks.length > 1) {
        this.logger.debug(
          `Contact ${options.contactId} split into ${chunks.length} chunks for embedding.`,
        );
      }

      const client = await this.mistralService.createMistralClient();
      await this.deleteEmbeddingsForContact(options.tenantId, options.contactId);

      let successfulChunks = 0;

      try {
        const chunkContents = chunks.map((chunk) => chunk.content);
        const embeddings = await this.mistralService.generateBulkEmbeddings(chunkContents, client);

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = embeddings[i];

          try {
            await this.embeddingsService.saveEmbedding({
              tenantId: options.tenantId,
              embedding,
              model: this.mistralService.getEmbeddingModel(),
              documentName: options.displayName || `Contact ${options.contactId}`,
              contactId: options.contactId, // ✅ Direct indexed field
              metadata: {
                source: 'contact',
                contactId: options.contactId,
                displayName: options.displayName ?? null,
                company: options.company ?? null,
                chunkIndex: chunk.index,
                chunkCount: chunks.length,
              },
            });

            successfulChunks += 1;
          } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : String(saveError);
            this.logger.warn(
              `Failed to save embedding for contact chunk ${chunk.index + 1}/${chunks.length}: ${message}`,
            );
          }
        }
      } catch (_bulkError) {
        // Fallback to individual processing
        for (const chunk of chunks) {
          try {
            const embedding = await this.mistralService.generateEmbedding(
              chunk.content,
              client,
              { tenantId: options.tenantId },
            );

            await this.embeddingsService.saveEmbedding({
              tenantId: options.tenantId,
              embedding,
              model: this.mistralService.getEmbeddingModel(),
              documentName: options.displayName || `Contact ${options.contactId}`,
              contactId: options.contactId,
              metadata: {
                source: 'contact',
                contactId: options.contactId,
                displayName: options.displayName ?? null,
                company: options.company ?? null,
                chunkIndex: chunk.index,
                chunkCount: chunks.length,
              },
            });

            successfulChunks += 1;
          } catch (chunkError) {
            const chunkMessage = chunkError instanceof Error ? chunkError.message : String(chunkError);
            this.logger.warn(`Failed embedding chunk for contact: ${chunkMessage}`);
          }
        }
      }

      return successfulChunks > 0;
    } catch (error) {
      const message = AiError.fromError(error).message;
      this.logger.warn(`Failed to create embedding for contact ${options.contactId}: ${message}`);
      return false;
    }
  }

  /**
   * Compose content string for contact embedding.
   * Prioritizes: name, company, job, notes, tags, contact info.
   */
  private composeContactEmbeddingContent(options: {
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    department?: string | null;
    notes?: string | null;
    tags?: string[];
    emails?: { value: string; type?: string }[] | null;
    phoneNumbers?: { value: string; type?: string }[] | null;
  }): string {
    const parts: string[] = [];

    // Name (most important for semantic search)
    const name = options.displayName
      || [options.firstName, options.lastName].filter(Boolean).join(' ')
      || null;
    if (name) {
      parts.push(`Name: ${name}`);
    }

    // Professional context
    if (options.company) {
      parts.push(`Company: ${options.company}`);
    }
    if (options.jobTitle) {
      parts.push(`Job Title: ${options.jobTitle}`);
    }
    if (options.department) {
      parts.push(`Department: ${options.department}`);
    }

    // Notes (rich context for semantic search)
    if (options.notes) {
      parts.push(`Notes: ${options.notes}`);
    }

    // Tags (categorical context)
    if (options.tags && options.tags.length > 0) {
      parts.push(`Tags: ${options.tags.join(', ')}`);
    }

    // Contact info (for exact matching)
    if (options.emails && Array.isArray(options.emails)) {
      const emailList = options.emails.map((e) => e.value).filter(Boolean).join(', ');
      if (emailList) {
        parts.push(`Emails: ${emailList}`);
      }
    }

    if (options.phoneNumbers && Array.isArray(options.phoneNumbers)) {
      const phoneList = options.phoneNumbers.map((p) => p.value).filter(Boolean).join(', ');
      if (phoneList) {
        parts.push(`Phones: ${phoneList}`);
      }
    }

    return parts.join('\n').trim();
  }

  /**
   * Delete embeddings for a single contact.
   */
  async deleteEmbeddingsForContact(tenantId: string, contactId: string): Promise<number> {
    if (!contactId) {
      return 0;
    }

    // ✅ Use indexed contactId field
    const result = await this.prisma.embedding.deleteMany({
      where: { tenantId, contactId },
    });

    return result.count;
  }

  /**
   * Bulk delete embeddings by contact IDs with batching.
   */
  async bulkDeleteEmbeddingsByContactIds(
    tenantId: string,
    contactIds: string[],
    batchSize: number = 100,
  ): Promise<number> {
    if (!contactIds || contactIds.length === 0) {
      return 0;
    }

    let totalDeleted = 0;

    for (let i = 0; i < contactIds.length; i += batchSize) {
      const batch = contactIds.slice(i, i + batchSize).filter(Boolean);
      if (batch.length === 0) continue;

      // ✅ Use indexed contactId field
      const result = await this.prisma.embedding.deleteMany({
        where: { tenantId, contactId: { in: batch } },
      });

      totalDeleted += result.count;
    }

    if (totalDeleted > 0) {
      this.logger.log(
        `Bulk deleted ${totalDeleted} embeddings for ${contactIds.length} contacts (tenant: ${tenantId})`,
      );
    }

    return totalDeleted;
  }
}
