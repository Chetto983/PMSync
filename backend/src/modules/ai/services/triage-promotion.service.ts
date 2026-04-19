/**
 * TriagePromotionService — Phase 147 D-06 promotion entry point.
 *
 * Three trigger paths (all idempotent):
 *   1. Debounced enqueue (5min delay, BullMQ dedup) — driven by recordFeedback in Wave 4
 *   2. Safety-net cron (`17 4 * * *` — off the 3 AM cluster) — this service registers
 *      the handler in its CONSTRUCTOR (W6) so no lifecycle window exists where a dispatch
 *      could fire before the handler is installed
 *   3. Admin force-promote (Plan 05 — `POST /api/admin/ai/triage/promote-suggestions`)
 *
 * Phase 147 scope (D-05a): label_correction suggestions don't map to TriageOverride.action
 * (which is lane-shaped). The label-correction learning signal is consumed at prompt-build
 * time via TriageCorrectionService.getFewShotExamples. Lane_correction will auto-promote
 * when Wave 4 ships the capture path; this method is forward-compatible for that day.
 */
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { TriageFeedbackService } from './triage-feedback.service';
import { TriageOverrideService } from './triage-override.service';
import { EmailAnalysisService } from './email-analysis.service';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
} from '../../../common/services/scheduled-jobs.queue';
import {
  getSharedRedisConnection,
  releaseSharedRedisConnection,
} from '../../../common/config/queue.config';
import { TriagePromotionQueueService } from './triage-promotion.queue';

const IDEMPOTENCY_KEY = (tenantId: string) => `triage:last-promoted:${tenantId}`;
const IDEMPOTENCY_TTL_SECONDS = 3600; // 1h
const MIN_INTERVAL_MS = 5 * 60 * 1000; // skip if last run was < 5min ago
const SAFETY_NET_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const SAFETY_NET_JITTER_MS = 60_000;

@Injectable()
export class TriagePromotionService implements OnModuleDestroy {
  private readonly logger = new Logger(TriagePromotionService.name);
  private redisHandle: Redis | null = null;
  private redisAcquired = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly feedbackService: TriageFeedbackService,
    private readonly overrideService: TriageOverrideService,
    private readonly analysisService: EmailAnalysisService,
    private readonly scheduledJobs: ScheduledJobsQueueService,
    @Inject(forwardRef(() => TriagePromotionQueueService))
    private readonly promotionQueue: TriagePromotionQueueService,
  ) {
    // W6: register the cron handler SYNCHRONOUSLY in the constructor. Moving this
    // out of onModuleInit closes the theoretical window where ScheduledJobsQueueService
    // could start dispatching cron ticks before this service's init hook ran.
    this.scheduledJobs.registerHandler(
      ScheduledJobType.TRIAGE_PROMOTION_SAFETY_NET,
      () => this.runSafetyNet(),
    );
  }

  async onModuleDestroy() {
    if (this.redisAcquired) {
      releaseSharedRedisConnection();
      this.redisAcquired = false;
      this.redisHandle = null;
    }
  }

  private getRedis(): Redis | null {
    if (this.redisAcquired) return this.redisHandle;
    try {
      this.redisHandle = getSharedRedisConnection();
      this.redisAcquired = true;
      return this.redisHandle;
    } catch (err) {
      this.logger.warn(`Redis unavailable for promotion idempotency: ${String(err)}`);
      return null;
    }
  }

  /**
   * D-06 primary entry point. Idempotent across trigger paths.
   */
  async promoteOverrides(
    tenantId: string,
  ): Promise<{ promoted: number; skipped: boolean }> {
    const redis = this.getRedis();

    if (redis) {
      try {
        const last = await redis.get(IDEMPOTENCY_KEY(tenantId));
        if (last && Date.now() - Number(last) < MIN_INTERVAL_MS) {
          this.logger.debug(
            `Promotion skipped for tenant=${tenantId} (within ${MIN_INTERVAL_MS / 60_000}min window)`,
          );
          return { promoted: 0, skipped: true };
        }
      } catch (err) {
        this.logger.warn(`Idempotency read failed (tenant=${tenantId}): ${String(err)}`);
      }
    }

    const suggestions = await this.feedbackService.getSuggestions(tenantId);
    let promoted = 0;

    // D-05a: Phase 147 skips label_correction suggestions — TriageOverride.action is
    // lane-shaped. Lane_correction paths (not wired until Wave 4+) would land here.
    for (const _s of suggestions) {
      // Forward-compat placeholder. When lane_correction capture ships, map here:
      //   this.overrideService.addOverride(...) + collect affected emailIds.
      continue;
    }

    // Cache-invalidation stub — wires up fully when lane_correction promotion starts
    // creating overrides. Using analysisService now keeps the DI edge present so the
    // unused-import guard doesn't drop it; Wave 4/5 calls invalidateCache(tenantId, ids).
    void this.analysisService;

    if (redis) {
      try {
        await redis.setex(
          IDEMPOTENCY_KEY(tenantId),
          IDEMPOTENCY_TTL_SECONDS,
          String(Date.now()),
        );
      } catch (err) {
        this.logger.warn(`Idempotency write failed (tenant=${tenantId}): ${String(err)}`);
      }
    }

    this.logger.log(`Promotion run complete for tenant=${tenantId}: promoted=${promoted}`);
    return { promoted, skipped: false };
  }

  /**
   * D-06 trigger 2: safety-net cron handler. Fans out one debounced promotion job
   * per tenant that recorded feedback in the last 24h, with 0-60s jitter so we
   * don't stampede the queue at 04:17.
   */
  async runSafetyNet(): Promise<void> {
    const cutoff = new Date(Date.now() - SAFETY_NET_LOOKBACK_MS);
    const rows = await this.prisma.emailTriageFeedback.findMany({
      where: { createdAt: { gte: cutoff } },
      distinct: ['tenantId'],
      select: { tenantId: true },
    });

    this.logger.log(
      `Safety-net fan-out: ${rows.length} tenant(s) with recent feedback`,
    );

    for (const { tenantId } of rows) {
      const jitter = Math.floor(Math.random() * SAFETY_NET_JITTER_MS);
      await this.promotionQueue.enqueueDebounced(tenantId, { delayOverride: jitter });
    }
  }
}
