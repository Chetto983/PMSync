/**
 * LabelAccuracyQueueService — Phase 148 D-05 accuracy-counter BullMQ queue.
 *
 * Worker invokes LabelAccuracyService.applyDelta per job. Dedup key format:
 *   `accuracy:${tenantId}:${feedbackId}:${labelId}:${kind}` (D-05)
 * — none of the four components may contain ':'. The listener validates
 * this before enqueue (T-148-03-05 mitigation; B-7 hardening).
 *
 * Lifecycle mirrors TriagePromotionQueueService (Phase 147 Plan 03).
 */
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import type { Redis } from 'ioredis';
import {
  getDefaultJobOptions,
  getSharedRedisConnection,
  getSharedWorkerConnection,
  QUEUE_NAMES,
  releaseSharedRedisConnection,
  releaseSharedWorkerConnection,
} from '../../../common/config/queue.config';
import { LabelAccuracyService } from './label-accuracy.service';
import type {
  AccuracyTriageSource,
  LabelAccuracyKind,
} from './label-accuracy.events';

interface AccuracyJobData {
  tenantId: string;
  feedbackId: string;
  labelId: string;
  kind: LabelAccuracyKind;
  delta: number;
  triageSource?: AccuracyTriageSource;
  signal?: 'edit' | 'correction' | 'system';
}

const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 min

@Injectable()
export class LabelAccuracyQueueService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(LabelAccuracyQueueService.name);
  private redisConnection: Redis | null = null;
  private workerConnection: Redis | null = null;
  private queue!: Queue<AccuracyJobData>;
  private worker?: Worker<AccuracyJobData>;

  constructor(private readonly accuracyService: LabelAccuracyService) {}

  async onModuleInit() {
    this.redisConnection = getSharedRedisConnection();
    this.queue = new Queue<AccuracyJobData>(
      QUEUE_NAMES.TRIAGE_ACCURACY_UPDATE,
      {
        connection: this.redisConnection,
        defaultJobOptions: {
          ...getDefaultJobOptions('NORMAL'),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
        },
      },
    );
    this.logger.log('LabelAccuracyQueue initialized');
  }

  async onApplicationBootstrap() {
    const jobsEnabled =
      (process.env.JOBS_ENABLED || 'true').toLowerCase() !== 'false';
    if (!jobsEnabled) {
      this.logger.warn(
        'LabelAccuracy worker disabled via JOBS_ENABLED=false',
      );
      return;
    }
    this.workerConnection = getSharedWorkerConnection();
    this.worker = new Worker<AccuracyJobData>(
      QUEUE_NAMES.TRIAGE_ACCURACY_UPDATE,
      async (job) => this.processJob(job),
      {
        connection: this.workerConnection,
        concurrency: 2,
        lockDuration: 30_000,
      },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Accuracy job ${job?.id} failed: ${err.message}`);
    });
    this.worker.on('ready', () => {
      this.logger.log(
        'LabelAccuracy worker READY (concurrency: 2, dedup 5min)',
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
   * D-05 enqueue. Key: `accuracy:${tenantId}:${feedbackId}:${labelId}:${kind}`.
   * Caller MUST ensure none of the components contain ':' — the listener guard
   * (B-7) enforces this before invoking enqueueAccuracyUpdate.
   */
  async enqueueAccuracyUpdate(input: AccuracyJobData): Promise<void> {
    if (!this.queue) {
      this.logger.warn(
        `enqueueAccuracyUpdate called before queue ready (tenant=${input.tenantId}) — skipping`,
      );
      return;
    }
    const dedupId = `accuracy:${input.tenantId}:${input.feedbackId}:${input.labelId}:${input.kind}`;
    await this.queue.add('label-accuracy-update', input, {
      deduplication: { id: dedupId, ttl: DEDUP_TTL_MS },
    });
  }

  private async processJob(job: Job<AccuracyJobData>): Promise<void> {
    const { tenantId, labelId, kind, delta, triageSource, signal } = job.data;
    await this.accuracyService.applyDelta({
      tenantId,
      labelId,
      kind,
      delta,
      triageSource,
      signal,
    });
  }
}
