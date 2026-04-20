# Phase 148: Per-Label Accuracy Profiles - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Track precision and recall per label so users and the system can measure whether triage is improving or degrading. Delivers: a `LabelAccuracyProfile` Prisma model that stores per-label TP/FP/FN counters for explicit windows, an async event-driven updater wired to the existing Phase 147 `recordFeedback` path, a delayed true-positive "sweeper" cron, a read API, and a traffic-light accuracy badge on the label-settings list. Publishes an `AccuracyDelta` event channel so Phase 151/152 (safety governance auto-rollback) and Phase 155 (dashboard) can subscribe.

**Out of scope (deferred to later v13.0 phases):**
- Temporal exponential decay of correction weights (Phase 149 — Phase 148 intentionally uses the same 14-day primitive so the swap is mechanical)
- Graph-based sender/domain → label edges (Phase 150)
- Light/Deep/REM consolidation phases (Phase 151)
- The actual rollback execution + audit table (Phase 152 consumes 148's event stream)
- Dashboard UI beyond a single per-label badge (Phase 155)
- Wiring `lane_correction` / `urgency_correction` / `followup_dismiss` signal types (Phase 147 left these dormant; 148 does not touch them either)
- Label creation hardening (Phase 153)

</domain>

<decisions>
## Implementation Decisions

### TP/FP/FN semantics (A1)

- **D-01: Implicit TP window = 14 days.** An AI-applied label on `Email.aiLabels` that is never touched by the user (no `EmailTriageFeedback` row referencing that `(emailId, label)` pair) for ≥14 days after `EmailAnalysis.processedAt` counts as a true positive for that label. The 14-day primitive is deliberately the same constant Phase 149 will promote into `weightCorrection(ageDays)` (Phase 147 D-12 helper at `backend/src/modules/ai/utils/triage-correction-weight.ts`). **Why:** Gmail Priority Inbox's classifier credits "no action" as a weak label only inside a bounded window (Aberdeen et al.); unbounded "lifetime TP" lets unopened/archived emails permanently inflate precision. 14d matches Phase 149's 14-day half-life so future-us swaps one constant, not the semantics.

- **D-02: Both `signal='correction'` AND `signal='edit'` count as FP** for the AI label that was removed. No weighting split this phase — both feedback rows mutate the FP counter by +1. The `signal` column on `EmailTriageFeedback` is preserved per row so the tooltip/dashboard in Phase 155 can later disambiguate explicit vs inferred corrections. **Why:** multi-label classification standard (Synthesio / Evidently) treats any removal as a prediction disagreement. Weighting (e.g., correction=1.0, edit=0.5) would require non-integer counter math and a heavier schema — not worth the signal/noise gain given `correction` volume is ~0.1% per RLUF (D-01 rationale from Phase 147).

- **D-03: Swap (remove L, add M) produces two mutations.** Removing AI-suggested label L while adding label M → FP+1 for L AND FN+1 for M. Both labels get a learning signal. Unblocks Phase 150's sender→label and domain→label graph edges — both edges need the pointing-to-correct-label signal. **Why:** One-sided tracking (FP-only) means recall for label M stays flat forever, violating OBS-01's "per-label recall tracked" requirement.

- **D-04: `added_personal_label` (auto-diff) excluded from accuracy math.** Per Phase 147 D-01's classification: if the user adds a label AI never suggested for this user (`added_personal_label`), that is personal organization, NOT a correction. It does not touch `LabelAccuracyProfile`. Only `added_back_correction` (label was in past AI suggestions for this user) fires FN. This matches Phase 147's guard against the Gmail-Priority-Inbox / Notion-AI classifier-poisoning anti-pattern.

### Update timing & stratification (A2)

- **D-05: Async event + idempotent upsert.** `TriageFeedbackService.captureLabelDiff()` and `TriageFeedbackService.recordFeedback()` (both existing Phase 147 entry points in `email-crud.service.ts:312` and `:360`) publish a typed `LabelAccuracyEvent` via NestJS `EventEmitter2`. A new `LabelAccuracyListener` subscribes and enqueues to a new BullMQ queue `'accuracy-update'`. Worker upserts counters on `LabelAccuracyProfile`. Dedup key: `accuracy:${tenantId}:${feedbackId}:${labelId}:${kind}` where `kind ∈ {'fp', 'fn', 'tp'}` — prevents double-count on job retry. **Why:** Phase 147 D-01 explicitly mandates "NEVER inside the transaction" for feedback-derived side effects. An event + queue keeps the API response latency unchanged and aligns with existing `triage-promotion.queue.ts` pattern.

- **D-06: Nightly TP sweeper cron at `'37 4 * * *'`.** New `ScheduledJobType.TRIAGE_ACCURACY_SWEEP` added to `backend/src/common/services/scheduled-jobs.queue.ts` enum + `SCHEDULED_JOB_PATTERNS`. Cron pattern `'37 4 * * *'` deliberately 20 minutes off the Phase 147 `TRIAGE_PROMOTION_SAFETY_NET` at `'17 4 * * *'` — respects the Phase 147 anti-thundering-herd rule. Handler:
  1. `SELECT DISTINCT tenant_id FROM email_triage_feedback WHERE created_at > now() - interval '24 hours'` (same fan-out idiom as the promotion safety-net).
  2. For each tenant, enqueue `'accuracy-sweep'` job with `Math.random() * 60_000` ms jitter.
  3. Per-tenant worker: query `Email` rows where `processedAt BETWEEN now() - interval '15 days' AND now() - interval '14 days'` AND `aiLabels IS NOT NULL` (bounded 1-day sweep-window slice, drives idempotency). For each `(email, aiLabel)` pair, check that no `EmailTriageFeedback` row exists with `emailId = email.id AND (newValue = aiLabel OR oldValue = aiLabel)` for the entire period from `processedAt` to now. If clean → resolve `aiLabel` to `labelId` via `UserLabel.slug` (or name) lookup → TP+1 upsert on `LabelAccuracyProfile`.
  4. Watermark stored in Redis key `triage:accuracy-sweep:last-processed:${tenantId}` (ISO timestamp) — next run's slice starts where last ended. 25-hour overlap tolerated (cheaper than a missed slice).
  - **Why:** exactly the "delayed-label" streaming pattern from arXiv:2409.10111 — batch-incremental performs on par with pure-instance-incremental under delayed labels, with a fraction of the write amplification.

- **D-07: Two-table schema — windowed profile + triageSource rollup.**
  - **Primary:** `LabelAccuracyProfile` keyed `(tenantId, labelId, windowKey)` where `windowKey ∈ {'7d', '30d', 'all'}`. Columns: `tp Int`, `fp Int`, `fn Int`, `sampleSize Int` (= tp+fp+fn), `precision Float?`, `recall Float?`, `f1 Float?`, `wilsonPrecLow Float?`, `wilsonPrecHigh Float?`, `wilsonRecLow Float?`, `wilsonRecHigh Float?`, `lastUpdatedAt DateTime`. Precision/recall/F1/Wilson bounds are **materialized on write** for read-cheap API (denormalization OK because API is hot path, writes are batched by queue dedup). Three rows per label; 20 labels per tenant → 60 rows per tenant.
  - **Secondary:** `LabelAccuracySourceBreakdown` keyed `(tenantId, labelId, triageSource, windowKey)` where `triageSource ∈ {'llm', 'rule', 'llm+rule'}`. Same counter columns. Enables the D-08-pre-staged "rule-bypassed vs LLM-classified" split that Phase 155 dashboards need and Phase 152 auto-rollback may reference.
  - Rolling windows implemented via the sweeper and a dedicated window-rollover cron path (D-08 below). NOT implemented via per-day buckets — bucket option was rejected because Phase 148 only needs 7d/30d/all, not arbitrary ranges (Phase 155 dashboard can add daily buckets later if needed; that'd be a Phase 155 schema extension, not a 148 requirement).

- **D-08: Window-rollover semantics.** `windowKey='7d'` and `'30d'` counters are NOT monotonically increasing lifetime counts — they represent the current rolling window. The nightly sweeper handles both directions: on each run, for each `(tenantId, labelId, windowKey)` row:
  - **FP/FN decrement:** decrement the counter by the number of `EmailTriageFeedback` rows that aged OUT of the window on this sweep's day slice.
  - **TP decrement:** decrement by the number of TP-credited `(email, label)` pairs where `Email.processedAt + 14d` now falls outside the window start.
  - Idempotency: maintain a "last rollover watermark" per row in the same table or a sibling `LabelAccuracyRollover` table. `windowKey='all'` is append-only (monotonic), no decrement.
  - This keeps the rolling window accurate without a daily-bucket table. Trade-off: rollover math adds complexity to the nightly sweeper — Claude's discretion to implement as a second sweeper job or a second pass in the same job.

### API + Frontend badge UX (A3)

- **D-09: Single endpoint `GET /api/ai/triage/label-accuracy`.** New route on the existing `TriageOverridesController` (or a new `TriageAccuracyController` under `backend/src/modules/ai/controllers/` — Claude's discretion). Auth: `TenantGuard` (standard cookie-based session auth — NOT admin-only; every authenticated user of the tenant sees their tenant's label accuracy). Response shape:
  ```ts
  {
    labels: Array<{
      labelId: string;
      labelName: string;
      labelSlug: string;
      windows: {
        '7d':  { precision, recall, f1, tp, fp, fn, sampleSize,
                 wilsonPrecLow, wilsonPrecHigh,
                 wilsonRecLow, wilsonRecHigh,
                 state: 'learning' | 'ready' };
        '30d': { ... };
        'all': { ... };
      };
      triageSourceBreakdown?: {
        llm:       { precision, recall, f1, sampleSize } | null;
        rule:      { precision, recall, f1, sampleSize } | null;
        'llm+rule': { precision, recall, f1, sampleSize } | null;
      };
      lastUpdatedAt: string; // ISO
    }>;
    computedAt: string;
  }
  ```
  Query params: `?windows=7d,30d,all` (default all three), `?includeBreakdown=true` (default false; opt-in to keep payload small for the settings page which only needs the '30d' pill). Pagination: NOT needed — 20 labels per tenant is bounded. Cache: TanStack Query `staleTime: 5min`, `gcTime: 30min` (matches CLAUDE.md frontend pattern).

- **D-10: Traffic-light F1 pill + Wilson-CI tooltip.** Small color pill on each `LabelTreeItem` row (`frontend/components/email/labels/LabelTreeItem.tsx`): green when F1 ≥ 0.85, yellow 0.6–0.84, red < 0.6. The pill shows just the F1 integer percent (`"91%"`). On hover/tap, MUI `Tooltip` reveals:
  ```
  Precision: 91%  (±4% at 95% CI)
  Recall:    84%  (±6% at 95% CI)
  Based on 47 corrections over the last 30 days
  ```
  Wilson score interval (95%) used for the ±W% bounds (already materialized on `LabelAccuracyProfile`). Uses MUI theme colors — `success.main`, `warning.main`, `error.main` — NOT hardcoded.

- **D-11: "Learning…" state threshold n=20.** When `sampleSize < 20` for the 30d window, the pill renders neutral gray with label `"Learning…"` and the tooltip reads `"Not enough corrections yet (N/20). Accuracy tracking starts after 20 feedback events."`. Threshold 20 is where Wilson CI half-width falls below ±15% at p≈0.8 — the point where the number stops being noise. NOT configurable per-tenant this phase (YAGNI — research consensus is n=10–20 universally).

- **D-12: i18n strings.** All badge strings live in `frontend/locales/en.ts` and `it.ts` under `t.labels.accuracy.*`:
  - `t.labels.accuracy.pill.ready(percent)` → `"{percent}%"` (just the number, locale-neutral)
  - `t.labels.accuracy.pill.learning` → `"Learning…"` / `"Imparo…"`
  - `t.labels.accuracy.tooltip.precision(value, ci)` → `"Precision: {value}%  (±{ci}% at 95% CI)"`
  - `t.labels.accuracy.tooltip.recall(value, ci)`
  - `t.labels.accuracy.tooltip.sampleSize(n, windowDays)` → `"Based on {n} corrections over the last {windowDays} days"`
  - `t.labels.accuracy.tooltip.learning(current, threshold)` → `"Not enough corrections yet ({current}/{threshold}). Accuracy tracking starts after {threshold} feedback events."`
  - `t.labels.accuracy.source.llm` / `.rule` / `.llmRule` — for the Phase 155 dashboard (add now, used later)

### Prometheus + backfill + model fit (A4)

- **D-13: Aggregated-only Prometheus exposure.** Three gauges + one counter. Per-label per-tenant gauges rejected (cardinality bomb: 1000 tenants × 20 labels × 3 windows × 3 source variants = 180k series per gauge — 2026 Prometheus best practice caps per-label values ~100).
  - `triage_accuracy_precision{tenant_id?, window}` Gauge — micro-averaged (sum TPs across all labels in the window / sum TPs+FPs). `tenant_id` label optional — gate behind `TRIAGE_METRICS_PER_TENANT=true` env (default OFF to stay under cardinality budget).
  - `triage_accuracy_recall{tenant_id?, window}` Gauge.
  - `triage_accuracy_f1{tenant_id?, window}` Gauge.
  - `triage_accuracy_corrections_total{signal, triage_source, kind}` Counter — `signal ∈ {'edit','correction'}`, `triage_source ∈ {'llm','rule','llm+rule'}`, `kind ∈ {'fp','fn','tp_credited'}`. NO `tenant_id` label. Bounded at 2×3×3 = 18 series total.
  - Gauges updated by the nightly sweeper (after rollover math). Counter incremented by the event listener inline.
  - Registered in `backend/src/common/metrics/metrics.module.ts` via `makeGaugeProvider`/`makeCounterProvider` — follows the existing Phase 46-01 pattern.

- **D-14: 30-day backfill on migration deploy.** One-time backfill script `backend/scripts/148-backfill-label-accuracy.ts` (scripts/ folder per CLAUDE.md file rules). Run post-migration, per-tenant, bounded to the last 30 days:
  1. `SELECT * FROM email_triage_feedback WHERE created_at > now() - interval '30 days'` grouped by `(tenantId, newValue as label, oldValue as label, signal)`.
  2. For each feedback row: resolve label strings → `labelId` (via `UserLabel.slug` / name lookup per tenant), apply D-02/D-03 mutations to `LabelAccuracyProfile` counters across all three windows.
  3. TP backfill pass: `SELECT email_id, ai_labels, processed_at FROM email_analyses ea JOIN emails e ON ... WHERE processed_at BETWEEN now() - interval '44 days' AND now() - interval '14 days'` AND no correction feedback for `(email_id, label)`. TP+1 per pair.
  4. Pre/post check: row-count and sum-of-counters verification logged; script exits non-zero on mismatch.
  - **Why:** expand→backfill→contract pattern (ml4devs/Acceldata 2026 guidance). 30d bounds the migration risk. Day-1 UX: users see real badges immediately instead of 30–45 days of "Learning…" across every label.
  - **Idempotency:** script can be re-run safely — dedup by `(tenantId, labelId, windowKey)` upsert; TP pass deduped by `(tenantId, emailId, labelId)` "backfilled" flag in a temp table (or a seed-column on `LabelAccuracyProfile`).

- **D-15: `AccuracyDelta` event channel.** After every profile mutation (both inline FP/FN writes AND nightly sweeper rollover), publish a typed event on NestJS `EventEmitter2` topic `'triage.accuracy.changed'`:
  ```ts
  interface AccuracyDeltaEvent {
    tenantId: string;
    labelId: string;
    windowKey: '7d' | '30d' | 'all';
    before: { precision: number | null; recall: number | null; f1: number | null; sampleSize: number };
    after:  { precision: number | null; recall: number | null; f1: number | null; sampleSize: number };
    deltaF1: number | null;       // null if before or after was 'learning' state
    triageSource?: 'llm' | 'rule' | 'llm+rule'; // set when mutation came from source breakdown path
    at: string; // ISO
  }
  ```
  Phase 151/152 subscribe for the >15% regression auto-rollback trigger (Phase 152 SAFE-02). Phase 155 subscribes for real-time dashboard push. **Phase 148 ships zero consumer code** — the event is the public contract. Document the contract shape in `backend/src/modules/ai/services/label-accuracy.events.ts` as a new file.

- **D-16: `LabelAccuracyProfile` is net-new.** Confirmed: existing `AgentLearningProfile` (schema.prisma:1382) is keyed `(tenantId, userId, agentName, actionType)` and tracks HITL approval stats (approvedCount, rejectedCount, confidenceBoost) — different semantic (per-agent-per-action, not per-label). No extension/reuse. New tables via `npx prisma migrate dev --name 148_label_accuracy_profiles`.

### Claude's Discretion

- Whether to put `LabelAccuracyListener` alongside the existing triage services (`backend/src/modules/ai/services/label-accuracy.service.ts`) or in a dedicated `backend/src/modules/ai/services/accuracy/` subdirectory. Given the cluster of triage services now topping 11 files, a sub-dir is defensible but not required.
- Exact BullMQ worker file layout: reuse `base.worker.ts` pattern, name `accuracy-update.worker.ts`.
- Whether the window-rollover pass is a second BullMQ job within the same cron slot OR a second-pass iteration inside the sweeper handler. Both acceptable as long as idempotency and watermarking are preserved.
- Decision on whether to put the badge pill inline in `LabelTreeItem.tsx` or extract `<LabelAccuracyBadge />` as a sibling component — extraction is cleaner and enables reuse by the Phase 155 dashboard, but a 30-line inline block in `LabelTreeItem` is acceptable if it reads naturally.
- Exact Wilson-score formula implementation path: `backend/src/modules/ai/utils/wilson-interval.ts` (new file) OR inline in the accuracy-update worker. New utility is the more testable choice.
- Exactly which triage-correction-weight helper imports `weightCorrection` and how. Phase 147's helper returns a 30d binary today; Phase 148's math does NOT call it (148 is not about decay, it's about counting). 148 may import `weightCorrection` for the sweeper's rollover pass IF it turns out decay needs to affect TP credit — but defaults to not calling it.

### Folded Todos

None — this discussion did not surface backlog items to fold.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 148 — Existing Phase 147 Integration Surface (must read)
- `backend/src/modules/ai/services/triage-feedback.service.ts` — `recordFeedback()` and `captureLabelDiff()` are the two Phase 147 entry points where `LabelAccuracyEvent` is emitted.
- `backend/src/modules/email/services/email-crud.service.ts` §`updateEmail` (lines ~300–334) — auto-diff path; `captureLabelDiff` fire-and-forget call site. NEVER place accuracy logic inside the transaction per Phase 147 D-01.
- `backend/src/modules/email/services/email-crud.service.ts` §`correctTriage` (lines ~343–400) — explicit `signal='correction'` path.
- `backend/prisma/schema.prisma` §`EmailTriageFeedback` (lines 2558–2574) — `signal` column discriminator + `type` + `oldValue`/`newValue`. This is the event source of truth.
- `backend/prisma/schema.prisma` §`EmailAnalysis.triageSource` (line 1368) — enables the `LabelAccuracySourceBreakdown` table's `triageSource` dimension per D-07. Values: `'llm' | 'rule' | 'llm+rule'`.
- `backend/prisma/schema.prisma` §`Email.aiLabels` (line 547) — the AI-applied label list that the TP sweeper scans. String array, NOT labelId; resolution via `UserLabel.slug`/name lookup per D-06.
- `backend/prisma/schema.prisma` §`UserLabel` (lines 670–702) — label resolution target. `slug` is the canonical key (`@@unique([tenantId, slug])`).
- `backend/prisma/schema.prisma` §`AgentLearningProfile` (lines 1382–1407) — referenced ONLY to confirm non-reuse per D-16. Do NOT extend; do NOT merge.

### Phase 148 — Queue & Cron Infrastructure (must read)
- `backend/src/common/services/scheduled-jobs.queue.ts` lines 32–135 — `ScheduledJobType` enum + `SCHEDULED_JOB_PATTERNS`. Add `TRIAGE_ACCURACY_SWEEP = 'triage-accuracy-sweep'` at cron `'37 4 * * *'`. Do NOT use `0 3 * * *` or `17 4 * * *` minute slots (Phase 147 anti-thundering-herd rule).
- `backend/src/modules/ai/services/triage-promotion.queue.ts` — existing BullMQ queue pattern for the new `'accuracy-update'` queue and sweeper worker. Mirror its dedup-key and deduplication.ttl idiom.
- `backend/src/common/workers/base.worker.ts` — pattern for new `accuracy-update.worker.ts` (shared worker connection, post-Phase 146 RAM-harden discipline).
- `backend/src/common/config/queue.config.ts` — `QUEUE_NAMES` registry. Register `'accuracy-update'` queue name here.

### Phase 148 — Metrics Module (must read)
- `backend/src/common/metrics/metrics.module.ts` — Phase 46-01 `PrometheusModule` pattern. Add 3 Gauge providers + 1 Counter provider per D-13. Export via `getToken(...)` for DI.

### Phase 148 — Frontend (must read)
- `frontend/components/email/labels/LabelTreeItem.tsx` — host for the `<LabelAccuracyBadge />` pill per D-10.
- `frontend/hooks/queries/use-labels.ts` — existing TanStack Query pattern. Add `use-label-accuracy.ts` next to it using `queryOptions()`.
- `frontend/lib/api/labels.ts` — existing API module. Add `getLabelAccuracy()` here OR create `frontend/lib/api/triage-accuracy.ts` (Claude's discretion).
- `frontend/locales/en.ts` and `frontend/locales/it.ts` — `t.labels.accuracy.*` strings per D-12. `frontend/locales/index.ts` type union must be updated.
- `frontend/components/email/labels/index.ts` — re-export `<LabelAccuracyBadge />` if extracted.
- MUI theme colors — use `success.main`/`warning.main`/`error.main` via `sx` prop, NO hardcoded CSS per CLAUDE.md.

### Phase 148 — Tests (must read)
- `backend/src/modules/ai/services/__tests__/` — existing triage test patterns for fixture shape + Prisma mocking approach.
- `frontend/components/email/labels/__tests__/` — existing label component test patterns.

### Roadmap & Requirements (locked source of truth)
- `.planning/milestones/v13.0-ROADMAP.md` §"Phase 148: Per-Label Accuracy Profiles" (lines 35–45) — success criteria (LEARN-03, OBS-01).
- `.planning/milestones/v13.0-ROADMAP.md` §"LEARN — Learning from Corrections" (line 152) — LEARN-03 requirement text.
- `.planning/milestones/v13.0-ROADMAP.md` §"OBS — Observability" (line 180) — OBS-01 requirement text.
- `.planning/phases/147-feedback-loop/147-CONTEXT.md` — full Phase 147 decisions, especially D-01 (signal discriminator), D-08 (triageSource), D-12 (weightCorrection helper). Phase 148 builds directly on these primitives.

### Project Constraints (must read)
- `CLAUDE.md` §"NEVER RUN `prisma db push` OR ANY DESTRUCTIVE DB COMMAND" — Phase 148 migration via `npx prisma migrate dev --name 148_label_accuracy_profiles`.
- `CLAUDE.md` §"Multi-tenant rule" — every new Prisma query MUST filter by `tenantId`.
- `CLAUDE.md` §"Frontend Procedure" (steps 1–4) — translations first, then query hook, then component, then type-check + lint.
- `memory/feedback_never_db_push_production.md` — production DB was wiped 2026-04-01 via `prisma db push`. Never again.

### External Research (referenced during discussion, for planner/researcher re-lookup)
- Aberdeen et al., "The Learning Behind Gmail Priority Inbox" — implicit-action window pattern behind D-01.
- arXiv:2409.10111 "Instance Incremental vs Batch Learning under Delayed Labels" — batch-incremental equivalence behind D-06 sweeper design.
- Wikipedia "Binomial proportion confidence interval" §Wilson score interval — formula for D-11 Wilson bounds.
- 2026 Prometheus labeling best practice (OneUptime 2026-01-30, Last9) — per-tenant × per-label cardinality prohibition behind D-13.
- Evidently AI "Accuracy, precision, and recall in multi-class classification" — multi-label micro-averaging idiom behind D-03 and D-13 gauges.
- 2026 confidence-UI guidance (Agentic Design, Modexa) — traffic-light + tooltip pattern behind D-10.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TriageFeedbackService.recordFeedback()` and `captureLabelDiff()` — Phase 147 already fires on every correction event. Phase 148 hooks onto these, NOT the Prisma layer directly — decouples us from schema and respects the Phase 147 "fire-and-forget, never in transaction" discipline.
- `ScheduledJobType` + `SCHEDULED_JOB_PATTERNS` cron registry — established pattern for daily jobs. Phase 148 adds one new enum value and one new cron entry following `TRIAGE_PROMOTION_SAFETY_NET`'s precedent.
- `PrometheusModule` + `makeCounterProvider`/`makeGaugeProvider` — Phase 46-01 pattern at `backend/src/common/metrics/metrics.module.ts`. Phase 148 adds 4 new providers without touching the module shape.
- `base.worker.ts` — BullMQ worker scaffold post-Phase 146 (shared connection, no per-worker Redis client).
- `EventEmitter2` (NestJS built-in `@nestjs/event-emitter`) — available project-wide; used by existing HITL events. `'triage.accuracy.changed'` topic is the D-15 contract.
- `UserLabel.slug` index `@@unique([tenantId, slug])` — primary resolver key for `Email.aiLabels` string → `labelId` mapping.
- `buildTaggedPromptSection` helper in `prompt-sanitizer.ts` — NOT used by this phase (no new LLM prompts), listed only to confirm Phase 148 adds zero prompt-surface changes.
- TanStack Query hook pattern in `frontend/hooks/queries/use-labels.ts` — template for `use-label-accuracy.ts`.
- MUI `Tooltip` + `Chip` components — Chip as pill, Tooltip as the precision/recall detail. `sx` prop for colors.

### Established Patterns
- **Phase 147 Prisma migration workflow:** `npx prisma migrate dev --name <name>`, review SQL, commit migration file + schema together. DROP statements → STOP and ASK. `prisma db push` strictly forbidden.
- **Multi-tenant queries:** every new query MUST `where: { tenantId, ... }`.
- **Prisma retry:** P2002 (unique constraint) and P2034 (deadlock) handled with exponential backoff in existing services. Accuracy upserts use the same `upsert`+retry pattern.
- **Cache invalidation:** Phase 155 dashboard and `use-label-accuracy` hook pick up new data via TanStack's `staleTime: 5min`. No manual invalidation needed from the backend.
- **Off-cluster cron slot pattern:** existing crons cluster at `0 3 * * *` and `0 4 * * *`; Phase 147 moved to `17 4 * * *`; Phase 148 takes `37 4 * * *`. Never add to a clustered minute.
- **Metrics naming:** `triage_*` prefix matches existing `ai_requests_total`, `ai_tokens_total` conventions. Gauge names end with the metric, counter names end with `_total` (Prometheus idiom enforced by linter).
- **Frontend-first translation:** strings added to `en.ts` + `it.ts` + `index.ts` BEFORE the component is written (CLAUDE.md Frontend Procedure step 1).

### Integration Points
- `TriageFeedbackService.recordFeedback()` / `captureLabelDiff()` ↔ new `LabelAccuracyListener` (via `EventEmitter2`) ↔ new BullMQ `'accuracy-update'` queue ↔ new `LabelAccuracyService.applyDelta()`.
- Nightly `TRIAGE_ACCURACY_SWEEP` cron ↔ per-tenant `'accuracy-sweep'` jobs ↔ `LabelAccuracyService.sweepTps()` + `LabelAccuracyService.rolloverWindows()`.
- New `LabelAccuracyService.applyDelta()` / `.sweepTps()` ↔ `EventEmitter2.emit('triage.accuracy.changed', ...)` — D-15 contract. Phase 148 does NOT subscribe; Phase 151/152/155 do.
- New `TriageAccuracyController.getLabelAccuracy()` ↔ `LabelAccuracyService.read()` ↔ `LabelAccuracyProfile` + `LabelAccuracySourceBreakdown` read.
- Frontend `LabelTreeItem.tsx` ↔ `use-label-accuracy` ↔ `GET /api/ai/triage/label-accuracy` ↔ backend `TriageAccuracyController`.
- `metrics.module.ts` ↔ `LabelAccuracyService` (DI the 3 gauges + counter, update them in `applyDelta` and `sweepTps`/`rolloverWindows`).

</code_context>

<specifics>
## Specific Ideas

- The 14-day primitive is load-bearing across v13.0: Phase 147 D-09b (few-shot recency decay), Phase 148 D-01 (implicit TP window), Phase 149 (half-life). Keep it a single constant in `triage-correction-weight.ts`; DO NOT hardcode `14` in Phase 148 code — import the same module.
- The `'Learning…'` copy should match the phrasing used in other PMSync AI surfaces for consistency (e.g., suggested-actions onboarding). If no existing phrase, this sets the convention; stick to ellipsis `…` (single char U+2026) not `...`.
- Wilson-CI formulas referenced: p_hat = TP/(TP+FP), n = TP+FP; `wilson_low = (p + z²/2n − z·√(p(1−p)/n + z²/4n²)) / (1 + z²/n)` with z=1.96 for 95% CI. Same pattern for recall (replace FP with FN). Extract into testable util.
- `triage_accuracy_corrections_total` counter's `kind='tp_credited'` label is intentional — "credited" because TP is a delayed decision, not a live event. Easier to grep than `kind='tp'` vs `kind='fp'`.
- Badge extraction to `<LabelAccuracyBadge labelId={id} variant="pill" />` is mildly preferred because Phase 155 dashboard will want the same pill in a different context (chart axis tick, leaderboard cell).

</specifics>

<deferred>
## Deferred Ideas

- **Per-day accuracy buckets** — rejected in D-07 this phase. If Phase 155 dashboard wants arbitrary range charts, it can add `LabelAccuracyBucket(tenantId, labelId, date)` at that time.
- **Configurable cold-start threshold** `TRIAGE_ACCURACY_MIN_SAMPLE` env — rejected in D-11 this phase (YAGNI; research says n=10–20 universally). Add if Phase 156 benchmarks show n=20 is wrong.
- **Explicit vs inferred-correction disambiguation in the tooltip** — counters are merged in D-02 but the `signal` column is preserved per row. If Phase 155 dashboard wants to split the pill, it can query per-signal on read without a Phase 148 schema change.
- **FP/FN weighted by signal** — rejected in D-02 this phase. Revisit if Phase 152 auto-rollback misfires on `edit`-heavy noise.
- **Per-user (not just per-tenant) accuracy** — out of scope. LEARN-03 scopes to tenant. If multi-user tenants need per-user accuracy, add `userId` to `LabelAccuracyProfile` PK later (non-breaking column addition).
- **Phase 155 dashboard UI** — every aggregation, chart, and real-time push is Phase 155's job. Phase 148's `AccuracyDelta` event + read API is the full contract.
- **Per-label Prometheus gauges** — rejected in D-13 this phase. If SRE demands per-label alerting, plumb it via PromQL recording rules computed from the `_total` counter, not by increasing base gauge cardinality.

</deferred>

---

*Phase: 148-label-accuracy*
*Context gathered: 2026-04-20*
