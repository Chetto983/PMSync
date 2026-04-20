# Phase 149: Temporal Memory Decay - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the flat 30-day TTL semantics in the triage learning path with exponential decay (14-day half-life, env-configurable), unify the three divergent decay/TTL sites behind the existing `weightCorrection` helper, and garbage-collect patterns whose decayed confidence falls below 0.3 via a nightly job.

**In scope:**
- `weightCorrection` helper at `backend/src/modules/ai/utils/triage-correction-weight.ts` — swap binary return for exponential-decay return; add configurable half-life + minWeight params.
- `TriageLearningService` Redis EMA blend — make time-aware using existing unused `lastUpdated` field.
- `TriageCorrectionService.getFewShotExamples` — migrate inlined `Math.exp(-ageDays / 14)` to use the helper (Phase 147 D-12 divergence unification).
- `TriageFeedbackService.getSuggestions` — already imports `weightCorrection`; no call-site change, semantics change via helper.
- `TriageBackfillSchedulerService` — add nightly GC job type; extend 3 AM recalculation to use temporal weights.
- TriageOverride row GC when underlying correction weighted-count < 0.3.
- Three Prometheus metrics + env var `TRIAGE_DECAY_HALF_LIFE_DAYS` (default 14).

**Out of scope (deferred to later v13.0 phases):**
- Graph-based sender→label / domain→label edges (Phase 150).
- Dreaming consolidation Light/Deep/REM loops (Phase 151 — uses decay primitives this phase establishes but is not this phase).
- Contradiction gates, auto-rollback on accuracy drop > 15% (Phase 152).
- Per-sender histogram of decayed weights (Phase 155 observability dashboard).
- EmailTriageFeedback raw-row pruning (GDPR retention concern, handled separately).
- Raw signal buffer GC (already has 10-min TTL).
- Decay in `reranking.service.ts` (ai-chat concern, different domain; only a canonical reference pattern).
- Decay in `relationship-score.service.ts` (contacts concern, 30d half-life is intentional there).

</domain>

<decisions>
## Implementation Decisions

### Helper API & EMA Fusion
- **D-01: Pure function, explicit params.** `weightCorrection(ageDays: number, opts?: { halfLifeDays?: number; minWeight?: number }): number` stays a pure util. Defaults: `halfLifeDays = 14`, `minWeight = 0`. Call sites read env via `ConfigService` and pass `halfLifeDays` through. **Why:** Matches the existing pure-util pattern of `reranking.service.ts` (static `HALF_LIFE_DAYS` + pure `decayFactor` method). Keeps helper testable without DI container; no env mocking in unit tests. Rejected alternative: DI-wrapped service adds boilerplate for one math function.
- **D-02: Time-aware EMA blend in `TriageLearningService`.** Modify `blendScores` to accept a `dt` parameter (time since previous `lastUpdated`). New formula: `effectivePrevWeight = EMA_PREV_WEIGHT * exp(-ln2/halfLife * dt_days)`. The existing `SenderBehaviorScore.lastUpdated` ISO string is already tracked but unused — wire it into `flushSenderSignals` as the clock source. **Why:** Success criterion #1 conflates two concepts (batch-count EMA and time decay). Fusing them via time-weighted blend weight (Boyd/Luxenberg EWMM pattern, arxiv 2404.08136) resolves the ambiguity: recent signals dominate naturally, stale scores decay toward irrelevance before GC even sees them. Rejected alternative: decay-on-read pushes the cost to every scorer read path and makes "what is this score?" ambiguous across the codebase.
- **D-03: Redis TTL becomes outer hygiene backstop, not primary aging mechanism.** Bump `REDIS_TTL_SECONDS` from 30d to `halfLifeDays * 4` seconds (= 56 days at default 14d half-life = 4 half-lives = weight ~0.0625, well below threshold). **Why:** GC does the real work via decay math; Redis TTL exists only to prevent unbounded hash growth if the nightly job fails for weeks. Auto-scales if env half-life is tuned up. Rejected alternative: removing TTL entirely relies on cron liveness for correctness — unacceptable risk given Railway deploy restarts can drop jobs.

### GC Scope & Store Semantics
- **D-04: GC targets two stores only.** (1) Redis `triage:sender-scores:{tenantId}` hash fields whose decayed sender score drops below 0.3. (2) `TriageOverride` DB rows whose underlying weighted-correction count drops below 0.3. **Out of scope this phase:** raw `EmailTriageFeedback` rows (retention is a GDPR concern, not staleness), `triage:signal-buffer:*` lists (already 10-min TTL). **Why:** Criterion #3's "patterns" maps unambiguously to these two pattern stores. Raw feedback rows are ground-truth signals — pruning them breaks Phase 148's TP sweeper and future Phase 155 analytics.
- **D-05: Hard-delete semantics; Prometheus counters are the audit trail.** Redis: `HDEL` hash fields. Postgres: `prisma.triageOverride.deleteMany({ where: ... })`. No `prunedAt` column added. Hard delete + counter emission matches the existing `orphan-embedding-cleanup.service.ts` pattern. **Why:** Avoids a blocking Prisma migration and a query-filter sweep across every TriageOverride read site. Recoverability via the upstream EmailTriageFeedback raw rows — a pruned override re-promotes from the next correction signal. Prometheus `triage_patterns_gc_total` labeled by `store` + `tenant_id` satisfies audit needs. Rejected alternative: soft-prune adds schema weight for a recoverable operation.
- **D-06: TriageOverride "confidence" recomputed at GC time from EmailTriageFeedback.** The nightly GC re-runs the Phase 147 D-09b math (`sum(count * exp(-age_days / halfLife))`) across `EmailTriageFeedback` rows that spawned each override. If the weighted-count < 0.3, GC the override. No new schema column, no `lastReinforced` tracking. **Why:** Uses existing data; no Prisma migration. Naturally accounts for reinforcement — if newer corrections match the same (sender, target-label) pair, the decayed-sum stays above threshold. Rejected alternative: stored `confidence` + `lastReinforced` columns require a blocking migration and correction-consumer wiring.

### Scheduler & Job Wiring
- **D-07: Extend `TriageBackfillSchedulerService` with a new `decay-gc` job type.** Add `'decay-gc'` to `BackfillJobData['type']` union and a new case in the worker's switch. **Why:** Zero new infrastructure, matches the existing scheduler's established pattern (`'scheduled' | 'manual' | 'recalculation'`). Dedicated `TriageDecayService` is NestJS-idiomatic but adds boilerplate for a single scheduled sweep. Phase 151 will later introduce dedicated consolidation services — that's the right moment to split, not this phase.
- **D-08: Cron `0 3 * * *` — nightly 3 AM, same slot as recalc.** Single repeatable job name `triage-nightly-decay-gc` with BullMQ `jobId` for deduplication across multi-instance. **Why:** Criterion #3 says "nightly." Deterministic ordering with recalc when they share a job (see D-09). Matches existing pattern in `setupRepeatableJob`.
- **D-09: GC runs FIRST, then recalculation, per tenant, in the same job handler.** Worker handler for `'decay-gc'` invokes GC sweep across all active tenants, then internally triggers the existing `processRecalculation` for the same tenant set. **Why:** Recalc reads a clean, GC'd Redis hash + surviving overrides; no cycles wasted scoring soon-to-be-deleted patterns. Avoids the race where recalc touches a pattern and GC immediately deletes it. One atomic nightly pass per tenant. (Implementation detail for planner: the `'recalculation'` job type can be retired once `'decay-gc'` absorbs it, or kept as an alias that redispatches — planner's call.)
- **D-10: All active tenants per run, bounded pagination.** `prisma.tenant.findMany({ where: { isActive: true, deletedAt: null }, take: 50 })` with `sleep(500)` between tenants. Matches existing `processRecalculation` pattern. **Why:** Single job ID simplifies queue observability; fan-out-per-tenant is overkill for a nightly sweep. Railway has a single worker instance — fan-out buys nothing and adds queue noise.

### Observability & Rollout Safety
- **D-11: Three Prometheus metrics ship this phase.** All under `triage_` prefix, snake_case, Prometheus canonical suffixes (verified against Prometheus naming guide + 2026 metric-naming conventions):
  - `triage_patterns_gc_total` — counter. Labels: `store` (`redis_sender_scores` | `triage_override`), `tenant_id`. Incremented per delete.
  - `triage_decay_half_life_seconds` — gauge. Exposes configured half-life in seconds (= `halfLifeDays * 86400`). Enables tuning observability without log-grep. Canonical base unit per Prometheus convention (not `_days`).
  - `triage_decay_last_run_timestamp_seconds` — gauge. `Date.now() / 1000` at end of each GC pass. Powers alerting on silent job failures (`now - gauge > 90000`).
  **Deferred:** per-sender-score histogram of surviving weights — cardinality risk, belongs in Phase 155 dashboard work.
- **D-12: No new feature flag. `TRIAGE_DECAY_HALF_LIFE_DAYS=9999` is the rollback switch.** Setting an absurdly large half-life effectively disables decay (weights stay ~1.0 forever for any realistic age). If production misbehaves, bump the env var and redeploy — single Railway push restart. **Why:** Flags-for-safety-not-features (Octopus 2025 12 commandments). One less flag to clean up; one less branch in the helper. Rejected alternative: dedicated `TRIAGE_DECAY_MODE=exponential|binary` requires removing the flag + binary branch later, which becomes dead-code tech debt.
- **D-13: Rewrite existing `weightCorrection` test suite.** The 7 cases in `backend/src/modules/ai/utils/__tests__/triage-correction-weight.spec.ts` assert `toBe(1)` / `toBe(0)` — these assert the CURRENT semantics, not a desired invariant. Semantics are intentionally changing this phase, so rewriting the assertions is correct per CLAUDE.md's "fix the code, not the tests" — because here the *spec* changes, not a broken implementation. Add property-based tests: monotone decreasing with `ageDays`, bounded `[minWeight, 1]`, `weightCorrection(halfLife) ≈ 0.5`, `weightCorrection(0) === 1`, `weightCorrection(halfLife * 2) ≈ 0.25`.
- **D-14: Natural decay on first production run — no backfill script, no dry-run mode.** Existing Redis `SenderBehaviorScore.lastUpdated` ISO strings are bounded by the current 30d TTL, so pass-1 decay will GC entries older than ~24.3 days (the weight=0.3 threshold) but leave everything younger intact. Math: `ln(0.3) / -(ln2/14) ≈ 24.3 days`. Existing TTL already limits exposure; no one-shot migration needed. **Why:** Matches the "swap is mechanical" spirit of Phase 147 D-12. Dry-run mode adds an extra deploy gate for negligible safety benefit given D-12 kill switch exists.

### Claude's Discretion
- Helper file layout decision: whether to add `decayWeight(ageDays, opts)` as a separate named export alongside `weightCorrection` for semantic clarity, or overload `weightCorrection` to handle both correction-weighting and generic-pattern-weighting. Planner decides based on how many call sites end up sharing the function.
- Prometheus client library integration (prom-client vs existing nestjs-prometheus setup) — wire to whatever pattern is already established in the ai module.
- Tenant-iteration error handling: try/catch per tenant with Prometheus failure counter, or log-and-continue — standard scheduler defensive-loop pattern applies.
- Exact shape of the new BullMQ job handler (extract to `processDecayGc(job)` private method vs inline) — follow `processRecalculation` style.

### Folded Todos
None — no pending todos matched Phase 149 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prior phase contracts (mandatory)
- `.planning/phases/147-feedback-loop/147-CONTEXT.md` — especially D-09b (frequency × recency_decay with 14d half-life already in-flight), D-12 (weightCorrection helper extraction, divergence note on `TriageCorrectionService.getFewShotExamples` inlining `Math.exp(-ageDays / 14)`).
- `.planning/phases/148-label-accuracy/148-CONTEXT.md` — D-01 (14-day primitive is load-bearing across v13.0; single source of truth in `triage-correction-weight.ts`; DO NOT hardcode `14`).
- `.planning/milestones/v13.0-ROADMAP.md` §Phase 149 — the 4 locked success criteria + LEARN-04 requirement mapping.

### In-scope source files
- `backend/src/modules/ai/utils/triage-correction-weight.ts` — the helper to swap. Read the existing comment block; it documents the pre-stage contract.
- `backend/src/modules/ai/utils/__tests__/triage-correction-weight.spec.ts` — 7 existing tests, rewrite per D-13.
- `backend/src/modules/ai/services/triage-learning.service.ts` — EMA blend site (D-02), `REDIS_TTL_SECONDS` (D-03), `SenderBehaviorScore.lastUpdated` currently tracked but unused.
- `backend/src/modules/ai/services/triage-correction.service.ts` — migrates inlined `DECAY_HALF_LIFE_DAYS = 14` / `Math.exp(-ageDays / DECAY_HALF_LIFE_DAYS)` to use the helper (D-01 unification resolves 147 D-12 divergence).
- `backend/src/modules/ai/services/triage-feedback.service.ts` (line 240) — `weightCorrection(ageDays)` call site; no call-site change, semantics change via helper.
- `backend/src/modules/ai/services/triage-backfill-scheduler.service.ts` — extension site for `decay-gc` job type (D-07, D-08, D-09, D-10). Existing `processRecalculation` (line 307+) is the ordering anchor.

### Reference implementation (do NOT modify — pattern source only)
- `backend/src/modules/ai-chat/services/reranking.service.ts` — proven `exp(-ln2 / halfLife * ageDays)` with `MIN_RECENCY_FACTOR` clamp. Copy the formula, copy the test style, copy the static-member pattern. DO NOT reimplement from scratch.

### Adjacent decay code (explicitly out of scope — do not touch)
- `backend/src/modules/contacts/services/relationship-score.service.ts` (30-day half-life, different domain).

### External research (inform, do not recite)
- Luxenberg & Boyd (2024), "Exponentially Weighted Moving Models" — formal basis for time-aware EMA (`prevWeight = exp(-α·dt)`). https://arxiv.org/abs/2404.08136
- Prometheus naming guide (https://prometheus.io/docs/practices/naming/) — confirms `_total` suffix for counters, `_seconds` base unit, `_timestamp_seconds` for epoch gauges. Applied to D-11.
- Octopus Deploy (2025), "The 12 Commandments Of Feature Flags" — "flags for safety, not features." Applied to D-12.
- BullMQ docs §Repeatable Jobs + Job Schedulers (https://docs.bullmq.io/guide/job-schedulers) — confirms `jobId` + `repeat.pattern` dedup in multi-instance.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `reranking.service.ts` — textbook implementation of the exact formula we need. `Math.exp(-RerankingService.LN_TWO / RerankingService.HALF_LIFE_DAYS * ageDays)` with `MIN_RECENCY_FACTOR = 0.05` clamp. Planner should literally copy-paste the math and adjust constants.
- `TriageBackfillSchedulerService.setupRepeatableJob` — working multi-instance cron pattern with BullMQ `jobId` + `repeat.pattern`. New `decay-gc` job slots directly into this function.
- `TriageBackfillSchedulerService.findActiveTenants` — all-tenants iteration pattern with `isActive: true, deletedAt: null` filter + `take: 50` bound. GC sweep reuses verbatim.
- `orphan-embedding-cleanup.service.ts` — hard-delete + Prometheus counter audit pattern, directly transferable to D-05 TriageOverride deletion.
- `SenderBehaviorScore.lastUpdated` — ISO string field already emitted on every blend (`computeScoreFromSignals` sets it to `new Date().toISOString()`). Wire directly into D-02 time-aware blend; no schema change.

### Established Patterns
- **Pure util pattern:** `backend/src/modules/ai/utils/*.ts` stays DI-free. Services inject ConfigService and pass config into utils. D-01 follows this.
- **Redis key prefix:** `triage:sender-scores:{tenantId}` + `triage:signal-buffer:{tenantId}:{senderEmail}`. GC walks the first namespace only; never touches the buffer namespace.
- **BullMQ multi-instance safety:** Named repeatable jobs with `jobId` for dedup + `concurrency: 1` on the worker. Existing pattern; reuse for `decay-gc`.
- **Tenant scoping bypass:** `withoutTenantScopingAsync` wraps scheduler worker callbacks because cross-tenant iteration requires it. D-10 sweep inherits this.
- **Config pattern:** Env vars read via `ConfigService.get<string>('FOO', 'default')` then `parseInt(..., 10)`. `TRIAGE_DECAY_HALF_LIFE_DAYS` follows this.
- **Metric naming:** module prefix + snake_case + `_total` for counters. `triage_promotion_*` already exists in the module — `triage_patterns_gc_total` fits.

### Integration Points
- `ai.module.ts` — add `ConfigService` dep to any service that reads the new env var (likely already present).
- `TriageBackfillSchedulerService` constructor — already takes `@Optional() TriageLearningService`. Add `@Optional() PrismaService` if not already present for TriageOverride delete.
- `TriageCorrectionService` — remove the local `DECAY_HALF_LIFE_DAYS = 14` constant (line 13) and the inlined `Math.exp(-ageDays / DECAY_HALF_LIFE_DAYS)` call (line 80). Replace with `weightCorrection(ageDays, { halfLifeDays })` where `halfLifeDays` comes from ConfigService. This closes the 147 D-12 divergence.
- `TriageFeedbackService` — no call-site edits; `weightCorrection(ageDays)` already imported on line 4. Semantics flip via helper.
- `label-accuracy.sweeper.service.ts` — uses `TP_IMPLICIT_WINDOW_DAYS` from the same utils file. That constant stays `14` (separate from half-life), but if Phase 149 ever parameterizes it via env, revisit Phase 148 D-01 wording.

</code_context>

<specifics>
## Specific Ideas

- User explicitly asked for "deep search best 2026 pattern" research during the discussion. Web research was performed for each area before presenting questions (Boyd/Luxenberg 2024 EWMM paper for D-02, Prometheus naming convention for D-11, Octopus 2025 feature flags for D-12). Sources cited in canonical_refs.
- User consistently took the recommended option on every question. This is a signal that the pre-staging from Phase 147/148 did its job — the gray areas are genuinely narrow and the recommendations were well-calibrated. Planner should NOT assume ambiguity where the user clicked through quickly; these are deliberate, informed acceptances of the recommended path.
- User initially missed the multiSelect intent on "which stores to GC" (Area 2a) — picked only Redis, then confirmed TriageOverride is in-scope via the follow-up question. This is now unambiguous in D-04.
- Small semantic correction applied during discussion: gauge metric renamed from `_half_life_days` to `_half_life_seconds` to match Prometheus canonical base units. The env var name `TRIAGE_DECAY_HALF_LIFE_DAYS` stays in human-friendly units (days); the exposed gauge converts to seconds.

</specifics>

<deferred>
## Deferred Ideas

- **Per-sender-score histogram of surviving weights** — useful for tuning the 0.3 threshold empirically. Cardinality risk with tenant_id label. Revisit in Phase 155 (Triage Observability Dashboard) with proper aggregation buckets.
- **Unify decay half-life across reranking.service.ts + triage** — currently both use 14d but via independent constants. Worth considering a single `backend/src/common/decay.ts` if a third call site emerges; not worth the refactor just for two.
- **Dedicated `TriageDecayService`** — D-07 extends the scheduler instead. If Phase 151 (Dreaming Consolidation) ends up with 3+ scheduled sweeps (Light/Deep/REM), factor a dedicated consolidation-scheduler module out at that point.
- **`TRIAGE_GC_ENABLED` flag for one-week canary** — rejected in D-12 (env var half-life is the kill switch). If prod behavior is surprising on first deploy, revisit.
- **Soft-prune TriageOverride with `prunedAt` column** — D-05 chose hard delete. If audit regulations change or a "show me what the system forgot" UX surfaces, add the column then.
- **EmailTriageFeedback retention policy** — separate GDPR concern, not this phase. Phase 152 (Safety Governance) is the natural home if it surfaces there; otherwise a standalone compliance-driven phase.

### Reviewed Todos (not folded)
None reviewed — no matching todos surfaced.

</deferred>

---

*Phase: 149-temporal-decay*
*Context gathered: 2026-04-20*
