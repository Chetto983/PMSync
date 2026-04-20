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
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { TriageFeedbackService } from './triage-feedback.service';
import { TriageOverrideService, LANE_TO_ACTION } from './triage-override.service';
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
// WR-01: cap per-pattern cache-invalidation lookup to bound memory per promotion run.
// Promotions fire every ~5min per active tenant; a high-volume sender/domain could
// otherwise load 100k+ email IDs into memory each time.
const CACHE_INVALIDATION_LIMIT = 5000;

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
    private readonly promotionQueue: TriagePromotionQueueService,
  ) {
    // W6: register the cron handler SYNCHRONOUSLY in the constructor. Moving this
    // out of onModuleInit closes the theoretical window where ScheduledJobsQueueService
    // could start dispatching cron ticks before this service's init hook ran.
    this.scheduledJobs.registerHandler(
      ScheduledJobType.TRIAGE_PROMOTION_SAFETY_NET,
      () => this.runSafetyNet(),
    );

    // WR-02: register the BullMQ worker handler on the queue via a one-way
    // function registration (see TriagePromotionQueueService.registerHandler).
    // Previously both services used forwardRef() to reference each other in
    // the DI graph, which violates the feedback_no_circular_deps project rule
    // and would be flagged by `madge --circular`. The queue no longer needs
    // to hold a reference to this service at all — it calls the registered
    // function when a job fires.
    this.promotionQueue.registerHandler((tenantId) =>
      this.promoteOverrides(tenantId),
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
    const patternsPromoted: Array<{ scope: 'sender' | 'domain'; pattern: string }> = [];

    // Phase 147 Plan 05:
    // - D-05a: label_correction suggestions are NOT promoted to TriageOverride
    //   (action enum is lane-shaped; label corrections feed the few-shot path).
    // - Lane_correction suggestions WHOSE `target` matches a known lane get promoted
    //   via LANE_TO_ACTION. Phase 147 has no lane_correction producers (D-02 defers
    //   capture), so this loop is effectively a no-op this phase. Wave 4+ lights up
    //   automatically with zero code changes.
    for (const s of suggestions) {
      const action = LANE_TO_ACTION[s.target];
      if (!action) continue; // target isn't a lane — skip (label_correction case)

      await this.overrideService.addOverride(tenantId, s.scope, s.pattern, action);
      patternsPromoted.push({ scope: s.scope, pattern: s.pattern });
      promoted += 1;
      this.logger.log(
        `Promoted ${s.scope} override: ${s.pattern} → ${action} (tenant=${tenantId})`,
      );
    }

    // Phase 147 Plan 05: cache invalidation for newly-minted overrides so the next
    // triage for any matching email picks up the new rule instead of a stale cached
    // EmailAnalysis row (24h TTL window). No-op when no overrides were created.
    //
    // WR-01: cap per-pattern lookup at CACHE_INVALIDATION_LIMIT to bound memory on
    // high-volume senders/domains. On a tenant with 100k emails from one domain, the
    // unbounded findMany would load 100k IDs into memory per promotion run (which
    // fires every ~5min per active tenant). Cache invalidation is best-effort —
    // overrun emails keep a stale EmailAnalysis row until the 24h TTL expires or
    // they next receive feedback, which is acceptable. 5000 covers the top ~99.9%
    // of senders/domains in practice.
    if (patternsPromoted.length > 0) {
      const affectedEmailIds: string[] = [];
      for (const p of patternsPromoted) {
        const rows =
          p.scope === 'sender'
            ? await this.prisma.email.findMany({
                where: { tenantId, from: { equals: p.pattern, mode: 'insensitive' } },
                select: { id: true },
                take: CACHE_INVALIDATION_LIMIT,
              })
            : await this.prisma.email.findMany({
                where: {
                  tenantId,
                  from: { contains: `@${p.pattern}`, mode: 'insensitive' },
                },
                select: { id: true },
                take: CACHE_INVALIDATION_LIMIT,
              });
        for (const r of rows) affectedEmailIds.push(r.id);
      }
      if (affectedEmailIds.length > 0) {
        const invalidated = await this.analysisService.invalidateCache(
          tenantId,
          affectedEmailIds,
        );
        this.logger.log(
          `Invalidated ${invalidated} cached analyses for newly-promoted overrides (tenant=${tenantId})`,
        );
      }
    }

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
