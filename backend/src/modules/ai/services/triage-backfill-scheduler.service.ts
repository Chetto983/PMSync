import { Job, Queue, Worker } from 'bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailTriageService } from './email-triage.service';
import { getRedisConnectionOptions, QUEUE_NAMES } from '../../../common/config';

interface BackfillJobData {
  type: 'scheduled' | 'manual';
  tenantId?: string; // Optional: specific tenant
  userId?: string; // Optional: specific user
}

interface BackfillResult {
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  tenantsProcessed: number;
}

/**
 * Automatic triage backfill scheduler using BullMQ.
 * Finds emails with isAutoTriaged=false and triggers triage.
 *
 * Similar pattern to EmbeddingBackfillSchedulerService.
 *
 * @see EmbeddingBackfillSchedulerService for reference implementation
 */
@Injectable()
export class TriageBackfillSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TriageBackfillSchedulerService.name);
  private queue!: Queue<BackfillJobData>;
  private worker!: Worker<BackfillJobData, BackfillResult>;

  // Configuration
  private readonly ENABLED: boolean;
  private readonly INTERVAL_MS: number;
  private readonly BATCH_SIZE: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly triageService: EmailTriageService,
    private readonly configService: ConfigService,
  ) {
    this.ENABLED =
      (this.configService.get<string>('TRIAGE_BACKFILL_ENABLED') || 'true').toLowerCase() !== 'false';
    this.INTERVAL_MS = parseInt(
      this.configService.get<string>('TRIAGE_BACKFILL_INTERVAL_MS', '3600000'), // 1 hour default
      10,
    );
    this.BATCH_SIZE = parseInt(
      this.configService.get<string>('TRIAGE_BACKFILL_BATCH_SIZE', '20'),
      10,
    );
  }

  async onModuleInit() {
    if (!this.ENABLED) {
      this.logger.warn('TriageBackfillScheduler disabled via TRIAGE_BACKFILL_ENABLED=false');
      return;
    }

    const connection = getRedisConnectionOptions();

    // Create queue
    this.queue = new Queue<BackfillJobData>(QUEUE_NAMES.TRIAGE_BACKFILL || 'triage-backfill', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000,
        },
        removeOnComplete: 50,
        removeOnFail: 20,
      },
    });

    // Create worker
    this.worker = new Worker<BackfillJobData, BackfillResult>(
      QUEUE_NAMES.TRIAGE_BACKFILL || 'triage-backfill',
      async (job: Job<BackfillJobData>) => {
        return this.processBackfillJob(job);
      },
      {
        connection,
        concurrency: 1, // Only one backfill job at a time
        lockDuration: 300000, // 5 minute lock
      },
    );

    this.worker.on('completed', (_job, result) => {
      if (result.processed > 0) {
        this.logger.log(
          `Triage backfill completed: ${result.successful} successful, ${result.failed} failed, ${result.tenantsProcessed} tenants`,
        );
      }
    });

    this.worker.on('failed', (_job, error) => {
      this.logger.error(`Triage backfill job failed: ${error?.message ?? error}`);
    });

    // Setup repeatable job
    await this.setupRepeatableJob();

    this.logger.log(
      `TriageBackfillScheduler enabled: interval ${this.INTERVAL_MS / 60000} minutes`,
    );

    // Run immediately on startup (don't wait for first interval)
    this.triggerManualBackfill().catch((err) => {
      this.logger.warn(`Initial backfill trigger failed: ${err?.message || err}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  private async setupRepeatableJob() {
    // Remove existing repeatable job
    const repeatableJobs = await this.queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.name === 'scheduled-triage-backfill') {
        await this.queue.removeRepeatableByKey(job.key);
      }
    }

    // Add new repeatable job
    await this.queue.add(
      'scheduled-triage-backfill',
      { type: 'scheduled' },
      {
        repeat: {
          every: this.INTERVAL_MS,
        },
        jobId: 'triage-backfill-scheduled',
      },
    );
  }

  /**
   * Process a backfill job - finds untriaged emails and triggers triage
   */
  private async processBackfillJob(job: Job<BackfillJobData>): Promise<BackfillResult> {
    const { tenantId, userId } = job.data;

    // Find tenants with untriaged emails
    const tenantsToProcess = await this.findTenantsWithUntriagedEmails(tenantId);

    if (tenantsToProcess.length === 0) {
      this.logger.debug('No untriaged emails found');
      return { processed: 0, successful: 0, failed: 0, skipped: 0, tenantsProcessed: 0 };
    }

    this.logger.log(`Found ${tenantsToProcess.length} tenants with untriaged emails`);

    let totalProcessed = 0;
    let totalSuccessful = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    for (const tenant of tenantsToProcess) {
      try {
        // Get first user for this tenant (simplified - in production might need per-user)
        const targetUserId = userId || tenant.userId;

        if (!targetUserId) {
          this.logger.warn(`No userId found for tenant ${tenant.tenantId}, skipping`);
          continue;
        }

        const result = await this.triageService.processUntriagedEmails({
          tenantId: tenant.tenantId,
          userId: targetUserId,
        });

        totalProcessed += result.processed;
        totalSuccessful += result.successful;
        totalFailed += result.failed;
        totalSkipped += result.skipped;

        // Update job progress
        await job.updateProgress({
          tenantsProcessed: tenantsToProcess.indexOf(tenant) + 1,
          totalTenants: tenantsToProcess.length,
          processed: totalProcessed,
          successful: totalSuccessful,
        });

        // Small delay between tenants
        await this.sleep(1000);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to process triage for tenant ${tenant.tenantId}: ${message}`);
      }
    }

    return {
      processed: totalProcessed,
      successful: totalSuccessful,
      failed: totalFailed,
      skipped: totalSkipped,
      tenantsProcessed: tenantsToProcess.length,
    };
  }

  /**
   * Find tenants with untriaged emails
   */
  private async findTenantsWithUntriagedEmails(
    specificTenantId?: string,
  ): Promise<Array<{ tenantId: string; userId: string | null; count: number }>> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 48); // Last 48 hours

    // Skip folders (based on actual DB values - all UPPERCASE)
    const skipFolders = ['SPAM', 'TRASH', 'SENT', 'DRAFTS', 'ARCHIVE'];

    const whereClause: Record<string, unknown> = {
      isAutoTriaged: false,
      receivedAt: { gte: cutoff },
      folder: { notIn: skipFolders },
      isDeleted: false,
      isDraft: false,
    };

    if (specificTenantId) {
      whereClause.tenantId = specificTenantId;
    }

    const results = await this.prisma.email.groupBy({
      by: ['tenantId'],
      where: whereClause,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 50, // Limit to prevent overload
    });

    // Get a userId for each tenant (from providerConfig)
    const tenantsWithUsers = await Promise.all(
      results.map(async (r) => {
        const provider = await this.prisma.providerConfig.findFirst({
          where: { tenantId: r.tenantId },
          select: { userId: true },
        });
        return {
          tenantId: r.tenantId,
          userId: provider?.userId ?? null,
          count: r._count.id,
        };
      }),
    );

    return tenantsWithUsers.filter((t) => t.userId !== null);
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
    pendingEmails: number;
    queueStats: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    } | null;
  }> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 48);

    const pendingEmails = await this.prisma.email.count({
      where: {
        isAutoTriaged: false,
        receivedAt: { gte: cutoff },
        folder: { notIn: ['spam', 'junk', 'trash', '[gmail]/spam', '[gmail]/trash'] },
        isDeleted: false,
        isDraft: false,
      },
    });

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
      pendingEmails,
      queueStats,
    };
  }

  /**
   * Manually trigger a triage backfill run
   */
  async triggerManualBackfill(tenantId?: string, userId?: string): Promise<{ jobId: string }> {
    if (!this.queue) {
      throw new Error('Triage backfill queue not initialized');
    }

    const job = await this.queue.add(
      'manual-triage-backfill',
      { type: 'manual', tenantId, userId },
      {
        priority: 1,
        jobId: `manual-triage-backfill-${Date.now()}`,
      },
    );

    this.logger.log(
      `Manual triage backfill triggered${tenantId ? ` for tenant ${tenantId}` : ''}, job ID: ${job.id}`,
    );

    return { jobId: job.id ?? 'unknown' };
  }
}
