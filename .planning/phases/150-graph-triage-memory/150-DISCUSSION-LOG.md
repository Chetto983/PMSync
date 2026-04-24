# Phase 150: Graph-Based Triage Memory - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `150-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-24
**Phase:** 150-graph-triage-memory
**Areas discussed:** Write path, Schema shape, Read path integration, Node identity, Sender vs domain precedence, Temporal validity semantics, Rollout + SC-4 measurement

---

## Preamble — user-requested research

User asked for "deep search online best 2026 practice and new memory consolidation" alongside the initial area selection. Five parallel `WebSearch` queries were run before any question was presented:

1. `graph memory LLM agent write path consolidation offline batch 2026 best practice`
2. `temporal knowledge graph edge confidence validFrom validUntil Graphiti Zep schema pattern 2026`
3. `email classification confidence gating skip LLM call graph memory retrieval 2026`
4. `entity graph node identity label classifier relational schema polymorphic 2026 knowledge graph`
5. `memory consolidation LLM agent 2026 new research dreaming OpenClaw SSGM improvement`

Surfaced findings influenced every subsequent question (GAM encoding/consolidation decoupling → D-01; Graphiti/Zep column-native bitemporal → D-02; vLLM HaluGate pre-classification gating → D-03; OpenClaw Dreaming 3/0.8 gates → D-01 thresholds).

Mid-discussion, the user supplied https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f (Karpathy's "LLM Wiki" gist). WebFetch summarized; Zettelkasten citation critique and "Oblio Selettivo" selective-oblivion pattern folded into D-01a (provenance) and validated D-06 (decay alignment).

---

## Write path

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal Deep stub | Nightly BullMQ `triage-affinity-promotion` job, reads TriageOverride rows ≥3 corrections + ≥0.8 conf → upserts affinity edges. Phase 151 replaces job body, keeps queue id. OpenClaw 3/0.8 gates. SC-4 measurable. | ✓ |
| Reuse Phase 147 promotion pipeline | Hook into existing override promotion queue, listener writes edges on promotion event. Couples two stores with different eviction semantics. | |
| Schema + read path only, no writer | Ship schema change + read path + shadow metrics. Edges empty until Phase 151. SC-4 deferred. | |
| Inline write during triage | Every triage call writes/upserts an edge. Violates SC-3 + GAM 2026 best practice. | |

**User's choice:** Minimal Deep stub (Recommended)
**Notes:** User's research request directly informed this question. The options were shaped by: GAM paper "decouple encoding from consolidation," OpenClaw Dreaming production-default promotion gates (matching Phase 147 thresholds), and the SC-3 vs Phase 151 scope tension. The user accepted the recommendation — no additional clarifications.

**Follow-up (no AskUserQuestion, captured from Karpathy gist):**
D-01a — edges carry Zettelkasten citation provenance (`metadata.derivedFromOverrideIds`, `metadata.promotionAudit`). Locked inline during discussion. Rationale: Karpathy gist surfaced the Zettelkasten critique of LLM-maintained knowledge bases — immutable atomic sources cited by synthesis, never rewritten.

---

## Schema shape

| Option | Description | Selected |
|--------|-------------|----------|
| Add nullable columns | Migration adds `confidence Float?`, `validFrom DateTime?`, `validUntil DateTime?` to graph_edges. Compound indexes. Backward-compatible for existing 7 edge types. | ✓ |
| Stuff everything in metadata JSONB | Zero migration. JSONB path queries. No indexed confidence range query. Violates CLAUDE.md "never JSONB metadata path queries" rule. | |
| Separate TriageAffinityEdge table | New Prisma model, own FKs. Duplicates adjacency model, breaks recursive CTE. | |
| Bitemporal columns (Graphiti-full) | Above + `invalidatedAt`. Zep-style supersede-not-delete. Over-engineered for solo-dev pre-Phase 152. | |

**User's choice:** Add nullable columns (Recommended)
**Notes:** Graphiti/Zep research (arXiv:2501.13956) framed the bitemporal option as legitimate but premature. CLAUDE.md rule against JSONB metadata path queries eliminated the JSONB option. Separate table was rejected for breaking `EntityGraphService` recursive-CTE traversal.

---

## Read path integration

| Option | Description | Selected |
|--------|-------------|----------|
| Three-layer stack | Rules (TriageOverride) → Graph (new TriageGraphLookupService) → LLM. Single indexed edge lookup. Emits skipped/hinted/miss counters. | ✓ |
| Fold into TriageOverrideService | Unified "overrides" abstraction. Breaks boolean-rule semantics of TriageOverride. | |
| Pre-override (graph wins first) | Violates principle of least surprise — user rules should beat inferred patterns. | |
| Hint injection only (no skip) | Safer but forfeits SC-2's ≥0.9 skip and SC-4's 20% reduction target. | |

**User's choice:** Three-layer stack (Recommended)
**Notes:** Stalwart Labs layered classifier and vLLM HaluGate pre-classification gating (72.2% efficiency gain) grounded the recommendation. The SQL query shape was locked as D-03a without a separate question because the `ORDER BY sender-first` clause handles D-05 precedence automatically.

---

## Node identity

| Option | Description | Selected |
|--------|-------------|----------|
| New sender/domain/label nodeTypes | Three new `nodeType` values on existing GraphNode: `sender`, `email_domain`, `label`. Auto-upsert on edge write. Label mirror via LabelsService hook. Forward-compatible merge path. | ✓ |
| Reuse Contact GraphNodes for senders | Match contacts when possible, fall back to 'sender' nodes otherwise. Two code paths for same concept. | |
| No label nodes — targetId = Label.id | Breaks Prisma FK relation. Requires invasive schema changes. | |
| Everything in metadata, dummy anchor node | Makes graph untraversable. Defeats purpose of using GraphEdge. | |

**User's choice:** New sender/domain/label nodeTypes (Recommended)
**Notes:** Key constraint: GraphEdge FKs require real GraphNode rows. Free-form `nodeType` string on existing GraphNode table means zero schema change for node identity (only the 3 columns from D-02 migrate). Forward-compatibility note: Phase 151 batch job can merge `sender` nodes into `contact` nodes by email match without a schema break.

**Follow-up (no AskUserQuestion):**
D-04a — sender email normalization is `email.trim().toLowerCase()`. No Gmail `+` stripping, no subdomain collapsing. Locked inline with rationale that different aliases represent semantically different senders.

---

## Sender vs domain precedence

| Option | Description | Selected |
|--------|-------------|----------|
| Sender beats domain, always | More specific wins. No magic combination math. Baked into ORDER BY clause. | ✓ |
| Max confidence wins | A 0.95 domain edge overriding 0.75 sender corrections is surprising. | |
| Weighted sum with penalty | Hides which signal drove decision; harder to audit. | |
| Both must agree | Massively reduces SC-4 hit rate for new senders. | |

**User's choice:** Sender beats domain, always (Recommended)
**Notes:** Precedence is enforced at the SQL query layer via `ORDER BY (CASE WHEN src.nodeType = 'sender' THEN 0 ELSE 1 END), e.confidence DESC LIMIT 1`. Zero code-side comparison needed.

---

## Temporal validity semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Creation-time validFrom, null validUntil, hard-delete on decay | `validFrom` = job timestamp; `validUntil` = null. Phase 149 decay-gc gains 3rd store: affinity edges hard-deleted when recomputed confidence < 0.3. Consistent with 149 D-05. | ✓ |
| Fixed 90-day validUntil TTL | Decouples validity from evidence strength. Wasteful for strong edges. | |
| Zep bitemporal — supersede instead of delete | Table grows unbounded. Contradicts Phase 149 D-05 hard-delete. | |
| validFrom = first feedback row, validUntil = last + 90d | Expensive MIN/MAX queries on every promotion. | |

**User's choice:** Creation-time validFrom, null validUntil, hard-delete on decay (Recommended)
**Notes:** Decision explicitly extends Phase 149's decay-gc nightly job with a third store (graph_edge). The `triage_patterns_gc_total` counter gets a third label value `store='graph_edge'`. Phase 149 D-09 ordering (GC first, then recalc, per tenant) is extended: affinity edge GC runs as a third step after recalc, inside the same job handler. `validUntil` reserved for Phase 151 SAFE-03 semantic-contradiction supersession.

---

## Rollout + SC-4 measurement

| Option | Description | Selected |
|--------|-------------|----------|
| Env-var cutoff + shadow counter always on | Single env var `TRIAGE_GRAPH_CONFIDENCE_CUTOFF` (default 9999 = disabled; flip to 0.9 to activate). Shadow counter `would_skip_shadow` always emits regardless of cutoff. Matches Phase 149 D-12. | ✓ |
| Dedicated feature flag with percentage rollout | Two env vars; over-engineered for solo-dev. Violates Phase 149 D-12 flags-for-safety-not-features rule. | |
| Three-mode state machine | `TRIAGE_GRAPH_MODE=off\|shadow\|active`. Shadow-always-on gives same data with one fewer state. | |
| No shadow metrics — skip from day one | Learn by degrading triage accuracy. No existing TTL bound to protect us like in Phase 149. | |

**User's choice:** Env-var cutoff + shadow counter always on (Recommended)
**Notes:** Rollout sequence is explicit in D-07: deploy at 9999 → 14-day shadow observation → flip to 0.9 if shadow rate ≥ 20% → monitor per-label accuracy regressions → Phase 156 formally benchmarks. Kill switch is one Railway redeploy. Three Prometheus metrics (D-07a) ship this phase.

---

## Claude's Discretion

The following were explicitly deferred to planner judgment:

- Exact Prisma migration filename (generated by `prisma migrate dev`).
- Whether `TriageGraphLookupService` lives in `ai/services/` or a new `ai/graph/` subdirectory — depends on Phase 151's anticipated module shape.
- Whether to extract a `triage-affinity-promotion.helpers.ts` (mirroring Phase 149 pattern) or inline the promotion SQL.
- Whether `would_skip_shadow` emission happens inside the service or as a decorator/interceptor.
- Whether the first deploy enforces a 24-hour minimum warmup before cutoff flip, or allows same-day activation.
- Test fixture approach: mocks vs existing test-feedback-seed script.

## Deferred Ideas

The following surfaced during discussion but were captured for future phases:

- Merge `sender` nodes into `Contact` nodes by email match (Phase 151 or hygiene pass).
- Bitemporal `invalidatedAt` column (Phase 152 SAFE-03 if audit demands it).
- Dedicated `TriageConsolidationAudit` table (Phase 152).
- Per-sender confidence histogram (Phase 155 dashboard).
- Per-tenant percentage rollout flag (rejected for solo-dev; revisit at growth).
- Weighted-sum or max-confidence precedence (rejected; revisit if data shows sender-always-wins underperforms).
- Gmail `+`-alias stripping, subdomain collapsing (rejected; revisit if Phase 155 surfaces harm).
- Fixed 90-day `validUntil` TTL (rejected; revisit if decay-gc can't keep pace).
- Label semantic-overlap detection on mirror sync (Phase 153).
- GraphRAG-style multi-hop traversal on affinity edges (Phase 155 dashboard opportunity).
- Cross-tenant pattern aggregation (privacy-sensitive; out of scope for v13).
- Unifying `sender` and `contact` identity via shared `nodeType='identity'` (over-abstraction for v13).
