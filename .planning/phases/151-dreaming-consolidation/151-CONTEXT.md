# Phase 151: Dreaming Consolidation Loop - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement OpenClaw-inspired 3-phase memory consolidation (Light hourly / Deep nightly 3AM / REM weekly Sunday 5AM) as BullMQ repeatable jobs on a NEW dedicated `TriageConsolidationScheduler` module, subsuming Phase 150's `affinity-promotion` stub into the Deep phase. Light compresses `EmailTriageFeedback` rows into a new `TriageCorrectionCluster` synthesis table. Deep promotes patterns with 3/0.8 gates into `SENDER_LABEL_AFFINITY` / `DOMAIN_LABEL_AFFINITY` graph edges, calls Phase 149 decay-gc helpers first, and enqueues Phase 148 label-accuracy sweeps for touched labels. REM detects two contradiction kinds, writes persistent audit rows to a new `TriageConsolidationAudit` table, and auto-demotes both contradicting edges to 0.79 confidence — with no cooldown (Phase 152 SAFE-03 owns that policy).

**In scope:**
- New NestJS module at `backend/src/modules/ai/consolidation/` with `TriageConsolidationScheduler`, BullMQ queue `triage-consolidation`, single worker (concurrency=1), and three handler methods: `processLightConsolidation`, `processDeepConsolidation`, `processRemConsolidation`.
- Migrate Phase 150's `affinity-promotion` job and handler body into the new module, renamed to `deep-consolidation`. Phase 150's stub registration on `TriageBackfillSchedulerService` is DELETED in the same phase (no dual-writer, no back-compat shim).
- Prisma migration (nullable-only, additive — passes Guard A/E/F) adding two new models:
  - `TriageCorrectionCluster` (tenantId, senderEmail, type, oldValue, newValue, count, firstAt, lastAt, representativeEmailId, windowStart, createdAt) — Light's synthesis layer over raw `EmailTriageFeedback` atoms.
  - `TriageConsolidationAudit` (tenantId, detectedAt, kind, sourceNodeId, targetNodeIds String[], edgeIds String[], confidencesBefore Float[], confidencesAfter Float[], notes JSON) — REM's persistent contradiction log for Phase 152 SAFE-02 human-review queue.
- Light handler (cron `15 * * * *`): per tenant, scan `EmailTriageFeedback` rows with `createdAt >= now() - 1 hour`. Group by (tenantId, senderEmail, type, oldValue, newValue). Within each group, use existing `EmailEmbedding` 1024-dim pgvector cosine_distance to collapse pairs with cosine > 0.9 into a single representative row. Upsert the resulting cluster into `TriageCorrectionCluster`. Then, for each (tenantId, senderEmail) touched, force-flush `SenderBehaviorScore` via existing `TriageLearningService.flushSenderSignals` (Phase 149 D-02 time-aware blend unchanged). Missing embeddings → not deduplicated (safer default).
- Deep handler (cron `0 3 * * *`): per tenant, (1) call `processDecayGcForTenant` + `processAffinityEdgeDecayForTenant` from `triage-decay-gc.helpers.ts` (synchronous, per-tenant ordering); (2) run the Phase 150 affinity-promotion math verbatim against `TriageCorrectionCluster` (new) OR raw `EmailTriageFeedback` (fallback when cluster is missing for the 3d window) — sender-level first, then domain-level, both with 3/0.8 gates via `weightCorrection(ageDays, { halfLifeDays })`; (3) enqueue Phase 148 `LabelAccuracyService` sweep jobs for each distinct `labelId` touched by promotion (bounded fan-out via existing `LabelAccuracyQueue`). `validUntil` stays NULL on all upserts (Phase 150 D-06 preserved).
- REM handler (cron `0 5 * * 0`): per tenant, (A) **sub-threshold domain roll-up** — scan domains where constituent senders each have <3 corrections but collectively 3+ distinct non-role senders (per Phase 147 D-04 constants `MIN_DISTINCT_SENDERS_FOR_DOMAIN` + `ROLE_ACCOUNT_LOCAL_PARTS`) agree on the same label → upsert `DOMAIN_LABEL_AFFINITY` edge with promotion provenance; (B) **contradiction detection** — two SQL queries: (1) same-source competing edges (`GROUP BY (tenantId, sourceId) HAVING COUNT(DISTINCT targetId) > 1 AND MIN(confidence) >= 0.8`), (2) sender-vs-domain disagreement (sender edge and domain edge both ≥0.8 pointing to different labelIds for the same logical sender); (C) insert `TriageConsolidationAudit` rows for each hit, emit `triage_contradictions_found_total{kind, tenant_id}` counter, AND auto-demote both contradicting edges to `confidence = 0.79` via `prisma.graphEdge.updateMany`.
- Prometheus reuse per Phase 149/150 (no renames):
  - `triage_graph_promotion_total` (Phase 150) satisfies SC-5 "`triage_patterns_promoted_total`" — add a CONTEXT.md note on the naming delta.
  - `triage_patterns_gc_total{store='graph_edge'}` (Phase 149) satisfies SC-5 "`triage_edges_decayed_total`" — same.
  - NEW `triage_contradictions_found_total{kind, tenant_id}` counter.
- Three NEW phase-health gauges (one per phase): `triage_light_last_run_timestamp_seconds`, `triage_deep_last_run_timestamp_seconds`, `triage_rem_last_run_timestamp_seconds` — enables Prometheus alerts on silent job failures.
- Remove all Phase 150 `affinity-promotion` job-type code from `TriageBackfillSchedulerService`: union member, switch case, queue registration, cron slot. One atomic migration within Phase 151.

**Out of scope (deferred to later v13.0 phases):**
- Auto-rollback when per-label accuracy drops >15% after consolidation cycle — Phase 152 SAFE-03 (this phase ships the audit row, Phase 152 reads it and reverts).
- `frozenUntil` cooldown column + demotion-escalation logic — Phase 152 SAFE-03 owns repair policy.
- Accuracy-regression contradiction kind (labelA precision drops, labelB precision rises, shared sender cohort) — Phase 152 SAFE-02 (expensive correlation, belongs with human-review UI).
- Mutually-exclusive label violation contradiction kind — Phase 153 LABEL-02 hardens `mutuallyExclusiveWith[]` first.
- Full bitemporal supersession (`validUntil = now()` on loser, new row with `validFrom = now()`) — Phase 152 SAFE-03 (requires audit-table-driven rollback path).
- Human-review UI / contradiction queue — Phase 152 SAFE-02.
- Retiring Phase 149's standalone `decay-gc` job type — SAFETY NET only; Deep handler now invokes the helpers directly, but the standalone job stays registered until observability confirms redundancy (future cleanup phase).
- Moving Phase 149's `decay-gc` registration onto the new consolidation scheduler — deliberately NOT touched to minimize Guard-F drift risk on a recently-shipped phase.
- Per-correction embedding artifact (`correctionEmbedding` column) — Light uses existing `EmailEmbedding` on the corrected email; no new embedding class.
- Touching raw `EmailTriageFeedback` rows (merging / pruning / tombstoning) — raw rows are the immutable Zettelkasten atoms (P150 D-01a); synthesis happens in `TriageCorrectionCluster`.
- Additional contradiction-signal categories (3rd-party evidence, cross-tenant pattern checks).
- UI dashboards for consolidation health / contradiction rate — Phase 155 Triage Observability Dashboard.

</domain>

<decisions>
## Implementation Decisions

### Service Architecture

- **D-A1: New dedicated `TriageConsolidationScheduler` module at `backend/src/modules/ai/consolidation/`.** Its own `.module.ts`, BullMQ queue named `triage-consolidation`, one `Worker` with `concurrency: 1`, three handler methods (`processLightConsolidation` / `processDeepConsolidation` / `processRemConsolidation`). Phase 149 D-07 explicitly anticipated this: *"If Phase 151 ends up with 3+ scheduled sweeps (Light/Deep/REM), factor a dedicated consolidation-scheduler module out at that point."* Rejected alternatives: extending `TriageBackfillSchedulerService` with 3 more job types pushes the file past 700 LF and intermixes "fix-broken-data backfill" with "learn-from-corrections consolidation" (orthogonal concerns, NestJS 2026 feature-module guidance favors separation); new class on shared queue introduces cross-service worker contention without simplifying anything.

- **D-A2: Migrate Phase 150's `affinity-promotion` into Deep, renamed to `deep-consolidation`.** Phase 151 Deep subsumes the Phase 150 writer body. The job is removed from `TriageBackfillSchedulerService` (union member, switch case, queue setup, cron entry) and re-registered on the new consolidation scheduler with the new name. Handler body (promotion math, Zettelkasten provenance per P150 D-01a, metric emissions) moves verbatim into `processDeepConsolidation`; `processAffinityPromotionForTenant` helper stays in `triage-affinity-promotion.helpers.ts` (same file path, re-imported by the new scheduler). Prometheus counter `triage_graph_promotion_total` continues to increment with identical labels — dashboards keep working. No dual-writer, no cutover window, no back-compat shim. **Why:** Phase 150 D-01 explicitly committed to this transition (*"Phase 151 will replace the handler body... but keep the same queue name and job id"* — we're honoring the "replace" intent while choosing the cleaner module boundary over the "same queue" detail). Verification criterion for planner: after migration, `grep -r "affinity-promotion"` should return zero hits in `backend/src/` except inside migration comments.

- **D-A3: Deep handler invokes `processDecayGcForTenant` + `processAffinityEdgeDecayForTenant` synchronously per tenant, at the START of each Deep run, before promotion.** Imports from `backend/src/modules/ai/services/triage-decay-gc.helpers.ts`. Deterministic ordering (decay-gc → promotion) without cross-scheduler coordination. Phase 149 decay-gc helpers stay pure-function and unchanged. Phase 149's standalone `decay-gc` job registration on `TriageBackfillSchedulerService` is NOT removed — it stays as a safety-net cron in case Deep fails for days. Can be retired in a later cleanup phase once Deep-triggered ordering is observed healthy. **Why:** Keeps Phase 149's shipped contract intact (Guard F diff check passes). Avoids touching recently-shipped code. Deep gets deterministic ordering without a mutex. Rejected alternatives: moving decay-gc onto the new scheduler touches Phase 149 code (migration risk); inline replacement without a safety net leaves no nightly cleanup if Deep hits a multi-day outage.

### Light-Phase Semantics

- **D-B1: Light compresses `EmailTriageFeedback` rows per `(tenantId, senderEmail, type, oldValue, newValue)` within a rolling 1-hour window.** NOT the Redis signal-buffer (which already flushes every 5 min via `TriageLearningService.flushSenderSignals` and carries passive behavioral signals, not corrections). NOT `TriageOverride` (those are already-promoted patterns; Phase 150's Deep writer reads them). The "sender+label" tuple in SC-1 maps directly to feedback rows' `(senderEmail, newValue)` — that's the correction signal Phase 151 compresses. **Why:** Matches spec semantics ("sender+label"); the other two stores either don't have a sender+label shape or are downstream of the thing we're compressing. Rejected: Redis flush-only interpretation makes DREAM-01 a no-op rename of existing 5-min flush.

- **D-B2: Cosine>0.9 dedup uses existing `EmailEmbedding` (1024-dim pgvector) of the corrected email.** For each candidate pair within a group, query `EmailEmbedding` by `emailId`, compute pgvector `<=>` cosine_distance (cosine distance < 0.1 ↔ cosine similarity > 0.9), collapse pairs into a single representative row. Missing embedding on EITHER side → pair is NOT deduplicated (stays as separate count entries in the cluster row). **Why:** Zero new inference cost; reuses email-embedding pipeline already live. `EmailEmbedding` backfill is async (per Phase 109 RAG pattern), so treating missing as "not duplicated" is the safer side (over-count beats wrong-merge). Rejected alternatives: new per-correction embedding class adds a schema column + worker cost for a signal that's already encoded in the email content; exact-match-only dedup fails the SC-1 "cosine similarity > 0.9" clause explicitly.

- **D-B3: New Prisma model `TriageCorrectionCluster` — non-destructive synthesis layer, raw `EmailTriageFeedback` preserved untouched.** Fields: `id`, `tenantId`, `senderEmail`, `type`, `oldValue`, `newValue`, `count` (Int), `firstAt` (DateTime), `lastAt` (DateTime), `representativeEmailId` (String), `windowStart` (DateTime), `createdAt` (DateTime @default(now())). Unique index `(tenantId, senderEmail, type, oldValue, newValue, windowStart)` so hourly upsert is idempotent. Additional index `(tenantId, lastAt)` for Deep's read pattern. `onDelete: Cascade` on tenantId. **Why:** Zettelkasten-compliant (P150 D-01a) — raw rows are immutable atoms, clusters are the synthesis layer that Deep reads for performance. Phase 147/148 pipelines keep reading raw rows unchanged (zero contract break). Phase 155 dashboard can later expose cluster shape without re-deriving. Rejected alternatives: destructive collapse with `clusterId + mergedAt` columns on `EmailTriageFeedback` violates the immutable-atom principle and risks double-counting in Phase 148 TP sweeper; hard-delete of duplicates breaks Phase 147 promotion math and Phase 149.1 audit guarantees.

- **D-B4: Light force-flushes `SenderBehaviorScore` EMA via existing `TriageLearningService.flushSenderSignals` for each touched (tenantId, senderEmail) in the hour.** After clustering, iterate the set of touched senders and invoke the existing flush path even if the Redis buffer hasn't reached `FLUSH_THRESHOLD` (5 signals). Uses Phase 149 D-02 time-aware blend verbatim (`effectivePrevWeight = EMA_PREV_WEIGHT * exp(-ln2/halfLifeDays * dtDays)`). No new EMA math. **Why:** Satisfies SC-1 "updates EMA scores" clause without introducing a new per-(sender, label) EMA store. Keeps sender-score semantics in one place.

- **D-B5: Remove Phase 150 stub code superseded by the consolidation-module migration in the same phase.** Delete: `'affinity-promotion'` from `BackfillJobData['type']` union, the `case 'affinity-promotion':` branch in `TriageBackfillSchedulerService`, the queue-registration block for that cron slot, and any import it leaves stranded. No back-compat shim. No feature-flag gating the old and new writers side-by-side. **Why:** CLAUDE.md — *"Don't add backwards-compatibility shims when you can just change the code."* User confirmed "remove all legacy shit file" intent. Single atomic migration reduces Guard-F drift surface.

- **D-B6: Light cron `15 * * * *` (every hour at :15). BullMQ repeatable `jobId='triage-light-consolidation'`.** Offset from :00 avoids clash with any future top-of-the-hour scheduled work. Deep at 3:00 stays untouched. **Why:** Deterministic, observable, minimal chance of worker contention. Planner's discretion: the 15-min offset can shift if another hourly job lands at :15 later; cron value is config-file-visible, not env-var-configurable (P149 D-12 philosophy — one less flag).

### Deep vs REM Scope Split

- **D-C1: Domain aggregation stays in Deep — runs nightly alongside sender aggregation.** Phase 150's 2nd-pass `DOMAIN_LABEL_AFFINITY` upsert logic is preserved verbatim in `processDeepConsolidation`. REM does NOT duplicate nightly rollup. **Why:** New domain signals need to reflect recent sender behavior within ~24h, not ~7d — the user feedback loop stays tight. Rejected alternative: moving domain rollup to REM introduces a 6-day lag on new domains (noticeable UX regression on first-time senders from a domain with history). REM's DREAM-03 "domain-level pattern aggregation" clause is satisfied by D-C4 (sub-threshold roll-up) instead of nightly rollup — a complementary signal Deep cannot produce.

- **D-C2: `validUntil` stays NULL by default — Phase 150 D-06 preserved.** Phase 151 Deep continues to upsert with `validUntil = null`; decay-gc hard-deletes edges whose recomputed confidence < 0.3. SC-2 "with temporal validity" is satisfied because `validFrom` IS populated (set to job runtime) and edges ARE time-scoped via GC. `validUntil` remains reserved for Phase 152 SAFE-03 bitemporal supersession. **Why:** Explicit calendar TTL (30d, 90d) decouples validity from evidence strength — a high-confidence reinforced edge shouldn't expire on the calendar. Bitemporal supersession before Phase 152's audit-driven rollback is here is over-engineering. Rejected alternatives already locked in Phase 150 D-06.

- **D-C3: Deep enqueues Phase 148 `LabelAccuracyService` sweep jobs for each distinct `labelId` touched by promotion.** Bounded fan-out — enqueue via existing `LabelAccuracyQueue` (Phase 148 infrastructure). Only labels that had an edge created/updated this run are swept, not all labels. Single-owner-per-computation preserved: Phase 148 service still owns the sweeper math; Deep just triggers it. **Why:** SC-2 "recalculates per-label accuracy" is satisfied actively (not passively waiting for Phase 148's own nightly sweep). Rejected alternatives: full-tenant accuracy sweep blows through tenants with 100+ labels when only 2 were touched; leaving it to Phase 148's passive schedule makes SC-2 a weak read.

- **D-C4: REM weekly "domain-level pattern aggregation" = sub-threshold roll-up.** Query domains where: (a) each constituent sender has fewer than 3 corrections individually (below Phase 147 D-04 `MIN_CORRECTIONS_FOR_SENDER_PROMOTION`); (b) 3+ DISTINCT non-role senders (excluding `ROLE_ACCOUNT_LOCAL_PARTS` like `no-reply`, `noreply`, `notifications`, etc. — reuse the existing constant from `triage-feedback.service.ts`) all corrected to the same `newValue` label; (c) their collective weighted-sum via `weightCorrection` ≥ 0.8. Upsert `DOMAIN_LABEL_AFFINITY` edge with the standard Phase 150 D-01a provenance. This is the novel signal Deep cannot see (Deep requires individual-sender gate first). **Why:** Honors SC-3 "domain-level pattern aggregation" clause with a signal that's actually distinct from Deep's per-night work. Bridges the Phase 147 `MIN_DISTINCT_SENDERS_FOR_DOMAIN` concept into the graph layer.

### REM Contradiction Algorithm

- **D-D1: Two contradiction kinds detected in REM.** **Kind 1** — same-source competing edges: `GROUP BY (tenantId, sourceId) HAVING COUNT(DISTINCT targetId) > 1 AND MIN(confidence) >= 0.8`. Two `SENDER_LABEL_AFFINITY` edges (or two `DOMAIN_LABEL_AFFINITY` edges) from one source to different labels, both above promotion threshold. **Kind 2** — sender-vs-domain disagreement: SQL join `SENDER_LABEL_AFFINITY se JOIN DOMAIN_LABEL_AFFINITY de ON se.src.domain = de.src.domain` where `se.confidence >= 0.8 AND de.confidence >= 0.8 AND se.targetLabelId != de.targetLabelId`. Phase 150 D-05 (sender-wins in read-path) still applies at triage time — logging it in REM surfaces aiPrompt or label-definition conflicts for human review. **Deferred to 152/153**: accuracy-regression kind (expensive, reads Phase 148 wilson intervals) belongs with SAFE-02 human-review UI; mutually-exclusive-label violation belongs with Phase 153 LABEL-02 hardening. **Why:** These two kinds are cheap, deterministic, pure graph queries — no embedding compute, no LLM inference, no cross-table correlation. Phase 151 stays detective and fast.

- **D-D2: New Prisma model `TriageConsolidationAudit` + Prometheus counter `triage_contradictions_found_total`.** Model fields: `id`, `tenantId`, `detectedAt` (DateTime @default(now())), `kind` (String — `'competing_source' | 'sender_vs_domain'`), `sourceNodeId` (String), `targetNodeIds` (String[]), `edgeIds` (String[]), `confidencesBefore` (Float[]), `confidencesAfter` (Float[]), `notes` (Json @default("{}")). Indexes: `(tenantId, detectedAt)`, `(tenantId, kind)`. `onDelete: Cascade` on tenantId. Counter labels: `kind`, `tenant_id`. REM inserts one row AND increments counter per contradiction hit. **Why:** Phase 152 SAFE-02 needs queryable rows to build the human-review queue — a counter alone forces Phase 152 to re-scan the graph. The table is the Zettelkasten-compliant persistent audit; the counter is ops observability. Two writes per contradiction, both cheap. Matches the "dedicated `TriageConsolidationAudit` table" Phase 150 D-01a / Phase 149 deferred-items.md anticipated.

- **D-D3: REM auto-demotes both contradicting edges to `confidence = 0.79`.** `prisma.graphEdge.updateMany` setting `confidence = 0.79` on every edge ID recorded in the audit row. 0.79 sinks both edges below Phase 150 D-07 skip cutoff AND below the 0.8 hint-injection threshold — but stays within the `[0.7, cutoff)` hint band, so the LLM still receives the highest-confidence edge as a hint (per Phase 150 D-03a `ORDER BY sender-first, confidence DESC LIMIT 1`). Neither contradicting label "wins" the fast-path; LLM adjudicates. **Why:** Active defense in Phase 151 (user-chosen over "Record only"). Honors the spirit of SSGM anti-poisoning without introducing the full auto-rollback mechanism Phase 152 will ship. Known implication: the `confidence` field now has two writers — the promotion math (via `weightCorrection` weighted-sum) AND REM's contradiction clamp. Planner should ensure the Phase 150 `metadata.promotionAudit.computedConfidence` field is preserved on demote (records what the math WOULD have said), so Phase 152 can reason about the clamp history.

- **D-D4: No cooldown column in Phase 151. Deep re-promotes freely; bounded oscillation accepted.** Deep computes new confidence from evidence (`weightCorrection` weighted-sum over the underlying feedback rows) independently of the current edge's stored confidence. If corrections continue to flow for BOTH contradicting labels, Deep WILL push the edges back up above 0.8 within 1-3 nightly cycles, and the next REM (up to 7 days later) will re-detect and re-demote. This is a bounded transitional state until Phase 152 SAFE-03 ships `frozenUntil` + demotion-escalation. Max oscillation horizon: weeks, not months. **Why:** Simplest Phase 151 cut; preserves `confidence` as "value from math" (plus the one-time REM clamp). Phase 152 is the principled home for repair policy. Rejected alternatives: `frozenUntil DateTime?` column pre-empts Phase 152 territory; escalating 2nd-consecutive-demote sanction is more nuanced but adds code Phase 152 will rewrite anyway. Planner must document the oscillation bound explicitly in Deep's / REM's docstrings so operators understand the expected behavior.

- **D-D5: REM cron `0 5 * * 0` (Sunday 5AM). BullMQ repeatable `jobId='triage-rem-consolidation'`.** 2-hour offset from Deep (3AM) absorbs Deep run-overrun. Off-peak. Weekly boundary gives Deep 6× to stabilize new edges before REM reviews them. Matches roadmap SC-3 wording verbatim. **Why:** Deterministic, simple, no env override (P149 D-12 philosophy).

### Observability & Metrics

- **D-E1: Reuse Phase 150/149 counters for SC-5 promotion + decay metrics. Document the naming delta.** SC-5 names `triage_patterns_promoted_total` / `triage_edges_decayed_total` / `triage_contradictions_found_total`. Phase 150 already ships `triage_graph_promotion_total` (labels: `tenant_id, edge_type, action`) — this satisfies "patterns_promoted" with richer labels. Phase 149 already ships `triage_patterns_gc_total{store='graph_edge'}` — this satisfies "edges_decayed". Phase 151 adds ONLY `triage_contradictions_found_total{kind, tenant_id}`. Planner writes a comment in the metric-registration block documenting the SC-5 name → actual name mapping. **Why:** Three half-overlapping counters for the same phenomenon is worse than documentation pointing at the canonical ones. No churn, no dashboard migration.

- **D-E2: Three per-phase timestamp gauges.** `triage_light_last_run_timestamp_seconds`, `triage_deep_last_run_timestamp_seconds`, `triage_rem_last_run_timestamp_seconds` — all gauges, each set to `Date.now() / 1000` at end of each successful handler run. Enables Prometheus alerting on silent job failures (e.g., `now - triage_light_last_run_timestamp_seconds > 5400` → Light skipped an hourly beat). Matches Phase 149 D-11's `triage_decay_last_run_timestamp_seconds` pattern. **Why:** Each phase runs on a different cadence (1h / 24h / 168h) — a single gauge can't alert on all three reliably. Three gauges is the canonical Prometheus pattern.

### Claude's Discretion

- Exact Prisma migration filename timestamp (planner generates via `npx prisma migrate dev --name add_triage_consolidation_tables`).
- Whether `TriageCorrectionCluster` has a separate file or sits next to `TriageCorrection*` models already in schema.prisma (style choice).
- Whether REM's two contradiction-kind queries live in the scheduler handler file or in a new `triage-rem-detection.helpers.ts` — follow the Phase 149 `triage-decay-gc.helpers.ts` / Phase 150 `triage-affinity-promotion.helpers.ts` pattern if the SQL is non-trivial.
- Whether the Light handler's embedding-cosine loop is implemented in pure app-layer JS (fetch embeddings, pairwise cosine) or pushed into a single SQL query using pgvector's `<=>` operator — planner measures p95 and picks.
- Whether `TriageConsolidationAudit.notes` JSONB stores a structured diagnostic (e.g., which aiPrompts were matched) or stays empty in Phase 151 — Phase 152 SAFE-02 will define the final shape; Phase 151 can leave it `{}` safely.
- Exact test-fixture approach for the 3 handlers — follow Phase 149/150 test pattern.
- Whether Deep's `LabelAccuracyQueue` enqueue uses a batched "touched labels" payload or one message per label — depends on queue ergonomics in the existing infrastructure.
- Whether to seed a minimum N-hour warmup on Light before first cluster write (to ensure at least one `EmailTriageFeedback` row exists per representative tenant) — pragmatic planner call.

### Folded Todos

None — no pending todos in `.planning/todos/` matched Phase 151 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level contracts (mandatory)
- `.planning/ROADMAP.md` §Phase 151 (line 361) — 1-line scope.
- `.planning/milestones/v13.0-ROADMAP.md` §Phase 151 (lines 71-82) — 5 locked success criteria, DREAM-01/02/03 requirement mapping, dependency on Phase 150.
- `.planning/REQUIREMENTS.md` §DREAM — DREAM-01 / 02 / 03 requirement text.
- `CLAUDE.md` — DB Safety hard rules (nullable columns + `prisma migrate dev` + Guard suite A/D/E/F/G). Zero `prisma db push`. Git push discipline (no auto-push). No back-compat shims.

### Prior phase contracts (mandatory)
- `.planning/phases/147-feedback-loop/147-CONTEXT.md` — D-09b (frequency × recency_decay with 14d half-life math). Phase 151 Deep reuses. D-04 `MIN_DISTINCT_SENDERS_FOR_DOMAIN` + `ROLE_ACCOUNT_LOCAL_PARTS` — REM D-C4 sub-threshold roll-up reuses.
- `.planning/phases/148-label-accuracy/148-CONTEXT.md` — D-01 (`weightCorrection` helper is single source of truth; DO NOT hardcode 14). D-07 (LabelAccuracyProfile + LabelAccuracyQueue schema). Phase 151 Deep enqueues to the existing queue.
- `.planning/phases/149-temporal-decay/149-CONTEXT.md` — D-05 (hard-delete + Prometheus counter pattern). D-06 (recompute-at-GC-time semantics). D-07/08/09/10 (scheduler extension pattern — Phase 151 parallels but on its own module). D-11 (three Prometheus metrics shape; Phase 151 E-2 mirrors). D-12 (env var kill-switch philosophy — no new boolean feature flags).
- `.planning/phases/149.1-email-triage-incoherence-audit/149.1-IMPROVEMENT-SPEC.md` — preserves passive-notification suppression; graph/audit additions must not regress. Raw `EmailTriageFeedback` rows stay immutable.
- `.planning/phases/150-graph-triage-memory/150-CONTEXT.md` — entire file. D-01 (affinity-promotion writer body Phase 151 subsumes). D-01a (Zettelkasten provenance — Phase 151 Deep preserves, REM demote preserves `metadata.promotionAudit.computedConfidence`). D-02 (schema: `confidence`, `validFrom`, `validUntil` columns). D-03 (three-layer read stack — REM demote sinks edges below cutoff). D-03a (SQL ORDER BY sender-first — REM detection uses the adjacency shape). D-04 (sender / email_domain / label nodeTypes — REM reuses). D-05 (sender-wins precedence — D-D1 Kind 2 surfaces violations). D-06 (`validUntil = NULL` default, decay-gc hard-delete — Phase 151 Deep preserves). D-07 (`TRIAGE_GRAPH_CONFIDENCE_CUTOFF` kill switch — demotion to 0.79 sinks below default 0.9). D-07a (three Prometheus metrics — Phase 151 E-1 reuses). Landmine §1 Option (b) find-then-create transaction pattern — Phase 151 Deep + REM MUST follow same pattern for graph-node writes.

### In-scope source files (mandatory reading for planner)
- `backend/prisma/schema.prisma` §GraphEdge (line 2293), §GraphNode (line 2270), §TriageOverride (line 2550), §EmailTriageFeedback (line 2565), §LabelAccuracyProfile (line 2590) — migration target + read sources.
- `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts` — source of `'affinity-promotion'` job code to DELETE (D-B5). Source of Phase 149 `'decay-gc'` job (stays, safety net).
- `backend/src/modules/ai/services/triage-affinity-promotion.helpers.ts` — stays in `services/`, re-imported by the new consolidation scheduler. Landmine §1 Option (b) find-then-create transaction is the template for all new GraphNode writes.
- `backend/src/modules/ai/services/triage-decay-gc.helpers.ts` — `processDecayGcForTenant` + `processAffinityEdgeDecayForTenant` + `extractDomain` — D-A3 imports these.
- `backend/src/modules/ai/services/triage-learning.service.ts` — `flushSenderSignals` for D-B4. `blendScores` for Phase 149 D-02 math (unchanged).
- `backend/src/modules/ai/services/triage-feedback.service.ts` — `MIN_DISTINCT_SENDERS_FOR_DOMAIN`, `ROLE_ACCOUNT_LOCAL_PARTS` constants (D-C4 reuses).
- `backend/src/modules/ai/services/triage-graph-lookup.service.ts` — read path (Phase 150 D-03). Confirms contradiction-demoted 0.79 edges fall into LLM-hint band, not skip band.
- `backend/src/modules/ai/services/email-triage.service.ts` — `triageEmail()` (Phase 150 integration point). No changes this phase; read to confirm hint band semantics under demoted confidence.
- `backend/src/modules/ai/services/label-accuracy.queue.ts` — Deep enqueues here per D-C3.
- `backend/src/modules/ai/services/label-accuracy.compute.ts` — sweeper math, unchanged in Phase 151.
- `backend/src/modules/ai/utils/triage-correction-weight.ts` — `weightCorrection(ageDays, { halfLifeDays })` helper. Phase 151 Deep + REM D-C4 use.
- `backend/src/modules/ai/services/email-embedding.queue.ts` + `embedding-search.service.ts` — understand the `EmailEmbedding` shape D-B2 queries.

### Reference implementations (do NOT modify — pattern sources only)
- `backend/src/modules/ai-chat/services/reranking.service.ts` — exponential decay formula pattern (already canonical).
- `backend/src/modules/email-sync/services/orphan-embedding-cleanup.service.ts` — hard-delete + Prometheus counter pattern.

### External research (inform, do not recite)
- **OpenClaw Dreaming — April 2026 GA (4.5)** — 3-phase consolidation (Light/REM/Deep); Light = ingestion+Jaccard-0.9 dedup; REM = concept-tag aggregation+extraction; Deep = promotion via `minScore 0.8, minRecallCount 3, minUniqueQueries 3` gates. https://dev.to/czmilo/openclaw-dreaming-guide-2026-background-memory-consolidation-for-ai-agents-585e. Applied to D-A1, D-B1, D-C4, D-D1. Also: https://docs.openclaw.ai/concepts/dreaming, https://openclawlaunch.com/guides/openclaw-dreaming.
- **CrewAI consolidation threshold (2026)** — 0.85 cosine as sweet spot; 0.9 is conservative. Our 0.9 choice intentionally conservative (favor not-merging over wrong-merging). Applied to D-B2.
- **Graphiti / Zep 2026 contradiction detection** — bitemporal supersession via `validUntil = now()` on loser; bidirectional edge↔episode indices. PDF: https://blog.getzep.com/content/files/2025/01/ZEP__USING_KNOWLEDGE_GRAPHS_TO_POWER_LLM_AGENT_MEMORY_2025011700.pdf. Applied conceptually to D-D3 (we chose demote over supersede for Phase 151; supersede = Phase 152 SAFE-03).
- **KARMA multi-agent KG enrichment (2026)** — conflict detection via logical inference / graph traversal, not LLM debate. https://openreview.net/pdf?id=k0wyi4cOGy. Applied to D-D1 Kind 1 (pure SQL, no LLM).
- **Martian-Engineering agent-memory** — three-layer persistent memory with automated extraction + contradiction detection + recency-scored retrieval. https://github.com/Martian-Engineering/agent-memory. Informs overall Phase 151 shape.
- **Graph-based Agent Memory taxonomy 2026** (arXiv:2602.05665) — graph memory has emerged as frontier for 2025-2026; topological model of experience. https://arxiv.org/html/2602.05665v1. Background; informs Phase 155 dashboard planning more than this phase.
- **SSGM (arXiv:2603.11768)** — anti-poisoning gates (≥3 corrections), contradiction gate requires human review, auto-rollback on accuracy drop. Applied: D-D3 active defense (anti-poisoning spirit), but full auto-rollback deferred to Phase 152 SAFE-03 per roadmap.
- **Karpathy "LLM Wiki" gist + Zettelkasten critique** — immutable atomic sources cited by synthesis layers. https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f. Applied to D-B3 (`TriageCorrectionCluster` is synthesis; `EmailTriageFeedback` rows stay immutable atoms).
- **NestJS / BullMQ 2026 module boundary guidance** — clean feature-module separation, producers/processors per feature. https://docs.bullmq.io/guide/nestjs. Applied to D-A1 (dedicated consolidation module over extending backfill scheduler).
- **Prometheus naming guide** — `_total` counter suffix, `_timestamp_seconds` gauge unit. https://prometheus.io/docs/practices/naming/. Applied to D-E1/E2.

### Adjacent code (explicitly out of scope)
- `backend/src/modules/contacts/services/relationship-score.service.ts` — independent decay concern (30d half-life, different domain).
- `backend/src/modules/ai-chat/services/memory.service.ts` — ai-chat memory, different domain. Do not touch.
- `backend/src/modules/ai-chat/services/reranking.service.ts` — reference implementation only.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`TriageBackfillSchedulerService.setupRepeatableJob`** — proven multi-instance BullMQ cron pattern. The new `TriageConsolidationScheduler` mirrors this shape verbatim (copy, don't subclass).
- **`TriageBackfillSchedulerService.findActiveTenants`** — all-tenants iteration with `isActive: true, deletedAt: null, take: 50`. All three Phase 151 handlers reuse this pattern.
- **`processDecayGcForTenant` + `processAffinityEdgeDecayForTenant`** in `triage-decay-gc.helpers.ts` — D-A3 imports these into Deep handler directly.
- **`processAffinityPromotionForTenant`** in `triage-affinity-promotion.helpers.ts` — Deep handler calls this with no body change; file stays in its current directory.
- **`weightCorrection(ageDays, { halfLifeDays })`** — Phase 149 decay helper. D-C4 REM sub-threshold roll-up invokes per-correction.
- **`TriageLearningService.flushSenderSignals`** — D-B4 invokes per touched sender. Method is public (verify); if not, minor refactor to expose.
- **`TriageLearningService.blendScores`** — Phase 149 D-02 time-aware blend. No change; Light just triggers more frequent flushes.
- **`TriageFeedbackService.MIN_DISTINCT_SENDERS_FOR_DOMAIN`** + **`ROLE_ACCOUNT_LOCAL_PARTS`** — D-C4 REM sub-threshold roll-up reuses verbatim.
- **`TriageGraphLookupService.lookup`** — unchanged; Phase 151 only mutates the edges it reads. Verify the 0.7 cutoff in D-03a still returns demoted 0.79 edges as hints.
- **`LabelAccuracyQueue`** — Phase 148 infrastructure. D-C3 enqueues. Verify enqueue method signature.
- **`pgvector` cosine_distance (`<=>`)** — native Postgres operator for D-B2.
- **`EmailEmbedding` model** — 1024-dim vectors already materialized for most emails.
- **`extractDomain` in `triage-decay-gc.helpers.ts`** — P150 D-04 shared helper. REM contradiction Kind 2 reuses.

### Established Patterns
- **Pure util + DI service split** — math utils stay DI-free. D-B2 cosine dedup follows.
- **BullMQ multi-instance safety** — named repeatable jobs with `jobId` dedup + `concurrency: 1` on the worker. Three new `jobId`s: `triage-light-consolidation`, `triage-deep-consolidation`, `triage-rem-consolidation`.
- **Tenant scoping bypass** — `withoutTenantScopingAsync` wrapper for cross-tenant iteration inside scheduler handlers. All three Phase 151 handlers use it.
- **Config pattern** — env vars via `ConfigService.get<string>('FOO', 'default')` + `parseFloat(..., 10)`. Phase 151 reads `TRIAGE_DECAY_HALF_LIFE_DAYS` (Phase 149 D-02).
- **Metric naming** — module prefix + snake_case + `_total` for counters, `_seconds` for durations, `_timestamp_seconds` for epoch gauges. D-E2 follows.
- **Prisma migration workflow (CLAUDE.md + Guards A/E/F)** — `npx prisma migrate dev --name <descriptive>` against LOCAL Postgres. Review SQL. Commit schema + migration together. Railway `migrate deploy` applies on deploy. Phase 151 migration adds 2 new tables (nullable columns only within each) — passes Guard A without `-- ALLOW-DESTRUCTIVE`.
- **Landmine §1 Option (b) find-then-create** for GraphNode writes — `prisma.$transaction` with `SELECT ... FOR UPDATE LIMIT 1`. Documented in `triage-affinity-promotion.helpers.ts` docstring. Phase 151 Deep + REM use this pattern.

### Integration Points
- **New file: `backend/src/modules/ai/consolidation/consolidation.module.ts`** — exports `TriageConsolidationScheduler`. Imports `PrismaModule`, `RedisConnectionModule`, `PrometheusModule.register()` for three new metric providers.
- **New file: `backend/src/modules/ai/consolidation/triage-consolidation.scheduler.ts`** — the scheduler + worker + three handler methods.
- **New files (if helpers extracted): `backend/src/modules/ai/consolidation/triage-light-consolidation.helpers.ts` + `triage-rem-consolidation.helpers.ts`** — planner's call per established pattern.
- **`ai.module.ts`** — add `ConsolidationModule` to imports. Do NOT remove `TriageBackfillSchedulerService` (keeps decay-gc as safety net per D-A3).
- **`TriageBackfillSchedulerService`** — delete `'affinity-promotion'` from `BackfillJobData['type']` union (line 25), delete corresponding switch case, delete `setupRepeatableJob` call for the affinity-promotion cron (line TBD — planner greps).
- **`prisma/schema.prisma`** — add 2 new models: `TriageCorrectionCluster`, `TriageConsolidationAudit`. Both have `tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)` plus indexes per D-B3 / D-D2.
- **`Tenant` model back-references** — add `triageCorrectionClusters TriageCorrectionCluster[]` and `triageConsolidationAudits TriageConsolidationAudit[]` relations (Prisma requires both sides for `onDelete: Cascade`).
- **Prometheus provider registration** — three new metrics (`triage_contradictions_found_total` counter, three `_last_run_timestamp_seconds` gauges). Follow Phase 148 D-04 / Phase 149 D-11 / Phase 150 D-07a wiring style.

### Known gotchas
- **`TriageLearningService.flushSenderSignals` may not be public** — if it's private, Phase 151 needs a thin public method (`forceFlushSenderSignalsForTenant(tenantId, senderEmails)`) that wraps it. Planner confirms during plan generation.
- **Confidence field dual-writer** — Phase 150 writes via weighted-sum math; Phase 151 REM writes via contradiction clamp (0.79). Plan docstrings must document this explicitly so future readers understand `graph_edges.confidence` is "last one of (math, contradiction-clamp) to write wins, until Phase 152 arbitrates". Phase 150 D-01a `metadata.promotionAudit.computedConfidence` MUST be preserved through the clamp (record what the math WOULD have said).
- **Queue concurrency** — all three phase handlers run on ONE worker with `concurrency: 1`. Crons at `15 * * * *`, `0 3 * * *`, `0 5 * * 0` never overlap in practice, but a stuck Deep job on Sunday night would delay that week's REM. Deep handler should have sane timeouts (planner picks).
- **Bounded contradiction oscillation** — D-D4 is explicit: if corrections keep flowing for both contradicting labels, Deep re-promotes, next REM re-demotes. This is ACCEPTED transitional behavior. Phase 152 SAFE-03 ships `frozenUntil` + auto-rollback. DO NOT pre-empt by adding cooldown logic in Phase 151.
- **Embedding absence** — `EmailEmbedding` backfill is async; D-B2 must treat missing embeddings as "not deduplicated" (no merge) to stay safer-side. NO fallback to LLM or other embedding source.
- **`MIN_DISTINCT_SENDERS_FOR_DOMAIN` + `ROLE_ACCOUNT_LOCAL_PARTS` are exported constants** — `triage-feedback.service.ts` exports them. Phase 151 D-C4 imports; do not duplicate.
- **`TriageCorrectionCluster.windowStart` column is the upsert dedup key** — must be set to the START of the hour (`date_trunc('hour', now())`), not the handler's runtime. Otherwise every hourly run creates new rows instead of upserting existing ones.

</code_context>

<specifics>
## Specific Ideas

- User invoked "deep search online best 2026 practice and new memory consolidation" as a parenthetical on the area-selection multi-select — same pattern as Phase 149 and Phase 150. Four parallel web searches ran before Area 1 discussion: OpenClaw Dreaming Apr 2026 GA, agent memory Light-phase buffer dedup, knowledge graph contradiction detection, NestJS/BullMQ module boundaries. Findings cited in `<canonical_refs>` external research.
- User took the Recommended option on every single answer EXCEPT one: **D-D3 REM action**, where they picked "Auto-demote to 0.79" over the recommended "Record only — no auto-mutation." This is a deliberate design choice to give Phase 151 active defense rather than pure detection. The implication (dual-writer on `confidence`, bounded oscillation) is locked into D-D4 and the gotchas list.
- User explicitly confirmed "remove all legacy shit file" intent in the Light-phase merge-shape question. I interpreted this as Reading 1 (non-destructive cluster table + delete stale code surfaced by the migration, NOT destructive pruning of raw `EmailTriageFeedback` rows), user confirmed "keep best strategy" — locked as D-B3 + D-B5.
- User consistently picked Recommended without revisiting prior answers. Planner should treat every Recommended pick as a deliberate, informed acceptance — NOT ambiguity to re-derive.
- Phase 149 D-07's explicit deferral ("factor a dedicated consolidation-scheduler module at that point") is being honored in D-A1. Planner does not need to re-litigate.
- The OpenClaw Dreaming `minUniqueQueries 3` gate has no direct PMSync analog (we don't have query-level retrieval metrics). D-D1 Kind 1 detection implicitly subsumes it via "distinct targetId per source" — adequate for Phase 151. Re-visit if Phase 155 dashboard wants a distinct-email count per pattern.
- SC-5 metric names differ from existing Phase 149/150 names. D-E1 documents the delta rather than introducing overlapping counters — planner must write the inline comment so operators can find the right metric for the spec clause.
- User's aggressive "auto-demote" choice in D-D3 signals they want Phase 151 Deep + REM to visibly affect triage outcomes, not be silent bookkeeping. Planner should ensure all three handlers emit INFO-level logs with counts so the nightly behavior is visible in Railway logs.

</specifics>

<deferred>
## Deferred Ideas

- **`frozenUntil DateTime?` column on `graph_edges`** + demotion-escalation sanction — Phase 152 SAFE-03 territory. D-D4 accepts bounded oscillation until then.
- **Full bitemporal supersession (`validUntil = now()` on loser, new row with `validFrom = now()`)** — Graphiti/Zep 2026 pattern. Phase 152 SAFE-03 when auto-rollback demands full edge history.
- **Accuracy-regression contradiction kind** (labelA precision drops, labelB precision rises, shared sender cohort) — Phase 152 SAFE-02. Requires Phase 148 wilson-interval correlation across tables.
- **Mutually-exclusive-label violation contradiction kind** — Phase 153 LABEL-02 hardens `mutuallyExclusiveWith[]` first.
- **Human-review UI for contradiction queue** — Phase 152 SAFE-02 reads `TriageConsolidationAudit` rows.
- **Auto-rollback on per-label accuracy drop > 15%** — Phase 152 SAFE-03.
- **Moving Phase 149's `decay-gc` job to the new consolidation scheduler** — Phase 151 deliberately leaves it on `TriageBackfillSchedulerService` as safety net (D-A3). Revisit in a cleanup phase once consolidation scheduler proves healthy.
- **Per-correction embedding artifact (`correctionEmbedding` column)** — D-B2 uses existing `EmailEmbedding`. New artifact only if cross-email correction dedup becomes load-bearing (Phase 155+).
- **Retiring Phase 150 `affinity-promotion` queue name entirely** — D-A2 renames to `deep-consolidation`. Zero references remain after migration.
- **Per-phase configurable cron via env vars** — rejected per Phase 149 D-12. Revisit only if ops demand.
- **Full-tenant accuracy sweep per nightly Deep run** — rejected in D-C3 favor of bounded fan-out on touched labels. Revisit if bounded sweep misses stale labels that accumulate error.
- **Light-phase cadence shorter than 1 hour** — rejected (SC-1 explicitly says hourly). Revisit only if correction load bursts regularly.
- **Jaccard (OpenClaw-style) instead of cosine for Light dedup** — rejected; we have 1024-dim embeddings natively via pgvector. Jaccard would require tokenizing correction text first.
- **Dashboards for consolidation health** — Phase 155 Triage Observability Dashboard.
- **Benchmarking the full Phase 150+151 learning loop** — Phase 156 E2E Validation.
- **Cross-tenant pattern aggregation** — privacy-sensitive; out of scope for v13.

### Reviewed Todos (not folded)
None reviewed — no matching todos surfaced.

</deferred>

---

*Phase: 151-dreaming-consolidation*
*Context gathered: 2026-04-24*
