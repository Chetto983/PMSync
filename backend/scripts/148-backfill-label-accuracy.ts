/**
 * Phase 148 D-14: one-time 30-day backfill of LabelAccuracyProfile counters.
 *
 * Invocation:
 *   cd backend && npx ts-node scripts/148-backfill-label-accuracy.ts [--tenant=<id>] [--dry-run]
 *
 * Idempotency (D-14):
 *   - Feedback pass dedups by EmailTriageFeedback.id via Redis set
 *     `triage:accuracy-backfill:feedback-seen:${tenantId}` (TTL 7d).
 *   - TP pass dedups by `${emailId}:${labelId}` via Redis set
 *     `triage:accuracy-backfill:credited:${tenantId}` (TTL 7d).
 *
 * Security (T-148-04-04): script NEVER accepts tp/fp/fn from CLI. Counts are
 * derived entirely from EmailTriageFeedback rows + Email.aiLabels TP pass.
 *
 * B-1 single source of truth: day offsets derived from TP_IMPLICIT_WINDOW_DAYS.
 * The only local window-bound constant is BACKFILL_LOOKBACK_DAYS = 30.
 *
 * B-5 invariant gate: verified pre-write via grep on triage-feedback.service.ts
 * that `captureLabelDiff`'s `added_personal_label` branch does NOT call
 * `recordFeedback`. Enforced at service-level (line: "// else:
 * added_personal_label — silent no-op"). If this invariant is violated in a
 * future refactor, the backfill will leak counters — re-run the grep before
 * each invocation.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LabelAccuracyService } from '../src/modules/ai/services/label-accuracy.service';
import {
  getSharedRedisConnection,
  releaseSharedRedisConnection,
} from '../src/common/config/queue.config';
import { TP_IMPLICIT_WINDOW_DAYS } from '../src/modules/ai/utils/triage-correction-weight';

interface BackfillOptions {
  tenantId?: string;
  dryRun?: boolean;
}

interface BackfillStats {
  tenantsProcessed: number;
  feedbackApplied: number;
  feedbackSkipped: number;
  tpCredited: number;
  tpSkipped: number;
  beforeCount: number;
  afterCount: number;
}

const FEEDBACK_SEEN = (t: string) =>
  `triage:accuracy-backfill:feedback-seen:${t}`;
const TP_CREDITED = (t: string) =>
  `triage:accuracy-backfill:credited:${t}`;
const DEDUP_TTL_SECONDS = 7 * 24 * 3600;

// B-1: every 14-day / 44-day offset is DERIVED from TP_IMPLICIT_WINDOW_DAYS.
// BACKFILL_LOOKBACK_DAYS is the INDEPENDENT 30-day window for the feedback
// pass; the composed 44 is TP_IMPLICIT_WINDOW_DAYS + BACKFILL_LOOKBACK_DAYS.
const BACKFILL_LOOKBACK_DAYS = 30;
const LOOKBACK_FEEDBACK_DAYS = BACKFILL_LOOKBACK_DAYS;
const LOOKBACK_TP_UPPER_DAYS = TP_IMPLICIT_WINDOW_DAYS;
const LOOKBACK_TP_LOWER_DAYS =
  TP_IMPLICIT_WINDOW_DAYS + BACKFILL_LOOKBACK_DAYS;

const DAY_MS = 24 * 3600 * 1000;

export async function runBackfill(
  options: BackfillOptions = {},
): Promise<BackfillStats> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: false,
  });
  const prisma = app.get(PrismaService);
  const accuracy = app.get(LabelAccuracyService);
  // getSharedRedisConnection is synchronous and cached; the finally-block
  // releases it regardless of success/failure.
  const redis = getSharedRedisConnection();

  const stats: BackfillStats = {
    tenantsProcessed: 0,
    feedbackApplied: 0,
    feedbackSkipped: 0,
    tpCredited: 0,
    tpSkipped: 0,
    beforeCount: 0,
    afterCount: 0,
  };

  try {
    const feedbackCutoff = new Date(
      Date.now() - LOOKBACK_FEEDBACK_DAYS * DAY_MS,
    );

    const tenants: Array<{ tenantId: string }> = options.tenantId
      ? [{ tenantId: options.tenantId }]
      : await prisma.emailTriageFeedback.findMany({
          where: { createdAt: { gte: feedbackCutoff } },
          distinct: ['tenantId'],
          select: { tenantId: true },
        });

    stats.beforeCount = await prisma.labelAccuracyProfile.count(
      options.tenantId
        ? { where: { tenantId: options.tenantId } }
        : undefined,
    );

    for (const { tenantId } of tenants) {
      stats.tenantsProcessed++;

      // Resolve label names → labelIds once per tenant.
      const labels = await prisma.userLabel.findMany({
        where: { tenantId },
        select: { id: true, slug: true, name: true },
      });
      const bySlug = new Map(labels.map((l) => [l.slug, l.id]));
      const byName = new Map(
        labels.map((l) => [l.name.toLowerCase(), l.id]),
      );
      const resolveLabel = (name: string): string | undefined =>
        bySlug.get(name) ?? byName.get(name.toLowerCase());

      // ----- Pass 1: feedback rows -----
      const feedback = await prisma.emailTriageFeedback.findMany({
        where: {
          tenantId,
          type: 'label_correction',
          createdAt: { gte: feedbackCutoff },
        },
        select: {
          id: true,
          emailId: true,
          signal: true,
          oldValue: true,
          newValue: true,
          createdAt: true,
        },
      });

      for (const row of feedback) {
        const seen = await redis.sismember(FEEDBACK_SEEN(tenantId), row.id);
        if (seen === 1) {
          stats.feedbackSkipped++;
          continue;
        }

        // D-02/D-03: removed label (oldValue) → FP+1; added label (newValue) → FN+1.
        const mutations: Array<['fp' | 'fn', string | null]> = [
          ['fp', row.oldValue],
          ['fn', row.newValue],
        ];
        for (const [kind, labelName] of mutations) {
          if (!labelName) continue;
          const labelId = resolveLabel(labelName);
          if (!labelId) continue;
          if (!options.dryRun) {
            await accuracy.applyDelta({
              tenantId,
              labelId,
              kind,
              delta: 1,
              signal: row.signal as 'edit' | 'correction',
            });
          }
        }

        if (!options.dryRun) {
          await redis.sadd(FEEDBACK_SEEN(tenantId), row.id);
          await redis.expire(FEEDBACK_SEEN(tenantId), DEDUP_TTL_SECONDS);
        }
        stats.feedbackApplied++;
      }

      // ----- Pass 2: TP credits for emails with clean aiLabels -----
      // Window: autoTriagedAt BETWEEN now - LOOKBACK_TP_LOWER_DAYS (=44)
      // AND now - LOOKBACK_TP_UPPER_DAYS (=14). B-1 derived, no bare literals.
      const tpUpper = new Date(Date.now() - LOOKBACK_TP_UPPER_DAYS * DAY_MS);
      const tpLower = new Date(Date.now() - LOOKBACK_TP_LOWER_DAYS * DAY_MS);
      // Same Rule-1 deviation as Plan 03: the plan spec says `processedAt` but
      // that column lives on EmailAnalysis. Email has `autoTriagedAt` with
      // identical semantics ("When auto-triage ran").
      const emails = await prisma.email.findMany({
        where: {
          tenantId,
          autoTriagedAt: { gte: tpLower, lte: tpUpper },
          aiLabels: { isEmpty: false },
        },
        select: { id: true, aiLabels: true },
      });

      for (const email of emails) {
        for (const labelName of email.aiLabels ?? []) {
          const labelId = resolveLabel(labelName);
          if (!labelId) continue;
          const key = `${email.id}:${labelId}`;
          const already = await redis.sismember(TP_CREDITED(tenantId), key);
          if (already === 1) {
            stats.tpSkipped++;
            continue;
          }
          const hasCorrection =
            await prisma.emailTriageFeedback.count({
              where: {
                tenantId,
                emailId: email.id,
                OR: [{ oldValue: labelName }, { newValue: labelName }],
              },
            });
          if (hasCorrection > 0) {
            stats.tpSkipped++;
            continue;
          }
          if (!options.dryRun) {
            await accuracy.applyDelta({
              tenantId,
              labelId,
              kind: 'tp',
              delta: 1,
              signal: 'system',
            });
            await redis.sadd(TP_CREDITED(tenantId), key);
            await redis.expire(TP_CREDITED(tenantId), DEDUP_TTL_SECONDS);
          }
          stats.tpCredited++;
        }
      }
    }

    stats.afterCount = await prisma.labelAccuracyProfile.count(
      options.tenantId
        ? { where: { tenantId: options.tenantId } }
        : undefined,
    );
    if (stats.afterCount < stats.beforeCount) {
      // Plan acceptance grep expects order: before → after → shrank.
      throw new Error(
        `Backfill integrity failure: before=${stats.beforeCount}, after=${stats.afterCount} (row count shrank)`,
      );
    }
    return stats;
  } finally {
    releaseSharedRedisConnection();
    await app.close();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const tenantArg = args.find((a) => a.startsWith('--tenant='));
  const dryRun = args.includes('--dry-run');
  runBackfill({
    tenantId: tenantArg ? tenantArg.split('=')[1] : undefined,
    dryRun,
  })
    .then((stats) => {
      // eslint-disable-next-line no-console
      console.log('Backfill complete:', stats);
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Backfill failed:', err);
      process.exit(1);
    });
}
