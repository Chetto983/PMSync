# Phase 150: Graph-Based Triage Memory - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the existing `GraphEdge` schema with `confidence` + temporal-validity columns, add two new edge types (`SENDER_LABEL_AFFINITY`, `DOMAIN_LABEL_AFFINITY`), slot a new `TriageGraphLookupService` into the triage hot path between deterministic overrides and the LLM call, and ship a minimal nightly BullMQ writer that promotes existing `TriageOverride` rows to affinity edges. Phase 151 will replace the writer body with the full OpenClaw-style Light/Deep/REM loop; this phase delivers the schema, the read-path integration, and a production-measurable writer stub.

**In scope:**
- Prisma migration: add nullable `confidence Float?`, `validFrom DateTime?`, `validUntil DateTime?` columns to `graph_edges`. Compound indexes `(tenantId, edgeType, confidence)` and `(tenantId, edgeType, validUntil)`. Backward-compatible for the 7 existing edge types.
- New `GraphNode.nodeType` values: `'sender'`, `'email_domain'`, `'label'`. No schema change (nodeType is already a free-form string).
- New service `TriageGraphLookupService` in `backend/src/modules/ai/services/` — single indexed edge lookup per triage call, returns `{ predictedLabel, confidence, source: 'sender' | 'domain' }` or null.
- Integration in `EmailTriageService.triageEmail`: call graph lookup AFTER `TriageOverrideService.applyOverrides` returned no match, BEFORE the LLM. On confidence ≥ `TRIAGE_GRAPH_CONFIDENCE_CUTOFF`: short-circuit and emit classification. On 0.7 ≤ confidence < cutoff: inject as hint into LLM prompt.
- New BullMQ job type `'affinity-promotion'` registered on `TriageBackfillSchedulerService`, cron `0 3 * * *` (same nightly slot as `decay-gc`). Job handler reads `TriageOverride` rows crossing OpenClaw 3/0.8 gates (≥3 reinforcing `EmailTriageFeedback` rows, `weightCorrection`-decayed sum ≥ 0.8), upserts affinity edges with provenance.
- Phase 149's existing `decay-gc` job gains a third store: affinity edges whose recomputed decayed confidence < 0.3 are hard-deleted (per Phase 149 D-05 pattern). `triage_patterns_gc_total` gets a new label value `store='graph_edge'`.
- Three new Prometheus metrics (read-path observability for SC-4 measurement): `triage_graph_lookup_total{outcome, edge_source, tenant_id}`, `triage_graph_promotion_total{tenant_id}`, `triage_graph_edges_active{tenant_id, edge_type}` (gauge).
- New env var `TRIAGE_GRAPH_CONFIDENCE_CUTOFF` (default `9999` = skip effectively disabled; flip to `0.9` to activate). Shadow counter always emits `would_skip_shadow` when edge confidence ≥ 0.9, regardless of cutoff — gives SC-4 measurability without behavior change.

**Out of scope (deferred to later v13.0 phases):**
- Light/REM phases of the dreaming loop (Phase 151). This phase ships only the Deep-equivalent stub.
- Contradiction gates, auto-rollback, minimum-corrections hard enforcement (Phase 152 SAFE-01/02/03).
- Semantic overlap detection, mutuallyExclusiveWith enforcement between labels (Phase 153).
- Batch reclassification on aiPrompt change (Phase 154 RLM pattern).
- Observability dashboard panels for graph health (Phase 155).
- E2E benchmark of 20% reduction (Phase 156 formally validates; this phase instruments the counters).
- Merging `sender` GraphNodes into `Contact` GraphNodes by email match (Phase 151 batch job, forward-compatible).
- Supersession-by-invalidation (`invalidatedAt` bitemporal column, Graphiti-full pattern) — deferred unless SAFE-03 surfaces the need.
- Per-tenant percentage rollout (`TRIAGE_GRAPH_SKIP_TENANT_PERCENT`) — explicitly rejected for solo-dev scope; single env-var cutoff is the kill switch.
- Weighted-sum precedence or max-confidence combination rules — explicitly rejected (D-05).
- Weights in existing `GraphEdge.weight` field repurposed for confidence — explicitly NOT done; new `confidence` column is the semantic home.

</domain>

<decisions>
## Implementation Decisions

### Write Path (how edges get created in Phase 150)

- **D-01: Minimal Deep stub — nightly BullMQ `affinity-promotion` job.** Register a new `'affinity-promotion'` job type on `TriageBackfillSchedulerService` with cron `0 3 * * *` (same nightly slot as Phase 149's `decay-gc`; D-07 below defines ordering). Handler reads `TriageOverride` rows per tenant, joins to `EmailTriageFeedback`, computes `sum(count * weightCorrection(ageDays, { halfLifeDays }))` per (senderEmail, targetLabelId) pair — the Phase 147 D-09b math already in the helper. When weighted-sum ≥ 0.8 AND underlying feedback row count ≥ 3, upsert a `SENDER_LABEL_AFFINITY` edge. Domain-level aggregation runs a second pass grouping by email domain with the same thresholds. Phase 151 will replace the handler body with the full Light/Deep/REM loop but keep the same queue name and job id. **Why:** Matches GAM (arXiv:2604.12285) "decouple encoding from consolidation" — edges are written by an explicit batch phase, never inline. Matches OpenClaw Dreaming production-default promotion gates (minRecallCount ≥ 3, minScore ≥ 0.8). Makes SC-4 measurable in 150 (not only after 151 ships). Reuses Phase 149's scheduler extension pattern verbatim. Rejected alternative: reusing Phase 147's promotion pipeline couples two stores with different eviction semantics (override = hard-delete on decay, edge = temporal window). Rejected alternative: schema + read-path only with no writer defers SC-4 measurement until Phase 151 lands, making 150 a no-behavior-change phase.

- **D-01a: Edges carry Zettelkasten-style citation provenance in `metadata`.** Each edge stores `metadata.derivedFromOverrideIds: string[]` (the `TriageOverride.id` rows that contributed weight) and `metadata.promotionAudit: { jobId: string, jobTimestamp: ISO8601, computedConfidence: number, feedbackRowCount: number, halfLifeDays: number }`. No new columns. **Why:** Karpathy's "LLM Wiki" gist thread surfaced the Zettelkasten critique — immutable atomic sources (here: `EmailTriageFeedback` rows and their `TriageOverride` promotions) cited by synthesis layers (here: affinity edges), never rewritten. Without provenance, promoted edges become "permanent hallucinations" — Phase 152 SAFE-03 audit trail becomes unbuildable retroactively. Storing in `metadata` avoids a second schema touch this phase; Phase 152 can migrate the audit fields to a dedicated `TriageConsolidationAudit` table if it judges the JSONB to be too loose.

### Schema

- **D-02: Three nullable columns added to `graph_edges`.** Prisma migration adds `confidence Float?`, `validFrom DateTime?`, `validUntil DateTime?`. All 7 existing edge types keep NULL values (non-destructive migration — passes Guard A / Guard E / Guard F). Compound indexes: `@@index([tenantId, edgeType, confidence])` for the hot-path `confidence >= cutoff` range query, and `@@index([tenantId, edgeType, validUntil])` for the "active edges" filter. The existing `@@unique([tenantId, sourceId, targetId, edgeType])` already covers per-pair uniqueness — no new unique constraint needed. **Why:** Graphiti/Zep pattern (arXiv:2501.13956) uses column-native confidence + validity fields so the retrieval layer can index-scan; JSONB metadata path queries are explicitly banned by `CLAUDE.md`. New columns are nullable → no backfill required → Guard A passes without a `-- ALLOW-DESTRUCTIVE` override. Rejected alternative: separate `TriageAffinityEdge` model splits the graph namespace, breaks `EntityGraphService`'s recursive-CTE multi-hop traversal for affinity edges, and forces downstream agents to learn two adjacency models. Rejected alternative: full Zep bitemporal (`invalidatedAt DateTime?` column) over-engineers the audit trail before Phase 152 has demanded it.

### Read Path

- **D-03: Three-layer stack in `EmailTriageService.triageEmail`.** Execution order: (1) `TriageOverrideService.applyOverrides` — deterministic user rules, returns `{ matched: true, label, source: 'rule' }` or null; (2) NEW `TriageGraphLookupService.lookup(tenantId, senderEmail)` — probabilistic graph affinity, returns `{ predictedLabel, confidence, source: 'sender' | 'domain' }` or null; (3) LLM call with optional hint injection. Short-circuit rules: if layer 1 matches → apply and exit. If layer 2 returns `confidence >= TRIAGE_GRAPH_CONFIDENCE_CUTOFF` → apply and exit (emit `triage_graph_lookup_total{outcome='skipped'}`). If layer 2 returns `0.7 <= confidence < cutoff` → pass `predictedLabel + confidence` into the LLM system prompt as a hint (emit `outcome='hinted'`) and run the LLM. Otherwise LLM runs unchanged (emit `outcome='missed'`). **Why:** Matches Stalwart Labs layered classifier pattern (rules + ML agreeing → high confidence; disagreement → flag). Matches vLLM HaluGate Dec 2025 result: pre-classification gating yields 72.2% efficiency on suitable queries. Keeps `TriageOverrideService` single-purpose (boolean rules) and introduces `TriageGraphLookupService` as the new single-purpose probabilistic layer. Rejected alternative: folding graph into `TriageOverrideService` forces the override service to return confidence and hint-vs-skip distinction, breaking its clean boolean-rule semantics. Rejected alternative: graph-wins-first violates principle of least surprise — user-defined rules must beat inferred patterns.

- **D-03a: `TriageGraphLookupService` query shape.** Single indexed Postgres query per triage call:
  ```sql
  SELECT e.edgeType, e.confidence, tgt.externalId AS labelId
  FROM graph_edges e
  JOIN graph_nodes src ON src.id = e.sourceId
  JOIN graph_nodes tgt ON tgt.id = e.targetId
  WHERE e.tenantId = $1
    AND e.edgeType IN ('SENDER_LABEL_AFFINITY', 'DOMAIN_LABEL_AFFINITY')
    AND e.confidence >= 0.7
    AND (e.validUntil IS NULL OR e.validUntil > now())
    AND (
      (src.nodeType = 'sender' AND src.externalId = $2)
      OR (src.nodeType = 'email_domain' AND src.externalId = $3)
    )
  ORDER BY (CASE WHEN src.nodeType = 'sender' THEN 0 ELSE 1 END), e.confidence DESC
  LIMIT 1;
  ```
  The `ORDER BY sender-first` clause enforces D-05 precedence at the query layer — no code-side comparison required. Planner should verify p95 latency < 5ms with the compound index on a realistic tenant (274 emails, 540 contacts, 810 graph edges per the 2026-04-20 wipe recovery state).

### Node Identity

- **D-04: Three new `nodeType` values on existing `GraphNode`, auto-upsert on edge write.** `nodeType = 'sender'` (label = normalized lowercase email, externalId = same email); `nodeType = 'email_domain'` (label = domain, externalId = domain); `nodeType = 'label'` (label = Label.name, externalId = Label.id). The affinity-promotion job upserts source/target nodes with `ON CONFLICT (tenantId, nodeType, externalId) DO NOTHING` before writing the edge. Label nodes additionally sync via a lightweight hook in `LabelsService.create` / `update` / `delete` — when a Label is renamed, the mirror GraphNode's `label` field updates; when deleted, `onDelete: Cascade` on GraphEdge drops the affinity edges automatically. **Why:** Preserves `GraphEdge.sourceId/targetId → GraphNode.id` FK integrity (Prisma requires it; making `targetId` FK-less would cascade invasive changes). Sender identity = normalized email string has stable identity without requiring the entity-resolution layer the project doesn't fully have. Forward-compatible: a Phase 151+ batch can merge `'sender'` nodes into existing `'contact'` nodes (from Phase 109 RAG graph) when email matches, without a schema break. Rejected alternative: reusing Contact nodes for senders creates two code paths (contact vs non-contact sender) for the same concept and adds an email-to-contact lookup to the hot write path. Rejected alternative: dummy anchor node + metadata-only identity makes the graph untraversable, defeating the point of using `GraphEdge`.

- **D-04a: Sender email normalization is `email.trim().toLowerCase()`.** No Gmail `+` stripping (different addresses are different senders semantically — `user+work@gmail.com` vs `user+personal@gmail.com` correctly get different affinity profiles). No subdomain collapsing for domain nodes — `mail.acme.com` and `acme.com` are distinct domain nodes. **Why:** The project explicitly values semantic separation (per v13 research basis). If empirically problematic, Phase 155 dashboard will surface it; revisit then.

### Precedence (when sender and domain edges both exist)

- **D-05: Sender edge always beats domain edge, baked into the SQL query.** If a `SENDER_LABEL_AFFINITY` edge with confidence ≥ 0.7 exists for this tenant+sender, the `ORDER BY sender-first` clause in D-03a returns it. The domain edge is only returned when no qualifying sender edge exists. No code-level comparison, no magic combination math. **Why:** "This specific person's past corrections" is strictly stronger evidence than "anyone from this domain's past corrections." Matches principle of least surprise. Predictable, debuggable, requires zero additional tests beyond the SQL ORDER BY semantics. Rejected alternatives: max-confidence-wins (a 0.95 domain edge overriding explicit 0.75 sender corrections is surprising); weighted sum (hides which signal drove the decision, worse for audit); both-must-agree (massively reduces SC-4 hit rate for new senders).

### Temporal Validity

- **D-06: `validFrom` = job runtime, `validUntil` = null by default, hard-delete via Phase 149 decay-gc.** The promotion job sets `validFrom = new Date()` on edge creation/upsert (matches the BullMQ job execution timestamp). `validUntil` stays NULL on creation — means "currently valid." Phase 149's `decay-gc` job gains a third store: after processing Redis sender-scores and TriageOverride rows, it walks `GraphEdge WHERE edgeType IN ('SENDER_LABEL_AFFINITY', 'DOMAIN_LABEL_AFFINITY')`, recomputes the weighted-sum using the same `weightCorrection(ageDays, { halfLifeDays })` math against the edge's `metadata.derivedFromOverrideIds`, and hard-deletes edges whose recomputed confidence < 0.3. The `triage_patterns_gc_total` counter gets a third label value: `store='graph_edge'`. `validUntil` is reserved for Phase 151 semantic-contradiction supersession (SAFE-03 will set `validUntil = now()` instead of hard-deleting when two edges contradict). **Why:** Consistent with Phase 149 D-05 hard-delete pattern and D-09 "recomputed at GC time" semantics. No new schema for audit; the decay-gc counter already functions as the audit trail. Fixed 90-day TTL rejected: decouples temporal validity from underlying evidence strength (a 0.95 edge with strong ongoing reinforcement would still expire wastefully). Full Zep bitemporal (soft-supersede instead of delete) rejected: contradicts Phase 149 D-05 hard-delete; table grows unbounded; audit need not yet justified.

### Rollout & SC-4 Measurement

- **D-07: Single env var `TRIAGE_GRAPH_CONFIDENCE_CUTOFF` (default `9999`). Shadow counter always on.** Read path always emits `triage_graph_lookup_total{outcome='would_skip_shadow'}` when edge confidence ≥ 0.9, regardless of the configured cutoff. Actual skip behavior fires only when `confidence >= cutoff`. First-deploy default is `9999` (no edge reaches it → skip effectively disabled). Rollout sequence: (1) deploy at 9999 → writer runs nightly, edges populate → shadow counter climbs; (2) after 14 days, if `rate(triage_graph_lookup_total{outcome='would_skip_shadow'}) / rate(triage_email_total)` ≥ 0.20, flip cutoff to `0.9` and redeploy; (3) monitor `triage_graph_lookup_total{outcome='skipped'}` and per-label accuracy (Phase 148 endpoint) for regressions; (4) Phase 156 formally benchmarks. Kill switch: `TRIAGE_GRAPH_CONFIDENCE_CUTOFF=9999` reverts to LLM-only in one Railway redeploy. **Why:** Matches Phase 149 D-12 "flags for safety, not features" — no new boolean flag to clean up later. Matches Phase 149 D-14 natural-rollout philosophy but ADDS the shadow counter because, unlike 149's TTL-bounded decay, we have no existing bound protecting us if the writer over-promotes. Single env var is reversible, testable, and avoids the Phase 149 D-12 rejection of dedicated-flag tech debt. Rejected alternatives: `TRIAGE_GRAPH_MODE=off|shadow|active` has three branches for the same data; percentage rollout is over-engineered for solo-dev; zero-shadow skip-from-day-one is unacceptable because the Phase 147/148 TriageOverride corpus has never been used to derive graph edges — quality is unproven at first deploy.

- **D-07a: Three Prometheus metrics ship this phase.** All under `triage_graph_` prefix, snake_case, Prometheus canonical suffixes:
  - `triage_graph_lookup_total` — counter. Labels: `outcome ∈ {skipped, hinted, missed, would_skip_shadow}`, `edge_source ∈ {sender, domain, none}`, `tenant_id`. Emits once per triage call that reaches the graph layer (i.e. after TriageOverride miss).
  - `triage_graph_promotion_total` — counter. Labels: `tenant_id`, `edge_type ∈ {SENDER_LABEL_AFFINITY, DOMAIN_LABEL_AFFINITY}`, `action ∈ {created, updated}`. Emitted by the nightly promotion job per upsert.
  - `triage_graph_edges_active` — gauge. Labels: `tenant_id`, `edge_type`. Sampled at end of each nightly promotion run as `COUNT(*) WHERE edgeType=? AND (validUntil IS NULL OR validUntil > now())`.
  **Deferred:** per-sender confidence histogram (cardinality risk, Phase 155 dashboard home).

### Claude's Discretion

- Exact Prisma migration filename timestamp (planner generates via `npx prisma migrate dev --name add_graph_affinity_columns` against local dev DB).
- Whether `TriageGraphLookupService` lives in `ai/services/` alongside `TriageOverrideService` or in a new `ai/graph/` subdirectory — planner's call based on whether additional graph services are anticipated in Phase 151 (if yes, make a subdir; if the rest of Phase 151 is queue-only, keep flat).
- Whether the promotion job extracts its SQL into a helper (e.g., `triage-affinity-promotion.helpers.ts` mirroring Phase 149's `triage-decay-gc.helpers.ts`) or inlines it — follow the pattern if the same query shape repeats, otherwise inline.
- Whether the `would_skip_shadow` emission happens inside `TriageGraphLookupService` or as a decorator/interceptor around it — same observable behavior, planner picks what fits NestJS conventions in the project.
- Whether to seed a minimum 24-hour first-deploy warmup period (write edges once, measure 24h, then allow cutoff flip) or allow same-day flip — pragmatic planner call informed by how often the user wants to iterate.
- Exact test fixture approach for the promotion job: mock `prisma.triageOverride.findMany` with hand-crafted data vs. use the existing test-feedback-seed script — follow established Phase 147/148/149 test pattern.

### Folded Todos

None — no pending todos matched Phase 150 scope in `.planning/todos/`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level contracts (mandatory)
- `.planning/ROADMAP.md` §Phase 150 (line 352) — 4 locked success criteria.
- `.planning/milestones/v13.0-ROADMAP.md` §Phase 150 (lines 59-69) — requirements GRAPH-01 / GRAPH-02 / GRAPH-03 mapping, dependency on Phase 148 + 149.
- `.planning/REQUIREMENTS.md` §GRAPH — GRAPH-01 / 02 / 03 requirement text.
- `CLAUDE.md` — DB Safety hard rules (nullable columns + `prisma migrate dev` + Guard suite). Zero `prisma db push`.

### Prior phase contracts (mandatory)
- `.planning/phases/147-feedback-loop/147-CONTEXT.md` — D-09b (frequency × recency_decay with 14d half-life), D-12 (weightCorrection helper extraction). The weighted-sum formula used by D-01 above is this one.
- `.planning/phases/148-label-accuracy/148-CONTEXT.md` — D-01 (14-day primitive is load-bearing; `weightCorrection` helper is the single source of truth; DO NOT hardcode 14). The `confidence` column in D-02 stores the helper's output; the D-01 writer invokes the helper via `ConfigService.get('TRIAGE_DECAY_HALF_LIFE_DAYS', '14')`.
- `.planning/phases/149-temporal-decay/149-CONTEXT.md` — D-05 (hard-delete + Prometheus counter pattern, which D-06 extends). D-07/D-08/D-09 (scheduler extension pattern, which D-01 reuses verbatim). D-12 (env var kill-switch philosophy, applied in D-07).
- `.planning/phases/149.1-email-triage-incoherence-audit/149.1-IMPROVEMENT-SPEC.md` — Stream A/B findings. The graph read layer (D-03) MUST NOT regress passive-notification suppression; TriageOverrideService still runs first. The graph hint injection in D-03 goes through the same `UnifiedEmailAnalysis` signal flow.

### In-scope source files (mandatory reading for planner)
- `backend/prisma/schema.prisma` §GraphEdge (line 2293), §GraphNode (line 2270) — the migration target.
- `backend/src/modules/ai-chat/services/entity-graph.service.ts` — reference implementation for graph queries. Planner should confirm the recursive CTE doesn't need changes; affinity lookup is a single-hop query, but multi-hop traversal from affinity edges should still work.
- `backend/src/modules/ai/services/email-triage.service.ts` — `triageEmail()` function, line 265+. Integration point for D-03 (between `applyOverrides` at line 284 and the LLM call).
- `backend/src/modules/ai/services/triage-override.service.ts` — reference for how layer 1 returns. Layer 2 (this phase) mirrors the null-or-match return shape.
- `backend/src/modules/ai/services/triage-correction.service.ts` — references `weightCorrection` with config-injected half-life. D-01's SQL-side aggregation invokes the same helper.
- `backend/src/modules/ai/services/triage-feedback.service.ts` — the promotion job reads this service's output shape; do not bypass.
- `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts` — extension point for D-01's new `'affinity-promotion'` job type and D-06's third decay-gc store. `setupRepeatableJob` pattern, `findActiveTenants` pagination.
- `backend/src/modules/ai/utils/triage-correction-weight.ts` — the single-source-of-truth decay helper. DO NOT reimplement.
- `backend/src/modules/ai/services/triage-decay-gc.helpers.ts` — Phase 149 helper pattern. Mirror this shape for `triage-affinity-promotion.helpers.ts` if extracted.
- `backend/src/modules/labels/` — find the Labels service hook points for D-04's label-node mirror sync on create/update/delete.

### Reference implementations (do NOT modify — pattern sources only)
- `backend/src/modules/ai-chat/services/reranking.service.ts` — exponential-decay formula pattern.
- `backend/src/modules/email-sync/services/orphan-embedding-cleanup.service.ts` — hard-delete + Prometheus counter pattern.

### External research (inform, do not recite)
- **Graphiti / Zep (arXiv:2501.13956)** — temporal KG edge schema with `validFrom` / `validUntil`. https://arxiv.org/abs/2501.13956. Applied to D-02.
- **GAM: Hierarchical Graph-based Agentic Memory (arXiv:2604.12285)** — decouples encoding from consolidation; writer is event-triggered, not inline. https://arxiv.org/abs/2604.12285. Applied to D-01.
- **Trainable Graph Memory (arXiv:2511.07800)** — experience graph → strategy graph promotion pattern. Informs D-01a provenance approach.
- **OpenClaw Dreaming (April 2026 production-default)** — 3-phase consolidation (Light/REM/Deep). Promotion gates: `minScore 0.8, minRecallCount 3, minUniqueQueries 3`. https://dev.to/czmilo/openclaw-dreaming-guide-2026-background-memory-consolidation-for-ai-agents-585e. Applied to D-01 thresholds.
- **vLLM HaluGate (Dec 2025)** — pre-classification gating yields 72.2% efficiency gain when the prior classifier is confident. https://blog.vllm.ai/2025/12/14/halugate.html. Applied to D-03.
- **Stalwart Labs LLM Classifier** — layered rules + ML classifier with confidence gating. https://stalw.art/docs/spamfilter/llm/. Applied to D-03 three-layer stack.
- **Karpathy "LLM Wiki" gist + Zettelkasten critique** — immutable atoms cited by synthesis pages, not rewritten. https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f. Applied to D-01a provenance.
- **Nebula KG reference** (surfaced via Karpathy thread) — confidence scores + temporal decay at 46,630 nodes / 386k+ edges. Density baseline 0.17. Informs scaling expectations for Phase 155 dashboard thresholds.
- **Prometheus naming guide** — `_total` counter suffix, `_timestamp_seconds` gauge unit. https://prometheus.io/docs/practices/naming/. Applied to D-07a.

### Adjacent code (explicitly out of scope)
- `backend/src/modules/contacts/services/relationship-score.service.ts` — independent decay concern. Do not touch.
- `backend/src/modules/ai-chat/services/memory.service.ts` — ai-chat memory, different domain. Do not touch.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`TriageBackfillSchedulerService.setupRepeatableJob`** — already handles the BullMQ `jobId` + `repeat.pattern` multi-instance dedup pattern. D-01's `'affinity-promotion'` job slots in verbatim.
- **`TriageBackfillSchedulerService.findActiveTenants`** — all-tenants iteration with `isActive: true, deletedAt: null, take: 50`. D-01 reuses.
- **`weightCorrection(ageDays, { halfLifeDays })`** — the helper already parameterized in Phase 149. D-01's SQL-side aggregation calls this on the app side (loops over feedback rows per pair). If performance requires SQL-native decay (`exp(-ln2 / halfLifeDays * EXTRACT(EPOCH FROM (now() - createdAt))/86400)`), planner can inline; formula is equivalent.
- **`EntityGraphService` recursive CTE** — continues to work for affinity edges without changes. Multi-hop traversal (e.g., "label X's top 10 senders") is a Phase 155 dashboard concern.
- **`TriageOverrideService.applyOverrides`** — returns `OverrideResult | null`. Layer 2 (this phase) mirrors this return shape for uniformity: `GraphLookupResult | null`.
- **`orphan-embedding-cleanup.service.ts`** — hard-delete + Prometheus counter pattern for D-06's third decay-gc store.
- **`GraphNode.nodeType` is a free-form string** — no Prisma enum migration needed for D-04's three new values.

### Established Patterns
- **Pure util + DI service split:** math utils stay DI-free, services inject `ConfigService` and pass `halfLifeDays` into utils. D-01's aggregation follows.
- **Redis key prefix:** `triage:*:{tenantId}` namespace. This phase touches Postgres only; no new Redis keys.
- **BullMQ multi-instance safety:** named repeatable jobs with `jobId` dedup + `concurrency: 1` on the worker. Reused for `affinity-promotion`.
- **Tenant scoping bypass:** `withoutTenantScopingAsync` wrapper for cross-tenant iteration inside scheduler handlers. D-01's sweep inherits.
- **Config pattern:** env vars via `ConfigService.get<string>('FOO', 'default')` + `parseFloat(..., 10)`. `TRIAGE_GRAPH_CONFIDENCE_CUTOFF` follows.
- **Metric naming:** module prefix + snake_case + `_total` for counters, `_seconds` for durations. `triage_graph_*` fits existing `triage_*` module scope.
- **Prisma migration workflow (CLAUDE.md + Guards A/E/F):** `npx prisma migrate dev --name add_graph_affinity_columns` against LOCAL Postgres, review SQL, commit schema + migration together. Railway `migrate deploy` applies on deploy.

### Integration Points
- **`ai.module.ts`** — register `TriageGraphLookupService` as provider, export if needed. Add `TriageBackfillSchedulerService` dependency on `PrismaService` if not already there for D-06 affinity-edge delete.
- **`EmailTriageService.triageEmail`** — insert graph lookup call between line 284 (`TriageOverrideService.applyOverrides`) and the LLM invocation. Keep the existing `triageSource` field on `EmailAnalysis` and extend its union to `'rule' | 'graph_sender' | 'graph_domain' | 'llm'` so D-11-style per-source metrics and future audit queries work.
- **`TriageBackfillSchedulerService` constructor** — already `@Optional()`-wired to multiple services. Add `TriageGraphLookupService` dependency if the affinity-promotion handler wants to share upsert logic with the live-read path (optional; planner decides).
- **`LabelsService.create` / `update` / `delete`** — add D-04 label-node mirror hook. Lightweight: `this.prisma.graphNode.upsert({ where: { tenantId_nodeType_externalId: ... }, ... })`. The unique constraint on `(tenantId, nodeType, externalId)` does not currently exist on GraphNode — verify if needed, or rely on `find-or-create` within a transaction.
- **Entrypoint boot check (Guard F)** — `prisma migrate diff --exit-code` will flag if the new columns aren't present on prod; deploy rolls back automatically.
- **Prometheus service** — wherever existing triage counters are registered (check Phase 148 D-04 wiring). Register three new metric providers.

### Known gotchas
- **`graph_nodes` lacks a `(tenantId, nodeType, externalId)` unique index.** Verify before D-04 upsert logic. If missing, add in the same Prisma migration (additive index, Guard A passes).
- **`graph_edges` `@@unique([tenantId, sourceId, targetId, edgeType])`** already exists — the affinity-promotion upsert must target this composite key.
- **Domain extraction must use the normalized lowercase email** before splitting on `@`. Non-normalized senders would create duplicate sender+domain nodes.
- **Phase 149 decay-gc ordering (D-09):** GC runs FIRST, then recalculation, per tenant. D-06 extends this: affinity edge GC happens as a third step AFTER the recalculation, inside the same job handler, per tenant. The order matters — recalculated override weights drive affinity-edge confidence recomputation.

</code_context>

<specifics>
## Specific Ideas

- User requested "deep search online best 2026 practice and new memory consolidation" before answering questions. Web research ran in parallel across 5 queries (see `<canonical_refs>`); OpenClaw Dreaming, GAM, Graphiti/Zep, Karpathy LLM Wiki gist, vLLM HaluGate synthesized into the decisions.
- User supplied the Karpathy "LLM Wiki" gist mid-discussion. Most load-bearing takeaways: Zettelkasten-style citation provenance (D-01a), three-layer architecture validation (D-03), "Oblio Selettivo" decay pattern already aligned with Phase 149 (D-06).
- OpenClaw Dreaming's `minScore 0.8, minRecallCount 3` gates map 1:1 onto PMSync's existing Phase 147 TriageOverride promotion thresholds (confidence ≥ 0.8, feedback rows ≥ 3). D-01 uses these verbatim — no novel threshold calibration this phase.
- User took the Recommended option on every question, consistent with the Phase 149 pattern. Planner should NOT assume ambiguity where a quick accept happened; each recommendation was research-backed and the user validated it.
- Two secondary decisions were surfaced via follow-up (D-03a SQL shape, D-04a email normalization). Both are locked — planner should not re-derive.
- SC-3 ("created only by consolidation loop, not inline during triage") has been honored: the only writer is the nightly BullMQ job. The read path strictly reads, never writes.
- SC-4 measurement is explicit: `rate(triage_graph_lookup_total{outcome='would_skip_shadow'}) / rate(triage_email_total) >= 0.20` after 30-day warmup → flip cutoff → measure actual `outcome='skipped'` rate. Phase 156 formally benchmarks.

</specifics>

<deferred>
## Deferred Ideas

- **Merge `sender` nodes into `Contact` nodes by email match** — forward-compatible batch job for Phase 151 or a later hygiene pass. The Phase 109 RAG graph uses `'contact'` node type; a deduplication job can rewrite `GraphEdge.sourceId` from a `'sender'` node to the matching `'contact'` node and delete the orphan, preserving affinity edges.
- **Bitemporal `invalidatedAt` column on `graph_edges`** — Graphiti-full audit pattern. Not needed until Phase 152 SAFE-03 formally demands immutable supersession history.
- **Dedicated `TriageConsolidationAudit` table** — Phase 152 concern. D-01a's `metadata.promotionAudit` is the shim until then; Phase 152 can migrate the JSONB audit records into a relational audit table.
- **Per-sender confidence histogram** — Phase 155 dashboard home. Cardinality risk prevents shipping it as a Prometheus label in this phase.
- **Per-tenant percentage rollout flag** — explicitly rejected in D-07. If solo-dev growth demands gradual rollout later, add then.
- **Weighted-sum or max-confidence precedence** — explicitly rejected in D-05. Revisit only if empirical data from Phase 155 shows sender-always-wins produces worse outcomes than combination rules.
- **Gmail `+`-alias stripping and subdomain collapsing** — explicitly rejected in D-04a. Revisit only if Phase 155 surfaces real harm.
- **Fixed 90-day `validUntil` TTL** — explicitly rejected in D-06 (decouples validity from evidence). Revisit only if Phase 149 decay-gc proves unable to keep pace with stale-edge growth.
- **Weighted sum precedence with source-penalty factor** — explicitly rejected in D-05. Revisit if per-label accuracy drops under sender-always-wins.
- **Label semantic-overlap detection on mirror sync** — Phase 153 concern. D-04's LabelsService hook deliberately does not enforce mutual exclusivity; that's SAFE-03 territory.
- **GraphRAG-style multi-hop traversal on affinity edges** — technically works today via `EntityGraphService` recursive CTE but not wired as a feature. Phase 155 may surface "labels frequently co-occurring with this sender's domain" as a dashboard card.
- **Cross-tenant pattern aggregation** — globally-observed patterns (e.g., `calendar-invite@google.com → 'meetings'` across all tenants) could seed per-tenant edges on Day 1. Privacy-sensitive; out of scope for v13.
- **Unifying `sender` and `contact` identity at the GraphNode level via a shared `nodeType='identity'`** — over-abstraction for v13; revisit if Phase 151+ adds 3+ identity-like node types.

</deferred>

---

*Phase: 150-graph-triage-memory*
*Context gathered: 2026-04-24*
