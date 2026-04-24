# Phase 150 Research

**Researched:** 2026-04-24
**Status:** COMPLETE
**Scope contract:** Research confirms existing-code assumptions in `150-CONTEXT.md` and produces the Validation Architecture the planner needs for Dimension 8 gates. External research (Graphiti/Zep, GAM, OpenClaw, HaluGate, Stalwart, Karpathy, Prometheus) is NOT redone — CONTEXT.md already locks those into D-01…D-07a.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions — research must conform, not explore alternatives

| ID | Decision (summary) |
|----|-------------------|
| **D-01** | Minimal Deep stub: nightly BullMQ `'affinity-promotion'` job at cron `0 3 * * *`. Handler reads `TriageOverride` + joins `EmailTriageFeedback`, uses `weightCorrection(ageDays, { halfLifeDays })`, upserts edge when weighted-sum ≥ 0.8 AND feedback row count ≥ 3. Domain aggregation in second pass. |
| **D-01a** | Edges carry Zettelkasten-style provenance in `GraphEdge.metadata`: `derivedFromOverrideIds: string[]` + `promotionAudit: { jobId, jobTimestamp, computedConfidence, feedbackRowCount, halfLifeDays }`. No new columns. |
| **D-02** | Prisma migration adds 3 nullable columns to `graph_edges`: `confidence Float?`, `validFrom DateTime?`, `validUntil DateTime?`. 2 new compound indexes: `(tenantId, edgeType, confidence)` + `(tenantId, edgeType, validUntil)`. Existing `@@unique([tenantId, sourceId, targetId, edgeType])` is reused. |
| **D-03** | 3-layer read path in `EmailTriageService.triageEmail`: (1) `TriageOverrideService.applyOverrides` → (2) NEW `TriageGraphLookupService.lookup(tenantId, senderEmail)` → (3) LLM. Short-circuit on `confidence >= TRIAGE_GRAPH_CONFIDENCE_CUTOFF`; hint injection on `0.7 <= confidence < cutoff`; LLM unchanged otherwise. |
| **D-03a** | Single SQL query shape with `ORDER BY sender-first, confidence DESC LIMIT 1`. JOIN src & tgt nodes, filter on `edgeType IN ('SENDER_LABEL_AFFINITY','DOMAIN_LABEL_AFFINITY')`, `confidence >= 0.7`, `(validUntil IS NULL OR validUntil > now())`. |
| **D-04** | 3 new `nodeType` values on existing `GraphNode`: `'sender'`, `'email_domain'`, `'label'`. Promotion job auto-upserts source/target nodes on edge write. `LabelsService.create/update/delete` mirrors Label→GraphNode (rename/delete hook). |
| **D-04a** | Sender normalization = `email.trim().toLowerCase()`. No `+`-alias stripping. No subdomain collapsing. |
| **D-05** | Sender edge beats domain edge via SQL `ORDER BY (CASE WHEN src.nodeType='sender' THEN 0 ELSE 1 END), confidence DESC`. No code-side comparison. |
| **D-06** | `validFrom = job runtime` on creation/upsert. `validUntil = NULL` on creation. Phase 149 `decay-gc` gains a THIRD store: affinity-edge sweep after Redis sender-scores + TriageOverride. `triage_patterns_gc_total{store='graph_edge'}` label value added. |
| **D-07** | Single env var `TRIAGE_GRAPH_CONFIDENCE_CUTOFF` (default `9999`). Shadow counter `outcome='would_skip_shadow'` ALWAYS emits when edge confidence ≥ 0.9, regardless of cutoff. |
| **D-07a** | 3 Prometheus metrics: `triage_graph_lookup_total{outcome, edge_source, tenant_id}` counter, `triage_graph_promotion_total{tenant_id, edge_type, action}` counter, `triage_graph_edges_active{tenant_id, edge_type}` gauge. |

### Claude's Discretion (from CONTEXT.md)

- Exact migration filename timestamp.
- Whether `TriageGraphLookupService` lives in `ai/services/` or `ai/graph/` subdir.
- Whether promotion-job SQL extracts to a helper file (mirror Phase 149 pattern) or inlines.
- Whether `would_skip_shadow` emission lives inside lookup service or as a decorator.
- First-deploy 24h warmup window.
- Promotion job test-fixture approach (mock vs seed script).

### Deferred Ideas (OUT OF SCOPE — do not recommend)

Merge `sender` → `Contact` nodes (Phase 151); bitemporal `invalidatedAt` column (Phase 152); dedicated `TriageConsolidationAudit` table (Phase 152); per-sender confidence histogram (Phase 155); per-tenant percentage rollout flag (rejected); weighted-sum / max-confidence precedence (rejected); Gmail `+`-alias stripping (rejected); fixed 90-day `validUntil` TTL (rejected); Label semantic-overlap on mirror sync (Phase 153); multi-hop traversal on affinity edges (Phase 155); cross-tenant pattern aggregation (out of scope for v13); unified `nodeType='identity'` (over-abstraction).

---

## Phase Requirements

| ID | Description (from v13.0-ROADMAP.md §GRAPH) | Research Support |
|----|--------------------------------------------|------------------|
| **GRAPH-01** | Sender-to-label and domain-to-label graph edges with confidence scores | D-01 writer + D-02 schema + D-04 node identity confirmed compatible with existing `GraphEdge` model at `schema.prisma:2293`. No blockers. |
| **GRAPH-02** | Confidence gating: skip LLM for high-confidence patterns (≥0.9) | D-03 + D-03a + D-07 confirmed compatible with `EmailTriageService.triageEmail` at `email-triage.service.ts:265`. Insertion point clarified below. |
| **GRAPH-03** | Graph edges carry temporal validity windows (validFrom/validUntil) | D-02 + D-06 confirmed. No existing edge uses these columns, so defaulting to NULL is backward-compatible for all 7 existing edge types. |

---

## Integration Point Confirmation

### `backend/prisma/schema.prisma` — GraphEdge @ line 2293 (CONTEXT claimed line 2293)

CONFIRMED. Exact current shape (lines 2293–2314):

```prisma
model GraphEdge {
  id        String   @id @default(cuid())
  tenantId  String
  sourceId  String
  targetId  String
  edgeType  String // 'sent', 'received', 'mentions', 'replies_to', 'about', 'attended', 'anchored_to'
  weight    Float    @default(1.0)
  metadata  Json     @default("{}")
  createdAt DateTime @default(now())

  tenant Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  source GraphNode @relation("EdgeSource", fields: [sourceId], references: [id], onDelete: Cascade)
  target GraphNode @relation("EdgeTarget", fields: [targetId], references: [id], onDelete: Cascade)

  @@unique([tenantId, sourceId, targetId, edgeType])
  @@index([tenantId])
  @@index([sourceId])
  @@index([targetId])
  @@index([tenantId, edgeType])
  @@index([sourceId, edgeType])
  @@map("graph_edges")
}
```

Drift from CONTEXT assumptions: **NONE**. All 7 existing edge type comments + `@@unique` + `weight` default match CONTEXT.md `<code_context>`.

### `backend/prisma/schema.prisma` — GraphNode @ line 2270 (CONTEXT claimed line 2270)

CONFIRMED. Lines 2270–2291. Drift: **NONE**. Three existing indexes: `(tenantId)`, `(tenantId, nodeType)`, `(tenantId, externalId)`, GIN on `label`. **No `(tenantId, nodeType, externalId)` unique constraint** — CONTEXT.md "Known gotchas" flag verified. See Landmines §1.

### `backend/src/modules/ai/services/email-triage.service.ts` — `triageEmail()` insertion point

CONTEXT.md claimed line 284. **CORRECTION:** line 284 is the `applyOverrides` CALL site. The graph-lookup insertion point is between the match-fail branch (control returns from the `if (or.matched ...)` block to the fall-through LLM path) and the LLM call `this.emailInsights.analyzeEmailUnified(...)` at **line 362**.

**Concrete insertion region:** between line 358 (end of the `if (this.triageOverrideService)` block) and line 362 (LLM call). The overrideHint + matchedOverrideAction state vars declared at 273–275 are in scope.

Constructor signature (line 119–127):
```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly emailInsights: EmailInsightsService,
  private readonly subscriptionService: SubscriptionService,
  private readonly redisConnection: RedisConnectionService,
  @Optional() private readonly triageActionService?: TriageActionService,
  @Optional() private readonly crmSuggestionTrigger?: CrmSuggestionTriggerService,
  @Optional() private readonly triageOverrideService?: TriageOverrideService,
) {}
```

Planner **MUST** add `@Optional() triageGraphLookupService?: TriageGraphLookupService` as an 8th constructor arg (preserving `@Optional()` symmetry with `triageOverrideService`). This avoids a BREAKING-CHANGE to existing test harnesses that construct the service without graph lookup (see `__tests__/email-triage.service.spec.ts`, `email-triage-cost-controls.spec.ts`, `email-triage-semaphore.spec.ts`).

The existing muting-override short-circuit (lines 293–351) already writes `triageSource: 'rule'` and returns early — graph lookup comes AFTER this block.

### `backend/src/modules/ai/services/triage-override.service.ts` — OverrideResult shape for mirror

CONFIRMED. `applyOverrides(tenantId, { from, threadId }): Promise<OverrideResult>` where:

```typescript
export interface OverrideResult {
  matched: boolean;
  override?: TriageOverride;
  lane?: string;
  suppressFollowUp?: boolean;
}
```

Layer 2 return shape should mirror: `GraphLookupResult | null` with `{ predictedLabel, confidence, source: 'sender' | 'domain' }`. No `matched` boolean needed — null-or-object is simpler. Planner discretion.

### `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts` — scheduler extension

CONFIRMED. Pattern verified line-by-line:

- **Line 16:** `BackfillJobData['type']` union = `'scheduled' | 'manual' | 'recalculation' | 'decay-gc'`. Phase 150 adds `'affinity-promotion'` here.
- **Line 119–125:** Worker dispatch switch. Phase 150 adds a 4th branch BEFORE `decay-gc` OR AFTER it. See Validation Architecture for ordering constraint (decay-gc hard-deletes affinity edges per D-06, so promotion must run BEFORE decay-gc OR the job ordering doesn't matter because they operate on different stores / the decay-gc already runs per-tenant inside its own pass).
- **Line 172–215:** `setupRepeatableJob`. Three existing repeatable names: `'scheduled-triage-backfill'`, `'nightly-recalculation'` (legacy, kept in cleanup list line 179), `'nightly-decay-gc'`. Phase 150 adds `'nightly-affinity-promotion'` with `jobId: 'triage-nightly-affinity-promotion'`. **Add to the cleanup list** (lines 175–184) so partial-deploy repeatables don't double-fire.
- **Line 413–456:** `processDecayGc`. Phase 150 D-06 extends this — the third store (`GraphEdge`) sweep is injected into the existing per-tenant loop (line 423) OR extracted to a second helper. See Discretion (CONTEXT `<decisions>` → Claude's Discretion).
- **Line 517–543:** `findActiveTenants`. Reused verbatim by affinity-promotion. No changes needed.

Constructor (lines 49–61) has 8 args: `PrismaService`, `EmailTriageService`, `ConfigService`, then 5 `@Optional()` deps (TriageLearningService, RedisConnectionService, and three metric tokens). Phase 150 adds 3 new metric tokens: `triage_graph_lookup_total`, `triage_graph_promotion_total`, `triage_graph_edges_active` (gauge) via `@Optional() @InjectMetric`.

### `backend/src/modules/ai/services/triage-decay-gc.helpers.ts` — mirror pattern for affinity-promotion

CONFIRMED. 270 LF pure-function module exporting `processDecayGcForTenant(tenantId, deps)` + helper `recomputeOverrideConfidence`. Dependency bag pattern:

```typescript
export interface DecayGcDeps {
  prisma: PrismaService;
  redis: Redis | null;
  gcCounter?: Counter<string>;
  halfLifeDays: number;
}
```

**Phase 150 mirrors verbatim.** Recommended filename: `triage-affinity-promotion.helpers.ts`. Exports: `processAffinityPromotionForTenant(tenantId, deps)`. Dep bag adds `promotionCounter`, `activeEdgesGauge`. No Redis dep.

**D-06 third store injection:** `triage-decay-gc.helpers.ts` gains a third sweep AFTER the TriageOverride sweep (line 158 is the seam). Add a `processAffinityEdgeDecayForTenant` helper in the same file OR a new file. Pattern preserves all existing invariants: `gcCounter?.inc({ store: 'graph_edge', tenant_id: tenantId })`, `prisma.graphEdge.deleteMany({ where: { tenantId, id: edge.id } })`.

### `backend/src/modules/ai/utils/triage-correction-weight.ts` — DO NOT reimplement

CONFIRMED. Pure DI-free helper. Export: `weightCorrection(ageDays, opts?: { halfLifeDays?, minWeight? })`. Also exports `TP_IMPLICIT_WINDOW_DAYS = 14` (Phase 148 constant, unchanged by Phase 150).

Phase 150 promotion-job math: `sum(count * weightCorrection(ageDays, { halfLifeDays }))` where `halfLifeDays` comes from `ConfigService.get('TRIAGE_DECAY_HALF_LIFE_DAYS', '14')` with `Math.max(1, ...)` clamp (the same 3-line prelude used in `TriageCorrectionService:42–49` and `TriageBackfillSchedulerService:80–87`).

### `backend/src/modules/ai-chat/services/entity-graph.service.ts` — recursive CTE compatibility

CONFIRMED. Line 92–139 recursive CTE uses `e.weight * power(0.7, w.hop + 1)` for score propagation. **It does NOT reference `e.confidence`.** New affinity edges default `weight=1.0` (GraphEdge default) — so traversal from a seed node THROUGH an affinity edge will use `weight=1.0`, NOT `confidence`. This is NOT broken for Phase 150 (which only does single-hop lookup, not traversal), but Phase 155 dashboards consuming multi-hop traversal will need a separate decision about whether to factor `confidence`. Out of scope for Phase 150; flag only.

Single-hop lookup does NOT use the recursive CTE — it's a direct SQL query per D-03a. `EntityGraphService` is not modified.

### `backend/src/modules/labels/services/labels.service.ts` — D-04 mirror hook points

CONFIRMED. Three hook sites:

| Method | Line | Current Behavior | D-04 Hook |
|--------|------|------------------|-----------|
| `create` | 156 | `prisma.userLabel.create` + realtimeEvents.emitLabelNew + invalidateTenantAnalysisCache | Upsert `GraphNode{ tenantId, nodeType:'label', externalId: newLabel.id, label: newLabel.name }` AFTER the Prisma create. |
| `createFromWizard` | 848 | Same shape, takes extra wizard params | Same hook. **Planner must NOT forget this branch — this is where UI labels come from.** |
| `update` | 217 | `prisma.userLabel.update` with or without `$transaction` | Update `GraphNode.label` on name change. Only fires when `dto.name` changed (check `data.name` set at line 260). |
| `updateFromWizard` | 915 | Same shape | Same hook. |
| `delete` | 420 | **SOFT-DELETE** — `prisma.userLabel.update` sets `isArchived: true` + slug rename. NO Prisma `delete`. | See Landmines §2: `onDelete: Cascade` does NOT fire on soft-delete. |
| `bulkDelete` | 448 | **SOFT-DELETE** via `updateMany` + `update` in `$transaction` | Same landmine. |

`LabelsService` constructor (lines 48–55) takes 5 deps + `@Optional() EmailInsightsService`. Adding a GraphNode mirror would need a new dep (likely `PrismaService` is already injected — it is; planner can use it directly, no new DI needed).

### `backend/src/modules/ai/ai.module.ts` — provider registration point

CONFIRMED. Line 170 registers `TriageOverrideService` as provider. Line 219 re-exports it. Phase 150 adds `TriageGraphLookupService` to:

1. `providers: [...]` (line 170 vicinity, with the other triage services).
2. `exports: [...]` IF consumed outside AiModule — check if Phase 151 needs it exported. For Phase 150 scope only, keep it unexported (only `EmailTriageService` inside the same module consumes it).

No ModuleInit wiring needed — the service is a regular `@Injectable()`.

### `backend/src/common/metrics/metrics.module.ts` — Prometheus provider registration

CONFIRMED. Line 109–127 registers Phase 149's three decay metrics. Phase 150 adds three new providers in the same pattern (lines 129 vicinity) AND adds `getToken()` exports at line 147 vicinity:

```typescript
// Phase 150 (D-07a)
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

**Cardinality check:**
- `triage_graph_lookup_total`: outcome (4 values) × edge_source (3 values) × tenant_id (≤ ~100 tenants) = max 1,200 series. Within 2026 Prometheus budget (~10k series per metric). Same as Phase 149's `triage_patterns_gc_total` with `tenant_id` (approved there).
- `triage_graph_promotion_total`: 2 edge_types × 2 actions × ~100 tenants = max 400 series. Fine.
- `triage_graph_edges_active`: 2 edge_types × ~100 tenants = max 200 series. Fine.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (via NestJS `@nestjs/testing`). Existing specs at `backend/src/modules/ai/**/__tests__/*.spec.ts`. Pattern: isolated service tests with `prismaMock`/`redisMock`/`configMock`. 28 triage-related spec files already exist. |
| Config | Root `backend/jest.config.js` (inherit). No new config needed. |
| Quick run command | `cd backend && npx jest --testPathPatterns='triage-graph-lookup\|triage-affinity-promotion\|triage-correction-weight'` — runs Phase 150 specs + the Phase 149 decay-weight spec that guards the shared helper. |
| Full suite command | `cd backend && npm test` (note: requires `npm run test:docker:up` for integration specs; unit specs run without Docker). |
| Type check | `cd backend && npx tsc --noEmit` (mandatory per CLAUDE.md post-edit validation). |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| GRAPH-01 | Affinity edges created by nightly job with OpenClaw 3/0.8 gates | unit (helper) | `jest triage-affinity-promotion.helpers.spec.ts` | ❌ Wave 0 |
| GRAPH-01 | `GraphEdge.confidence`/`validFrom`/`validUntil` columns populated on affinity-edge creation, NULL on the 7 existing edge types | integration (schema shape) | `jest graph-affinity-migration.spec.ts` OR `tsc --noEmit` catches type drift from generated Prisma client | ❌ Wave 0 |
| GRAPH-02 | `TriageGraphLookupService.lookup` returns match/hint/miss per cutoff | unit (service) | `jest triage-graph-lookup.service.spec.ts` | ❌ Wave 0 |
| GRAPH-02 | `EmailTriageService.triageEmail` calls lookup AFTER override, BEFORE LLM, short-circuits on confidence ≥ cutoff | unit (plumbing) | `jest email-triage.service.spec.ts` (extend existing) | ✅ extend |
| GRAPH-02 | `outcome='would_skip_shadow'` emits regardless of `TRIAGE_GRAPH_CONFIDENCE_CUTOFF` | unit (service) | `jest triage-graph-lookup.service.spec.ts` | ❌ Wave 0 |
| GRAPH-03 | Affinity edges with `validUntil > now()` returned by lookup query; expired edges excluded | unit (SQL shape via Prisma mock or real query) | `jest triage-graph-lookup.service.spec.ts` | ❌ Wave 0 |
| GRAPH-03 | Phase 149 `decay-gc` third store: affinity edges below 0.3 recomputed confidence are hard-deleted + counter emits `store='graph_edge'` | unit (helper) | `jest triage-decay-gc.helpers.spec.ts` (extend existing OR create new) | ⚠ spec doesn't exist today — Phase 149's decay-gc tests live in `triage-learning-redis.spec.ts` per VERIFICATION §Plan 05. See Wave 0 Gaps. |

### Sampling Rate (Nyquist — per D-01…D-07a)

**For each decision, the minimum fixture set the plan MUST cover:**

#### D-01 Promotion Gate Coverage (OpenClaw 3/0.8)

| Scenario | Expected Outcome | Minimum Fixtures |
|----------|------------------|------------------|
| Weighted-sum ≥ 0.8 AND feedback rows ≥ 3 | Edge upserted, counter `promotion_total{action='created'}` | 1 |
| Weighted-sum ≥ 0.8 AND feedback rows = 2 | No edge (row-count gate) | 1 |
| Weighted-sum = 0.7 AND feedback rows ≥ 5 | No edge (confidence gate) | 1 |
| Re-run against existing edge (same sender+label) with new feedback | Edge UPDATED, counter `action='updated'` | 1 |
| Re-run after all supporting feedback rows aged out (weightCorrection < 0.3) | Edge NOT pruned by promotion job (that's decay-gc's job) | 1 |
| Domain aggregation: 3 distinct senders × 3 corrections each, same target label | Domain edge created | 1 |
| Domain aggregation: 1 sender × 9 corrections, same target | No domain edge (distinct-sender gate — **this is Phase 147 D-04 rule, verify CONTEXT.md inherits it — actually CONTEXT.md D-01 says only "row count ≥ 3", check Phase 147 `MIN_DISTINCT_SENDERS_FOR_DOMAIN=3` still applies** — see Open Questions §1) | 1 |

**Total D-01 promotion fixtures: ≥ 7 per the minimum scenario map.**

Fixture source: mock `prisma.triageOverride.findMany` + `prisma.emailTriageFeedback.findMany` + `prisma.email.findMany` (for domain aggregation `Email.from` correlation). The Phase 149 test pattern at `triage-correction.service.spec.ts` (lines 1–80) is the reference — **follow it verbatim**.

#### D-03 Three-Layer Read Path Coverage

Minimum scenario matrix (sender × domain × cutoff-state × confidence-band):

| Layer 1 | Layer 2 Edge | Confidence Band | Cutoff | Expected `outcome` | Expected Behavior |
|---------|-------------|-----------------|--------|-------------------|-------------------|
| Miss | Sender 0.95 | ≥ 0.9 | 0.9 | `skipped` + `edge_source='sender'` | Short-circuit, no LLM |
| Miss | Sender 0.95 | ≥ 0.9 | 9999 | `would_skip_shadow` + `edge_source='sender'` | LLM runs normally |
| Miss | Sender 0.85 | 0.7–0.9 | 0.9 | `hinted` + `edge_source='sender'` | LLM runs with hint |
| Miss | Domain 0.85 | 0.7–0.9 | 0.9 | `hinted` + `edge_source='domain'` | LLM runs with hint |
| Miss | Sender 0.6 | < 0.7 | 0.9 | `missed` + `edge_source='none'` | LLM runs unchanged |
| Miss | Sender 0.95 AND Domain 0.95 | ≥ 0.9 | 0.9 | `skipped` + `edge_source='sender'` (D-05 precedence) | Short-circuit |
| Miss | Domain 0.95, no sender | ≥ 0.9 | 0.9 | `skipped` + `edge_source='domain'` | Short-circuit |
| Miss | Sender 0.95 but `validUntil < now()` | — | 0.9 | `missed` (expired edge filtered) | LLM runs |
| Muting-override match (Layer 1) | sender 0.95 exists | — | 0.9 | Lookup **NOT called** — muting short-circuits at line 293 | Verify `TriageGraphLookupService.lookup` is NOT invoked |
| Visible-override match (Layer 1) | sender 0.95 exists | — | 0.9 | Lookup **may still be called** — CONTEXT §D-03 says "if layer 1 matches → apply and exit" — verify the lookup is SKIPPED in this case too (hint+graph would compound unpredictably) | see Open Questions §2 |

**Total D-03 read-path fixtures: ≥ 10.**

#### D-05 Sender-Beats-Domain Precedence

Minimum fixture: 1 integration-like unit test that seeds BOTH a sender-edge with confidence 0.75 AND a domain-edge with confidence 0.95 for the same tenant+email. Expected: lookup returns the sender edge (0.75), NOT the domain edge (0.95). This proves the `ORDER BY sender-first` clause is load-bearing — without it, the domain edge would win on confidence-DESC.

If real Postgres is not available for the unit test, mock `prisma.$queryRaw` and assert the emitted SQL contains `(CASE WHEN src.nodeType = 'sender' THEN 0 ELSE 1 END)` literal (pattern grep gate). Follow Phase 149's `triage-decay-gc.helpers.spec.ts` pattern which grep-asserts SQL shape.

#### D-06 Decay-GC Third Store

Minimum fixtures:

| Scenario | Expected |
|----------|----------|
| Affinity edge recomputed confidence < 0.3 | `graphEdge.deleteMany` called; `gcCounter{store='graph_edge'}` emits |
| Affinity edge confidence = 0.35 (just above threshold) | No delete |
| Affinity edge with `derivedFromOverrideIds=[]` (no provenance — corrupt or legacy) | Defensive behavior: treat as ancient OR skip. Planner decides, but must test both branches. |
| Multi-tenant: 2 tenants each with 3 edges each | Deletes scoped per tenant (invariant: `where: { tenantId, id }`) |
| `decay-gc` failure on graph-edge store does NOT corrupt Redis/TriageOverride sweeps | per-tenant try/catch already in place in scheduler lines 424–442; extend to the new helper |

**Phase 149 decay-gc regression baseline:** `149-VERIFICATION.md §Plan 05` lists tests 5.1–5.12. Phase 150 must not regress any of them. Run `jest triage-learning-redis.spec.ts` as the regression harness (this is where Phase 149's decay-gc unit tests live per Plan 05 commit `76a79e27`).

#### D-07 Shadow Counter Always-On

Minimum fixture: 1 test per outcome value with `TRIAGE_GRAPH_CONFIDENCE_CUTOFF=9999`. Exactly ONE scenario (sender edge 0.95) must produce `outcome='would_skip_shadow'` AND NOT `outcome='skipped'` AND the LLM IS still called. Pair with a cutoff=0.9 control that produces `outcome='skipped'` AND does NOT call LLM. This proves the shadow counter is independent of the cutoff branch.

#### D-03a Latency Ceiling (p95 < 5ms)

**Important honesty flag:** `[ASSUMED]` — CONTEXT.md asserts p95 < 5ms for the lookup query against "274 emails, 540 contacts, 810 graph edges" (the 2026-04-20 wipe recovery state). This is unverified. **The realistic test is:**

1. Unit-test benchmark CANNOT prove 5ms p95 — it only proves query correctness.
2. A realistic benchmark requires a Postgres instance with a seeded affinity-edge dataset at similar cardinality. The planner's options:
   - **Option A (recommended):** Skip the latency test in Phase 150. Add a Phase 155 dashboard panel for `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{route=~"/api/v1/emails.*triage"}[5m])))` — measure in production, not in CI.
   - **Option B:** Add an integration test that runs against the Docker Postgres (via `npm run test:docker:up`) with a seeded fixture of 1000 affinity edges and 100 tenants. Assert the query returns in < 100ms on CI (not 5ms — CI hardware varies wildly). The 5ms is a prod target, not a CI target.
3. The compound indexes `(tenantId, edgeType, confidence)` + `(tenantId, edgeType, validUntil)` will be used by the planner for:
   - The `WHERE edgeType IN (...) AND confidence >= 0.7` filter → primary index usage on `(tenantId, edgeType, confidence)`.
   - The `validUntil IS NULL OR validUntil > now()` predicate → secondary index scan OR index-only if the planner decides.
   - The JOIN to `graph_nodes` (src and tgt) uses the existing `(tenantId, nodeType)` + `(tenantId, externalId)` indexes already in schema — no new work.

**Position of each index use (EXPLAIN POSITION):**
1. `(tenantId, edgeType, confidence)` — drives the primary filter. Postgres uses this as the outer-loop driving scan.
2. `(tenantId, edgeType, validUntil)` — redundant for this query if Postgres chooses the first; NOT REDUNDANT for the decay-gc D-06 sweep which filters by `validUntil`. Both indexes are justified.
3. GraphNode joins use the existing `(tenantId, externalId)` — no new index.

### Failure Modes the Plan Must Test

1. **NULL-column regression for existing 7 edge types.** After Phase 150 migration, `graph_edges.confidence/validFrom/validUntil` are NULL for the 7 existing types. Any `SELECT * FROM graph_edges WHERE confidence >= X` that omits the edgeType filter would exclude existing rows. The `WHERE edgeType IN (...)` filter in D-03a is load-bearing — if the planner forgets it in the GC sweep or elsewhere, Phase 109 graph data is silently excluded from traversal. **Test gate:** grep every raw SQL touching `graph_edges` post-Phase-150 for the `edgeType` filter.

2. **FK cascade misconfiguration on Label delete.** D-04 promises `onDelete: Cascade` drops affinity edges when a Label is deleted. **This does NOT work** — see Landmines §2. Test scenario: create a UserLabel, create a GraphNode mirror, create a SENDER_LABEL_AFFINITY edge targeting that mirror. Call `LabelsService.delete(labelId)`. Assert the GraphEdge is **still present** (soft-delete does not cascade). This proves the landmine exists AND that the planner needs a manual cleanup step.

3. **p95 latency regression.** See D-03a §Latency Ceiling. Out of scope for CI.

4. **Shadow-counter off when it should be on.** If the planner puts the shadow-counter emit inside a branch gated on `confidence >= cutoff`, the counter falls silent on the default `cutoff=9999` deploy. Test gate: assert `outcome='would_skip_shadow'` emits with `cutoff=9999` AND confidence=0.95.

5. **Promotion job writes inline from triage-path (SC-3 violation).** D-01 states: edges are created only by the nightly job, never inline. Test gate: grep `TriageGraphLookupService` for `graphEdge.create|graphEdge.upsert|graphEdge.update` — must be zero. The service is READ-ONLY.

6. **Promotion job collides with decay-gc via race condition.** Both jobs run nightly at 3 AM. Dispatch order matters: if affinity-promotion runs BEFORE decay-gc, fresh edges could be decayed immediately. Test gate: verify the scheduler dispatch order places promotion FIRST (or wrap the jobs so decay-gc excludes edges created in the last 24h).

7. **Cross-tenant leak via missing `tenantId` filter.** Mandatory per CLAUDE.md. Test gate: grep every new Prisma call for explicit `tenantId` in `where`. Phase 149 shipped 9/9 clean (VERIFICATION §Multi-Tenant Invariant Audit). Phase 150 must match.

8. **`EmailAnalysis.triageSource` string-value drift.** Current values: `'llm' | 'rule' | 'llm+rule'` (documented in 1370 comment). CONTEXT.md `<code_context>` suggests extending to `'rule' | 'graph_sender' | 'graph_domain' | 'llm'`. But `LabelAccuracySourceBreakdown.triageSource` (schema.prisma:2616) is also a free-form string — extending the value set would silently break Phase 148's accuracy rollup unless the rollup is updated to accept the new values. See Landmines §3.

9. **Guard F runtime drift fail-fast.** The Prisma migration adds columns + indexes. After `npx prisma migrate deploy`, Guard F runs `prisma migrate diff --exit-code`. Any schema drift causes rollback. Test gate: run `npx prisma migrate diff --from-schema-datamodel schema.prisma --to-schema-datasource $DATABASE_URL --exit-code` in CI BEFORE the production deploy. Already automated by Guard F.

10. **Guard A migration safety — nullable columns only, no DROP.** The migration must be nullable-only (D-02). Guard A rejects DROP TABLE/COLUMN/CONSTRAINT. Test gate: read the generated migration SQL, confirm zero `DROP` tokens. No `-- ALLOW-DESTRUCTIVE:` header needed.

### Acceptance Thresholds (Dimension 8 gates)

The plan-checker MUST enforce these concrete numbers:

| Gate | Threshold | Evidence Location |
|------|-----------|-------------------|
| Schema columns added | Exactly 3 (`confidence`, `validFrom`, `validUntil`) — all nullable | `prisma/schema.prisma` §GraphEdge + migration SQL |
| Schema indexes added | Exactly 2 compound (`tenantId, edgeType, confidence` + `tenantId, edgeType, validUntil`) | same |
| New edge-type strings | Exactly 2 (`SENDER_LABEL_AFFINITY`, `DOMAIN_LABEL_AFFINITY`) | grep across `backend/src/` |
| New nodeType strings | Exactly 3 (`sender`, `email_domain`, `label`) | grep |
| New services | Exactly 1 (`TriageGraphLookupService`) | `ai/services/` |
| New helper files | Exactly 1 (`triage-affinity-promotion.helpers.ts`) if extracted, OR inlined in scheduler | planner's call |
| New Prometheus metrics | Exactly 3 (`triage_graph_lookup_total`, `triage_graph_promotion_total`, `triage_graph_edges_active`) | `metrics.module.ts` |
| New env vars | Exactly 1 (`TRIAGE_GRAPH_CONFIDENCE_CUTOFF`) | `ConfigService.get` grep |
| New BullMQ job types | Exactly 1 (`'affinity-promotion'` added to `BackfillJobData['type']` union) | `triage-backfill-scheduler.service.ts:16` |
| Promotion gates | `weighted-sum >= 0.8 AND feedbackRowCount >= 3` hardcoded OR as named constants | helper file |
| Read-layer ORDER BY | Literal string `CASE WHEN src."nodeType" = 'sender' THEN 0 ELSE 1 END` present in emitted SQL | grep |
| Shadow-counter emit | `outcome: 'would_skip_shadow'` path NOT gated on cutoff | service source + spec |
| Test count | ≥ 7 promotion fixtures, ≥ 10 read-path fixtures, ≥ 1 D-05 precedence fixture, ≥ 5 D-06 decay-gc fixtures | spec files |
| Multi-tenant invariant | Every new Prisma `where` clause contains `tenantId` | grep + review |
| `tsc --noEmit` | Exits 0 | CI |
| Guard A (migration safety) | Zero `DROP` in migration SQL | pre-commit |
| Guard E (schema/migration sync) | Both files committed together | pre-commit |
| Guard F (runtime drift) | `prisma migrate diff --exit-code` post-deploy exits 0 | Railway deploy |

### Wave 0 Gaps

Tests / infrastructure that must exist BEFORE Phase 150 implementation waves start:

- [ ] `backend/src/modules/ai/services/__tests__/triage-graph-lookup.service.spec.ts` — covers D-03, D-05, D-07 read-path scenarios (~10 `it` blocks).
- [ ] `backend/src/modules/ai/services/__tests__/triage-affinity-promotion.helpers.spec.ts` — covers D-01 gates + D-01a provenance (~7 `it` blocks). Follow the `triage-correction.service.spec.ts:1–80` pattern: mock `prisma.triageOverride.findMany`, `prisma.emailTriageFeedback.findMany`, `prisma.email.findMany`.
- [ ] Extend `backend/src/modules/ai/services/__tests__/email-triage.service.spec.ts` — add 3 new `it` blocks asserting `TriageGraphLookupService.lookup` is invoked AFTER override-miss and BEFORE LLM, with behavior branching on `cutoff` env.
- [ ] Extend `backend/src/modules/ai/services/__tests__/triage-learning-redis.spec.ts` (Phase 149's decay-gc spec home) — add D-06 third-store scenarios OR create a sibling `triage-decay-gc.helpers.spec.ts` file. CONTEXT.md line 138 suggests extracting `triage-affinity-promotion.helpers.ts` — the spec file naming should follow.
- [ ] Migration SQL file at `backend/prisma/migrations/<timestamp>_add_graph_affinity_columns/migration.sql` — generated by `npx prisma migrate dev --name add_graph_affinity_columns` against LOCAL Postgres.
- [ ] Framework install: none — Jest + @nestjs/testing already installed; `@willsoto/nestjs-prometheus` already in use (Phase 148/149).

---

## Landmines

### 1. `GraphNode` has NO `@@unique([tenantId, nodeType, externalId])` — upsert will fail

**Severity:** HIGH. Blocks D-04 naive implementation.

**Evidence:** `schema.prisma:2286-2290` — `GraphNode` has three plain `@@index` entries:

```prisma
@@index([tenantId])
@@index([tenantId, nodeType])
@@index([tenantId, externalId])
```

**No `@@unique`.** CONTEXT.md `<code_context>` known gotchas flagged this. Confirmed via grep: no hit for `tenantId_nodeType_externalId` anywhere in codebase.

**Impact on D-04:** CONTEXT.md proposes `ON CONFLICT (tenantId, nodeType, externalId) DO NOTHING` — this will **fail with a runtime error** because there's no unique index to conflict on. Prisma's `upsert(where: { tenantId_nodeType_externalId: ... })` auto-generated composite key does NOT exist.

**How existing code handles it:** `EntityExtractionService.findNodeIdByExternalId` (line 380–389) does `findFirst` → then either `update` or `create`. This is the find-then-create pattern, NOT upsert. It is NOT atomic — two concurrent promotion jobs for the same tenant/sender could create duplicate GraphNode rows (race condition).

**Planner MUST resolve one of three ways:**
- **(a)** Add `@@unique([tenantId, nodeType, externalId])` to `GraphNode` in the same Phase 150 migration (additive — Guard A passes). Risk: violates the multi-hop CTE's expectations if duplicates already exist in prod from the `EntityExtractionService` race window. **Requires a pre-migration duplicate-scan query.**
- **(b)** Use the find-then-create pattern inside a `$transaction` with a `SELECT ... FOR UPDATE` lock. Expensive per call; acceptable once a night.
- **(c)** Apply a Prisma `upsert` keyed by a different shape (e.g., a derived cuid). Changes D-04 externally.

**Recommended:** (a) with pre-migration dedup scan. Document the dedup query in the plan. Phase 155 can clean up any lingering duplicates from the extraction-service race window.

### 2. `LabelsService.delete` is SOFT-DELETE — `onDelete: Cascade` on GraphEdge NEVER FIRES

**Severity:** HIGH. D-04 "when deleted, `onDelete: Cascade` on GraphEdge drops the affinity edges automatically" **does not work.**

**Evidence:** `labels.service.ts:420–446`:

```typescript
async delete(tenantId: string, id: string) {
  const label = await this.findOne(tenantId, id);
  const deletedSlug = `${label.slug}-deleted-${Date.now()}`;
  await this.prisma.userLabel.update({   // <-- UPDATE, not delete
    where: { id },
    data: {
      isArchived: true,
      slug: deletedSlug,
    },
  });
  // Cascade soft-delete to all descendants
  await this.archiveDescendants(tenantId, id);
  // ... realtime emit + cache invalidate
}
```

Same pattern in `bulkDelete` (line 448) and `archiveDescendants` (line 754).

**Compounding problem:** Even if the code were hard-delete, the FK chain would NOT work as described. `GraphEdge` has `onDelete: Cascade` to `GraphNode`, NOT to `UserLabel`. `GraphNode`'s FKs are to `Tenant` only. The "label" node D-04 proposes is a mirror — there's no FK from `GraphNode` back to `UserLabel` (D-04a notes `externalId = Label.id` as a plain string, not a relation).

**Planner MUST:**
- Add explicit affinity-edge cleanup inside `LabelsService.delete` and `LabelsService.bulkDelete` (and `archiveDescendants`): walk `GraphNode WHERE nodeType='label' AND externalId=<labelId>`, delete those nodes → cascade fires to `GraphEdge` (since GraphEdge HAS `onDelete: Cascade` on GraphNode FKs).
- OR leave orphan affinity edges and let the Phase 149 `decay-gc` D-06 sweep eventually prune them (they'll have a dangling `targetId` to a deleted GraphNode — but the cascade from GraphNode delete would have already dropped them, so this case doesn't arise if the GraphNode is deleted).
- OR use `onDelete: SetNull` semantics via code, not schema.

**The cleanest path is:** on `LabelsService.delete` soft-delete, additionally `prisma.graphNode.deleteMany({ where: { tenantId, nodeType: 'label', externalId: id } })`. The cascade to GraphEdge then fires naturally.

Plan must include this explicit delete call AND test it (Failure Mode §2).

### 3. `EmailAnalysis.triageSource` string-value extension affects Phase 148 `LabelAccuracySourceBreakdown`

**Severity:** MEDIUM. Silent correctness bug.

**Evidence:** Two sites store triage source as comment-documented string enums:

- `schema.prisma:1370` — `EmailAnalysis.triageSource` comment: `'llm' | 'rule' | 'llm+rule'`
- `schema.prisma:2616` — `LabelAccuracySourceBreakdown.triageSource` comment: `'llm' | 'rule' | 'llm+rule'`

CONTEXT.md `<code_context>` line 184 proposes extending EmailAnalysis's union to `'rule' | 'graph_sender' | 'graph_domain' | 'llm'`. If the planner does this and writes `triageSource='graph_sender'` to EmailAnalysis, the Phase 148 accuracy rollup (`LabelAccuracySourceBreakdown`) will start generating new rows with `triageSource='graph_sender'` — Phase 148's D-13 counter labels (`triage_accuracy_corrections_total{triage_source ∈ {'llm','rule','llm+rule'}}`) will get a 4th/5th value.

**Impact:**
- Phase 148's D-13 Prometheus counter cardinality goes from 2×3×4=24 to 2×5×4=40 series — still bounded, not a cardinality bomb. OK on cardinality.
- Phase 148's frontend `LabelAccuracyBadge` tooltip may display `'graph_sender'` as a new breakdown label — i18n strings at `t.labels.accuracy.source.*` currently only cover `llm | rule | llmRule` (per Phase 148 D-12). **Adding new source values requires Phase 148-style i18n additions.**
- Phase 148's `LabelAccuracyService` aggregation code may have switch/case on `triageSource` — grep required.

**Planner MUST:**
- Either defer the triageSource extension entirely (keep 'llm' for graph-backed triage — loses provenance but zero Phase 148 impact).
- Or extend the set + add i18n + audit Phase 148's switch statements. Full-cycle change.

CONTEXT.md locks this under `<code_context>` "Integration Points" — so the planner should extend the set. But the planner MUST touch the Phase 148 translation files + rollup code; this is NOT a schema-only change.

### 4. `EntityGraphService` recursive CTE uses `e.weight`, not `e.confidence`

**Severity:** LOW for Phase 150 (single-hop lookup doesn't use CTE). HIGH if Phase 155 ever traverses affinity edges multi-hop.

**Evidence:** `entity-graph.service.ts:119` — `w.score * e.weight * power(0.7, w.hop + 1)`. Affinity edges default `GraphEdge.weight = 1.0`. Multi-hop traversal through affinity edges uses weight=1.0, NOT confidence.

**Not blocking Phase 150.** Flag only. Phase 155 dashboards should choose whether to factor confidence in CTE traversal — out of scope for Phase 150.

### 5. Phase 150 promotion-job runtime ordering with Phase 149 decay-gc at same cron

**Severity:** MEDIUM. Race condition risk.

**Evidence:** Both jobs scheduled at cron `'0 3 * * *'` per D-01 and Phase 149 D-08. Concurrent BullMQ execution is prevented by worker `concurrency: 1` (scheduler line 130) — so one must complete before the other runs. BUT the scheduler has TWO separate `queue.add` calls with different `jobId`s — they will execute sequentially, with ordering determined by BullMQ's enqueue order, not our intent.

**Impact:**
- If decay-gc runs FIRST: it sweeps affinity edges with `confidence < 0.3` — but those edges were just promoted 5 minutes ago! They have fresh `validFrom = now()` and the underlying `EmailTriageFeedback` rows are recent → weighted sum is well above 0.3 → no false pruning. SAFE.
- If affinity-promotion runs FIRST: it writes new edges. Decay-gc then runs its TriageOverride sweep (could delete a TriageOverride that the just-created affinity edge depends on via `derivedFromOverrideIds`). The edge's `metadata.derivedFromOverrideIds` now references a deleted TriageOverride. On the NEXT day's decay-gc, `recomputeOverrideConfidence` equivalent for affinity edges would find the override missing → recompute from raw feedback rows (which still exist) → same result. PROBABLY SAFE, depending on the planner's implementation of affinity-edge recompute.

**Planner MUST:**
- Document the intended run order (recommend: promotion FIRST, decay-gc SECOND in the same handler OR as two sequential queue entries).
- OR: combine the two into a single `'nightly-maintenance'` job that runs promotion→decay-gc in a fixed sequence.

Recommended: add `'affinity-promotion'` as a SEPARATE job type but document in scheduler comments that the worker's serial BullMQ dispatch provides ordering. Test via a fixture that seeds TriageOverride rows and verifies the nightly run creates the affinity edge before the decay-gc's TriageOverride sweep sees those same rows.

### 6. `TriageOverride` is used by Phase 149 decay-gc AND Phase 150 promotion — mutation race

**Severity:** LOW. Same job, sequential scheduler.

**Evidence:** Phase 149 `processDecayGcForTenant` deletes TriageOverride rows below 0.3. Phase 150 promotion-job READS TriageOverride rows. If decay-gc runs during promotion's tenant loop, an override could be deleted mid-read → stale data in the promotion's in-memory list.

Worker `concurrency: 1` prevents this (one job at a time). Still, the planner should wrap promotion's TriageOverride read in a single Prisma query, not an iterative loop with intermediate awaits. Standard pattern — no new risk.

### 7. Guard G (prod DB identifier scan) does NOT block migration content

**Severity:** INFORMATIONAL. Not blocking, just context.

Guard G scans diffs for `ballast.proxy.rlwy.net`, `rlwy.net`, `railway.app`. Migration SQL files are git-tracked and SHOULD not contain prod URLs. The Prisma migration workflow (CLAUDE.md) runs `prisma migrate dev` against LOCAL Postgres — no prod URL touches the migration file. Planner just confirms this at generate-time.

---

## Open Questions for Planner

### Q1: Does D-01 promotion inherit Phase 147 D-04's `MIN_DISTINCT_SENDERS_FOR_DOMAIN=3` gate?

CONTEXT.md D-01 says "Domain-level aggregation runs a second pass grouping by email domain with the same thresholds" — meaning `weighted-sum ≥ 0.8 AND feedback row count ≥ 3`. But Phase 147 D-04 adds **distinct-sender ≥ 3 AND zero role-account local-parts** for domain promotion. Should Phase 150 replicate Phase 147's domain gates exactly, or only the OpenClaw 3/0.8 subset?

**Planner MUST verify** in `triage-feedback.service.ts:51–59` (`MIN_CORRECTIONS_FOR_DOMAIN = 8`, `MIN_DISTINCT_SENDERS_FOR_DOMAIN = 3`, `ROLE_ACCOUNT_LOCAL_PARTS`) whether these constants are reused verbatim by the Phase 150 writer, or whether CONTEXT.md D-01's simpler "row count ≥ 3" replaces them. This affects whether `boss@acme.com` alone can produce a `acme.com` domain affinity edge (Phase 147 says NO — needs 3 distinct senders).

**Recommended resolution:** Import `MIN_DISTINCT_SENDERS_FOR_DOMAIN` and `ROLE_ACCOUNT_LOCAL_PARTS` from `triage-feedback.service.ts`, reuse verbatim. Avoids divergence from Phase 147's hard-learned anti-patterns (B2B sender/domain asymmetry).

### Q2: When Layer 1 (override) matches with a VISIBLE override, does Layer 2 (graph) still run?

CONTEXT.md D-03 says: "if layer 1 matches → apply and exit." But the existing `EmailTriageService.triageEmail` code treats visible overrides differently from muting overrides: muting short-circuits fully (line 345 returns), visible-override injects a `overrideHint` and PROCEEDS to the LLM call (line 362). The graph lookup is slotted BEFORE the LLM — so for visible overrides, the graph lookup WOULD still run between the hint-injection and LLM invocation.

**Planner MUST decide:**
- **Option A:** Graph lookup is skipped entirely when ANY override matched (muting or visible). Keeps D-03 wording literal. Means: visible overrides bypass graph affinity.
- **Option B:** Graph lookup runs when only visible override matched. Means: a 0.95-confidence graph edge could short-circuit past the visible-override hint, breaking user expectation ("my rule should apply").
- **Option C:** Graph lookup runs in hint-only mode (never short-circuits) when visible override matched. Both signals reach the LLM as separate hints.

**Recommended:** Option A (skip graph lookup entirely when any override matched). Cleanest user model — user's explicit rule wins over inferred patterns. Matches D-05's "most-specific-wins" spirit at a different level.

### Q3: Does `TriageGraphLookupService` go in `ai/services/` or `ai/graph/` subdir?

CONTEXT.md `<decisions>` → Claude's Discretion says "planner's call based on whether additional graph services are anticipated in Phase 151." Phase 151 (Dreaming Consolidation) is BullMQ-queue centric, not service-cluster centric. Phase 151 will likely extend the same scheduler. No obvious need for a `graph/` subdir.

**Recommended:** Keep flat (`ai/services/triage-graph-lookup.service.ts`). Revisit only if Phase 151 ships 3+ graph services.

### Q4: Does the promotion-job helper go in `triage-affinity-promotion.helpers.ts` or inline in the scheduler?

Phase 149 extracted `triage-decay-gc.helpers.ts` (270 LF) only because the scheduler was hitting 700 LF cap. Phase 150's promotion-job body is smaller (maybe 150 LF). **Recommended:** extract to a helper — it's the established Phase 149 pattern, and it keeps the scheduler at ~650 LF (still over CLAUDE.md's 500 soft cap but acceptable per Phase 149 VERIFICATION.md §Deviations).

### Q5: Does `ai.module.ts` need `TriageGraphLookupService` exported?

Only if consumed outside `AiModule`. Phase 150's only consumer is `EmailTriageService` (same module) and the promotion job (same module). **Recommended:** provider-only, not exported. Keeps the module interface minimal.

### Q6: Does `TriageBackfillSchedulerService` constructor need new `@Optional() TriageGraphLookupService` dep?

CONTEXT.md line 185 suggests the scheduler could inject `TriageGraphLookupService` to share upsert logic between the write path (promotion) and read path (lookup). **NO — they don't share logic.** The lookup service READS; the promotion helper WRITES. Different code paths. **Recommended:** scheduler DOES NOT inject lookup service. Promotion helper receives `prisma` via dep bag (following `DecayGcDeps`) and writes directly via `prisma.graphEdge.upsert`.

### Q7: Does the D-07 `would_skip_shadow` counter live in `TriageGraphLookupService` or in a decorator?

CONTEXT.md Claude's Discretion says "planner picks what fits NestJS conventions." **Recommended:** inline inside `TriageGraphLookupService.lookup`. Decorator adds indirection without measurable benefit, and the counter emission depends on `confidence >= 0.9` — a domain condition that belongs with the lookup logic.

### Q8: Promotion-job test fixture approach

CONTEXT.md Claude's Discretion: mock `prisma.triageOverride.findMany` vs seed script. Phase 147/148/149 all use **mock fixtures** (pattern at `triage-correction.service.spec.ts:1–80`). **Recommended:** mock-based unit tests. Integration seed script is deferred to Phase 156 (E2E benchmarking).

### Q9: Should the Phase 150 migration ALSO add `@@unique([tenantId, nodeType, externalId])` to GraphNode?

Per Landmine §1, this is blocked unless a pre-migration duplicate scan confirms no duplicates exist. The planner should generate a one-off SQL script to run manually against prod (read-only SELECT) BEFORE the migration:

```sql
SELECT "tenantId", "nodeType", "externalId", COUNT(*)
FROM graph_nodes
GROUP BY "tenantId", "nodeType", "externalId"
HAVING COUNT(*) > 1;
```

If zero rows — migration can add the unique index safely. If nonzero — planner needs a dedup step before the migration (and Phase 155 takeover).

**Recommended:** run the scan pre-migration. Add the unique constraint only if clean. Otherwise, fall back to Landmine §1 Option (b) (find-then-create in transaction).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL (local) | `prisma migrate dev` | ✓ (per CLAUDE.md DB Safety §1: `backend/.env` now points at `localhost:5432/pmsync_local`) | 15+ (project baseline) | — |
| Redis | BullMQ scheduler (existing) | ✓ (Phase 149 already requires) | 6+ | — |
| `@willsoto/nestjs-prometheus` | Metric providers | ✓ (Phase 148/149 dependency) | existing | — |
| BullMQ | `'affinity-promotion'` job | ✓ (Phase 149 dependency) | existing | — |
| `ioredis` | Scheduler DI | ✓ (existing) | existing | — |

No new external dependencies introduced. Phase 150 is pure code + schema change using the stack Phase 149 already proved out.

**Missing with fallback:** none.
**Missing blocking:** none.

---

## Project Constraints (from CLAUDE.md)

Extracted actionable directives the planner MUST honor:

| Directive | Source | Phase 150 Application |
|-----------|--------|----------------------|
| NEVER run `prisma db push` — only `npx prisma migrate dev --name <descriptive>` against LOCAL Postgres | CLAUDE.md DB Safety §3 | D-02 migration uses `npx prisma migrate dev --name add_graph_affinity_columns`. |
| Before ANY prisma command, print target host + stop if `rlwy.net` / `railway.app` | CLAUDE.md DB Safety §1-2 | Planner agent must run `node -e "require('dotenv').config(); console.log(new URL(process.env.DATABASE_URL).host)"` before any migration command. |
| Migration must pass Guard A (no DROP) | CLAUDE.md §Active guardrails | D-02 is nullable-column-only — no DROP. |
| Migration must pass Guard E (schema + migration committed together) | CLAUDE.md §Active guardrails | Stage `schema.prisma` + `prisma/migrations/<ts>_*/migration.sql` in same commit. |
| Multi-tenant invariant: every query MUST include `tenantId` | CLAUDE.md §Backend Procedure | Every new `prisma.graphEdge.*`, `prisma.graphNode.*`, `prisma.triageOverride.*` call in Phase 150 code includes `tenantId` in `where`. |
| Max 500 LF per file | CLAUDE.md §File Organization | `TriageGraphLookupService` target: <300 LF. `triage-affinity-promotion.helpers.ts` target: <300 LF. Scheduler stays ≤650 LF (Phase 149 precedent). |
| Never save working files / docs / tests to root | CLAUDE.md §File Organization | All new code under `backend/src/modules/ai/**` or `backend/src/modules/labels/**`. Scripts (if any) under `backend/scripts/`. |
| Post-edit validation mandatory: `cd backend && npx tsc --noEmit` | CLAUDE.md §Post-Edit Validation | After every code edit in every wave. |
| Follow existing patterns — never invent new approaches | CLAUDE.md §Behavioral Rules | Phase 149 pattern reused verbatim for scheduler extension + helper extraction. |
| NEVER `git push` unless explicitly requested | CLAUDE.md §Git push discipline | Planner/executor subagents MUST NOT push to origin without explicit user confirmation. |
| Handle Prisma P2002/P2034 with exponential backoff | CLAUDE.md §Backend Procedure | Promotion job's `prisma.graphEdge.upsert` may race against concurrent promotions (concurrency:1 prevents this, but defensive catch anyway). |
| Embeddings use indexed FK fields, NEVER JSONB metadata path queries | CLAUDE.md §Backend Procedure | D-01a stores `derivedFromOverrideIds` in `metadata.derivedFromOverrideIds`. No queries target this path (it's audit-only, read by the decay-gc D-06 recompute). Decay-gc's recompute reads the JSONB array — this is the ONE JSONB read. Acceptable because it's nightly, not hot path. |

---

## Evidence

For every claim above, the file + line number.

| Claim | Evidence |
|-------|----------|
| GraphEdge lives at schema.prisma:2293–2314 with exact shape | file read — matches CONTEXT.md verbatim |
| GraphNode lacks `@@unique([tenantId, nodeType, externalId])` | `schema.prisma:2286-2290` — only `@@index`, not `@@unique`. Grep for `tenantId_nodeType_externalId` returns zero hits. |
| `EmailTriageService.triageEmail` graph-lookup insertion point is lines 358–362 | file read — `applyOverrides` at line 284, muting short-circuit return at line 345, visible-override hint assignment at line 355, LLM call at line 362 |
| `TriageOverrideService.applyOverrides` return shape | `triage-override.service.ts:22–26` |
| `TriageBackfillSchedulerService.BackfillJobData['type']` includes `decay-gc` | `triage-backfill-scheduler.service.ts:16` |
| Scheduler has 3 `@Optional() @InjectMetric` slots already | `triage-backfill-scheduler.service.ts:55–60` |
| `triage-decay-gc.helpers.ts` pattern to mirror | file read — 270 LF pure-function helper with `DecayGcDeps` dep bag |
| `weightCorrection` helper signature | `triage-correction-weight.ts:38–51` |
| `TP_IMPLICIT_WINDOW_DAYS = 14` lives in same file | `triage-correction-weight.ts:74` |
| `EntityGraphService` recursive CTE uses `e.weight` | `entity-graph.service.ts:119` |
| `LabelsService.delete` is soft-delete | `labels.service.ts:420–446` (explicit `prisma.userLabel.update` with `isArchived: true`) |
| `LabelsService.bulkDelete` is soft-delete | `labels.service.ts:448–514` |
| `EmailAnalysis.triageSource` is `String?` with 3-value enum comment | `schema.prisma:1370` |
| `LabelAccuracySourceBreakdown.triageSource` is `String` with 3-value enum comment | `schema.prisma:2616` |
| Phase 147 domain-promotion gates | `triage-feedback.service.ts:51–59` (`MIN_CORRECTIONS_FOR_DOMAIN=8`, `MIN_DISTINCT_SENDERS_FOR_DOMAIN=3`, `ROLE_ACCOUNT_LOCAL_PARTS` set of 18 local-parts) |
| Phase 149 decay-gc test home | 149-VERIFICATION.md §Plan 05 cites `--testPathPatterns="triage-correction-weight\|triage-correction.service\|triage-learning-redis\|triage-feedback\|triage-promotion"` — the decay-gc helper tests live in `triage-learning-redis.spec.ts` via shared test mocks |
| MetricsModule Phase 149 pattern | `metrics.module.ts:109-127` + `:147-149` |
| `AiModule` provider + export pattern | `ai.module.ts:170, :219` |
| 22 migrations exist in `prisma/migrations/` | Glob — baseline (`0_baseline`) + `20260325105000_reconcile_baseline` defines graph_edges indexes |
| `graph_edges` has 5 existing indexes after the unique constraint | migration SQL `20260325105000_reconcile_baseline/migration.sql:935–950` |

---

## Assumptions Log

Every `[ASSUMED]` claim that the discuss-phase or executor must confirm before locking into plans.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The p95 <5ms target for `TriageGraphLookupService.lookup` is a production target, not a CI target | Validation Architecture §D-03a Latency Ceiling | If user demands CI enforcement, plan needs an integration-test Postgres + seed script (Wave 0 scope increase) |
| A2 | The `domain aggregation` in D-01 inherits Phase 147 D-04's `MIN_DISTINCT_SENDERS_FOR_DOMAIN=3` + role-account exclusion | Open Questions §Q1 | If wrong, Phase 150 ships a naive domain aggregation that regresses Phase 147's B2B anti-pattern protection (SaneBox / Gmail Priority Inbox failure mode) |
| A3 | When Layer 1 override matches (visible or muting), Layer 2 graph lookup is SKIPPED | Open Questions §Q2 | If wrong, visible overrides could be silently over-ridden by a 0.95 graph edge — breaks user's explicit-rule expectation |
| A4 | `EmailAnalysis.triageSource` extension to `'graph_sender' | 'graph_domain'` requires Phase 148 i18n + rollup-switch updates | Landmines §3 | If undone, `LabelAccuracyBadge` tooltip displays raw `graph_sender` string, and Phase 148 accuracy counters may under-report (depending on how the switch treats unknown values) |
| A5 | Affinity-promotion job runs BEFORE decay-gc at the 3 AM cron slot (via sequential BullMQ enqueue in same setupRepeatableJob call) | Landmines §5 | If reversed ordering, freshly promoted edges could theoretically get decay-scored on the same night. Low-risk because weighted-sum of recent corrections is well above 0.3 threshold. |
| A6 | `GraphNode` has no duplicate rows per `(tenantId, nodeType, externalId)` today in prod | Open Questions §Q9 | If duplicates exist (from `EntityExtractionService` race window), adding `@@unique` would fail migration. Must run pre-migration SELECT scan. |
| A7 | CI Postgres host does NOT match the Guard B prod-host regex (`ballast.proxy.rlwy.net`/`rlwy.net`/`railway.app`) | Project Constraints | If a CI env accidentally points at prod, Guard B blocks the migration test. Confirmed safe per `backend/.env` pointing at `localhost:5432/pmsync_local` as of 2026-04-24. |

---

## Summary

Phase 150 is a **pure extension** of the Phase 149 scheduler + helper + Prometheus pattern, adding:
- 3 nullable columns + 2 compound indexes on `graph_edges` (non-destructive migration — passes Guards A/E/F)
- 1 new read-path service (`TriageGraphLookupService`)
- 1 new BullMQ job type (`'affinity-promotion'`)
- 1 third store for Phase 149's decay-gc sweep (affinity edges)
- 3 new Prometheus metrics
- 1 new env var (`TRIAGE_GRAPH_CONFIDENCE_CUTOFF`, default 9999 = shadow mode)
- 1 label-mirror hook in `LabelsService.create/update/delete`

**Seven landmines identified.** The two critical ones are (1) `GraphNode` missing the unique constraint that D-04's upsert relies on, and (2) `LabelsService.delete` being soft-delete so `onDelete: Cascade` does NOT fire as D-04 promises. Both are resolvable with explicit planner decisions surfaced in Open Questions §Q9 and Landmines §2.

**Zero blockers.** The planner has all the information needed to produce a detailed plan. Guard suite (A/E/F/G) all pass with the recommended nullable-column-only migration approach.

---

## RESEARCH COMPLETE
