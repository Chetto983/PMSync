/**
 * Phase 149 D-04/D-06 helpers for TriageBackfillSchedulerService.processDecayGc.
 *
 * Extracted here so the scheduler service stays below the 700 LF cap while
 * keeping the BullMQ wiring (queue/worker/cron) in the scheduler. These
 * helpers are pure functions: they take the Prisma client, Redis client, and
 * metric Counter as explicit params instead of being class methods — the
 * scheduler still owns the DI surface and just delegates the GC math here.
 *
 * Invariants preserved verbatim from the scheduler body:
 *   - Every Prisma call in `processDecayGcForTenant` / `recomputeOverrideConfidence`
 *     includes explicit `tenantId` in the `where` clause (multi-tenant rule;
 *     T-149-05-01 defense in depth).
 *   - Redis HGETALL/HDEL always uses the tenant-prefixed hash key
 *     `triage:sender-scores:{tenantId}` — impossible to HDEL cross-tenant.
 *   - D-06 strict two-condition match for TriageOverride reinforcement:
 *       1. `EmailTriageFeedback.newValue === override.action` (enforced in
 *          the Prisma `where` clause).
 *       2. `Email.from` matches the override's sender/domain `pattern`
 *          (enforced in-memory post-join).
 *   - `gcCounter.inc({ store, tenant_id })` fires once per delete.
 *
 * Thread overrides (`type === 'thread'`) naturally recompute to 0 weighted
 * count because their pattern is a thread id — no Email.from correlation is
 * possible. They are GC'd once their natural reinforcement falls below 0.3,
 * which they do immediately (no feedback rows ever match), so they age out
 * on the first nightly pass. Intentional per D-06.
 */

import type { Redis } from 'ioredis';
import type { Counter } from 'prom-client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { weightCorrection } from '../utils/triage-correction-weight';
import { extractDomain as sharedExtractDomain } from '../utils/domain-extraction';

/** Phase 149 D-04: Redis key prefix for sender-score hashes. Mirrors TriageLearningService. */
export const DECAY_GC_REDIS_KEY_PREFIX = 'triage:sender-scores';

/** Phase 149 D-05: below-threshold cutoff. Overrides/scores with weighted confidence < 0.3 are GC'd. */
export const DECAY_GC_CONFIDENCE_THRESHOLD = 0.3;

/** Phase 149 D-06: lookback for recomputing TriageOverride reinforcement from EmailTriageFeedback. */
export const DECAY_GC_LOOKBACK_DAYS = 30;

/** Phase 150 D-06: affinity edges below this recomputed weighted-sum are hard-deleted. Matches Phase 149 override threshold. */
export const AFFINITY_EDGE_DECAY_CUTOFF = 0.3;

/**
 * Phase 149: extract domain from "user@host" or "Name <user@host>".
 *
 * Phase 150.1 WR-04: consolidated with triage-graph-lookup.service.ts into
 * `../utils/domain-extraction.ts`. Re-exported here so existing callers
 * (triage-affinity-promotion.helpers.ts + this file's internal usage)
 * keep working without a wider import rewrite.
 */
export const extractDomain = sharedExtractDomain;

export interface DecayGcTenantResult {
  redisDeleted: number;
  overrideDeleted: number;
  overrideTotal: number;
}

export interface DecayGcDeps {
  prisma: PrismaService;
  redis: Redis | null;
  gcCounter?: Counter<string>;
  halfLifeDays: number;
}

/**
 * Phase 149 D-04: per-tenant GC sweep across the two stores.
 * Returns counts to be aggregated by the caller (processDecayGc).
 *
 * Store 1 — Redis sender-scores hash:
 *   HGETALL `triage:sender-scores:{tenantId}` → for each (senderEmail, json),
 *   parse `score.lastUpdated`, compute age, decay via weightCorrection, HDEL
 *   the field if decayed weight < 0.3. Corrupt JSON is treated as ancient
 *   (scoreLastUpdatedMs = 0 → aggressive GC).
 *
 * Store 2 — TriageOverride rows:
 *   findMany tenant-scoped → recomputeOverrideConfidence (D-06 strict)
 *   → deleteMany with explicit tenantId if weighted count < 0.3.
 *
 * Metric emissions:
 *   gcCounter.inc({ store: 'redis_sender_scores' | 'triage_override', tenant_id })
 *   once per deleted entity.
 */
export async function processDecayGcForTenant(
  tenantId: string,
  deps: DecayGcDeps,
): Promise<DecayGcTenantResult> {
  const { prisma, redis, gcCounter, halfLifeDays } = deps;

  // ------------------------------------------------------------------
  // Store 1: Redis sender-scores hash
  // ------------------------------------------------------------------
  let redisDeleted = 0;
  if (redis) {
    const hashKey = `${DECAY_GC_REDIS_KEY_PREFIX}:${tenantId}`;
    const all = await redis.hgetall(hashKey);
    const now = Date.now();

    for (const [senderEmail, raw] of Object.entries(all)) {
      let scoreLastUpdatedMs: number;
      try {
        const score = JSON.parse(raw) as { lastUpdated?: string };
        const parsed = score?.lastUpdated
          ? Date.parse(score.lastUpdated)
          : NaN;
        scoreLastUpdatedMs = Number.isFinite(parsed) ? parsed : 0;
      } catch {
        // Corrupt JSON → treat as ancient → aggressively GC.
        scoreLastUpdatedMs = 0;
      }

      // Age in days (max 0 guard — clock-skew defensive; T-149-05-02).
      const ageDays = Math.max(0, (now - scoreLastUpdatedMs) / 86_400_000);
      const decayedWeight = weightCorrection(ageDays, { halfLifeDays });

      if (decayedWeight < DECAY_GC_CONFIDENCE_THRESHOLD) {
        // HDEL scoped via the tenant-prefixed hash key (T-149-05-01).
        await redis.hdel(hashKey, senderEmail);
        gcCounter?.inc({
          store: 'redis_sender_scores',
          tenant_id: tenantId,
        });
        redisDeleted++;
      }
    }
  }

  // ------------------------------------------------------------------
  // Store 2: TriageOverride rows (D-06 recompute-at-GC-time, strict)
  // ------------------------------------------------------------------
  const overrides = await prisma.triageOverride.findMany({
    where: { tenantId }, // Multi-tenant invariant (T-149-05-01).
    select: {
      id: true,
      type: true,
      pattern: true,
      action: true,
      createdAt: true,
    },
  });

  let overrideDeleted = 0;
  for (const override of overrides) {
    const weightedCount = await recomputeOverrideConfidence(
      tenantId,
      override,
      deps,
    );

    if (weightedCount < DECAY_GC_CONFIDENCE_THRESHOLD) {
      await prisma.triageOverride.deleteMany({
        where: { id: override.id, tenantId }, // Explicit tenantId — belt-and-braces.
      });
      gcCounter?.inc({
        store: 'triage_override',
        tenant_id: tenantId,
      });
      overrideDeleted++;
    }
  }

  return {
    redisDeleted,
    overrideDeleted,
    overrideTotal: overrides.length,
  };
}

/**
 * Phase 149 D-06 (STRICT, per locked CONTEXT.md): recompute TriageOverride
 * reinforcement confidence at GC time.
 *
 * A feedback row contributes to an override's weighted sum if AND ONLY IF:
 *   1. `EmailTriageFeedback.newValue === override.action` (the feedback's
 *      promoted target matches the override's promoted target) — enforced
 *      at the Prisma `where` level for index-friendly filtering.
 *   2. `Email.from` matches the override's sender/domain `pattern` —
 *      enforced in-memory after joining to the Email table.
 *
 * Weighted sum: sum(weightCorrection(ageDays, { halfLifeDays })) over rows
 * that pass BOTH conditions.
 *
 * Rationale: An override's weight is the evidence of THIS SPECIFIC target
 * being reinforced for this sender/domain. A correction that matches the
 * sender but promotes a DIFFERENT lane should not count as reinforcement
 * for this override. Phase 147 D-05a notes that label-correction overrides
 * are not auto-promoted (most overrides are lane-level from lane corrections),
 * so in practice the newValue condition often coincides with existence of
 * the override — but we enforce it explicitly per the locked D-06 semantics,
 * not as an implementation shortcut.
 *
 * Thread overrides (type='thread') return 0 weighted count naturally (their
 * pattern is a thread id, no Email.from correlation) — they get GC'd once
 * createdAt > ~30d. Intentional.
 */
export async function recomputeOverrideConfidence(
  tenantId: string,
  override: {
    id: string;
    type: string;
    pattern: string;
    action: string;
    createdAt: Date;
  },
  deps: DecayGcDeps,
): Promise<number> {
  const { prisma, halfLifeDays } = deps;

  const cutoff = new Date(
    Date.now() - DECAY_GC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );

  // Phase 149 D-06 (strict): newValue === override.action enforced at query time.
  // This narrows the result set dramatically for indexed scans and guarantees
  // the "promoted target matches" check is never skipped.
  const feedbackRows = await prisma.emailTriageFeedback.findMany({
    where: {
      tenantId, // Multi-tenant invariant (T-149-05-01).
      type: 'label_correction',
      signal: 'correction',
      createdAt: { gte: cutoff },
      newValue: override.action, // Phase 149 D-06 (strict): promoted target must match.
    },
    select: {
      emailId: true,
      newValue: true,
      createdAt: true,
    },
  });

  if (feedbackRows.length === 0) return 0;

  const emailIds = Array.from(new Set(feedbackRows.map((r) => r.emailId)));
  const emails = await prisma.email.findMany({
    where: { id: { in: emailIds }, tenantId }, // Multi-tenant invariant.
    select: { id: true, from: true },
  });
  const fromById = new Map(
    emails.map((e) => [e.id, (e.from ?? '').toLowerCase().trim()]),
  );

  const patternLower = override.pattern.toLowerCase().trim();
  const now = Date.now();
  let weightedCount = 0;

  for (const row of feedbackRows) {
    const rowFrom = fromById.get(row.emailId) ?? '';
    let patternMatches = false;

    // D-06 condition 1 enforced here: Email.from matches the override's pattern.
    if (override.type === 'sender') {
      patternMatches = rowFrom === patternLower;
    } else if (override.type === 'domain') {
      const rowDomain = extractDomain(rowFrom);
      patternMatches = rowDomain !== null && rowDomain === patternLower;
    } else {
      // 'thread' and any future types — no Email.from correlation possible.
      patternMatches = false;
    }

    if (!patternMatches) continue;

    // Both D-06 conditions satisfied: accumulate decayed weight.
    const ageDays = Math.max(
      0,
      (now - row.createdAt.getTime()) / 86_400_000,
    );
    weightedCount += weightCorrection(ageDays, { halfLifeDays });
  }

  return weightedCount;
}

export interface GraphEdgeDecayResult {
  graphEdgeDeleted: number;
}

/**
 * Phase 150 D-06: third decay-gc store. Sweeps affinity edges whose
 * recomputed weighted-sum confidence drops below AFFINITY_EDGE_DECAY_CUTOFF.
 *
 * Called AFTER processDecayGcForTenant's Redis + TriageOverride sweeps so
 * recomputed override weights drive affinity-edge confidence recomputation
 * (Phase 149 D-09 ordering invariant extended).
 *
 * B-2 contract: EmailTriageFeedback has NO `overrideId` column. Recompute
 * walks `edge.metadata.derivedFromOverrideIds` → `TriageOverride.findMany`
 * (tenant-scoped) → matches feedback by `(override.pattern, override.action)`
 * via `email.from` + `feedback.newValue`. Same matching logic used by
 * Plan 02 Task 3 promotion — if the writer promoted the edge, this reader
 * will find the same evidence.
 *
 * Defensive semantics:
 *   - Edge with empty/missing `metadata.derivedFromOverrideIds` → weightedSum = 0 → delete
 *     (no traceable evidence → stale by construction).
 *   - Edge referencing overrides that no longer exist (Phase 149 TriageOverride
 *     sweep ran first and deleted them) → findMany returns fewer rows → the
 *     missing overrides contribute 0 to weightedSum → may push edge below cutoff.
 *
 * Multi-tenant invariant: every Prisma call includes `tenantId` in `where`.
 */
export async function processAffinityEdgeDecayForTenant(
  tenantId: string,
  deps: DecayGcDeps,
): Promise<GraphEdgeDecayResult> {
  const { prisma, gcCounter, halfLifeDays } = deps;
  const now = new Date();
  let deleted = 0;

  const edges = await prisma.graphEdge.findMany({
    where: {
      tenantId,
      edgeType: { in: ['SENDER_LABEL_AFFINITY', 'DOMAIN_LABEL_AFFINITY'] },
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
    },
  });

  if (edges.length === 0) {
    return { graphEdgeDeleted: 0 };
  }

  // Collect all override IDs referenced by all edges (deduped) for batch fetch.
  const allOverrideIds = new Set<string>();
  for (const e of edges) {
    const ids = (((e as any).metadata as any)?.derivedFromOverrideIds ?? []) as string[];
    for (const id of ids) allOverrideIds.add(id);
  }

  // Batch-fetch the referenced overrides (tenant-scoped).
  const overrides =
    allOverrideIds.size > 0
      ? await prisma.triageOverride.findMany({
          where: { tenantId, id: { in: Array.from(allOverrideIds) } },
        })
      : [];
  // Map id → override for per-edge lookup.
  const overrideById = new Map<string, { pattern: string; action: string }>();
  for (const o of overrides) {
    overrideById.set((o as any).id, {
      pattern: ((o as any).pattern ?? '').trim().toLowerCase(),
      action: (o as any).action,
    });
  }

  // Derive distinct action values needed for feedback filtering.
  const actionsOfInterest = new Set<string>();
  for (const o of overrideById.values()) actionsOfInterest.add(o.action);

  // Batch-fetch candidate feedback rows (tenant-scoped). If no overrides survived,
  // there is nothing to recompute — every edge falls to zero-weight and is deleted.
  const feedbackRows =
    actionsOfInterest.size > 0
      ? await prisma.emailTriageFeedback.findMany({
          where: { tenantId, newValue: { in: Array.from(actionsOfInterest) } },
        })
      : [];

  // Batch-fetch the emails those feedback rows reference, tenant-scoped.
  const emailIds = (feedbackRows as any[])
    .map((f) => f.emailId)
    .filter(Boolean);
  const emails =
    emailIds.length > 0
      ? await prisma.email.findMany({
          where: { tenantId, id: { in: emailIds } },
        })
      : [];
  const emailFromById = new Map<string, string>();
  for (const e of emails as any[]) {
    emailFromById.set(e.id, ((e.from ?? '') as string).trim().toLowerCase());
  }

  // Build a (pattern, action) → feedback[] index so per-edge recompute is
  // O(|overrides| * avg_feedback_per_key).
  const evidenceByKey = new Map<string, Array<{ createdAt: Date }>>();
  for (const fb of feedbackRows as any[]) {
    const from = emailFromById.get(fb.emailId);
    if (!from) continue;
    const key = `${from}|${fb.newValue}`;
    if (!evidenceByKey.has(key)) evidenceByKey.set(key, []);
    evidenceByKey.get(key)!.push({ createdAt: fb.createdAt });
  }

  const nowMs = now.getTime();
  for (const edge of edges as any[]) {
    const overrideIds = ((edge.metadata as any)?.derivedFromOverrideIds ??
      []) as string[];
    let weightedSum = 0;
    for (const oid of overrideIds) {
      const ov = overrideById.get(oid);
      if (!ov) continue; // override no longer exists — contributes 0
      const key = `${ov.pattern}|${ov.action}`;
      const rows = evidenceByKey.get(key) ?? [];
      for (const r of rows) {
        const ageDays = Math.max(
          0,
          (nowMs - r.createdAt.getTime()) / 86_400_000,
        );
        weightedSum += weightCorrection(ageDays, { halfLifeDays });
      }
    }

    if (weightedSum < AFFINITY_EDGE_DECAY_CUTOFF) {
      await prisma.graphEdge.deleteMany({
        where: { tenantId, id: edge.id },
      });
      gcCounter?.inc({ store: 'graph_edge', tenant_id: tenantId });
      deleted += 1;
    }
  }

  return { graphEdgeDeleted: deleted };
}
