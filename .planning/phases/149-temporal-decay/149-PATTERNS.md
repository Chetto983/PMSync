# Phase 149: Temporal Memory Decay - Pattern Map

**Mapped:** 2026-04-23
**Files analyzed:** 6 in-scope files (5 modify, 1 tests rewrite) + 3 pattern sources
**Analogs found:** 6 / 6 (all in-scope files have a concrete analog or anchor in-file)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/src/modules/ai/utils/triage-correction-weight.ts` | utility (pure) | transform | `backend/src/modules/ai-chat/services/reranking.service.ts` (static `computeRecencyFactor`, lines 165-188) | role-match (util vs service, same math) |
| `backend/src/modules/ai/utils/__tests__/triage-correction-weight.spec.ts` | test (unit, pure) | transform | self (existing file, rewrite) + reranking test style for property-based assertions | exact (same file) |
| `backend/src/modules/ai/services/triage-learning.service.ts` | service (stateful, Redis) | event-driven | self (in-file edit to `blendScores` + `flushSenderSignals`, lines 88-106, 362-399) | exact (in-file) |
| `backend/src/modules/ai/services/triage-correction.service.ts` | service (read-only, DB) | request-response | self (in-file edit: swap lines 11-13 + line 80 inlined `Math.exp` for helper call) | exact (in-file, trivial substitution) |
| `backend/src/modules/ai/services/triage-feedback.service.ts` | service (DB + event emit) | request-response | N/A — no call-site edit, semantics flip via helper (line 240 `weightCorrection(ageDays)`) | no edit needed |
| `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts` | service (scheduled worker, BullMQ) | batch | self for scheduler wiring (lines 86-168, 307-434) + `orphan-embedding-cleanup.service.ts` for hard-delete loop + `label-accuracy.service.ts` (lines 82-101) for `@Optional() @InjectMetric` Counter pattern | exact composite (scheduler own code + two cross-cuts) |

Score rationale: all six files sit in the same module (`modules/ai`), and the three pattern anchors (`reranking.service.ts`, `orphan-embedding-cleanup.service.ts`, existing `TriageBackfillSchedulerService.processRecalculation`) already implement the exact shapes Phase 149 needs. There is no "adjacent-domain" risk — this is a pure primitive swap + a sibling scheduled-job addition.

---

## Pattern Assignments

### `backend/src/modules/ai/utils/triage-correction-weight.ts` (utility, transform)

**Analog:** `backend/src/modules/ai-chat/services/reranking.service.ts`

The helper must stay a pure, DI-free function (CLAUDE.md "pure util pattern" — utils/*.ts stays DI-free, services inject ConfigService and pass config in). Reranking's `computeRecencyFactor` is the closest code that implements the same `exp(-ln2/halfLife * ageDays)` formula with a min-clamp. Copy the math verbatim; adapt to a free function with an `opts` bag per D-01.

**Canonical formula pattern** (reranking.service.ts lines 22-26, 165-188):
```typescript
/** Half-life for recency decay in days (score halves every 14 days) */
private static readonly RECENCY_HALF_LIFE_DAYS = 14;
/** ln(2) precomputed */
private static readonly LN2 = Math.LN2;
/** Minimum recency factor — old emails never fully disappear */
private static readonly MIN_RECENCY_FACTOR = 0.5;

// ...

private computeRecencyFactor(
  receivedAt: Date | null,
  nowMs: number,
): number {
  if (!receivedAt) return RerankingService.MIN_RECENCY_FACTOR;

  const ageDays =
    (nowMs - new Date(receivedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 1.0;

  const decay = Math.exp(
    (-RerankingService.LN2 / RerankingService.RECENCY_HALF_LIFE_DAYS) *
      ageDays,
  );
  return Math.max(decay, RerankingService.MIN_RECENCY_FACTOR);
}
```

**Adaptation for Phase 149 helper** (D-01 signature: `weightCorrection(ageDays, { halfLifeDays?, minWeight? })`):
- Convert static class fields to `const DEFAULT_HALF_LIFE_DAYS = 14;` and `const DEFAULT_MIN_WEIGHT = 0;` module-level.
- `ageDays <= 0` branch returns `1.0` (matches existing "defensive negative age" test assertion and reranking behavior).
- Use `Math.max(decay, minWeight)` where `minWeight` defaults to `0` (NOT `0.5` — reranking's use-case is "old emails never disappear from search"; ours is "stale corrections should eventually be GC'd").
- Keep the existing `TP_IMPLICIT_WINDOW_DAYS = 14` export in this file untouched (Phase 148 consumers).

**Existing header comment to REPLACE** (current file lines 1-13):
```typescript
/**
 * Phase 149 pre-stage helper. Phase 147 implementation is a flat 30-day TTL;
 * Phase 149 will swap this for exponential decay (14-day half-life) without
 * changing call sites.
 * ...
 */
export function weightCorrection(ageDays: number): number {
  return ageDays <= 30 ? 1 : 0;
}
```
Replace with an exponential-decay implementation. Update the block comment to reflect the new semantics AND the new `TriageCorrectionService` call site (previously listed as NOT calling, Phase 149 D-01 unifies).

---

### `backend/src/modules/ai/utils/__tests__/triage-correction-weight.spec.ts` (test, transform)

**Analog:** Existing file (rewrite per D-13) + property-based style.

**Current test pattern to REPLACE** (lines 1-29): all 7 `toBe(1) / toBe(0)` assertions encode the FLAT 30d semantics that Phase 149 intentionally changes. Per D-13, rewrite to assert the exponential-decay invariants — not specific numeric outputs (except the half-life anchor).

**Required rewritten assertions** (D-13 invariants):
```typescript
import { weightCorrection } from '../triage-correction-weight';

describe('weightCorrection (Phase 149 — exponential decay)', () => {
  it('returns 1 at age 0', () => {
    expect(weightCorrection(0)).toBe(1);
  });

  it('returns ~0.5 at the half-life (14 days by default)', () => {
    expect(weightCorrection(14)).toBeCloseTo(0.5, 5);
  });

  it('returns ~0.25 at 2× half-life', () => {
    expect(weightCorrection(28)).toBeCloseTo(0.25, 5);
  });

  it('is monotonically non-increasing in ageDays', () => {
    let prev = weightCorrection(0);
    for (const age of [1, 5, 10, 14, 20, 30, 50, 100]) {
      const w = weightCorrection(age);
      expect(w).toBeLessThanOrEqual(prev);
      prev = w;
    }
  });

  it('is bounded in [minWeight, 1]', () => {
    for (const age of [0, 1, 14, 100, 1000]) {
      const w = weightCorrection(age);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it('respects custom halfLifeDays (opts)', () => {
    expect(weightCorrection(7, { halfLifeDays: 7 })).toBeCloseTo(0.5, 5);
    expect(weightCorrection(28, { halfLifeDays: 7 })).toBeCloseTo(0.0625, 5);
  });

  it('clamps to minWeight', () => {
    const w = weightCorrection(1000, { minWeight: 0.1 });
    expect(w).toBe(0.1);
  });

  it('returns 1 for negative/zero age (clock-skew defensive)', () => {
    expect(weightCorrection(-1)).toBe(1);
    expect(weightCorrection(0)).toBe(1);
  });

  it('env-disable pattern: large halfLife keeps weight ≈1 (D-12 kill switch)', () => {
    // TRIAGE_DECAY_HALF_LIFE_DAYS=9999 rollback switch invariant
    expect(weightCorrection(30, { halfLifeDays: 9999 })).toBeCloseTo(1, 3);
  });
});
```

**Style note:** no DI, no mocks, no fake timers — pure input/output math testing. Matches the "pure util" test style already established in `backend/src/modules/ai/utils/__tests__/`.

---

### `backend/src/modules/ai/services/triage-learning.service.ts` (service, event-driven Redis)

**Analog:** self (in-file edits to `blendScores` lines 88-106, `flushSenderSignals` lines 362-399, `REDIS_TTL_SECONDS` line 75).

#### D-02: Time-aware EMA — patch `blendScores`

**Current pattern to EXTEND** (lines 77-106):
```typescript
/** EMA weight for previous score (0.0-1.0) */
const EMA_PREV_WEIGHT = 0.7;

// ...

function blendScores(
  prev: SenderBehaviorScore,
  curr: SenderBehaviorScore,
  prevWeight: number,
): SenderBehaviorScore {
  const currWeight = 1 - prevWeight;
  return {
    replyRate: prev.replyRate * prevWeight + curr.replyRate * currWeight,
    avgResponseTimeMs:
      prev.avgResponseTimeMs * prevWeight +
      curr.avgResponseTimeMs * currWeight,
    archiveWithoutReplyRate:
      prev.archiveWithoutReplyRate * prevWeight +
      curr.archiveWithoutReplyRate * currWeight,
    flagRate: prev.flagRate * prevWeight + curr.flagRate * currWeight,
    totalSignals: prev.totalSignals + curr.totalSignals,
    lastUpdated: curr.lastUpdated,
  };
}
```

**Phase 149 modification (D-02):** change signature to take a `dtDays` param (time since `prev.lastUpdated`) and a `halfLifeDays` param, compute `effectivePrevWeight = EMA_PREV_WEIGHT * exp(-LN2/halfLifeDays * dtDays)`, then proceed with the existing convex blend using that effective weight. Every field blend line stays identical — only the `prevWeight` value flowing in changes.

**Sketch** (keep the structure, change only the weight derivation):
```typescript
function blendScores(
  prev: SenderBehaviorScore,
  curr: SenderBehaviorScore,
  basePrevWeight: number,    // was `prevWeight` — renamed for clarity
  dtDays: number,            // NEW — time since prev.lastUpdated
  halfLifeDays: number,      // NEW — injected from call-site ConfigService
): SenderBehaviorScore {
  const decayFactor = Math.exp(-Math.LN2 / halfLifeDays * Math.max(0, dtDays));
  const prevWeight = basePrevWeight * decayFactor;
  const currWeight = 1 - prevWeight;
  // ...unchanged blend body...
}
```

#### D-02: Wire `lastUpdated` in `flushSenderSignals`

**Current pattern to MODIFY** (lines 362-399):
```typescript
private async flushSenderSignals(
  key: string,
  signals: TriageSignal[],
): Promise<void> {
  if (signals.length === 0) return;

  const [tenantId, senderEmail] = this.parseKey(key);
  if (!tenantId || !senderEmail) return;

  const newScore = computeScoreFromSignals(signals);

  // EMA-blend with existing score (if any)
  const prevScore = await this.getSenderBehavior(tenantId, senderEmail);
  const blended = prevScore
    ? blendScores(prevScore, newScore, EMA_PREV_WEIGHT)
    : newScore;

  // Persist to Redis hash
  try {
    await this.redis.hset(
      `${REDIS_KEY_PREFIX}:${tenantId}`,
      senderEmail,
      JSON.stringify(blended),
    );
    await this.redis.expire(
      `${REDIS_KEY_PREFIX}:${tenantId}`,
      REDIS_TTL_SECONDS,
    );
    // ...
```

**Phase 149 modification:** compute `dtDays = (now - Date.parse(prevScore.lastUpdated)) / 86_400_000` then pass it to `blendScores(prevScore, newScore, EMA_PREV_WEIGHT, dtDays, halfLifeDays)`. `halfLifeDays` must be injected — read it at service construction time via `ConfigService.get<string>('TRIAGE_DECAY_HALF_LIFE_DAYS', '14')` + `parseInt(..., 10)` (Phase 149 D-01 + CLAUDE.md "Established Patterns — Config pattern"). This service does NOT currently inject `ConfigService` — add it to the constructor.

#### D-03: `REDIS_TTL_SECONDS` change

**Current (line 75):**
```typescript
/** TTL for Redis hash keys (seconds) */
const REDIS_TTL_SECONDS = 30 * 24 * 3600; // 30 days
```

**Phase 149 replacement (D-03):** 4 × halfLife as outer hygiene backstop. Since `halfLifeDays` becomes a runtime config, the TTL must be computed at use-site (in `flushSenderSignals`), not at module load. Remove the module-level const; compute `const redisTtlSeconds = this.halfLifeDays * 4 * 86400;` inside `flushSenderSignals` and pass to `redis.expire`.

#### Constructor injection addendum

**Current** (lines 169-173):
```typescript
constructor(
  private readonly redisConnection: RedisConnectionService,
  @Optional() private readonly prisma?: PrismaService,
  @Optional() private readonly consentService?: ConsentEnforcementService,
) {}
```

**Add:** `private readonly configService: ConfigService` (non-optional). Read `TRIAGE_DECAY_HALF_LIFE_DAYS` once in `onModuleInit` or in a `get halfLifeDays()` getter. The scheduler (`TriageBackfillSchedulerService`) and correction service will both read the same env var — keep them consistent by using the SAME default (`14`) everywhere.

---

### `backend/src/modules/ai/services/triage-correction.service.ts` (service, request-response DB)

**Analog:** self (in-file substitution, 2-line diff + 1 constant removal).

**Current pattern to REMOVE** (lines 11-14, 80):
```typescript
const LOOKBACK_DAYS = 30;
const MAX_EXAMPLES = 3;
const DECAY_HALF_LIFE_DAYS = 14;   // REMOVE — divergent from helper (147 D-12)

// ...

const weight = Math.exp(-ageDays / DECAY_HALF_LIFE_DAYS);   // REPLACE
```

**Phase 149 replacement (D-01 unification — closes 147 D-12 divergence):**
```typescript
import { weightCorrection } from '../utils/triage-correction-weight';

// at top of class constructor
constructor(
  private readonly prisma: PrismaService,
  private readonly configService: ConfigService,   // NEW
) {}

// inside getFewShotExamples
const halfLifeDays = parseInt(
  this.configService.get<string>('TRIAGE_DECAY_HALF_LIFE_DAYS', '14'),
  10,
);

// replace line 80 exactly:
const weight = weightCorrection(ageDays, { halfLifeDays });
```

**Block-comment update:** lines 15-22 mention "Phase 149 will unify with the `weightCorrection` helper" — update to past tense once the swap lands, and remove the D-12 divergence note.

**Config pattern source** (`triage-backfill-scheduler.service.ts` lines 46-60) — canonical env-parse idiom:
```typescript
this.INTERVAL_MS = parseInt(
  this.configService.get<string>('TRIAGE_BACKFILL_INTERVAL_MS', '3600000'),
  10,
);
```

---

### `backend/src/modules/ai/services/triage-feedback.service.ts` (service, request-response)

**No code edits.** Line 4 already imports `weightCorrection` from `../utils/triage-correction-weight`; line 240 already calls it: `const w = weightCorrection(ageDays);`. The semantics flip automatically when the helper's implementation changes.

**ONE caveat:** line 241 currently reads `if (w === 0) continue;` — after Phase 149, `w` will be a continuous value in `(0, 1]` and will almost never equal exactly `0` (only when clamped by `minWeight: 0` at infinite age). The `=== 0` early-return becomes dead code but is NOT wrong — leave it alone. The planner may optionally change it to `if (w < EPSILON) continue;` for clarity, but it is not load-bearing. The promotion math downstream sums `weighted += w` and gates on `raw >= 3` (raw count, not weighted), so tiny weights contribute harmlessly.

**Verify in plan:** the `w` variable is used on line 250 (`sExisting.weighted += w`) and line 266 (`dExisting.weighted += w`). Both are additive accumulators tolerant of fractional input — no changes needed.

---

### `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts` (service, scheduled BullMQ worker)

**Analog (composite):**
1. Self — existing `setupRepeatableJob` (lines 133-168), `processRecalculation` (lines 307-347), `findActiveTenants` (lines 407-434), constructor pattern (lines 40-61).
2. `backend/src/modules/ai/services/orphan-embedding-cleanup.service.ts` — hard-delete + audit pattern (D-05).
3. `backend/src/modules/ai/services/label-accuracy.service.ts` lines 82-101 — `@Optional() @Inject(getToken('...'))` Counter injection.
4. `backend/src/modules/ai/services/ai-run-ledger.service.ts` lines 13-14, 76-82 — alternate `@Optional() @InjectMetric('...')` shortcut idiom.

#### D-07: Extend `BackfillJobData['type']` union

**Current** (line 11):
```typescript
interface BackfillJobData {
  type: 'scheduled' | 'manual' | 'recalculation';
  tenantId?: string;
  userId?: string;
}
```

**Phase 149 add:** `'decay-gc'` to the union. Add a new branch to the worker switch (line 86-95):
```typescript
async (job: Job<BackfillJobData>) => {
  return withoutTenantScopingAsync(async () => {
    if (job.data.type === 'decay-gc') {
      return this.processDecayGc(job);   // NEW
    }
    if (job.data.type === 'recalculation') {
      return this.processRecalculation(job);
    }
    return this.processBackfillJob(job);
  });
},
```

Per D-09, `processDecayGc` MUST internally invoke the existing `processRecalculation` body (or the refactored `recalculateTenant` per-tenant helper, line 350) AFTER the GC sweep — same tenants, same pass. Claude's Discretion per D-09 lets the planner either (a) call `processRecalculation(job)` at the end of `processDecayGc`, or (b) inline per-tenant GC-then-recalc and retire `'recalculation'` as a separate type. Recommended: (a) to keep diffs smaller and allow the old `nightly-recalculation` repeatable job to be cleanly deleted in `setupRepeatableJob`.

#### D-08 + D-09: Repeatable job wiring

**Current pattern to REPLACE** (lines 133-168 — the "Nightly recalculation job" block):
```typescript
private async setupRepeatableJob() {
  const repeatableJobs = await this.queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (
      job.name === 'scheduled-triage-backfill' ||
      job.name === 'nightly-recalculation'
    ) {
      await this.queue.removeRepeatableByKey(job.key);
    }
  }

  // Add hourly backfill job
  await this.queue.add(
    'scheduled-triage-backfill',
    { type: 'scheduled' },
    {
      repeat: { every: this.INTERVAL_MS },
      jobId: 'triage-backfill-scheduled',
    },
  );

  // Nightly recalculation job (updates priorities using learned weights)
  await this.queue.add(
    'nightly-recalculation',
    { type: 'recalculation' },
    {
      repeat: { pattern: '0 3 * * *' }, // 3 AM daily
      jobId: 'triage-nightly-recalculation',
    },
  );
}
```

**Phase 149 modification (D-08):** either rename the nightly job to `'nightly-decay-gc'` with `type: 'decay-gc'` and `jobId: 'triage-nightly-decay-gc'`, OR add a THIRD repeatable job and keep the existing `nightly-recalculation` as-is. Per D-09's "implementation detail for planner: the `'recalculation'` job type can be retired once `'decay-gc'` absorbs it," the cleaner path is to REPLACE the recalculation job with the new decay-gc job and have `processDecayGc` delegate to `processRecalculation` internally after the sweep.

Cleanup list on line 136-143 MUST include the old name (`'nightly-recalculation'`) to ensure repeatable jobs from prior deployments are removed — matches the existing pattern's purpose.

#### D-05: Hard-delete + Prometheus counter pattern (orphan-embedding-cleanup.service.ts)

**Source pattern** (`orphan-embedding-cleanup.service.ts` lines 67-113):
```typescript
async cleanupOrphanEmbeddings(): Promise<{ deleted: number; batches: number }> {
  // ...
  let totalDeleted = 0;
  let batches = 0;

  while (true) {
    const orphans = await this.prisma.embedding.findMany({
      where: { emailId: null, contactId: null },
      select: { id: true, tenantId: true },
      take: this.BATCH_SIZE,
    });

    if (orphans.length === 0) break;

    const deleted = await this.prisma.embedding.deleteMany({
      where: { OR: orphans.map((o) => ({ id: o.id, tenantId: o.tenantId })) },
    });

    totalDeleted += deleted.count;
    batches++;
    // ...
    if (batches >= this.MAX_BATCHES) { /* safety limit */ break; }
  }
  // ...
}
```

**Adaptation for Phase 149 `processDecayGc`** — two stores per D-04:

(a) **Redis sender-scores GC** — iterate `triage:sender-scores:{tenantId}` hash via `HGETALL`, compute decayed `replyRate/flagRate` aggregate per field (spec says "sender score drops below 0.3" — planner decides whether that means `replyRate + flagRate > 0.3` aggregate or the dominant signal; follow existing `computeScoreFromSignals` semantics), and `HDEL` below-threshold fields. Reuse the SCAN idiom from `TriageLearningService.flushAllBuffers` (lines 404-432) for key-space traversal across tenants.

(b) **TriageOverride row GC** — for each (tenantId, pattern) in `TriageOverride` table, re-run the Phase 147 D-09b math against `EmailTriageFeedback`:
```typescript
// Pseudocode for D-06 recompute-at-GC-time
const feedbackRows = await this.prisma.emailTriageFeedback.findMany({
  where: {
    tenantId,
    type: 'label_correction',
    signal: 'correction',
    // join-via-email: filter by Email.from matching override.pattern
  },
  select: { createdAt: true, newValue: true, /* joined Email.from */ },
});
const weightedCount = feedbackRows
  .filter((r) => r.newValue === override.action /* or the promoted target */)
  .reduce((sum, r) => {
    const ageDays = (now - r.createdAt.getTime()) / 86_400_000;
    return sum + weightCorrection(ageDays, { halfLifeDays });
  }, 0);

if (weightedCount < 0.3) {
  await this.prisma.triageOverride.deleteMany({
    where: { id: override.id, tenantId },   // MULTI-TENANT: tenantId ALWAYS present
  });
  this.gcCounter?.inc({ store: 'triage_override', tenant_id: tenantId });
}
```

**CLAUDE.md compliance:** EVERY Prisma query in the GC sweep MUST include `tenantId` in the `where` clause. The schema (`triage_overrides` line 2548-2557) has `@@index([tenantId])` and `@@unique([tenantId, type, pattern])` — use the unique index where possible. `prisma.triageOverride.deleteMany({ where: { tenantId, id: ... } })` matches the orphan-cleanup `OR:` batch pattern above.

#### D-10: Tenant iteration pattern — reuse `findActiveTenants`

**Source (self, lines 407-434):**
```typescript
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
  // ...
  return results;
}
```

**Adaptation:** `processDecayGc` can reuse `findActiveTenants` verbatim (the GC doesn't need a `userId` per tenant, but receiving one is harmless). Per-tenant loop with `await this.sleep(500);` between tenants matches `processRecalculation` lines 324-338.

#### D-11: Prometheus counter + gauges injection

**Pattern source 1** — `@InjectMetric` shortcut (`ai-run-ledger.service.ts` lines 13-14, 76-82):
```typescript
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';

constructor(
  // ...
  @Optional() @InjectMetric('ai_tokens_total') private readonly tokensCounter?: Counter,
  @Optional() @InjectMetric('ai_cost_usd_total') private readonly costCounter?: Counter,
  @Optional() @InjectMetric('ai_requests_total') private readonly requestsCounter?: Counter,
) {}
```

**Pattern source 2** — `getToken` explicit DI (`label-accuracy.service.ts` lines 82-101):
```typescript
import { Inject, Optional } from '@nestjs/common';
import { getToken } from '@willsoto/nestjs-prometheus';
import type { Counter } from 'prom-client';

constructor(
  // ...
  @Optional()
  @Inject(getToken('triage_accuracy_corrections_total'))
  private readonly correctionsCounter: Counter<string> | null = null,
) {}

private safeInc(
  metric: Counter<string> | null,
  labels: Record<string, string>,
  value = 1,
): void {
  if (!metric) return;
  metric.inc(labels, value);
}
```

**Which to use:** `@InjectMetric` (shortcut) is simpler and matches `ai-run-ledger.service.ts`. Use this for Phase 149 unless Claude's Discretion elects the `getToken` explicit form for consistency with the sibling `triage_accuracy_*` metrics which use `getToken`.

**Provider registration** (`backend/src/common/metrics/metrics.module.ts` lines 99-103, 121):
```typescript
makeCounterProvider({
  name: 'triage_accuracy_corrections_total',
  help: 'Total triage accuracy mutations by signal × triage_source × kind',
  labelNames: ['signal', 'triage_source', 'kind'],
}),
// ...
exports: [
  // ...
  getToken('triage_accuracy_corrections_total'),
],
```

**D-11 additions to `metrics.module.ts`** (three new providers + three new exports):
```typescript
// Counter — per-delete audit trail
makeCounterProvider({
  name: 'triage_patterns_gc_total',
  help: 'Total triage patterns garbage-collected by store × tenant',
  labelNames: ['store', 'tenant_id'],
}),
// Gauge — configured half-life (seconds, Prometheus canonical base unit)
makeGaugeProvider({
  name: 'triage_decay_half_life_seconds',
  help: 'Configured triage decay half-life in seconds',
  labelNames: [],
}),
// Gauge — epoch-seconds of last GC pass
makeGaugeProvider({
  name: 'triage_decay_last_run_timestamp_seconds',
  help: 'Epoch seconds at end of last triage decay GC pass',
  labelNames: [],
}),
```
Add corresponding `getToken('...')` entries to the `exports` array so the scheduler can inject them.

**Cardinality note (D-11 + metrics.module.ts comment lines 67-72):** `tenant_id` as a Counter label is opt-in in the accuracy metrics for exactly the cardinality-budget reason cited in that comment. For `triage_patterns_gc_total`, `tenant_id` is PART OF D-11's locked spec and is acceptable because GC events are low-frequency (nightly) and naturally sparse. Do NOT gate behind `TRIAGE_METRICS_PER_TENANT` — D-11 is explicit that `tenant_id` labels ship.

---

## Shared Patterns

### 1. Multi-tenant Prisma query invariant (CLAUDE.md hard rule)

**Apply to:** all Prisma calls inside `processDecayGc` (TriageOverride delete, EmailTriageFeedback lookup, Email joins).

Every `where` MUST include `tenantId`. The `triage_overrides` index `@@index([tenantId])` + unique `@@unique([tenantId, type, pattern])` is already in place. Pattern reused verbatim from `triage-correction.service.ts` line 41 and `triage-feedback.service.ts` lines 205-210:
```typescript
await this.prisma.emailTriageFeedback.findMany({
  where: {
    tenantId,                // ALWAYS present
    type: 'label_correction',
    signal: 'correction',
    createdAt: { gte: cutoff },
  },
  select: { /* ... */ },
});
```

### 2. `withoutTenantScopingAsync` wrapper for cross-tenant worker bodies

**Source:** `triage-backfill-scheduler.service.ts` lines 88-94, `orphan-embedding-cleanup.service.ts` line 52.
**Apply to:** the `'decay-gc'` branch of the worker function body.

```typescript
async (job: Job<BackfillJobData>) => {
  return withoutTenantScopingAsync(async () => {
    if (job.data.type === 'decay-gc') return this.processDecayGc(job);
    // ...
  });
},
```
The per-tenant Prisma calls inside still pass `tenantId` explicitly (Rule 1) — `withoutTenantScopingAsync` disables the AsyncLocalStorage auto-scope guard, it does NOT exempt the callee from passing tenantId.

### 3. Config env-parse idiom

**Source:** `triage-backfill-scheduler.service.ts` lines 47-59 (TRIAGE_BACKFILL_*).
**Apply to:** `TRIAGE_DECAY_HALF_LIFE_DAYS` in BOTH `TriageLearningService` and `TriageBackfillSchedulerService` (and `TriageCorrectionService` for the helper call site).

```typescript
const halfLifeDays = parseInt(
  this.configService.get<string>('TRIAGE_DECAY_HALF_LIFE_DAYS', '14'),
  10,
);
```
`ConfigService.get<string>(KEY, default)` then `parseInt(..., 10)` — NEVER `parseInt` without radix. NEVER read `process.env` directly inside a service (CLAUDE.md "FOLLOW EXISTING PATTERNS").

### 4. Prometheus Counter/Gauge — optional DI seam

**Source:** `ai-run-ledger.service.ts` lines 76-82 (`@Optional() @InjectMetric`) and `label-accuracy.service.ts` lines 89-101 (`@Optional() @Inject(getToken(...))` + `safeInc` helper).
**Apply to:** `TriageBackfillSchedulerService` constructor additions.

The `@Optional()` is critical: the metrics module is `@Global()` (metrics.module.ts line 18), but test harnesses can omit it. Matches the B-4 seam pattern for Phase 148 tests.

### 5. BullMQ repeatable-job multi-instance dedup

**Source:** `triage-backfill-scheduler.service.ts` lines 146-165. Every `queue.add(name, data, { repeat: {...}, jobId: 'stable-id' })` pairs a `jobId` with the repeat. Required for Railway multi-replica safety.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | Every in-scope file has a same-module analog or is a trivial in-file edit. |

---

## Rollback & Safety Considerations (CLAUDE.md invariants)

- **No Prisma migration in Phase 149** — D-05 hard-delete + D-06 recompute-at-GC-time deliberately avoid schema changes. No `prisma migrate dev` needed. No risk of hitting the DB-SAFETY hard stops.
- **No `prisma db push`, `prisma migrate reset`, or `db seed` anywhere in this phase.**
- **D-12 env-var kill switch:** `TRIAGE_DECAY_HALF_LIFE_DAYS=9999` disables decay without a code change. Single Railway env update + restart. Verified against the helper test (`weightCorrection(30, { halfLifeDays: 9999 }) ≈ 1`).
- **Post-edit validation (CLAUDE.md mandatory):** after every file edit, run `cd backend && npx tsc --noEmit` before moving on.

---

## Metadata

**Analog search scope:**
- `backend/src/modules/ai/services/` (in-scope + reranking neighborhood)
- `backend/src/modules/ai/utils/` (helper location)
- `backend/src/modules/ai/utils/__tests__/` (test location)
- `backend/src/common/metrics/` (Prometheus DI)
- `backend/prisma/schema.prisma` (TriageOverride, EmailTriageFeedback shape)

**Files scanned:** 9 read in full; 2 partial reads (`ai-run-ledger.service.ts` top 50 LF, `label-accuracy.service.ts` top 130 LF, `metrics.module.ts` full, schema targeted grep).

**Pattern extraction date:** 2026-04-23

**CLAUDE.md checks performed:**
- Pure-util DI-free pattern verified against `triage-correction-weight.ts` existing shape.
- Multi-tenant invariant verified against `triage_overrides` schema and existing service call sites.
- Config-env-parse idiom verified against existing scheduler constructor.
- No new Prisma migrations required (D-05 + D-06 schema-preserving).
- No `prisma db *` commands referenced anywhere in plan.
