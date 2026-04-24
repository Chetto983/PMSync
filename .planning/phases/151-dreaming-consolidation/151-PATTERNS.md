# Phase 151: Dreaming Consolidation Loop - Pattern Map

**Mapped:** 2026-04-24
**Files analyzed:** 8 (4 new, 4 modified)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/src/modules/ai/consolidation/consolidation.module.ts` | NestJS feature module | DI wiring | `backend/src/modules/ai/ai.module.ts` (and `@Module` providers/exports style) | role-match |
| `backend/src/modules/ai/consolidation/triage-consolidation.scheduler.ts` | BullMQ scheduler + worker + 3 handlers | batch / scheduled | `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts` | exact (proven template, copy-don't-subclass) |
| `backend/src/modules/ai/consolidation/triage-light-consolidation.helpers.ts` (optional) | Pure helper | batch / read+dedup | `backend/src/modules/ai/services/triage-decay-gc.helpers.ts` | exact shape (pure function + deps object) |
| `backend/src/modules/ai/consolidation/triage-rem-consolidation.helpers.ts` (optional) | Pure helper | batch / SQL queries | `backend/src/modules/ai/services/triage-affinity-promotion.helpers.ts` | exact shape (pure function + deps object) |
| `backend/prisma/migrations/<ts>_add_triage_consolidation_tables/migration.sql` | Migration | schema additive | `backend/prisma/migrations/20260424100000_add_graph_affinity_columns/` (P150) | role-match |
| `backend/prisma/schema.prisma` (MODIFY) | Prisma models | schema | `GraphEdge` §2293, `EmailTriageFeedback` §2565, `TriageOverride` §2550 (multi-tenant pattern) | exact |
| `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts` (MODIFY) | DELETE affinity-promotion | code excision | self (delete existing `'affinity-promotion'` branches) | N/A (deletion) |
| `backend/src/modules/ai/ai.module.ts` (MODIFY) | Add ConsolidationModule import | DI wiring | self (existing imports block) | N/A (addition) |
| `backend/src/modules/ai/services/triage-learning.service.ts` (MODIFY, conditional) | Expose public flush wrapper | method extraction | self (`flushSenderSignals` at line 392 is `private`) | N/A (visibility change) |
| `backend/src/common/metrics/metrics.module.ts` (MODIFY) | Register 4 new metric providers | DI wiring | self — Phase 149 D-11 + Phase 150 D-07a blocks at lines 105-152 | exact |

---

## Pattern Assignments

### 1. `backend/src/modules/ai/consolidation/triage-consolidation.scheduler.ts` (scheduler, 3 handlers)

**Analog:** `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts` (699 LF, the `setupRepeatableJob` + worker + `findActiveTenants` + per-tenant loop template)

**Copy-don't-subclass:** the new scheduler mirrors this shape verbatim; it does NOT extend or inject the backfill scheduler class. Three handler methods (`processLightConsolidation` / `processDeepConsolidation` / `processRemConsolidation`) parallel `processDecayGc` + `processAffinityPromotion`.

**Imports + constructor DI block** (lines 1-17, 43-102):
```typescript
import { Job, Queue, Worker } from 'bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { TriageLearningService } from '../services/triage-learning.service';
import { getRedisConnectionOptions, QUEUE_NAMES } from '../../../common/config';
import { RedisConnectionService } from '../../../common/services/redis-connection.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping';
import { processDecayGcForTenant, processAffinityEdgeDecayForTenant } from '../services/triage-decay-gc.helpers';
import { processAffinityPromotionForTenant } from '../services/triage-affinity-promotion.helpers';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter, Gauge } from 'prom-client';

@Injectable()
export class TriageConsolidationScheduler implements OnModuleInit, OnModuleDestroy {
  private queue!: Queue<ConsolidationJobData>;
  private worker!: Worker<ConsolidationJobData, ConsolidationResult>;
  private readonly halfLifeDays: number;
  // ...
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() private readonly triageLearningService?: TriageLearningService,
    @Optional() @InjectMetric('triage_graph_promotion_total') private readonly promotionCounter?: Counter<string>,
    @Optional() @InjectMetric('triage_patterns_gc_total') private readonly gcCounter?: Counter<string>,
    @Optional() @InjectMetric('triage_contradictions_found_total') private readonly contradictionsCounter?: Counter<string>,
    @Optional() @InjectMetric('triage_light_last_run_timestamp_seconds') private readonly lightLastRunGauge?: Gauge<string>,
    @Optional() @InjectMetric('triage_deep_last_run_timestamp_seconds') private readonly deepLastRunGauge?: Gauge<string>,
    @Optional() @InjectMetric('triage_rem_last_run_timestamp_seconds') private readonly remLastRunGauge?: Gauge<string>,
    @Optional() @InjectMetric('triage_graph_edges_active') private readonly activeEdgesGauge?: Gauge<string>,
  ) {
    const rawHalfLife = parseInt(this.configService.get<string>('TRIAGE_DECAY_HALF_LIFE_DAYS', '14'), 10);
    this.halfLifeDays = Math.max(1, Number.isFinite(rawHalfLife) ? rawHalfLife : 14);
  }
```

**Worker + dispatch pattern** (lines 127-154):
```typescript
this.worker = new Worker<ConsolidationJobData, ConsolidationResult>(
  QUEUE_NAMES.TRIAGE_CONSOLIDATION || 'triage-consolidation',
  async (job: Job<ConsolidationJobData>) => {
    return withoutTenantScopingAsync(async () => {
      if (job.data.type === 'light') return this.processLightConsolidation(job);
      if (job.data.type === 'deep') return this.processDeepConsolidation(job);
      if (job.data.type === 'rem')  return this.processRemConsolidation(job);
      return /* empty result */;
    });
  },
  { connection, concurrency: 1, lockDuration: 300000 },  // same concurrency:1 as analog
);
```

**`setupRepeatableJob` cron registration** (lines 193-250, verbatim shape):
```typescript
private async setupRepeatableJob() {
  const repeatableJobs = await this.queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (job.name === 'triage-light-consolidation' ||
        job.name === 'triage-deep-consolidation' ||
        job.name === 'triage-rem-consolidation') {
      await this.queue.removeRepeatableByKey(job.key);
    }
  }
  await this.queue.add('triage-light-consolidation', { type: 'light' },
    { repeat: { pattern: '15 * * * *' }, jobId: 'triage-light-consolidation' });
  await this.queue.add('triage-deep-consolidation', { type: 'deep' },
    { repeat: { pattern: '0 3 * * *' }, jobId: 'triage-deep-consolidation' });
  await this.queue.add('triage-rem-consolidation', { type: 'rem' },
    { repeat: { pattern: '0 5 * * 0' }, jobId: 'triage-rem-consolidation' });
}
```

**`findActiveTenants` pattern** — reuse VERBATIM from analog lines 602-628. Tenant iteration with `where: { isActive: true, deletedAt: null }, take: 50` + per-tenant try/catch + `sleep(500)` pacing.

**Deep handler composition** (analog lines 438-488 `processDecayGc` + lines 496-541 `processAffinityPromotion` — combined):
```typescript
private async processDeepConsolidation(job: Job<ConsolidationJobData>): Promise<ConsolidationResult> {
  const activeTenants = await this.findActiveTenants(job.data.tenantId);
  const jobTimestamp = new Date();
  for (const tenant of activeTenants) {
    try {
      // D-A3 STEP 1: decay-gc helpers first (synchronous, per-tenant ordering)
      const deps = { prisma: this.prisma, redis: this.redis, gcCounter: this.gcCounter, halfLifeDays: this.halfLifeDays };
      await processDecayGcForTenant(tenant.tenantId, deps);
      await processAffinityEdgeDecayForTenant(tenant.tenantId, deps);

      // D-A2 STEP 2: Phase 150 promotion math verbatim — helper untouched
      const promotionResult = await processAffinityPromotionForTenant(
        tenant.tenantId,
        { prisma: this.prisma, promotionCounter: this.promotionCounter, activeEdgesGauge: this.activeEdgesGauge, halfLifeDays: this.halfLifeDays },
        job.id ?? 'unknown',
        jobTimestamp,
      );

      // D-C3 STEP 3: enqueue LabelAccuracyQueue sweeps for touched labelIds (bounded fan-out)
      // ...

      await this.sleep(500);
    } catch (err) {
      this.logger.error(`Deep failed for tenant ${tenant.tenantId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  this.deepLastRunGauge?.set(Date.now() / 1000);  // D-E2 end-of-run gauge
  return /* result */;
}
```

**Gauge emission at END of handler** (analog line 485):
```typescript
this.lastRunGauge?.set(Date.now() / 1000);
```

**Delta from analog:**
- Three handlers (Light/Deep/REM) instead of one (`processDecayGc`) plus one (`processAffinityPromotion`).
- Queue name is `triage-consolidation` (new), NOT `triage-backfill`.
- Three jobIds: `triage-light-consolidation`, `triage-deep-consolidation`, `triage-rem-consolidation`.
- Three end-of-run gauges (one per handler) — analog has one (`triage_decay_last_run_timestamp_seconds`).
- Deep handler INVOKES `processAffinityPromotionForTenant` directly — Phase 150 helper file stays in `backend/src/modules/ai/services/` untouched (D-A2).
- No `processBackfillJob` / `processRecalculation` — those stay on `TriageBackfillSchedulerService`.

**Landmines:**
- **Queue concurrency** — `concurrency: 1` (D-C4 constraint). Stuck Deep delays REM by up to 6 days.
- **Gauge emission placement** — must fire at END of each handler on success only (like analog line 485). NOT in the try-block header.
- **`withoutTenantScopingAsync` wrapper** — REQUIRED for cross-tenant iteration. Analog line 130 wraps the entire worker callback. If omitted, Prisma tenant-scoping middleware blocks cross-tenant queries.
- **BullMQ multi-instance dedup** — `jobId` MUST be stable and unique per cron. Removing old repeatables (analog lines 196-206) is required to avoid doubled emission after job-name changes.
- **Phase 150 ordering invariant (Landmine §5 from P150 context)** — in `TriageBackfillSchedulerService` the `nightly-affinity-promotion` cron is registered BEFORE `nightly-decay-gc` so BullMQ FIFO on `concurrency:1` preserves promotion→decay order. Phase 151 Deep now INTERNALIZES this ordering (decay-gc first, then promotion, per D-A3 STEP 1 then STEP 2). **This reverses the analog's ordering.** Document in the handler docstring explicitly.

---

### 2. `backend/src/modules/ai/consolidation/triage-light-consolidation.helpers.ts` (pure helper, optional)

**Analog:** `backend/src/modules/ai/services/triage-decay-gc.helpers.ts` (444 LF, pure-function + deps-object shape)

**File-header docstring template** (analog lines 1-28):
```typescript
/**
 * Phase 151 D-B1/D-B2/D-B3/D-B4 helpers for TriageConsolidationScheduler.processLightConsolidation.
 *
 * Extracted here so the scheduler service stays below the 700 LF cap while
 * keeping the BullMQ wiring (queue/worker/cron) in the scheduler. These
 * helpers are pure functions: they take the Prisma client and metric Counter
 * as explicit params instead of being class methods.
 *
 * Invariants preserved verbatim from the scheduler body:
 *   - Every Prisma call includes explicit `tenantId` in the `where` clause.
 *   - Uses existing EmailEmbedding 1024-dim vectors — NO new embedding compute.
 *   - Missing embedding → pair NOT deduplicated (safer-side; over-count beats wrong-merge).
 *   - `TriageCorrectionCluster.windowStart` = date_trunc('hour', now()) — upsert idempotency key.
 */
```

**Deps-object pattern** (analog lines 87-92):
```typescript
export interface LightConsolidationDeps {
  prisma: PrismaService;
  halfLifeDays: number;
}
export interface LightConsolidationTenantResult {
  clustersUpserted: number;
  duplicatesMerged: number;
  sendersFlushed: number;
}
```

**Per-tenant entry-point signature** (analog lines 112-115):
```typescript
export async function processLightConsolidationForTenant(
  tenantId: string,
  deps: LightConsolidationDeps,
  windowStart: Date,  // must be date_trunc('hour', now()) from caller
): Promise<LightConsolidationTenantResult> {
  const { prisma, halfLifeDays } = deps;
  // ...
}
```

**pgvector distance usage** — the codebase's ONLY existing site is `backend/src/modules/ai/services/embeddings.service.ts` lines 232-259. That site uses `<->` (L2 distance), NOT `<=>` (cosine distance). For Light, D-B2 explicitly calls for **cosine** via pgvector `<=>`. The template to follow:

```typescript
// Inline SQL template — cosine distance pattern (NEW shape; codebase reference for
// <-> L2 usage is embeddings.service.ts:232-259 but the operator here MUST be <=>):
const cosineDistances = await prisma.$queryRaw<Array<{ a_email_id: string; b_email_id: string; cosine_distance: number }>>`
  SELECT a."emailId" AS a_email_id, b."emailId" AS b_email_id,
         (a."vector" <=> b."vector") AS cosine_distance
  FROM "embeddings" a
  JOIN "embeddings" b ON b."emailId" = ANY(${candidateEmailIds}::text[])
  WHERE a."tenantId" = ${tenantId}
    AND b."tenantId" = ${tenantId}
    AND a."emailId" = ANY(${candidateEmailIds}::text[])
    AND a."emailId" < b."emailId"   -- pair de-dup (lexicographic)
    AND (a."vector" <=> b."vector") < 0.1  -- cosine distance < 0.1 ↔ similarity > 0.9
`;
```

**Constants exports** (mirror analog lines 59-69):
```typescript
export const LIGHT_COSINE_DEDUP_THRESHOLD = 0.9;  // ↔ cosine distance < 0.1
export const LIGHT_WINDOW_SECONDS = 3600;         // 1-hour rolling window (D-B1)
```

**Force-flush call for D-B4** — wrapped per gotcha (flushSenderSignals is private):
```typescript
// If TriageLearningService.flushSenderSignals stays private, caller invokes a new
// public wrapper forceFlushSenderSignalsForTenant(tenantId, senderEmails[]) added
// in triage-learning.service.ts as a minimal visibility change.
for (const senderEmail of touchedSenders) {
  await triageLearningService.forceFlushSenderSignalsForTenant(tenantId, [senderEmail]);
}
```

**Delta from analog:**
- No Redis client in `deps` (Light touches Postgres + pgvector only; Redis flush goes through `triageLearningService`).
- New `TriageCorrectionCluster` upsert site — uses composite unique `(tenantId, senderEmail, type, oldValue, newValue, windowStart)` per D-B3.
- Upsert driver NOT `graphNode.upsert` — this model CAN have a composite unique (additive migration), so standard `prisma.triageCorrectionCluster.upsert` works (NO Landmine §1 find-then-create pattern needed).

**Landmines:**
- **`windowStart` must be `date_trunc('hour', now())`** — set by the CALLER (scheduler handler), not the helper. If the helper computes it, clock drift between start-of-sweep and in-sweep upserts will break the unique-key idempotency.
- **Missing embedding → no merge** (D-B2 + gotcha line 209). Query returns pairs only where BOTH sides have a vector; un-paired corrections are persisted as independent cluster rows (`count = 1`).
- **`flushSenderSignals` is private** (confirmed at `triage-learning.service.ts:392`). Either (a) change visibility to `public` on that method, or (b) add a thin public wrapper `forceFlushSenderSignalsForTenant(tenantId: string, senderEmails: string[])` that internally calls `this.flushSenderSignals(\`${tenantId}:${email}\`, /* drained signals */)`. Planner picks the lower-risk shape.

---

### 3. `backend/src/modules/ai/consolidation/triage-rem-consolidation.helpers.ts` (pure helper, optional)

**Analog:** `backend/src/modules/ai/services/triage-affinity-promotion.helpers.ts` (490 LF — pure-function + deps-object + `findOrCreateGraphNode` Landmine §1 Option (b) template)

**Deps-object pattern** (analog lines 52-57):
```typescript
export interface RemConsolidationDeps {
  prisma: PrismaService;
  promotionCounter?: Counter<string>;
  contradictionsCounter?: Counter<string>;
  activeEdgesGauge?: Gauge<string>;
  halfLifeDays: number;
}
export interface RemConsolidationTenantResult {
  subThresholdDomainsPromoted: number;
  kind1ContradictionsFound: number;
  kind2ContradictionsFound: number;
  edgesDemoted: number;
}
```

**Constants reuse from `triage-feedback.service.ts` lines 53-61** (D-C4 REM sub-threshold roll-up):
```typescript
import {
  MIN_DISTINCT_SENDERS_FOR_DOMAIN,    // = 3, exported line 53
  ROLE_ACCOUNT_LOCAL_PARTS,           // Set, exported line 57
} from '../services/triage-feedback.service';
import { weightCorrection } from '../utils/triage-correction-weight';
import { extractDomain } from '../services/triage-decay-gc.helpers';  // re-exports from ../utils/domain-extraction
```

**Landmine §1 Option (b) find-then-create** — if REM needs to write NEW GraphNode rows for sub-threshold domain roll-up, COPY VERBATIM from analog lines 86-122:
```typescript
async function findOrCreateGraphNode(prisma, args: { tenantId; nodeType; externalId; label }): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM graph_nodes
      WHERE "tenantId" = ${args.tenantId}
        AND "nodeType" = ${args.nodeType}
        AND "externalId" = ${args.externalId}
      FOR UPDATE LIMIT 1
    `;
    if (existing.length > 0) return { id: existing[0].id };
    const created = await tx.graphNode.create({
      data: { tenantId, nodeType, externalId, label },
      select: { id: true },
    });
    return created;
  });
}
```

**GraphEdge upsert pattern (for sub-threshold domain promotion)** (analog lines 305-338):
```typescript
await prisma.graphEdge.upsert({
  where: {
    tenantId_sourceId_targetId_edgeType: { tenantId, sourceId: domainNode.id, targetId: labelNode.id, edgeType: 'DOMAIN_LABEL_AFFINITY' },
  },
  update: { confidence: computedConfidence, validFrom: jobTimestamp, metadata },
  create: { tenantId, sourceId: domainNode.id, targetId: labelNode.id, edgeType: 'DOMAIN_LABEL_AFFINITY',
            confidence: computedConfidence, validFrom: jobTimestamp, metadata },
});
```

**Contradiction Kind 1 detection** (D-D1 — same-source competing edges via raw SQL):
```typescript
// Kind 1: GROUP BY (tenantId, sourceId) HAVING COUNT(DISTINCT targetId) > 1 AND MIN(confidence) >= 0.8
const kind1Hits = await prisma.$queryRaw<Array<{
  sourceId: string; targetIds: string[]; edgeIds: string[]; confidences: number[];
}>>`
  SELECT e."sourceId",
         array_agg(e."targetId" ORDER BY e."confidence" DESC) AS "targetIds",
         array_agg(e."id" ORDER BY e."confidence" DESC) AS "edgeIds",
         array_agg(e."confidence" ORDER BY e."confidence" DESC) AS "confidences"
  FROM "graph_edges" e
  WHERE e."tenantId" = ${tenantId}
    AND e."edgeType" IN ('SENDER_LABEL_AFFINITY', 'DOMAIN_LABEL_AFFINITY')
    AND e."confidence" >= 0.8
    AND (e."validUntil" IS NULL OR e."validUntil" > now())
  GROUP BY e."sourceId"
  HAVING COUNT(DISTINCT e."targetId") > 1
`;
```

**Contradiction Kind 2 detection** (D-D1 — sender-vs-domain disagreement):
```typescript
// Kind 2: senderEdge (>=0.8) ↔ domainEdge (>=0.8) for same logical sender pointing to different labels
// Requires joining sender node → extractDomain → email_domain node → their respective edges.
// Shape (sketch — planner refines):
const kind2Hits = await prisma.$queryRaw<Array<{
  senderEdgeId: string; domainEdgeId: string; senderLabelId: string; domainLabelId: string;
  senderConfidence: number; domainConfidence: number; senderEmail: string;
}>>`
  SELECT se."id" AS "senderEdgeId", de."id" AS "domainEdgeId",
         stgt."externalId" AS "senderLabelId", dtgt."externalId" AS "domainLabelId",
         se."confidence" AS "senderConfidence", de."confidence" AS "domainConfidence",
         ssrc."externalId" AS "senderEmail"
  FROM "graph_edges" se
  JOIN "graph_nodes" ssrc ON ssrc."id" = se."sourceId" AND ssrc."nodeType" = 'sender'
  JOIN "graph_nodes" stgt ON stgt."id" = se."targetId"
  -- split domain from ssrc.externalId via split_part(X, '@', 2)
  JOIN "graph_nodes" dsrc ON dsrc."nodeType" = 'email_domain'
                         AND dsrc."tenantId" = se."tenantId"
                         AND dsrc."externalId" = split_part(ssrc."externalId", '@', 2)
  JOIN "graph_edges" de ON de."sourceId" = dsrc."id"
                       AND de."tenantId" = se."tenantId"
                       AND de."edgeType" = 'DOMAIN_LABEL_AFFINITY'
                       AND (de."validUntil" IS NULL OR de."validUntil" > now())
                       AND de."confidence" >= 0.8
  JOIN "graph_nodes" dtgt ON dtgt."id" = de."targetId"
  WHERE se."tenantId" = ${tenantId}
    AND se."edgeType" = 'SENDER_LABEL_AFFINITY'
    AND (se."validUntil" IS NULL OR se."validUntil" > now())
    AND se."confidence" >= 0.8
    AND stgt."externalId" != dtgt."externalId"  -- different labels = contradiction
`;
```

**Audit insert + demote** (D-D2 + D-D3):
```typescript
// Insert audit row + increment counter for EACH hit.
await prisma.triageConsolidationAudit.create({
  data: {
    tenantId, kind: 'competing_source',  // or 'sender_vs_domain'
    sourceNodeId: hit.sourceId,
    targetNodeIds: hit.targetIds,
    edgeIds: hit.edgeIds,
    confidencesBefore: hit.confidences,
    confidencesAfter: hit.edgeIds.map(() => 0.79),  // D-D3: demote both to 0.79
    notes: {},  // D-D2 leaves empty for Phase 151; Phase 152 SAFE-02 defines shape
  },
});
contradictionsCounter?.inc({ kind: 'competing_source', tenant_id: tenantId });

// D-D3: demote both contradicting edges to 0.79 via updateMany.
// IMPORTANT (gotcha §207): preserve metadata.promotionAudit.computedConfidence
// as-is — only confidence is clamped, audit fields record "what the math WOULD have said".
await prisma.graphEdge.updateMany({
  where: { tenantId, id: { in: hit.edgeIds } },
  data: { confidence: 0.79 },   // NOT setting metadata — promotionAudit.computedConfidence stays intact
});
```

**Delta from analog:**
- Two distinct SQL queries (Kind 1 GROUP BY; Kind 2 JOIN) vs. analog's single promotion aggregation loop.
- Writes to NEW `TriageConsolidationAudit` model (not GraphEdge).
- `updateMany` for demotion (NOT `upsert`) — edges already exist at this point.
- Sub-threshold domain roll-up (D-C4) still uses the analog's `findOrCreateGraphNode` + `graphEdge.upsert` pattern for the novel domain edges.

**Landmines:**
- **D-D3 confidence dual-writer** (gotcha §207): `confidence` column has two writers — promotion math (Deep) and contradiction clamp (REM). `metadata.promotionAudit.computedConfidence` records what the math said; DO NOT overwrite it on demote. Docstring must state "last-write-wins until Phase 152 SAFE-03 arbitrates."
- **D-D4 bounded oscillation** (gotcha §209): corrections keep flowing → Deep re-promotes → next REM re-demotes. Accept this. DO NOT add cooldown / frozenUntil / escalation. Document in REM handler docstring: "Accepted transitional state until Phase 152 SAFE-03."
- **Kind 2 domain-extraction in SQL** — `split_part(ssrc.externalId, '@', 2)` must mirror app-layer `extractDomain` semantics (no subdomain collapsing per P150 D-04a). Sender externalId format is already normalized lowercase email per P150 D-04a.
- **Landmine §1 Option (b)** — any NEW graph_node write MUST use `findOrCreateGraphNode` with `SELECT ... FOR UPDATE LIMIT 1` because `graph_nodes` does NOT have a `(tenantId, nodeType, externalId)` unique constraint. Analog docstring lines 31-42 explain the history; REM sub-threshold domain promotion writes `email_domain` + `label` nodes, so this applies.
- **REM read path sanity** (gotcha §180): demote to 0.79 must stay in the LLM-hint band (`[0.7, cutoff)`). Verify with Phase 150 D-03/D-07 cutoff default `9999` — 0.79 is well inside hint band. Confirmed by `triage-graph-lookup.service.ts:95` (`e."confidence" >= 0.7`).

---

### 4. `backend/src/modules/ai/consolidation/consolidation.module.ts` (NestJS feature module)

**Analog:** `backend/src/modules/ai/ai.module.ts` lines 102-201 (providers/exports/imports `@Module` style)

**Concrete excerpt to mirror** (imports + providers + exports, simplified):
```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { TriageConsolidationScheduler } from './triage-consolidation.scheduler';
import { TriageLearningService } from '../services/triage-learning.service';

@Module({
  imports: [
    PrismaModule,
    // PrometheusModule / MetricsModule is @Global() — providers inject @InjectMetric directly.
  ],
  providers: [
    TriageConsolidationScheduler,
    // TriageLearningService must be resolvable — either re-declare here (if not
    // exported by AiModule) or @Inject it from AiModule via `forwardRef`.
    // `ai.module.ts:228` DOES export TriageLearningService, so the right path is
    // `imports: [forwardRef(() => AiModule)]` — avoid circular by careful ordering.
  ],
  exports: [
    // None — ConsolidationModule is a leaf. The scheduler self-activates at OnModuleInit.
  ],
})
export class ConsolidationModule {}
```

**Delta:**
- Much smaller than `AiModule` (leaf module, no controllers, no exports).
- `PrometheusModule` is `@Global` via `backend/src/common/metrics/metrics.module.ts:18` — `@InjectMetric` works without importing it here.
- `PrismaModule` is the only mandatory import.

**Landmines:**
- **Circular dependency risk** with `AiModule` if both mutually import. Pick ONE direction: `AiModule.imports += ConsolidationModule` (simpler, per CONTEXT §199). ConsolidationModule should NOT re-import AiModule; instead, declare any needed dependencies (`TriageLearningService`, `PrismaService`) as providers directly or via a shared sub-module.
- **`TriageLearningService` provider** — already exported by AiModule (line 228 of `ai.module.ts`). The recommended path is: `@Module({ imports: [PrismaModule, forwardRef(() => AiModule)] })` — but if that creates a cycle, re-declare `TriageLearningService` as a local provider in `ConsolidationModule` (it has clean dependencies: `RedisConnectionService`, `ConfigService`, `PrismaService`).
- **DO NOT register `TriageBackfillSchedulerService`** here — it stays in AiModule (D-A3 keeps Phase 149 standalone decay-gc as safety net).

---

### 5. `backend/prisma/schema.prisma` (ADD 2 models + Tenant back-refs)

**Analog:**
- `GraphEdge` model at lines 2293-2319 (multi-tenant FK + indexes + `@@unique` composite)
- `TriageOverride` model at lines 2550-2563 (simpler multi-tenant pattern)
- `EmailTriageFeedback` model at lines 2565-2581 (JSON-free, indexed-by-timestamp pattern)
- `Tenant.graphEdges` / `Tenant.triageOverrides` at lines 64-65, 88 (back-reference pattern)

**Multi-tenant FK pattern** (analog `GraphEdge` lines 2306-2310):
```prisma
model TriageCorrectionCluster {
  id                     String   @id @default(cuid())
  tenantId               String
  senderEmail            String
  type                   String
  oldValue               String?
  newValue               String?
  count                  Int      @default(1)
  firstAt                DateTime
  lastAt                 DateTime
  representativeEmailId  String
  windowStart            DateTime
  createdAt              DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, senderEmail, type, oldValue, newValue, windowStart])
  @@index([tenantId, lastAt])
  @@map("triage_correction_clusters")
}
```

**Audit model** (analog `GraphEdge` indexes + `EmailTriageFeedback` composite index):
```prisma
model TriageConsolidationAudit {
  id                 String   @id @default(cuid())
  tenantId           String
  detectedAt         DateTime @default(now())
  kind               String   // 'competing_source' | 'sender_vs_domain'
  sourceNodeId       String
  targetNodeIds      String[]
  edgeIds            String[]
  confidencesBefore  Float[]
  confidencesAfter   Float[]
  notes              Json     @default("{}")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, detectedAt])
  @@index([tenantId, kind])
  @@map("triage_consolidation_audits")
}
```

**Tenant back-references** (add to Tenant block at schema.prisma:10-100; mirror line 64-65 shape):
```prisma
model Tenant {
  // ... existing fields ...
  graphNodes                    GraphNode[]
  graphEdges                    GraphEdge[]
  // ... existing fields ...
  triageOverrides               TriageOverride[]
  // ADD:
  triageCorrectionClusters      TriageCorrectionCluster[]
  triageConsolidationAudits     TriageConsolidationAudit[]
}
```

**Delta from analogs:**
- `TriageCorrectionCluster` has a 6-column composite `@@unique` — broader than GraphEdge's 4-column one (D-B3 upsert dedup key).
- `TriageConsolidationAudit` uses `String[]` + `Float[]` arrays — Prisma-native, no JSON blob parsing. Analog `GraphEdge.metadata` is `Json` (structural rows vs. free-form — CLAUDE.md + CONTEXT D-D2 prefer structured columns for query-ability).
- Both models have simpler FK surface than `GraphEdge` (no source/target to other GraphNode rows).

**Landmines:**
- **Nullable columns only** (D-A1 "additive" + CLAUDE.md Guard A): every column except `id`, `tenantId`, `kind`, `firstAt`, `lastAt`, `representativeEmailId`, `windowStart`, `detectedAt` should be nullable in the FIRST migration. `count` has `@default(1)` so it's also safe. DO NOT add `NOT NULL` to columns without defaults — migration will fail Guard A without `-- ALLOW-DESTRUCTIVE:` on existing-row backfill (not applicable here since both tables are brand new).
- **Migration workflow** (CLAUDE.md hard rule): `cd backend && npx prisma migrate dev --name add_triage_consolidation_tables` against LOCAL Postgres. Review the generated SQL. Commit the migration file + schema.prisma together. Railway's build pipeline applies it via `prisma migrate deploy` on deploy. **NEVER use `prisma db push`.**
- **String[] + Float[]** — PostgreSQL-native array types. Prisma supports them directly; no `ALLOW-DESTRUCTIVE` needed (they're new columns in new tables).
- **Indexes without `@@id`** — the composite `@@unique` on TriageCorrectionCluster doubles as a query index for upsert; the `(tenantId, lastAt)` index drives Deep's "recent clusters in window" reads.
- **`oldValue` / `newValue` nullable** — matches `EmailTriageFeedback.oldValue/newValue String?` at lines 2571-2572.

---

### 6. `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts` (DELETE affinity-promotion)

**Analog:** self — this is a surgical deletion operation, not a new-pattern copy.

**Exact lines to DELETE (per D-A2 + D-B5):**

Line 25 (union member):
```typescript
    | 'affinity-promotion'; // Phase 150 D-01   ← DELETE
```

Lines 70-74 (metric injections that now belong to the consolidation scheduler):
```typescript
@Optional() @InjectMetric('triage_graph_promotion_total')
private readonly promotionCounter?: Counter<string>,
@Optional() @InjectMetric('triage_graph_edges_active')
private readonly activeEdgesGauge?: Gauge<string>,
```
These stay ONLY IF other code paths on the backfill scheduler use them (none do — grep to confirm). Otherwise DELETE; consolidation.module.ts registers them.

Lines 135-137 (worker switch branch):
```typescript
if (job.data.type === 'affinity-promotion') {
  return this.processAffinityPromotion(job);
}
```

Line 14 (import statement):
```typescript
import { processAffinityPromotionForTenant } from './triage-affinity-promotion.helpers';
```

Lines 202 + 220-233 (setupRepeatableJob — both the cleanup entry and the cron registration):
```typescript
job.name === 'nightly-affinity-promotion' // Phase 150 D-01    ← DELETE from cleanup if-else

await this.queue.add(
  'nightly-affinity-promotion',
  { type: 'affinity-promotion' },
  { repeat: { pattern: '0 3 * * *' }, jobId: 'triage-nightly-affinity-promotion' },
);
// ← DELETE entire block
```

Lines 490-541 (`processAffinityPromotion` method body — entire method).

**DO NOT DELETE:**
- `processDecayGc` (lines 438-488) — still runs decay-gc as safety net per D-A3.
- `processAffinityEdgeDecayForTenant` import (line 12-13) — `processDecayGc` still calls it.
- `gcCounter`, `halfLifeGauge`, `lastRunGauge` metric injections (lines 64-69) — decay-gc still emits them.

**Verification criterion** (CONTEXT D-A2 line 50):
```bash
grep -r "affinity-promotion" backend/src/
# Expected: zero hits, except inside migration comments.
```

**Landmines:**
- **Leftover imports** — after deletion, TypeScript may still import `processAffinityPromotionForTenant` from an unused import. Run `cd backend && npx tsc --noEmit` to catch dead imports (CLAUDE.md Post-Edit Validation mandate).
- **Prometheus provider lifetime** — if the backfill scheduler's DI injection is removed AND the metrics remain registered in `metrics.module.ts`, the metric providers live on (consolidation.module consumes them). Do NOT remove the metric registrations from `metrics.module.ts`.
- **Repeatable-jobs cleanup** — the `'nightly-affinity-promotion'` jobId persists in Redis BullMQ state even after code-level removal. Deploying the new code will NOT auto-clean it. Leave the cleanup entry (analog line 202) in place for ONE deploy cycle to force removal, then delete in a follow-up cleanup PR. Alternative: write a one-shot `@Injectable()` with `OnModuleInit` to `queue.removeRepeatableByKey` for the old jobId. Planner's call — document in migration notes.

---

### 7. `backend/src/modules/ai/ai.module.ts` (add ConsolidationModule import)

**Analog:** self — existing imports block at lines 103-111.

**Concrete excerpt (ADD 1 line):**
```typescript
import { ConsolidationModule } from './consolidation/consolidation.module';

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    SubscriptionModule,
    ComplianceModule,
    RealtimeModule,
    SuggestionModule,
    ConsolidationModule,  // ← ADD Phase 151
  ],
  // ...
})
```

**Delta:** one import line + one entry in the `imports` array.

**Landmines:**
- **Do NOT remove `TriageBackfillSchedulerService`** from `providers[]` (line 137) — still owns decay-gc safety net per D-A3.
- **Provider double-registration** — `TriageConsolidationScheduler` is registered ONLY in `ConsolidationModule.providers[]`. If ai.module.ts ALSO registers it, NestJS creates a second instance → two workers, double cron emission. The ai.module.ts import above is enough; do NOT add `TriageConsolidationScheduler` to ai.module.ts's providers.

---

### 8. `backend/src/modules/ai/services/triage-learning.service.ts` (conditional MODIFY)

**Analog:** self at lines 383-448 (`flushSenderSignals` is `private async`).

**Change required** (gotcha §206 confirmed by grep line 392): add a minimal public wrapper.

**Concrete excerpt (ADD at end of public API block, analog line ~360 before `// Private` section):**
```typescript
/**
 * Phase 151 D-B4: Light consolidation forces a flush per touched sender
 * even when buffer hasn't reached FLUSH_THRESHOLD. Wraps private
 * `flushSenderSignals` for an explicit per-sender compute+blend+persist pass.
 *
 * Uses the existing drain-lua + EMA blend pipeline — no new math.
 */
async forceFlushSenderSignalsForTenant(
  tenantId: string,
  senderEmails: string[],
): Promise<void> {
  for (const senderEmail of senderEmails) {
    const normalized = senderEmail.trim().toLowerCase();
    const bufferKey = `${REDIS_BUFFER_PREFIX}:${tenantId}:${normalized}`;
    await this.drainAndFlush(bufferKey, tenantId, normalized).catch((err) => {
      this.logger.warn(
        `Force-flush failed for ${tenantId}:${normalized}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }
}
```

**Delta:** new public method, delegates to existing private `drainAndFlush` (line 369) which in turn calls `flushSenderSignals` (line 392). No visibility changes on the existing private methods — minimal surface area.

**Landmines:**
- **Keep existing methods private** — changing `flushSenderSignals` visibility would expose a wider contract than needed and the method signature `flushSenderSignals(key: string, signals: TriageSignal[])` is awkward (the `key` is pre-composed `${tenantId}:${senderEmail}`). The wrapper above gives a tenant-safe interface.
- **Redis connection ordering** — `forceFlushSenderSignalsForTenant` can only be called AFTER `onModuleInit` (`this.redis` must exist). Not a concern from the scheduler path since both live in the same Nest lifecycle, but document it.
- **No-op-safe** — if the buffer is empty, `drainAndFlush` returns without error (line 379 early-return).

---

## Shared Patterns

### Multi-tenant Prisma invariant (CLAUDE.md hard rule)

**Source:** analog `triage-decay-gc.helpers.ts:159-161` + `triage-affinity-promotion.helpers.ts` throughout
**Apply to:** Every Prisma call in all new handlers + helpers.

```typescript
// CORRECT — tenant-scoped
await prisma.triageCorrectionCluster.findMany({ where: { tenantId, ...others } });
await prisma.graphEdge.updateMany({
  where: { tenantId, id: { in: edgeIds } },   // tenantId ALWAYS in where even with id scoped
  data: { confidence: 0.79 },
});

// WRONG — security vulnerability
await prisma.triageCorrectionCluster.findMany({ where: { ...others } });
```

### BullMQ scheduler + worker lifecycle

**Source:** `triage-backfill-scheduler.service.ts:104-186` (`onModuleInit`) + 188-191 (`onModuleDestroy`)
**Apply to:** `triage-consolidation.scheduler.ts`

Copy the `onModuleInit` / `onModuleDestroy` pair verbatim. Key constraints:
- `concurrency: 1` on the Worker (analog line 151)
- `removeRepeatableByKey` cleanup before re-adding (analog lines 197-206)
- `this.worker.on('completed'/'failed', ...)` log listeners (analog lines 156-166)

### Prometheus metric registration

**Source:** `backend/src/common/metrics/metrics.module.ts:105-152` (Phase 149 D-11 + Phase 150 D-07a blocks)
**Apply to:** ADD 4 new providers + 4 new getToken exports in same file.

```typescript
// ADD in providers[] after line 152:
// Phase 151 D-E2: three per-phase end-of-run gauges + 1 contradiction counter.
makeCounterProvider({
  name: 'triage_contradictions_found_total',
  help: 'Total contradictions detected by REM consolidation by kind × tenant',
  labelNames: ['kind', 'tenant_id'],
}),
makeGaugeProvider({
  name: 'triage_light_last_run_timestamp_seconds',
  help: 'Epoch seconds at end of last Light consolidation pass',
  labelNames: [],
}),
makeGaugeProvider({
  name: 'triage_deep_last_run_timestamp_seconds',
  help: 'Epoch seconds at end of last Deep consolidation pass',
  labelNames: [],
}),
makeGaugeProvider({
  name: 'triage_rem_last_run_timestamp_seconds',
  help: 'Epoch seconds at end of last REM consolidation pass',
  labelNames: [],
}),

// ADD in exports[] after line 178:
getToken('triage_contradictions_found_total'),
getToken('triage_light_last_run_timestamp_seconds'),
getToken('triage_deep_last_run_timestamp_seconds'),
getToken('triage_rem_last_run_timestamp_seconds'),
```

**Inline comment to ADD for SC-5 naming delta (D-E1 requirement):**
```typescript
// Phase 151 D-E1 SC-5 naming delta (intentional reuse of Phase 149/150 counters):
//   SC-5 name                             → existing canonical metric
//   triage_patterns_promoted_total        → triage_graph_promotion_total (Phase 150 D-07a)
//   triage_edges_decayed_total            → triage_patterns_gc_total{store='graph_edge'} (Phase 149 D-11)
//   triage_contradictions_found_total     → NEW this phase (below).
// Operators reading SC-5 against dashboards should use the canonical names.
```

### Pure-function helper + deps-object pattern

**Source:** `triage-decay-gc.helpers.ts:1-92` + `triage-affinity-promotion.helpers.ts:1-68`
**Apply to:** Both optional Light and REM helper files.

- Export `interface <Name>Deps { prisma; /* counters as optional */; halfLifeDays; }`.
- Export `interface <Name>TenantResult { ... numeric counts ... }`.
- Entry point: `export async function process<Name>ForTenant(tenantId, deps, ...otherParams): Promise<<Name>TenantResult>`.
- File header docstring lists invariants + D-xx references + Phase/Plan links.

### Landmine §1 Option (b) find-then-create for GraphNode writes

**Source:** `triage-affinity-promotion.helpers.ts:71-122` (+ docstring lines 27-42)
**Apply to:** Any new `GraphNode` write in REM's sub-threshold domain roll-up (D-C4).

**Rationale** (docstring verbatim): `graph_nodes` does NOT have a `(tenantId, nodeType, externalId)` unique constraint, so `prisma.graphNode.upsert` is a compile-time type error. Use the find-then-create transaction.

```typescript
return prisma.$transaction(async (tx) => {
  const existing = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM graph_nodes
    WHERE "tenantId" = ${args.tenantId}
      AND "nodeType" = ${args.nodeType}
      AND "externalId" = ${args.externalId}
    FOR UPDATE LIMIT 1
  `;
  if (existing.length > 0) return { id: existing[0].id };
  return tx.graphNode.create({ data: { ...args }, select: { id: true } });
});
```

### Zettelkasten provenance preservation (P150 D-01a, preserved through P151)

**Source:** `triage-affinity-promotion.helpers.ts:294-303` (metadata shape)

**Apply to:** Deep handler's GraphEdge upserts (delegated to `processAffinityPromotionForTenant` — no change). REM's `updateMany` demote MUST NOT touch `metadata.promotionAudit.computedConfidence` (gotcha §207).

```typescript
const metadata = {
  derivedFromOverrideIds,
  promotionAudit: {
    jobId,
    jobTimestamp: jobTimestamp.toISOString(),
    computedConfidence,
    feedbackRowCount: entry.count,
    halfLifeDays,
  },
};
// REM demote uses `updateMany` with only `{ confidence: 0.79 }` — metadata untouched.
```

### Tenant scoping bypass for cross-tenant worker callbacks

**Source:** `triage-backfill-scheduler.service.ts:130-148`
**Apply to:** All three Phase 151 handlers.

Wrap the entire worker callback body in `withoutTenantScopingAsync(async () => { ... })`. Handlers iterate all active tenants; Prisma's tenant-scoping middleware would block this without the wrapper.

```typescript
async (job: Job<ConsolidationJobData>) => {
  return withoutTenantScopingAsync(async () => {
    // dispatch to handler
  });
}
```

---

## No Analog Found

None. All 10 new/modified files have a direct codebase analog.

---

## Metadata

**Analog search scope:**
- `backend/src/modules/ai/services/` (all files)
- `backend/src/modules/ai/ai.module.ts`
- `backend/src/common/metrics/metrics.module.ts`
- `backend/prisma/schema.prisma` (GraphEdge, GraphNode, TriageOverride, EmailTriageFeedback, LabelAccuracyProfile, Embedding, Tenant)

**Files scanned:** 8 analog files (full reads, no truncation; all under 700 LF)

**Pattern extraction date:** 2026-04-24

**Tokens saved vs naive reading:** None of the 8 analogs exceeded 2000 lines. One read per file, no re-reads.

---

## PATTERN MAPPING COMPLETE
