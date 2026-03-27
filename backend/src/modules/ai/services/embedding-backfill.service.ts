import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { EMAIL_EMBEDDING_QUEUE, IEmailEmbeddingQueue } from '../../../common/interfaces/embedding-queue.interface';
import { HtmlContentExtractor } from './html-content-extractor';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Result from backfill operation
 */
export interface BackfillResult {
  /** Total emails processed in this batch */
  processed: number;
  /** Emails successfully enqueued for embedding */
  embedded: number;
  /** Emails skipped (empty content or enqueue failure) */
  skipped: number;
  /** Remaining emails without embeddings */
  remaining: number;
}

/**
 * Options for backfill operation
 */
export interface BackfillOptions {
  /** Maximum emails to process (default: 100) */
  limit?: number;
  /** Emails per batch (max 10) */
  batchSize?: number;
  /** Include soft-deleted emails (default: false) */
  includeDeleted?: boolean;
}

/**
 * Embedding statistics for a tenant
 */
export interface EmbeddingStats {
  /** Total embeddings count */
  total: number;
  /** Breakdown by age bucket */
  byAge: {
    last24h: number;
    last7d: number;
    last30d: number;
    last90d: number;
    older: number;
  };
  /** Oldest embedding timestamp */
  oldestCreatedAt: Date | null;
  /** Newest embedding timestamp */
  newestCreatedAt: Date | null;
}

/**
 * Email data for backfill processing
 */
export interface EmailForBackfill {
  id: string;
  providerId: string;
  subject: string;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  from: string | null;
  to: string[] | null;
  receivedAt: Date | null;
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * EmbeddingBackfillService - Batch backfill and stats for email embeddings
 *
 * Extracted from KnowledgeBaseService to isolate backfill orchestration.
 *
 * KEY BEHAVIORS:
 * - Raw SQL with LEFT JOIN to efficiently find emails without embeddings
 * - Batch size capped at 10 to avoid rate limiting
 * - 1 second pause between batches for API throttling
 * - Default 90-day retention for cleanup
 * - Multi-tenant isolation on all operations
 *
 * @see knowledge-base.service.ts lines 106-169, 772-841, 1002-1085 (original)
 */
@Injectable()
export class EmbeddingBackfillService {
  private readonly logger = new Logger(EmbeddingBackfillService.name);

  /** Maximum batch size per API call (rate limiting protection) */
  private static readonly MAX_BATCH_SIZE = 10;

  /** Pause between batches in milliseconds */
  private static readonly BATCH_PAUSE_MS = 1000;

  /** Default retention period for embeddings (days) */
  private static readonly DEFAULT_RETENTION_DAYS = 90;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_EMBEDDING_QUEUE)
    private readonly emailEmbeddingQueue: IEmailEmbeddingQueue,
  ) {}

  // ============================================================================
  // BACKFILL ORCHESTRATION
  // ============================================================================

  /**
   * Backfill email embeddings for a tenant.
   * Processes emails without embeddings in batches.
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param options - Backfill options (limit, batchSize, includeDeleted)
   * @returns BackfillResult with processed/embedded/skipped/remaining counts
   */
  async backfillEmailEmbeddingsForTenant(
    tenantId: string,
    options: BackfillOptions = {},
  ): Promise<BackfillResult> {
    const limit = options.limit && options.limit > 0 ? options.limit : 100;
    const requestedBatchSize = options.batchSize && options.batchSize > 0 ? options.batchSize : 10;
    const batchSize = Math.min(requestedBatchSize, EmbeddingBackfillService.MAX_BATCH_SIZE);
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
            to: email.to,
            receivedAt: email.receivedAt,
          });
          enqueued += 1;
        } catch (error) {
          skipped += 1;
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to enqueue embedding job for email ${email.id}: ${message}`);
        }
      }

      // Pause between batches to avoid rate limiting
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

  // ============================================================================
  // EMAIL QUERIES (Raw SQL for efficiency)
  // ============================================================================

  /**
   * Fetch emails without embeddings using raw SQL LEFT JOIN.
   * Much more efficient than separate queries for large datasets.
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param limit - Maximum emails to return
   * @param includeDeleted - Include soft-deleted emails
   * @returns Array of emails for embedding
   */
  async fetchEmailsWithoutEmbeddings(
    tenantId: string,
    limit: number,
    includeDeleted: boolean,
  ): Promise<EmailForBackfill[]> {
    const deletedCondition = includeDeleted
      ? Prisma.sql`TRUE`
      : Prisma.sql`e."isDeleted" = FALSE`;

    const rows = await this.prisma.$queryRaw<EmailForBackfill[]>(
      Prisma.sql`
        SELECT
          e."id",
          e."providerId",
          e."subject",
          e."snippet",
          e."bodyText",
          e."bodyHtml",
          e."from",
          e."to",
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

  /**
   * Count emails without embeddings using raw SQL LEFT JOIN.
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param includeDeleted - Include soft-deleted emails
   * @returns Count of emails needing embeddings
   */
  async countEmailsWithoutEmbeddings(tenantId: string, includeDeleted: boolean): Promise<number> {
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

  // ============================================================================
  // CLEANUP & RETENTION
  // ============================================================================

  /**
   * Clean up old embeddings based on retention policy.
   * Deletes embeddings older than retentionDays.
   *
   * @param tenantId - Optional tenant ID (null = all tenants)
   * @param retentionDays - Days to retain (default: 90)
   * @returns Number of embeddings deleted
   */
  async cleanupOldEmbeddings(
    tenantId?: string,
    retentionDays: number = EmbeddingBackfillService.DEFAULT_RETENTION_DAYS,
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

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Get embedding statistics including age distribution.
   *
   * @param tenantId - Tenant ID (required)
   * @returns Embedding statistics with age breakdown
   */
  async getEmbeddingStats(tenantId: string): Promise<EmbeddingStats> {
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

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Pause between backfill batches to avoid rate limiting.
   */
  private async pauseBetweenBackfillBatches(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, EmbeddingBackfillService.BATCH_PAUSE_MS));
  }

  /**
   * Compose email content for embedding (simplified version).
   * Used for content validation before enqueuing.
   *
   * Priority: bodyHtml > bodyText > snippet
   *
   * @param email - Email data
   * @returns Composed content or null if empty
   */
  private composeEmailEmbeddingContent(email: {
    subject: string;
    snippet: string | null;
    bodyText: string | null;
    bodyHtml: string | null;
  }): string | null {
    const pieces: string[] = [];

    if (email.subject) {
      pieces.push(`Subject: ${email.subject}`);
    }

    // Priority: bodyHtml > bodyText > snippet
    if (email.bodyHtml) {
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
}
