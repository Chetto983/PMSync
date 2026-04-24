# Phase 150: Graph-Based Triage Memory — Pattern Map

**Mapped:** 2026-04-24
**Files analyzed:** 14 (5 new, 9 modified)
**Analogs found:** 13 / 14 (one partial — no read-path SQL-centric triage analog exists)
**Scope:** planner cheat-sheet — minimum-divergence code shapes, absolute paths, line ranges. CONTEXT/RESEARCH are NOT duplicated here.

---

## File Classification

| New/Modified | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| **NEW** `backend/src/modules/ai/services/triage-graph-lookup.service.ts` | service | read-path | `backend/src/modules/ai/services/triage-override.service.ts` (partial — boolean rule matcher; 150 is SQL-query-centric) | role-match only |
| **NEW** `backend/src/modules/ai/services/triage-affinity-promotion.helpers.ts` | helper (pure fn) | write-path | `backend/src/modules/ai/services/triage-decay-gc.helpers.ts` | exact |
| **NEW** `backend/src/modules/ai/services/__tests__/triage-graph-lookup.service.spec.ts` | spec | static-gate | `backend/src/modules/ai/services/__tests__/triage-correction.service.spec.ts` | exact |
| **NEW** `backend/src/modules/ai/services/__tests__/triage-affinity-promotion.helpers.spec.ts` | spec | static-gate | `backend/src/modules/ai/services/__tests__/triage-correction.service.spec.ts` | exact |
| **NEW** `backend/prisma/migrations/<ts>_add_graph_affinity_columns/migration.sql` | migration | schema | `backend/prisma/migrations/20260325105000_reconcile_baseline/migration.sql` §graph_edges (lines 480-950) | role-match |
| **MOD** `backend/prisma/schema.prisma` §GraphEdge (2293), §GraphNode (2270) | schema | schema | self (additive) | n/a |
| **MOD** `backend/src/modules/ai/services/email-triage.service.ts` (L358-362) | service | cross-cutting | self — existing override-hint pattern L273-357 | exact |
| **MOD** `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts` | service | write-path orchestration | self — Phase 149 `decay-gc` dispatch + `setupRepeatableJob` | exact |
| **MOD** `backend/src/modules/ai/ai.module.ts` | module-wiring | static | self L170 (`TriageOverrideService` provider), L219 (export) | exact |
| **MOD** `backend/src/modules/labels/services/labels.service.ts` | service | cross-cutting (hook) | self L180-215 (create), L420-446 (delete) | exact |
| **MOD** `backend/src/common/metrics/metrics.module.ts` | module-wiring | static-gate | self L109-127 (Phase 149 3 metrics + exports L147-149) | exact |
| **MOD** `backend/src/modules/ai/services/__tests__/email-triage.service.spec.ts` | spec | static-gate | self (extend existing override tests) | exact |
| **MOD** `backend/src/modules/ai/services/__tests__/triage-backfill-scheduler.service.spec.ts` (if exists) or `triage-learning-redis.spec.ts` | spec | static-gate | `triage-correction.service.spec.ts` | exact |
| **MOD** `frontend/locales/{en,it,index}.ts` | i18n | static | self L1310-1326 (en.ts `accuracy.source`) | exact |

---

## Pattern Assignments

### NEW `backend/src/modules/ai/services/triage-affinity-promotion.helpers.ts` (helper, write-path)

**Analog:** `backend/src/modules/ai/services/triage-decay-gc.helpers.ts` (270 LF, pure fn + DepBag).

**Imports + header block pattern** (analog L1-33):
```typescript
/**
 * Phase 150 D-01 helper for TriageBackfillSchedulerService.processAffinityPromotion.
 *
 * Extracted here so the scheduler service stays below the 700 LF cap while
 * keeping the BullMQ wiring (queue/worker/cron) in the scheduler. These
 * helpers are pure functions: they take the Prisma client and metric Counter/Gauge
 * as explicit params instead of being class methods — the scheduler still owns
 * the DI surface and just delegates the promotion math here.
 *
 * Invariants preserved verbatim from the Phase 149 pattern:
 *   - Every Prisma call in `processAffinityPromotionForTenant` includes
 *     explicit `tenantId` in the `where` clause (multi-tenant rule).
 *   - `promotionCounter.inc({ tenant_id, edge_type, action })` fires once per upsert.
 *   - Uses `weightCorrection(ageDays, { halfLifeDays })` — NEVER reimplements decay math.
 */
import type { Counter, Gauge } from 'prom-client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { weightCorrection } from '../utils/triage-correction-weight';
import { extractDomain } from './triage-decay-gc.helpers';  // reuse — not re-declare
```

**DepBag pattern** (analog L57-62):
```typescript
export interface AffinityPromotionDeps {
  prisma: PrismaService;
  promotionCounter?: Counter<string>;
  activeEdgesGauge?: Gauge<string>;
  halfLifeDays: number;
}

export interface AffinityPromotionTenantResult {
  sendersPromoted: number;
  domainsPromoted: number;
  sendersUpdated: number;
  domainsUpdated: number;
}
```

**Per-tenant entry point pattern** (analog L82-165):
```typescript
export async function processAffinityPromotionForTenant(
  tenantId: string,
  deps: AffinityPromotionDeps,
  jobId: string,       // for metadata.promotionAudit
  jobTimestamp: Date,  // for validFrom + metadata.promotionAudit
): Promise<AffinityPromotionTenantResult> {
  const { prisma, promotionCounter, halfLifeDays } = deps;
  // ... sender-pass
  // ... domain-pass (reuses MIN_DISTINCT_SENDERS_FOR_DOMAIN from triage-feedback.service.ts
  //     per RESEARCH Open Q1 recommendation)
}
```

**Promotion gate constants pattern** (analog L36-42 style — named exports):
```typescript
/** OpenClaw Dreaming 3/0.8 promotion gates — matches TriageOverride promotion (Phase 147 D-09b). */
export const AFFINITY_MIN_CONFIDENCE = 0.8;
export const AFFINITY_MIN_FEEDBACK_ROWS = 3;
/** Decay-GC cutoff — mirrors DECAY_GC_CONFIDENCE_THRESHOLD = 0.3. */
export const AFFINITY_DECAY_CUTOFF = 0.3;
```

**Weighted-sum loop pattern** (analog L244-267 — same math, different grouping):
```typescript
const now = Date.now();
let weightedCount = 0;
for (const row of feedbackRows) {
  // ... pattern match
  const ageDays = Math.max(0, (now - row.createdAt.getTime()) / 86_400_000);
  weightedCount += weightCorrection(ageDays, { halfLifeDays });
}
```

**Prisma upsert pattern — TARGETS EXISTING UNIQUE KEY** (analog has no upsert; use `triage-override.service.ts:101-107`):
```typescript
await prisma.graphEdge.upsert({
  where: {
    tenantId_sourceId_targetId_edgeType: {
      tenantId,
      sourceId: senderNodeId,
      targetId: labelNodeId,
      edgeType: 'SENDER_LABEL_AFFINITY',
    },
  },
  update: {
    confidence: computedConfidence,
    validFrom: jobTimestamp,
    metadata: { derivedFromOverrideIds, promotionAudit: { jobId, jobTimestamp: jobTimestamp.toISOString(), computedConfidence, feedbackRowCount, halfLifeDays } },
  },
  create: { tenantId, sourceId: senderNodeId, targetId: labelNodeId, edgeType: 'SENDER_LABEL_AFFINITY', confidence: computedConfidence, validFrom: jobTimestamp, metadata: { ... } },
});
promotionCounter?.inc({ tenant_id: tenantId, edge_type: 'SENDER_LABEL_AFFINITY', action: /* 'created' | 'updated' */ });
```

**Divergence from analog:** writes instead of deletes. Emits promotion counter `{tenant_id, edge_type, action}` (3 labels) where Phase 149 emits gcCounter `{store, tenant_id}` (2 labels). D-01a audit dict goes into `metadata` JSONB — the ONE allowed JSONB write (read only by nightly decay-gc, not hot path — CLAUDE.md JSONB ban is hot-path-only).

---

### NEW `backend/src/modules/ai/services/triage-graph-lookup.service.ts` (service, read-path)

**Analog:** `backend/src/modules/ai/services/triage-override.service.ts` (role-match only — boolean rule matcher is the closest existing "layer-N-of-triage" probe. The SQL shape itself has NO direct analog — `entity-graph.service.ts` is a multi-hop CTE traversal, not single-edge lookup).

**Divergence from analog:** Phase 150 lookup is a single `prisma.$queryRaw` call with `ORDER BY sender-first, confidence DESC LIMIT 1` (D-03a). The override service is a `findMany` + in-memory loop. The return shape `GraphLookupResult | null` intentionally drops the `{matched: boolean}` envelope (RESEARCH §Integration Point Confirmation) — null-or-object is simpler.

**Class skeleton pattern** (analog L64-68):
```typescript
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter } from 'prom-client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface GraphLookupResult {
  predictedLabelId: string;
  predictedLabelName: string;
  confidence: number;
  source: 'sender' | 'domain';
}

@Injectable()
export class TriageGraphLookupService {
  private readonly logger = new Logger(TriageGraphLookupService.name);
  private readonly cutoff: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() @InjectMetric('triage_graph_lookup_total')
    private readonly lookupCounter?: Counter<string>,
  ) {
    // Mirror scheduler L80-87 pattern for env parsing + clamp
    const raw = parseFloat(
      this.configService.get<string>('TRIAGE_GRAPH_CONFIDENCE_CUTOFF', '9999'),
    );
    this.cutoff = Number.isFinite(raw) ? raw : 9999;
  }
  // ... lookup()
}
```

**Env-var parsing pattern** (analog `triage-backfill-scheduler.service.ts:80-87`):
```typescript
const rawHalfLife = parseInt(
  this.configService.get<string>('TRIAGE_DECAY_HALF_LIFE_DAYS', '14'),
  10,
);
this.halfLifeDays = Math.max(1, Number.isFinite(rawHalfLife) ? rawHalfLife : 14);
```
Phase 150 uses `parseFloat` (cutoff is a float) but the `Number.isFinite(...) ? ... : default` clamp is identical.

**Return-shape mirror** (analog `triage-override.service.ts:119-156`):
```typescript
async applyOverrides(tenantId: string, email: { from: string; threadId?: string | null }): Promise<OverrideResult> {
  const overrides = await this.getOverrides(tenantId);
  if (overrides.length === 0) return { matched: false };
  // ... scan
  if (matches) { return { matched: true, override, lane, suppressFollowUp }; }
  return { matched: false };
}
```

For Phase 150 — replace with null-or-object:
```typescript
async lookup(tenantId: string, senderEmail: string): Promise<GraphLookupResult | null> {
  const normalized = senderEmail.trim().toLowerCase();
  const domain = normalized.includes('@') ? normalized.split('@')[1] : null;
  if (!domain) { this.lookupCounter?.inc({ outcome: 'missed', edge_source: 'none', tenant_id: tenantId }); return null; }

  const rows = await this.prisma.$queryRaw<Array<{ confidence: number; labelId: string; labelName: string; sourceType: string }>>`
    SELECT e."confidence" AS confidence, tgt."externalId" AS "labelId", tgt."label" AS "labelName", src."nodeType" AS "sourceType"
    FROM "graph_edges" e
    JOIN "graph_nodes" src ON src."id" = e."sourceId"
    JOIN "graph_nodes" tgt ON tgt."id" = e."targetId"
    WHERE e."tenantId" = ${tenantId}
      AND e."edgeType" IN ('SENDER_LABEL_AFFINITY', 'DOMAIN_LABEL_AFFINITY')
      AND e."confidence" >= 0.7
      AND (e."validUntil" IS NULL OR e."validUntil" > now())
      AND (
        (src."nodeType" = 'sender' AND src."externalId" = ${normalized})
        OR (src."nodeType" = 'email_domain' AND src."externalId" = ${domain})
      )
    ORDER BY (CASE WHEN src."nodeType" = 'sender' THEN 0 ELSE 1 END), e."confidence" DESC
    LIMIT 1
  `;
  if (rows.length === 0) { this.lookupCounter?.inc({ outcome: 'missed', edge_source: 'none', tenant_id: tenantId }); return null; }

  const row = rows[0];
  const source: 'sender' | 'domain' = row.sourceType === 'sender' ? 'sender' : 'domain';

  // D-07 shadow counter — ALWAYS emits when >=0.9, regardless of cutoff
  if (row.confidence >= 0.9) {
    this.lookupCounter?.inc({ outcome: 'would_skip_shadow', edge_source: source, tenant_id: tenantId });
  }

  if (row.confidence >= this.cutoff) {
    this.lookupCounter?.inc({ outcome: 'skipped', edge_source: source, tenant_id: tenantId });
  } else if (row.confidence >= 0.7) {
    this.lookupCounter?.inc({ outcome: 'hinted', edge_source: source, tenant_id: tenantId });
  }

  return { predictedLabelId: row.labelId, predictedLabelName: row.labelName, confidence: row.confidence, source };
}
```

**NOTE on shadow counter placement** (RESEARCH Open Q7): the shadow emission lives inline (not a decorator). The `outcome='would_skip_shadow'` counter increment is INDEPENDENT of the `outcome='skipped|hinted|missed'` increment — a single call can emit both (one with outcome=would_skip_shadow, one with outcome=missed if cutoff=9999 and confidence=0.95). Test gate: assert both counters fire in cutoff=9999 + confidence=0.95 scenario (RESEARCH Failure Mode §4).

---

### NEW `backend/src/modules/ai/services/__tests__/triage-graph-lookup.service.spec.ts` (spec, static-gate)

**Analog:** `backend/src/modules/ai/services/__tests__/triage-correction.service.spec.ts` L1-90 (mock-based; ConfigService default-fallback).

**Scaffold pattern** (analog L1-28 verbatim):
```typescript
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TriageGraphLookupService } from '../triage-graph-lookup.service';
import { PrismaService } from '../../../../prisma/prisma.service';

describe('TriageGraphLookupService.lookup', () => {
  let service: TriageGraphLookupService;
  const prismaMock = {
    $queryRaw: jest.fn(),
  };
  const configMock = {
    // default cutoff 9999 → shadow mode
    get: jest.fn((_key: string, defaultValue?: string) => defaultValue ?? '9999'),
  };
  const lookupCounter = { inc: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        TriageGraphLookupService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
        { provide: 'PROM_METRIC_TRIAGE_GRAPH_LOOKUP_TOTAL', useValue: lookupCounter },
      ],
    }).compile();
    service = mod.get(TriageGraphLookupService);
  });
```
**NOTE on metric token injection:** `@InjectMetric('triage_graph_lookup_total')` resolves via token `getToken('triage_graph_lookup_total')` from `@willsoto/nestjs-prometheus`. In the spec, provide the token via `{ provide: getToken('triage_graph_lookup_total'), useValue: lookupCounter }` (see `label-accuracy.metrics.spec.ts` for the exact import). Planner must verify the token export in metrics.module.ts mods.

**Assertion-on-SQL-shape pattern** (for D-05 ORDER BY gate — RESEARCH Acceptance Thresholds "Read-layer ORDER BY"):
```typescript
it('emits ORDER BY sender-first clause — D-05 precedence', async () => {
  prismaMock.$queryRaw.mockResolvedValue([]);
  await service.lookup('t1', 'boss@acme.com');
  // template-literal tag receives Prisma.Sql — assert on the SQL text
  const callArgs = prismaMock.$queryRaw.mock.calls[0];
  const sqlText = callArgs[0].strings ? callArgs[0].strings.join('?') : String(callArgs[0]);
  expect(sqlText).toMatch(/CASE WHEN src\."nodeType" = 'sender' THEN 0 ELSE 1 END/);
});
```

**Mandatory test block list** (RESEARCH Validation Architecture §D-03 matrix — 10 fixtures):
- `it('returns null when no edge exists — outcome=missed')`
- `it('returns null when confidence < 0.7 — outcome=missed')`
- `it('returns sender edge with source=sender — outcome=skipped when cutoff=0.9 & conf=0.95')`
- `it('returns sender edge hinted when 0.7 <= conf < cutoff')`
- `it('returns domain edge when no sender edge exists')`
- `it('prefers sender over domain (D-05) via ORDER BY CASE WHEN')`
- `it('emits outcome=would_skip_shadow independently of cutoff when conf >= 0.9')` ← shadow counter gate
- `it('excludes edges with validUntil <= now()')`
- `it('normalizes senderEmail via trim().toLowerCase() — D-04a')`
- `it('extracts domain without + stripping or subdomain collapsing — D-04a')`

---

### NEW `backend/src/modules/ai/services/__tests__/triage-affinity-promotion.helpers.spec.ts` (spec, static-gate)

**Analog:** `triage-correction.service.spec.ts` L1-90 verbatim scaffold.

**Pure-function test pattern** (no `Test.createTestingModule` needed — helper is a pure fn):
```typescript
import { processAffinityPromotionForTenant } from '../triage-affinity-promotion.helpers';

describe('processAffinityPromotionForTenant', () => {
  const prismaMock = {
    triageOverride: { findMany: jest.fn() },
    emailTriageFeedback: { findMany: jest.fn() },
    email: { findMany: jest.fn() },
    graphNode: { findFirst: jest.fn(), create: jest.fn() },
    graphEdge: { upsert: jest.fn(), count: jest.fn() },
  };
  const promotionCounter = { inc: jest.fn() };
  const activeEdgesGauge = { set: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('creates edge when weighted-sum >= 0.8 AND feedback rows >= 3', async () => { /* ... */ });
  it('skips promotion when feedback rows = 2 (row-count gate)', async () => { /* ... */ });
  it('skips promotion when weighted-sum = 0.7 (confidence gate)', async () => { /* ... */ });
  it('updates existing edge (upsert path, action=updated)', async () => { /* ... */ });
  it('domain aggregation requires >= 3 distinct senders (Phase 147 D-04 inherited)', async () => { /* ... */ });
  it('excludes role-account local-parts (info@, sales@) from domain aggregation', async () => { /* ... */ });
  it('writes derivedFromOverrideIds + promotionAudit into metadata JSONB — D-01a', async () => { /* ... */ });
});
```
**NOTE (Open Q1):** Planner MUST import `MIN_DISTINCT_SENDERS_FOR_DOMAIN` and `ROLE_ACCOUNT_LOCAL_PARTS` from `backend/src/modules/ai/services/triage-feedback.service.ts:51-55` (CONFIRMED line numbers). Do not re-declare them.

---

### NEW `backend/prisma/migrations/<ts>_add_graph_affinity_columns/migration.sql` (migration, schema)

**Analog:** `backend/prisma/migrations/20260325105000_reconcile_baseline/migration.sql` L480-490 (graph_edges CREATE TABLE) + L935-950 (graph_edges CREATE INDEX).

**Planner generates via:**
```bash
cd backend && node -e "require('dotenv').config(); console.log(new URL(process.env.DATABASE_URL).host)"   # MUST print localhost
cd backend && npx prisma migrate dev --name add_graph_affinity_columns
```

**Expected SQL shape** (Prisma auto-generates — no hand-editing unless reviewing):
```sql
-- AlterTable
ALTER TABLE "graph_edges" ADD COLUMN "confidence" DOUBLE PRECISION,
                          ADD COLUMN "validFrom" TIMESTAMP(3),
                          ADD COLUMN "validUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "graph_edges_tenantId_edgeType_confidence_idx" ON "graph_edges"("tenantId", "edgeType", "confidence");
CREATE INDEX "graph_edges_tenantId_edgeType_validUntil_idx" ON "graph_edges"("tenantId", "edgeType", "validUntil");

-- (optional — RESEARCH Landmine §1 + Open Q9) IF pre-migration dedup scan returns 0 rows:
CREATE UNIQUE INDEX "graph_nodes_tenantId_nodeType_externalId_key" ON "graph_nodes"("tenantId", "nodeType", "externalId");
```

**Guard A check (pre-commit):** zero `DROP` tokens — nullable `ADD COLUMN` + additive `CREATE INDEX` only. No `-- ALLOW-DESTRUCTIVE:` header needed.

**Pre-migration dedup scan (RESEARCH Open Q9)** — run read-only against prod BEFORE committing the migration:
```sql
SELECT "tenantId", "nodeType", "externalId", COUNT(*)
FROM "graph_nodes"
GROUP BY "tenantId", "nodeType", "externalId"
HAVING COUNT(*) > 1;
```
If non-empty → DROP the `graph_nodes` unique index from the migration; planner falls back to find-then-create-in-transaction (Landmine §1 Option b).

---

### MOD `backend/prisma/schema.prisma` (schema)

**Target lines:** 2293-2314 (GraphEdge), 2270-2291 (GraphNode).

**Additive changes to GraphEdge** — mirror Phase 149's nullable-additive pattern. Apply AFTER `createdAt`, BEFORE relations:
```prisma
model GraphEdge {
  id        String   @id @default(cuid())
  tenantId  String
  sourceId  String
  targetId  String
  edgeType  String // 'sent', 'received', 'mentions', 'replies_to', 'about', 'attended', 'anchored_to', 'SENDER_LABEL_AFFINITY', 'DOMAIN_LABEL_AFFINITY'
  weight    Float    @default(1.0)
  confidence Float?   // Phase 150 D-02: probabilistic confidence for affinity edges. NULL for legacy 7 edge types.
  validFrom  DateTime? // Phase 150 D-02: edge-creation timestamp. NULL for legacy types.
  validUntil DateTime? // Phase 150 D-02: explicit expiry. NULL = currently valid (Phase 151 SAFE-03 may set this).
  metadata  Json     @default("{}")
  createdAt DateTime @default(now())
  // ... relations unchanged
  @@unique([tenantId, sourceId, targetId, edgeType])
  @@index([tenantId])
  @@index([sourceId])
  @@index([targetId])
  @@index([tenantId, edgeType])
  @@index([sourceId, edgeType])
  @@index([tenantId, edgeType, confidence])     // Phase 150 D-02 hot-path filter
  @@index([tenantId, edgeType, validUntil])     // Phase 150 D-02 decay-gc sweep
  @@map("graph_edges")
}
```

**GraphNode change** — comment update + optional unique constraint (pending Open Q9 dedup scan):
```prisma
nodeType   String // 'contact', 'email', 'thread', 'calendar_event', 'topic', 'memory', 'sender', 'email_domain', 'label'
// ... if Open Q9 scan passes:
@@unique([tenantId, nodeType, externalId])      // Phase 150 D-04 upsert key
```

**Divergence from analog:** two `@@index` additions in one migration vs Phase 149's one `@@index` addition. Still nullable-only — Guards A/E pass.

---

### MOD `backend/src/modules/ai/services/email-triage.service.ts` (L358-362 insertion)

**Analog:** self — the existing visible-override pattern at L273-357 already implements "run probe → either short-circuit or set hint for LLM."

**Constructor extension** (analog L119-127, add 8th `@Optional()` arg):
```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly emailInsights: EmailInsightsService,
  private readonly subscriptionService: SubscriptionService,
  private readonly redisConnection: RedisConnectionService,
  @Optional() private readonly triageActionService?: TriageActionService,
  @Optional() private readonly crmSuggestionTrigger?: CrmSuggestionTriggerService,
  @Optional() private readonly triageOverrideService?: TriageOverrideService,
  @Optional() private readonly triageGraphLookupService?: TriageGraphLookupService,  // Phase 150 NEW
) {}
```
**Why `@Optional()`:** RESEARCH §Integration Point — preserves compatibility with 3 existing spec harnesses (`email-triage.service.spec.ts`, `email-triage-cost-controls.spec.ts`, `email-triage-semaphore.spec.ts`) that construct without graph lookup.

**Insertion region — between L358 and L362** (analog L353-370 for shape):
```typescript
            // D-07 visible override: run LLM with hint, lane-forcing happens after parse
            // inside EmailAnalysisService (via matchedOverrideAction passthrough).
            overrideHint = `From ${or.override.pattern}: user has marked as ${or.override.action} — honor this`;
          }
        }
      }

      // Phase 150 D-03: Layer 2 graph lookup AFTER override miss, BEFORE LLM.
      // RESEARCH Open Q2 resolution: SKIP entirely when ANY override matched
      // (matchedOverrideAction !== null) — user rules beat inferred patterns.
      let graphHint: string | null = null;
      if (!matchedOverrideAction && this.triageGraphLookupService && emailShape?.from) {
        const senderEmail = extractEmail(emailShape.from);   // reuse helper from triage-override.service.ts:159
        if (senderEmail) {
          const g = await this.triageGraphLookupService.lookup(tenantId, senderEmail);
          if (g && g.confidence >= this.graphCutoff) {
            // SHORT-CIRCUIT — mirror muting short-circuit L306-351 shape
            const now = new Date();
            await this.prisma.email.updateMany({ where: { id: emailId, tenantId }, data: { /* ... aiLabel set */ } });
            await this.prisma.emailAnalysis.upsert({
              where: { emailId_tenantId: { emailId, tenantId } },
              update: { triageSource: g.source === 'sender' ? 'graph_sender' : 'graph_domain', /* ... */ },
              create: { /* ... */ },
            });
            return { emailId, success: true, aiLabels: [g.predictedLabelName] };
          } else if (g) {
            graphHint = `Graph memory: similar emails from this ${g.source} have been labeled "${g.predictedLabelName}" (confidence ${g.confidence.toFixed(2)})`;
          }
        }
      }

      // UNIFIED ANALYSIS: Single LLM call for all insights (L362 unchanged)
      const analysis = await this.emailInsights.analyzeEmailUnified(
        tenantId, emailId, locale,
        { includeSmartReplies: false, overrideHint, matchedOverrideAction, graphHint },  // NEW param graphHint
      );
```

**Divergence from analog:** analog's visible-override path NEVER short-circuits — it only sets `overrideHint`. Phase 150's graph path DOES short-circuit at confidence >= cutoff (new behavior). Shape of short-circuit write mirrors the muting-override block at L306-351 (same `email.updateMany` + `emailAnalysis.upsert` shape, different `triageSource` value).

**Landmine §3 follow-through:** `triageSource` new values `'graph_sender' | 'graph_domain'` propagate to Phase 148's `LabelAccuracySourceBreakdown.triageSource` (RESEARCH Landmines §3). Planner MUST extend en/it locales (see i18n section below).

---

### MOD `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts` (write-path orchestration)

**Analog:** self — Phase 149 `decay-gc` extension is the template.

**`BackfillJobData['type']` union extension** (L16):
```typescript
interface BackfillJobData {
  type: 'scheduled' | 'manual' | 'recalculation' | 'decay-gc' | 'affinity-promotion';  // Phase 150 NEW
  tenantId?: string;
  userId?: string;
}
```

**Constructor extension** (L49-61 — add 3 optional metric injections):
```typescript
@Optional() @InjectMetric('triage_graph_promotion_total')
private readonly promotionCounter?: Counter<string>,
@Optional() @InjectMetric('triage_graph_edges_active')
private readonly activeEdgesGauge?: Gauge<string>,
// lookupCounter NOT injected here — belongs in TriageGraphLookupService only (RESEARCH Open Q6)
```

**Worker dispatch extension** (L115-126 — add branch BEFORE decay-gc so promotion runs first per Landmine §5):
```typescript
this.worker = new Worker<BackfillJobData, BackfillResult>(
  QUEUE_NAMES.TRIAGE_BACKFILL || 'triage-backfill',
  async (job: Job<BackfillJobData>) => {
    return withoutTenantScopingAsync(async () => {
      // Phase 150 D-01: affinity promotion runs BEFORE decay-gc so fresh edges
      // don't get accidentally swept (Landmine §5).
      if (job.data.type === 'affinity-promotion') {
        return this.processAffinityPromotion(job);
      }
      // Phase 149 D-09: decay-gc branch
      if (job.data.type === 'decay-gc') { return this.processDecayGc(job); }
      if (job.data.type === 'recalculation') { return this.processRecalculation(job); }
      return this.processBackfillJob(job);
    });
  },
  { connection, concurrency: 1, lockDuration: 300000 },
);
```

**`setupRepeatableJob` extension** (L172-215 — pattern exact verbatim for registration + cleanup list):
```typescript
private async setupRepeatableJob() {
  const repeatableJobs = await this.queue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    if (
      job.name === 'scheduled-triage-backfill' ||
      job.name === 'nightly-recalculation' ||
      job.name === 'nightly-decay-gc' ||
      job.name === 'nightly-affinity-promotion'   // Phase 150 NEW — add to cleanup list
    ) {
      await this.queue.removeRepeatableByKey(job.key);
    }
  }
  // ... scheduled hourly (unchanged)
  // Phase 150 D-01 — nightly 3 AM. Order note: BullMQ FIFO-adds deterministically,
  // so affinity-promotion enqueued BEFORE decay-gc runs first (Landmine §5 fix).
  await this.queue.add('nightly-affinity-promotion', { type: 'affinity-promotion' }, {
    repeat: { pattern: '0 3 * * *' },
    jobId: 'triage-nightly-affinity-promotion',
  });
  await this.queue.add('nightly-decay-gc', { type: 'decay-gc' }, {
    repeat: { pattern: '0 3 * * *' },
    jobId: 'triage-nightly-decay-gc',
  });
}
```

**`processAffinityPromotion` method pattern** (new, mirror `processDecayGc` L413-456 exactly):
```typescript
private async processAffinityPromotion(job: Job<BackfillJobData>): Promise<BackfillResult> {
  const activeTenants = await this.findActiveTenants(job.data.tenantId);
  const jobTimestamp = new Date();
  let totalSenders = 0, totalDomains = 0, tenantsProcessed = 0;
  for (const tenant of activeTenants) {
    try {
      const r = await processAffinityPromotionForTenant(tenant.tenantId, {
        prisma: this.prisma,
        promotionCounter: this.promotionCounter,
        activeEdgesGauge: this.activeEdgesGauge,
        halfLifeDays: this.halfLifeDays,
      }, job.id ?? 'unknown', jobTimestamp);
      totalSenders += r.sendersPromoted; totalDomains += r.domainsPromoted;
      tenantsProcessed++;
      await this.sleep(500);   // same pacing as decay-gc
    } catch (err) { this.logger.error(`Affinity promotion failed for tenant ${tenant.tenantId}: ${err}`); }
  }
  return { processed: totalSenders + totalDomains, successful: totalSenders + totalDomains, failed: 0, skipped: 0, tenantsProcessed };
}
```

**D-06 third store injection in `processDecayGc`** (L413-456) — extend the existing per-tenant loop with a third helper call. Mirror analog L423-443 shape:
```typescript
for (const tenant of activeTenants) {
  try {
    const { redisDeleted, overrideDeleted, overrideTotal } =
      await processDecayGcForTenant(tenant.tenantId, deps);
    // Phase 150 D-06: third store — affinity edges.
    const { graphEdgeDeleted } = await processAffinityEdgeDecayForTenant(tenant.tenantId, deps);
    // accumulate + logger.log includes graphEdgeDeleted
  } catch (error) { /* ... */ }
}
```

---

### MOD `backend/src/modules/ai/ai.module.ts` (module-wiring)

**Analog:** self L170 (Phase 147 `TriageOverrideService` provider) + L219 (export).

**Provider addition** (near L170):
```typescript
providers: [
  // ...existing
  TriageOverrideService,
  TriageGraphLookupService,  // Phase 150 NEW — read-path (RESEARCH Open Q5: NOT exported)
  // ...
],
```

**No export needed** (RESEARCH Open Q5 recommendation — only consumed by `EmailTriageService` in same module).

---

### MOD `backend/src/modules/labels/services/labels.service.ts` (cross-cutting hook)

**Analog:** self — the existing `create` (L180-215), `update` (L217-418 with dto.name branch ~L248-259), `delete` (L420-446), `bulkDelete` (L448-514), `archiveDescendants` (L754+), `createFromWizard` (L848+), `updateFromWizard` (L915+).

**Pattern — append hook AFTER existing Prisma call, BEFORE realtime emit** (analog `create` L202-213 for placement):
```typescript
// existing
const newLabel = await this.prisma.userLabel.create({ data: { /* ... */ }, include: { /* ... */ } });

// Phase 150 D-04: mirror GraphNode for affinity-edge targeting.
// Landmine §1 fallback: if GraphNode unique constraint not yet added, use find-then-create in tx.
await this.prisma.graphNode.upsert({
  where: { tenantId_nodeType_externalId: { tenantId, nodeType: 'label', externalId: newLabel.id } },
  update: { label: newLabel.name },
  create: { tenantId, nodeType: 'label', externalId: newLabel.id, label: newLabel.name },
});

// existing
this.realtimeEvents.emitLabelNew(tenantId, { /* ... */ });
```

**Critical — Landmine §2 FIX on `delete` L420-446** (soft-delete does NOT cascade to GraphEdge, so we must HARD-DELETE the GraphNode mirror which THEN cascades to GraphEdge via existing schema FK `onDelete: Cascade`):
```typescript
async delete(tenantId: string, id: string) {
  const label = await this.findOne(tenantId, id);
  const deletedSlug = `${label.slug}-deleted-${Date.now()}`;
  await this.prisma.userLabel.update({ where: { id }, data: { isArchived: true, slug: deletedSlug } });
  await this.archiveDescendants(tenantId, id);

  // Phase 150 D-04 + Landmine §2: explicit GraphNode cleanup.
  // UserLabel is soft-deleted, so GraphEdge's onDelete:Cascade on graph_nodes.id
  // only fires when we HARD-delete the mirror node. Cascade then drops affinity edges.
  await this.prisma.graphNode.deleteMany({
    where: { tenantId, nodeType: 'label', externalId: id },
  });

  this.realtimeEvents.emitLabelDelete(tenantId, { /* ... */ });
  await this.invalidateTenantAnalysisCache(tenantId, 'label-deleted');
}
```

**Five sites to extend:**
1. `create` (L180 — upsert mirror AFTER Prisma create, BEFORE realtime)
2. `createFromWizard` (L848 — same shape)
3. `update` when `dto.name` provided (L244-259 — update `GraphNode.label`)
4. `updateFromWizard` (L915 — same shape)
5. `delete` (L420) + `bulkDelete` (L448) + `archiveDescendants` (L754) — explicit GraphNode `deleteMany` per Landmine §2

**Divergence:** uses existing `this.prisma` — no new DI. Hooks are fire-and-forget in the sense that the transactional boundary is unchanged (upsert is atomic). NO new `$transaction` wrapping needed.

---

### MOD `backend/src/common/metrics/metrics.module.ts` (static-gate)

**Analog:** self L109-127 (Phase 149 three providers) + L147-149 (exports).

**Three new providers** (add after L127, before `QueueMetricsCollector`):
```typescript
// Phase 150 D-07a: graph-based triage memory observability.
// Cardinality: lookup 4×3×~100 = 1200 series max; promotion 2×2×~100 = 400;
// active 2×~100 = 200. All within 10k/metric budget (same tier as Phase 149).
makeCounterProvider({
  name: 'triage_graph_lookup_total',
  help: 'Total triage graph-layer lookups by outcome × edge_source × tenant',
  labelNames: ['outcome', 'edge_source', 'tenant_id'],
}),
makeCounterProvider({
  name: 'triage_graph_promotion_total',
  help: 'Total affinity edges promoted by nightly job',
  labelNames: ['tenant_id', 'edge_type', 'action'],
}),
makeGaugeProvider({
  name: 'triage_graph_edges_active',
  help: 'Count of active (non-expired) affinity edges per tenant × edge_type',
  labelNames: ['tenant_id', 'edge_type'],
}),
```

**Three new exports** (add after L149):
```typescript
// Phase 150 D-07a graph memory metrics
getToken('triage_graph_lookup_total'),
getToken('triage_graph_promotion_total'),
getToken('triage_graph_edges_active'),
```

---

### MOD `backend/src/modules/ai/services/__tests__/email-triage.service.spec.ts` (spec)

**Analog:** self L1-80 (existing mock scaffold includes `TriageOverrideService`). Add `TriageGraphLookupService` mock alongside.

**Mock + provider addition** (analog L37-73):
```typescript
const graphLookupMock = { lookup: jest.fn().mockResolvedValue(null) };
// ...
providers: [
  EmailTriageService,
  // ... existing
  { provide: TriageOverrideService, useValue: overrideServiceMock },
  { provide: TriageGraphLookupService, useValue: graphLookupMock },  // Phase 150 NEW
],
```

**New `it` blocks** (extend the existing `describe` per RESEARCH §Wave 0 Gaps):
```typescript
it('calls graph lookup AFTER override-miss, BEFORE LLM', async () => { /* assert graphLookupMock.lookup invoked + insightsMock.analyzeEmailUnified invoked after */ });
it('SKIPS graph lookup when any override matched (Open Q2 resolution)', async () => { /* seed overrideServiceMock to return matched:true, assert graphLookupMock.lookup NOT called */ });
it('short-circuits LLM when graph confidence >= cutoff', async () => { /* seed graphLookupMock.lookup → 0.95; assert insightsMock.analyzeEmailUnified NOT called */ });
```

---

### MOD `backend/src/modules/ai/services/__tests__/triage-backfill-scheduler.service.spec.ts` or `triage-learning-redis.spec.ts` (spec)

**Analog:** `triage-correction.service.spec.ts` L1-90 (for the `processAffinityPromotion` branch dispatch) + `triage-learning-redis.spec.ts` L1-80 for the D-06 third-store extension.

**Divergence:** RESEARCH §Wave 0 Gaps notes the scheduler spec doesn't exist today (Phase 149's decay-gc tests live in `triage-learning-redis.spec.ts`). Planner's call: extend there OR create sibling `triage-decay-gc.helpers.spec.ts`. Recommendation from RESEARCH §D-06 fixtures: create new helper-spec for both D-01 promotion and D-06 third-store — cleaner separation.

---

### MOD `frontend/locales/{en,it,index}.ts` (i18n, static)

**Analog:** self — `frontend/locales/en.ts:1321-1326` + `frontend/locales/it.ts:1314` (the `accuracy.source` 3-entry dictionary).

**Pattern extension** (add 2 new keys after `llmRule`):
```typescript
// en.ts L1321-1326 extended
source: {
  llm: 'AI model',
  rule: 'Rule',
  llmRule: 'AI + Rule',
  graphSender: 'Learned pattern (sender)',       // Phase 150 D-03 / Landmine §3
  graphDomain: 'Learned pattern (domain)',       // Phase 150 D-03 / Landmine §3
},
```

```typescript
// it.ts L1314 extended
source: {
  llm: 'Modello AI',
  rule: 'Regola',
  llmRule: 'AI + Regola',
  graphSender: 'Pattern appreso (mittente)',
  graphDomain: 'Pattern appreso (dominio)',
},
```

**Type binding** — `frontend/locales/index.ts` type union will propagate automatically via `typeof en`. Grep for the `accuracy.source` interface if the project uses an explicit type — the Phase 148 D-12 pattern did NOT declare an explicit union type (the source dict is `Record<string, string>` structurally).

**Landmine §3 audit scope:** grep `frontend/src/**` for `t.labels.accuracy.source.llm|rule|llmRule` — any consumer `switch` statement must be extended to handle `graphSender` / `graphDomain`. Planner MUST grep for `triageSource` in frontend components (especially `LabelAccuracyBadge.tsx` if it exists) and add the two new branches.

---

## Shared Patterns

### Multi-tenant invariant (cross-cutting — CLAUDE.md hard rule)

**Source:** every Phase 149 Prisma call (e.g., `triage-decay-gc.helpers.ts:129-138, :149-151, :214-221, :232-234`).

**Apply to:** every new `prisma.graphEdge.*`, `prisma.graphNode.*`, `prisma.triageOverride.*`, `prisma.emailTriageFeedback.*`, `prisma.email.*` call in Phase 150 code.
```typescript
await prisma.graphEdge.findMany({ where: { tenantId, ... } });   // tenantId ALWAYS present
await prisma.graphEdge.deleteMany({ where: { id: edge.id, tenantId } });   // belt-and-braces
```

### `withoutTenantScopingAsync` (scheduler orchestration)

**Source:** `triage-backfill-scheduler.service.ts:116, :125`.
**Apply to:** Phase 150's `processAffinityPromotion` worker body — already wrapped by the outer `withoutTenantScopingAsync` at scheduler L116 since the new branch is dispatched from inside the existing wrapper. No additional wrapping needed.

### Env-var parsing with clamp

**Source:** `triage-backfill-scheduler.service.ts:80-87`.
**Apply to:** `TRIAGE_GRAPH_CONFIDENCE_CUTOFF` in `TriageGraphLookupService` constructor. Same `Number.isFinite(...) ? ... : default` clamp.

### `@InjectMetric` + `@Optional()` DI

**Source:** `triage-backfill-scheduler.service.ts:55-60` (3 metric injections with `@Optional() @InjectMetric`).
**Apply to:** 3 new metrics across 2 services (lookup service — 1 counter; scheduler — 1 counter + 1 gauge).

### BullMQ repeatable `jobId` dedup

**Source:** `triage-backfill-scheduler.service.ts:172-215` (3 existing repeatable names in cleanup list + `jobId: 'triage-nightly-X'` dedup).
**Apply to:** Phase 150's `'nightly-affinity-promotion'` / `jobId: 'triage-nightly-affinity-promotion'`. MUST add to cleanup list so partial-deploy repeatables don't double-fire.

### Prisma `upsert` against composite unique key

**Source:** `triage-override.service.ts:101-107` (`tenantId_type_pattern` composite key).
**Apply to:** `prisma.graphEdge.upsert({ where: { tenantId_sourceId_targetId_edgeType: {...} } })` in promotion helper. Composite key name derived automatically by Prisma from existing `@@unique([tenantId, sourceId, targetId, edgeType])` on GraphEdge.

### Extract-domain helper reuse (don't re-declare)

**Source:** `triage-decay-gc.helpers.ts:45-49` (`extractDomain`).
**Apply to:** promotion helper imports from Phase 149 file — no new declaration. Also `triage-override.service.ts:159-164` (`extractEmail`) reused by Phase 150 email-triage insertion block.

### Pure util + DI service split

**Source:** `triage-correction-weight.ts:1-74` (pure, DI-free util) + `triage-correction.service.ts:42-49` (DI service reads env, passes to util).
**Apply to:** `triage-affinity-promotion.helpers.ts` = pure (DepBag), `TriageGraphLookupService` = DI (ConfigService, @InjectMetric). `weightCorrection` used verbatim — NEVER reimplemented.

### Soft-delete landmine fix (Phase 150-specific, CLAUDE.md §Backend Procedure caveat)

**Source:** new in Phase 150. No prior analog — this is the first place in the codebase where a soft-deleted entity needs to trigger a FK cascade.
**Apply to:** `LabelsService.delete`, `bulkDelete`, `archiveDescendants`. Each must explicitly `prisma.graphNode.deleteMany({ where: { tenantId, nodeType: 'label', externalId: id } })` AFTER the soft-delete step. Test gate per RESEARCH Failure Mode §2.

### Migration workflow (CLAUDE.md §Active guardrails — zero bypass)

**Source:** `CLAUDE.md` §Active guardrails + Guard A/E/F.
**Apply to:** Phase 150 migration
1. `node -e "require('dotenv').config(); console.log(new URL(process.env.DATABASE_URL).host)"` MUST print `localhost`.
2. `npx prisma migrate dev --name add_graph_affinity_columns` locally.
3. Review SQL — zero `DROP` (Guard A).
4. Commit schema.prisma + migration.sql in SAME commit (Guard E).
5. Railway `migrate deploy` applies on push (Guard F boot-time drift check).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `triage-graph-lookup.service.ts` (partial) | service | read-path SQL | No existing `ai/services/*` is a pure single-query indexed-lookup probe. `TriageOverrideService` matches role (layer-N-of-triage) but is in-memory boolean rule match, not SQL. `EntityGraphService.queryGraph` (ai-chat) matches SQL shape but is multi-hop recursive CTE. Planner synthesizes from override-service return-shape + raw SQL from `entity-graph.service.ts` CTE shape. |

---

## Metadata

**Analog search scope:**
- `backend/src/modules/ai/services/` (Phase 147-149 services — primary analog source)
- `backend/src/modules/ai/services/__tests__/` (28 spec files — scaffold source)
- `backend/src/modules/ai/utils/` (`weightCorrection` — verbatim reuse)
- `backend/src/modules/labels/services/` (5 hook sites)
- `backend/src/modules/ai-chat/services/entity-graph.service.ts` (SQL shape only, not modified)
- `backend/src/common/metrics/metrics.module.ts` (Phase 148-149 provider/export pattern)
- `backend/prisma/migrations/20260325105000_reconcile_baseline/migration.sql` (graph_edges baseline DDL)
- `frontend/locales/{en,it,index}.ts` (Phase 148 D-12 accuracy.source dict)

**Files scanned:** ~20 read fully, ~15 grep-probed.

**Pattern extraction date:** 2026-04-24.

**Open questions resolved (by picking the RESEARCH-recommended path):**
- Q1: YES — reuse `MIN_DISTINCT_SENDERS_FOR_DOMAIN` + `ROLE_ACCOUNT_LOCAL_PARTS` from `triage-feedback.service.ts:51-55`.
- Q2: Option A — skip Layer 2 entirely when Layer 1 matched (any visibility).
- Q3: flat `ai/services/` — no subdir.
- Q4: extract helper (Phase 149 pattern).
- Q5: provider-only, not exported.
- Q6: scheduler does NOT inject `TriageGraphLookupService`.
- Q7: shadow counter inline in lookup service (not decorator).
- Q8: mock-based unit tests (Phase 147/148/149 pattern).
- Q9: MIGRATION ADDS `@@unique([tenantId, nodeType, externalId])` ONLY IF pre-migration dedup scan returns 0 rows. Otherwise fall back to find-then-create in transaction (Landmine §1 Option b). Planner MUST run the scan BEFORE generating the migration.
