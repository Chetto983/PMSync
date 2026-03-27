import { Job, Queue, Worker } from 'bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { EmailEmbeddingQueueService } from './email-embedding.queue';
import { EmbeddingsService } from './embeddings.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping';

interface BackfillJobData {
  type: 'scheduled' | 'manual';
  batchSize?: number;
}

interface BackfillResult {
  processed: number;
  enqueued: number;
  remaining: number;
  rateLimited: boolean;
}

/**
 * Automatic embedding backfill scheduler using BullMQ.
 * Runs as a repeatable job every 10 minutes to find and process orphan emails.
 * Optimized for 1000+ tenants with:
 * - Single efficient query across all tenants (LEFT JOIN to find missing)
 * - Rate limit handling with exponential backoff (via BullMQ retries)
 * - Distributed locking via Redis (only one instance runs)
 * - Persisted state across restarts
 */
@Injectable()
export class EmbeddingBackfillSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmbeddingBackfillSchedulerService.name);
  private queue!: Queue<BackfillJobData>;
  private worker!: Worker<BackfillJobData, BackfillResult>;

  // Configuration
  private readonly BATCH_SIZE: number;
  private readonly ENABLED: boolean;
  private readonly INTERVAL_MS: number;
  private readonly BACKFILL_DAYS: number; // Option C: Limit history
  private readonly REINDEX_BATCH: number; // Max old-format embeddings to purge per run

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailEmbeddingQueue: EmailEmbeddingQueueService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly configService: ConfigService,
  ) {
    this.BATCH_SIZE = parseInt(
      this.configService.get<string>('EMBEDDING_BACKFILL_BATCH_SIZE', '50'),
      10,
    );
    this.ENABLED =
      (this.configService.get<string>('EMBEDDING_BACKFILL_ENABLED') || 'true').toLowerCase() !== 'false';
    this.INTERVAL_MS = parseInt(
      this.configService.get<string>('EMBEDDING_BACKFILL_INTERVAL_MS', '600000'), // 10 minutes
      10,
    );
    this.BACKFILL_DAYS = parseInt(
      this.configService.get<string>('EMBEDDING_BACKFILL_DAYS', '30'), // Default 30 days
      10,
    );
    this.REINDEX_BATCH = parseInt(
      this.configService.get<string>('EMBEDDING_REINDEX_BATCH', '100'),
      10,
    );
  }

  async onModuleInit() {
    if (!this.ENABLED) {
      this.logger.warn('EmbeddingBackfillScheduler disabled via EMBEDDING_BACKFILL_ENABLED=false');
      return;
    }

    const connection = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: Number(this.configService.get<number>('REDIS_PORT', 6379)),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      lazyConnect: true,
    };

    // Create queue
    this.queue = new Queue<BackfillJobData>('embedding-backfill', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000, // 1 minute base delay for retries
        },
        removeOnComplete: 100, // Keep last 100 completed jobs for monitoring
        removeOnFail: 50,
      },
    });

    // Create worker
    this.worker = new Worker<BackfillJobData, BackfillResult>(
      'embedding-backfill',
      async (job: Job<BackfillJobData>) => {
        return withoutTenantScopingAsync(() => this.processBackfillJob(job));
      },
      {
        connection,
        concurrency: 1, // Only one backfill job at a time
        lockDuration: 300000, // 5 minute lock (backfill can be slow)
      },
    );

    this.worker.on('completed', (_job, result) => {
      if (result.enqueued > 0) {
        this.logger.log(
          `Backfill job completed: processed ${result.processed}, enqueued ${result.enqueued}, remaining ${result.remaining}`,
        );
      }
    });

    this.worker.on('failed', (_job, error) => {
      this.logger.error(`Backfill job failed: ${error?.message ?? error}`);
    });

    // Setup repeatable job (runs every 10 minutes)
    await this.setupRepeatableJob();

    this.logger.log(
      `EmbeddingBackfillScheduler enabled: batch size ${this.BATCH_SIZE}, interval ${this.INTERVAL_MS / 60000} minutes`,
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  /**
   * Setup repeatable job for automatic backfill
   */
  private async setupRepeatableJob() {
    // Remove existing repeatable job to avoid duplicates on restart
    const repeatableJobs = await this.queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.name === 'scheduled-backfill') {
        await this.queue.removeRepeatableByKey(job.key);
      }
    }

    // Add new repeatable job
    await this.queue.add(
      'scheduled-backfill',
      { type: 'scheduled', batchSize: this.BATCH_SIZE },
      {
        repeat: {
          every: this.INTERVAL_MS,
        },
        jobId: 'embedding-backfill-scheduled',
      },
    );
  }

  /**
   * Process a backfill job
   */
  private async processBackfillJob(job: Job<BackfillJobData>): Promise<BackfillResult> {
    const batchSize = job.data.batchSize ?? this.BATCH_SIZE;

    // Phase S11: Purge old-format embeddings so they become orphans for re-embedding
    await this.purgeStaleEmbeddings();

    // Find orphan emails (emails without embeddings)
    const orphanEmails = await this.findOrphanEmails(batchSize);

    if (orphanEmails.length === 0) {
      this.logger.debug('No orphan emails found, all embeddings up to date');
      return { processed: 0, enqueued: 0, remaining: 0, rateLimited: false };
    }

    this.logger.log(`Found ${orphanEmails.length} emails without embeddings, processing...`);

    let enqueued = 0;
    let rateLimited = false;

    for (const email of orphanEmails) {
      if (rateLimited) break;

      try {
        // Double-check embedding doesn't exist (race condition protection)
        const alreadyEmbedded = await this.embeddingsService.hasEmbeddingForEmail(
          email.tenantId,
          email.id,
        );

        if (alreadyEmbedded) {
          continue; // Skip, already processed
        }

        await this.emailEmbeddingQueue.enqueue({
          tenantId: email.tenantId,
          providerId: email.providerId,
          emailId: email.id,
          subject: email.subject || '',
          snippet: email.snippet || '',
          bodyText: email.bodyText || '',
          bodyHtml: email.bodyHtml || '',
          from: email.from || '',
          to: email.to || [],
          receivedAt: email.receivedAt || new Date(),
        });

        enqueued++;

        // Update job progress
        if (enqueued % 10 === 0) {
          await job.updateProgress({
            processed: orphanEmails.length,
            enqueued,
          });
          // Small delay to avoid flooding
          await this.sleep(50);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Detect rate limit errors
        if (message.includes('rate') || message.includes('429') || message.includes('1300')) {
          this.logger.warn(`Rate limit hit during backfill: ${message}`);
          rateLimited = true;
        } else {
          this.logger.warn(`Failed to queue embedding for email ${email.id}: ${message}`);
        }
      }
    }

    const remaining = await this.countOrphanEmails();

    return {
      processed: orphanEmails.length,
      enqueued,
      remaining,
      rateLimited,
    };
  }

  /**
   * Folders to exclude from embedding (spam, trash, archive)
   * These are checked against both specialUse and folder name patterns
   */
  private static readonly EXCLUDED_SPECIAL_USE = ['SPAM', 'TRASH', 'ARCHIVE', 'JUNK', 'DELETED', 'DRAFTS'];
  private static readonly EXCLUDED_FOLDER_PATTERNS = [
    'spam', 'junk', 'trash', 'deleted', 'archive', 'draft', 'drafts',
    'posta indesiderata', 'cestino', 'eliminat', 'archivi', 'bozz', // Italian (root forms: bozze/bozza)
    '[gmail]/spam', '[gmail]/trash', '[gmail]/all mail', '[gmail]/drafts',
    'deleted items', 'junk email', 'junk e-mail',
  ];

  /**
   * Find emails without embeddings across all tenants.
   * Efficient single query using LEFT JOIN.
   * Excludes spam, deleted, and archived emails.
   */
  private async findOrphanEmails(limit: number): Promise<
    Array<{
      id: string;
      tenantId: string;
      providerId: string;
      subject: string | null;
      snippet: string | null;
      bodyText: string | null;
      bodyHtml: string | null;
      from: string | null;
      to: string[] | null;
      receivedAt: Date | null;
    }>
  > {
    // Build the folder exclusion pattern for SQL ILIKE
    const excludedPatterns = EmbeddingBackfillSchedulerService.EXCLUDED_FOLDER_PATTERNS;
    const excludedSpecialUse = EmbeddingBackfillSchedulerService.EXCLUDED_SPECIAL_USE;

    // Build OR conditions for folder pattern exclusion
    const patternConditions = Prisma.join(
      excludedPatterns.map((pattern) =>
        Prisma.sql`LOWER(COALESCE(e."folder", '')) LIKE ${`%${pattern.toLowerCase()}%`}`,
      ),
      ' OR ',
    );

    // Option C: Limit to recent history
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - this.BACKFILL_DAYS);

    const rows = await this.prisma.$queryRaw<Array<any>>(
      Prisma.sql`
        SELECT
          e."id",
          e."tenantId",
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
        LEFT JOIN "folders" f
          ON f."providerId" = e."providerId"
          AND (f."path" = e."folder" OR f."name" = e."folder" OR f."externalId" = e."folder")
        WHERE emb."id" IS NULL
          AND e."isDeleted" = FALSE
          AND e."receivedAt" > ${limitDate}
          -- Exclude by specialUse
          AND (f."specialUse" IS NULL OR f."specialUse" NOT IN (${Prisma.join(excludedSpecialUse)}))
          -- Exclude by folder name patterns (case insensitive)
          AND NOT (${patternConditions})
        ORDER BY e."receivedAt" DESC NULLS LAST
        LIMIT ${limit};
      `,
    );

    return rows;
  }

  /**
   * Count total orphan emails (excluding spam, deleted, archived)
   */
  private async countOrphanEmails(): Promise<number> {
    const excludedPatterns = EmbeddingBackfillSchedulerService.EXCLUDED_FOLDER_PATTERNS;
    const excludedSpecialUse = EmbeddingBackfillSchedulerService.EXCLUDED_SPECIAL_USE;

    // Build OR conditions for folder pattern exclusion
    const patternConditions = Prisma.join(
      excludedPatterns.map((pattern) =>
        Prisma.sql`LOWER(COALESCE(e."folder", '')) LIKE ${`%${pattern.toLowerCase()}%`}`,
      ),
      ' OR ',
    );

    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - this.BACKFILL_DAYS);

    const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "emails" e
        LEFT JOIN "embeddings" emb
          ON emb."emailId" = e."id" AND emb."tenantId" = e."tenantId"
        LEFT JOIN "folders" f
          ON f."providerId" = e."providerId"
          AND (f."path" = e."folder" OR f."name" = e."folder" OR f."externalId" = e."folder")
        WHERE emb."id" IS NULL
          AND e."isDeleted" = FALSE
          AND e."receivedAt" > ${limitDate}
          -- Exclude by specialUse
          AND (f."specialUse" IS NULL OR f."specialUse" NOT IN (${Prisma.join(excludedSpecialUse)}))
          -- Exclude by folder name patterns (case insensitive)
          AND NOT (${patternConditions});
      `,
    );

    return Number(result?.[0]?.count ?? BigInt(0));
  }

  /**
   * Purge old-format embeddings (missing enriched metadata) so the regular
   * backfill re-embeds them with From/To/Date headers and chunk overlap.
   * Detects old format by checking metadata->'to' IS NULL.
   * Rate-limited to REINDEX_BATCH per run (default 100).
   */
  private async purgeStaleEmbeddings(): Promise<void> {
    try {
      const result = await this.prisma.$executeRaw(
        Prisma.sql`
          DELETE FROM "embeddings"
          WHERE "id" IN (
            SELECT "id" FROM "embeddings"
            WHERE "emailId" IS NOT NULL
              AND ("metadata"->'to' IS NULL)
            LIMIT ${this.REINDEX_BATCH}
          )
        `,
      );

      if (result > 0) {
        this.logger.log(
          `Purged ${result} old-format embeddings for re-indexing with enriched metadata`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to purge stale embeddings: ${message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current backfill status
   */
  async getStatus(): Promise<{
    enabled: boolean;
    intervalMinutes: number;
    batchSize: number;
    missingEmbeddings: number;
    queueStats: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    } | null;
  }> {
    const missingEmbeddings = await this.countOrphanEmails();

    let queueStats = null;
    if (this.queue) {
      const [waiting, active, completed, failed] = await Promise.all([
        this.queue.getWaitingCount(),
        this.queue.getActiveCount(),
        this.queue.getCompletedCount(),
        this.queue.getFailedCount(),
      ]);
      queueStats = { waiting, active, completed, failed };
    }

    return {
      enabled: this.ENABLED,
      intervalMinutes: this.INTERVAL_MS / 60000,
      batchSize: this.BATCH_SIZE,
      missingEmbeddings,
      queueStats,
    };
  }

  /**
   * Manually trigger a backfill run
   */
  async triggerManualBackfill(): Promise<{ jobId: string }> {
    if (!this.queue) {
      throw new Error('Backfill queue not initialized');
    }

    const job = await this.queue.add(
      'manual-backfill',
      { type: 'manual', batchSize: this.BATCH_SIZE * 2 },
      {
        priority: 1, // Higher priority than scheduled jobs
        jobId: `manual-backfill-${Date.now()}`,
      },
    );

    this.logger.log(`Manual backfill triggered, job ID: ${job.id}`);

    return { jobId: job.id ?? 'unknown' };
  }
}
