import { Job, Queue, Worker } from 'bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailTriageService } from './email-triage.service';
import { TriageLearningService } from './triage-learning.service';
import { getRedisConnectionOptions, QUEUE_NAMES } from '../../../common/config';
import { RedisConnectionService } from '../../../common/services/redis-connection.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping';
import { processDecayGcForTenant } from './triage-decay-gc.helpers';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter, Gauge } from 'prom-client';
import type { Redis } from 'ioredis';

interface BackfillJobData {
  type: 'scheduled' | 'manual' | 'recalculation' | 'decay-gc';
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

/** Folders excluded from backfill and recalculation */
const SKIP_FOLDERS = ['SPAM', 'TRASH', 'SENT', 'DRAFTS', 'ARCHIVE'];

/** Automatic triage backfill scheduler + nightly recalculation using BullMQ. */
@Injectable()
export class TriageBackfillSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TriageBackfillSchedulerService.name);
  private queue!: Queue<BackfillJobData>;
  private worker!: Worker<BackfillJobData, BackfillResult>;

  // Configuration
  private readonly ENABLED: boolean;
  private readonly INTERVAL_MS: number;
  private readonly BATCH_SIZE: number;
  private readonly MAX_AGE_HOURS: number;
  /** Phase 149 D-02/D-03: configured decay half-life in days (env TRIAGE_DECAY_HALF_LIFE_DAYS, default 14). */
  private readonly halfLifeDays: number;
  /** Phase 149 D-04: Redis client for GC sweeps. Lazy-init at onModuleInit. */
  private redis: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly triageService: EmailTriageService,
    private readonly configService: ConfigService,
    @Optional() private readonly triageLearningService?: TriageLearningService,
    @Optional() private readonly redisConnection?: RedisConnectionService,
    @Optional() @InjectMetric('triage_patterns_gc_total')
    private readonly gcCounter?: Counter<string>,
    @Optional() @InjectMetric('triage_decay_half_life_seconds')
    private readonly halfLifeGauge?: Gauge<string>,
    @Optional() @InjectMetric('triage_decay_last_run_timestamp_seconds')
    private readonly lastRunGauge?: Gauge<string>,
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
    const maxAgeDays = parseInt(
      this.configService.get<string>('TRIAGE_BACKFILL_MAX_AGE_DAYS', '7'),
      10,
    );
    this.MAX_AGE_HOURS = maxAgeDays * 24;

    // Phase 149 D-02: same env var used by TriageLearningService and TriageCorrectionService.
    // Clamp floor to 1 to prevent divide-by-zero in GC math (T-149-04-03).
    const rawHalfLife = parseInt(
      this.configService.get<string>('TRIAGE_DECAY_HALF_LIFE_DAYS', '14'),
      10,
    );
    this.halfLifeDays = Math.max(
      1,
      Number.isFinite(rawHalfLife) ? rawHalfLife : 14,
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
        return withoutTenantScopingAsync(async () => {
          // Phase 149 D-09: decay-gc branch checked FIRST so the new job type
          // takes precedence; the GC sweep runs before recalc reads patterns.
          if (job.data.type === 'decay-gc') {
            return this.processDecayGc(job);
          }
          if (job.data.type === 'recalculation') {
            return this.processRecalculation(job);
          }
          return this.processBackfillJob(job);
        });
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
      `TriageBackfillScheduler enabled: interval ${this.INTERVAL_MS / 60000}min, max age ${this.MAX_AGE_HOURS / 24}d`,
    );

    // Phase 149 D-11: expose configured half-life as a gauge (seconds — Prometheus base unit).
    this.halfLifeGauge?.set(this.halfLifeDays * 86400);

    // Phase 149 D-04: capture Redis client for GC sweeps. Null if RedisConnectionService
    // is not provided (test harnesses) — GC body no-ops on the Redis store.
    this.redis = this.redisConnection?.client ?? null;

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
    // Remove existing repeatable jobs — includes legacy 'nightly-recalculation'
    // so old deploys' repeatable entries get cleaned up (BullMQ multi-instance safety).
    const repeatableJobs = await this.queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (
        job.name === 'scheduled-triage-backfill' ||
        job.name === 'nightly-recalculation' ||
        job.name === 'nightly-decay-gc'
      ) {
        await this.queue.removeRepeatableByKey(job.key);
      }
    }

    // Add hourly backfill job
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

    // Phase 149 D-08/D-09: nightly decay-GC job. Runs GC sweep first, then
    // delegates to processRecalculation internally (D-09 ordering: clean
    // patterns before recalc reads them). Replaces legacy 'nightly-recalculation'
    // — the old name is in the cleanup list above so prior-deploy repeatables
    // don't double-fire during transition.
    await this.queue.add(
      'nightly-decay-gc',
      { type: 'decay-gc' },
      {
        repeat: { pattern: '0 3 * * *' }, // 3 AM daily
        jobId: 'triage-nightly-decay-gc',
      },
    );

    this.logger.debug(
      'Repeatable jobs configured: hourly backfill + nightly decay-GC',
    );
  }

  /**
   * Process a backfill job - finds untriaged emails and triggers triage
   */
  private async processBackfillJob(job: Job<BackfillJobData>): Promise<BackfillResult> {
    const { tenantId, userId } = job.data;

    // Find active tenants with untriaged emails
    const tenantsToProcess = await this.findTenantsWithUntriagedEmails(tenantId);

    this.logger.debug(`Processing triage backfill for ${tenantsToProcess.length} tenants`);

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
    cutoff.setHours(cutoff.getHours() - this.MAX_AGE_HOURS);

    const whereClause: Record<string, unknown> = {
      isAutoTriaged: false,
      receivedAt: { gte: cutoff },
      folder: { notIn: SKIP_FOLDERS },
      isDeleted: false,
      isDraft: false,
    };

    if (specificTenantId) {
      whereClause.tenantId = specificTenantId;
    }

    // Filter to only active tenants
    const activeTenantIds = specificTenantId
      ? [specificTenantId]
      : (
          await this.prisma.tenant.findMany({
            where: { isActive: true, deletedAt: null },
            select: { id: true },
          })
        ).map((t) => t.id);

    if (activeTenantIds.length === 0) return [];

    if (!specificTenantId) {
      whereClause.tenantId = { in: activeTenantIds };
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
          orderBy: { createdAt: 'asc' },
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

  /** Re-triages stale emails using updated sender behavior weights. */
  private async processRecalculation(job: Job<BackfillJobData>): Promise<BackfillResult> {
    const emptyResult: BackfillResult = { processed: 0, successful: 0, failed: 0, skipped: 0, tenantsProcessed: 0 };

    if (!this.triageLearningService) {
      this.logger.warn('Recalculation skipped: TriageLearningService not available');
      return emptyResult;
    }

    const activeTenants = await this.findActiveTenants(job.data.tenantId);
    if (activeTenants.length === 0) {
      this.logger.debug('Recalculation: no active tenants found');
      return emptyResult;
    }

    this.logger.log(`Recalculation starting for ${activeTenants.length} tenants`);
    let totalRecalculated = 0, totalChanged = 0, totalFailed = 0;

    for (const tenant of activeTenants) {
      try {
        const r = await this.recalculateTenant(tenant.tenantId, tenant.userId);
        totalRecalculated += r.recalculated;
        totalChanged += r.changed;
        totalFailed += r.failed;
        await job.updateProgress({
          tenantsProcessed: activeTenants.indexOf(tenant) + 1,
          totalTenants: activeTenants.length,
        });
        await this.sleep(500);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Recalculation failed for tenant ${tenant.tenantId}: ${msg}`);
      }
    }

    this.logger.log(`Recalculation complete: ${totalRecalculated} emails, ${totalChanged} changed, ${totalFailed} failed`);
    return {
      processed: totalRecalculated, successful: totalChanged,
      failed: totalFailed, skipped: totalRecalculated - totalChanged - totalFailed,
      tenantsProcessed: activeTenants.length,
    };
  }

  /**
   * Phase 149 D-07/D-09: nightly decay-based GC sweep.
   *
   * Per D-09, runs GC across two stores FIRST, then delegates to
   * processRecalculation so recalc reads a clean state.
   *
   * Stores (D-04):
   *   1. Redis `triage:sender-scores:{tenantId}` hash — HDEL fields whose
   *      decayed recency score (based on score.lastUpdated) falls below 0.3.
   *   2. `TriageOverride` rows — recompute reinforcement at GC time against
   *      EmailTriageFeedback (D-06 strict: pattern-match AND newValue === action)
   *      and deleteMany rows below 0.3.
   *
   * Emits:
   *   - triage_patterns_gc_total{store, tenant_id} — per delete
   *   - triage_decay_last_run_timestamp_seconds — once at END
   */
  private async processDecayGc(
    job: Job<BackfillJobData>,
  ): Promise<BackfillResult> {
    const activeTenants = await this.findActiveTenants(job.data.tenantId);

    let totalRedisDeleted = 0;
    let totalOverrideDeleted = 0;
    let totalOverrideSeen = 0;
    let tenantsProcessed = 0;

    for (const tenant of activeTenants) {
      try {
        const { redisDeleted, overrideDeleted, overrideTotal } =
          await processDecayGcForTenant(tenant.tenantId, {
            prisma: this.prisma,
            redis: this.redis,
            gcCounter: this.gcCounter,
            halfLifeDays: this.halfLifeDays,
          });
        totalRedisDeleted += redisDeleted;
        totalOverrideDeleted += overrideDeleted;
        totalOverrideSeen += overrideTotal;
        tenantsProcessed++;
        await this.sleep(500);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Decay GC failed for tenant ${tenant.tenantId}: ${msg}`,
        );
      }
    }

    this.logger.log(
      `Decay GC complete: ${totalRedisDeleted} redis scores, ${totalOverrideDeleted}/${totalOverrideSeen} overrides pruned across ${tenantsProcessed}/${activeTenants.length} tenants`,
    );

    // Phase 149 D-11: stamp end-of-run gauge. Powers `now - gauge > 90000`
    // alerting on silent failures (>25h since last successful pass).
    this.lastRunGauge?.set(Date.now() / 1000);

    // D-09: delegate to processRecalculation AFTER GC completes so recalc
    // reads a clean state (no cycles spent scoring soon-to-be-deleted patterns).
    return this.processRecalculation(job);
  }

  /** Recalculate triage for a single tenant's stale emails (>24h old, limit 100). */
  private async recalculateTenant(
    tenantId: string,
    userId: string,
  ): Promise<{ recalculated: number; changed: number; failed: number }> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 24);

    // Find emails triaged >24h ago with aiPriority set
    const staleEmails = await this.prisma.email.findMany({
      where: {
        tenantId,
        isAutoTriaged: true,
        aiPriority: { not: null },
        updatedAt: { lte: cutoff },
        folder: { notIn: SKIP_FOLDERS },
        isDeleted: false,
        isDraft: false,
      },
      select: {
        id: true,
        aiPriority: true,
      },
      orderBy: { updatedAt: 'asc' }, // Oldest first
      take: 100, // Limit per tenant per run
    });

    if (staleEmails.length === 0) return { recalculated: 0, changed: 0, failed: 0 };

    this.logger.debug(
      `Recalculating ${staleEmails.length} stale emails for tenant ${tenantId}`,
    );

    let changed = 0;
    let failed = 0;

    for (const email of staleEmails) {
      try {
        const prevPriority = email.aiPriority;
        const result = await this.triageService.triageEmail(email.id, {
          tenantId,
          userId,
        });

        if (result.aiPriority !== prevPriority) {
          changed++;
        }
      } catch (error) {
        failed++;
        this.logger.debug(
          `Recalculation failed for email ${email.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { recalculated: staleEmails.length, changed, failed };
  }

  /** Find active tenants with a userId (for recalculation). */
  private async findActiveTenants(
    specificTenantId?: string,
  ): Promise<Array<{ tenantId: string; userId: string }>> {
    const tenants = specificTenantId
      ? [{ id: specificTenantId }]
      : await this.prisma.tenant.findMany({
          where: { isActive: true, deletedAt: null },
          select: { id: true },
          take: 50,
        });

    if (tenants.length === 0) return [];

    const results: Array<{ tenantId: string; userId: string }> = [];
    for (const t of tenants) {
      const provider = await this.prisma.providerConfig.findFirst({
        where: { tenantId: t.id },
        orderBy: { createdAt: 'asc' },
        select: { userId: true },
      });
      if (provider?.userId) {
        results.push({ tenantId: t.id, userId: provider.userId });
      }
    }

    return results;
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
    cutoff.setHours(cutoff.getHours() - this.MAX_AGE_HOURS);

    const pendingEmails = await this.prisma.email.count({
      where: {
        isAutoTriaged: false,
        receivedAt: { gte: cutoff },
        folder: { notIn: SKIP_FOLDERS },
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
