/**
 * TriagePromotionQueueService — Debounced BullMQ queue for Phase 147 D-06 promotion.
 *
 * Enqueues a `triage-promote-overrides` job per tenant with:
 *   - 5min delay (debounce window; a burst of corrections within 5min collapses to one run)
 *   - deduplication.id = `promote:<tenantId>` with TTL 5min (Redis-level single-fire guarantee)
 *
 * Worker calls TriagePromotionService.promoteOverrides(tenantId) wrapped in
 * withoutTenantScopingAsync so the handler can span tenants without RLS fighting back.
 *
 * Forward-ref wired with TriagePromotionService — the service holds the safety-net
 * fan-out logic that calls back into this queue's enqueueDebounced.
 */
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';
import {
  getDefaultJobOptions,
  getSharedRedisConnection,
  getSharedWorkerConnection,
  QUEUE_NAMES,
  releaseSharedRedisConnection,
  releaseSharedWorkerConnection,
} from '../../../common/config/queue.config';
import { TriagePromotionService } from './triage-promotion.service';

interface TriagePromoteJobData {
  tenantId: string;
  triggeredAt: string;
}

export interface EnqueueDebouncedOptions {
  /** Override the default 5-minute delay (e.g., safety-net jitter). */
  delayOverride?: number;
}

const DEFAULT_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minutes
const DEDUPLICATION_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class TriagePromotionQueueService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TriagePromotionQueueService.name);
  private redisConnection: Redis | null = null;
  private workerConnection: Redis | null = null;
  private queue!: Queue<TriagePromoteJobData>;
  private worker?: Worker<TriagePromoteJobData>;

  constructor(
    @Inject(forwardRef(() => TriagePromotionService))
    private readonly promotionService: TriagePromotionService,
  ) {}

  async onModuleInit() {
    this.redisConnection = getSharedRedisConnection();

    this.queue = new Queue<TriagePromoteJobData>(
      QUEUE_NAMES.TRIAGE_PROMOTE_OVERRIDES,
      {
        connection: this.redisConnection,
        defaultJobOptions: {
          ...getDefaultJobOptions('SCHEDULED'),
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 100 },
          attempts: 2,
          backoff: { type: 'exponential', delay: 10_000 },
        },
      },
    );

    this.logger.log('TriagePromotionQueue initialized');
  }

  async onApplicationBootstrap() {
    const jobsEnabled =
      (process.env.JOBS_ENABLED || 'true').toLowerCase() !== 'false';
    if (!jobsEnabled) {
      this.logger.warn(
        'Triage promotion worker disabled via JOBS_ENABLED=false',
      );
      return;
    }

    this.workerConnection = getSharedWorkerConnection();
    this.worker = new Worker<TriagePromoteJobData>(
      QUEUE_NAMES.TRIAGE_PROMOTE_OVERRIDES,
      async (job) => this.processPromotion(job),
      {
        connection: this.workerConnection,
        concurrency: 2,
        lockDuration: 60_000,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Triage promotion job ${job?.id} failed: ${err.message}`,
      );
    });

    this.worker.on('ready', () => {
      this.logger.log(
        'TriagePromotion worker READY (concurrency: 2, dedup window: 5min)',
      );
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    if (this.redisConnection) {
      releaseSharedRedisConnection();
      this.redisConnection = null;
    }
    if (this.workerConnection) {
      releaseSharedWorkerConnection();
      this.workerConnection = null;
    }
  }

  /**
   * D-06 trigger 1: debounced enqueue. A burst of recordFeedback() calls within
   * a 5-minute window collapses to a single promotion run thanks to BullMQ
   * deduplication keyed by `promote:<tenantId>`.
   *
   * Safety-net (D-06 trigger 2) passes `delayOverride` with 0-60s jitter to
   * spread tenant fan-out without colliding with the 5-min dedup.
   */
  async enqueueDebounced(
    tenantId: string,
    options?: EnqueueDebouncedOptions,
  ): Promise<void> {
    if (!this.queue) {
      this.logger.warn(
        `enqueueDebounced called before queue ready (tenant=${tenantId}) — skipping`,
      );
      return;
    }

    const delay = options?.delayOverride ?? DEFAULT_DEBOUNCE_MS;

    await this.queue.add(
      'triage-promote',
      { tenantId, triggeredAt: new Date().toISOString() },
      {
        delay,
        deduplication: {
          id: `promote:${tenantId}`,
          ttl: DEDUPLICATION_TTL_MS,
        },
      },
    );

    this.logger.debug(
      `Enqueued promotion for tenant=${tenantId} (delay: ${Math.round(delay / 1000)}s)`,
    );
  }

  private async processPromotion(job: Job<TriagePromoteJobData>): Promise<void> {
    return withoutTenantScopingAsync(() => this.processPromotionInner(job));
  }

  private async processPromotionInner(
    job: Job<TriagePromoteJobData>,
  ): Promise<void> {
    const { tenantId } = job.data;
    const result = await this.promotionService.promoteOverrides(tenantId);
    this.logger.log(
      `Promotion job ${job.id} done: tenant=${tenantId}, promoted=${result.promoted}, skipped=${result.skipped}`,
    );
  }
}
