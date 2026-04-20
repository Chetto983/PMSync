---
phase: 148-label-accuracy
plan: 04
subsystem: backend/ai/triage
tags: [nestjs, event-emitter, prometheus, bullmq, phase-148, wave-4, backfill, metrics]
dependency_graph:
  requires:
    - 148-01 (TP_IMPLICIT_WINDOW_DAYS constant; LabelAccuracyProfile Prisma model)
    - 148-02 (Prisma migration 20260420092400_148_label_accuracy_profiles applied)
    - 148-03 (LabelAccuracyService.applyDelta + @Optional() metric DI seam; ACCURACY_APPLIED_TOPIC constant; LabelAccuracyEvent interface; existing runSweep with 3 placeholder safeSet calls)
  provides:
    - TriageFeedbackService.recordFeedback now emits ACCURACY_APPLIED_TOPIC fire-and-forget on every Prisma create
    - MetricsModule exposes 3 Gauges (triage_accuracy_precision/recall/f1) + 1 Counter (triage_accuracy_corrections_total) via getToken() for DI
    - LabelAccuracyService.refreshGauges() — real gauge-refresh block (micro-averaged or per-tenant, env-gated) replacing Plan 03's no-op safeSet stubs
    - LabelAccuracyService.applyDelta kind='tp_credited' label mapping for sweeper/backfill TP credits
    - backend/scripts/148-backfill-label-accuracy.ts — one-time 30d idempotent backfill CLI
    - runBackfill(options) exported function for Plan 05 admin-endpoint reuse if needed
  affects:
    - 148-05 (controller read API will see real gauge data streaming; unchanged API contract)
    - 148-06 (frontend consumes 148-05 API — no direct effect from Plan 04)
    - 151/152/155 (consumers of ACCURACY_CHANGED_TOPIC — end-to-end flow is now live from user feedback to downstream subscribers)
tech_stack:
  added: []
  patterns:
    - Fire-and-forget EventEmitter2 emit after Prisma create (try/catch so handler errors can't corrupt the write)
    - Env-gated Prometheus label set (TRIAGE_METRICS_PER_TENANT) evaluated at module load, not runtime
    - Redis-set idempotency for one-shot backfill scripts (feedback-seen + credited sets, 7d TTL)
    - Task-level B-5 invariant gate — pre-write grep of the source-of-truth service file before backfill runs
    - Delayed-event counter label ('tp_credited') to distinguish live user-event TPs from sweeper-credited TPs on dashboards
key_files:
  created:
    - backend/src/modules/ai/services/__tests__/label-accuracy.metrics.spec.ts
    - backend/scripts/148-backfill-label-accuracy.ts
  modified:
    - backend/src/modules/ai/services/triage-feedback.service.ts (Task 1 — pre-existing commit 40c4aaa0 from previous executor session)
    - backend/src/modules/ai/services/__tests__/triage-feedback.service.spec.ts (Task 1 — pre-existing commit 40c4aaa0)
    - backend/src/common/metrics/metrics.module.ts (Task 2 — 3 Gauges + 1 Counter + 4 getToken() exports)
    - backend/src/modules/ai/services/label-accuracy.service.ts (Task 2 — runSweep gauge-refresh block, tp_credited kind mapping, W-7 JSDoc)
    - backend/src/modules/ai/services/__tests__/label-accuracy.service.spec.ts (Task 2 — B-4 enrichment: 4 null providers → mock Counter/Gauge)
decisions:
  - "W-7 JSDoc on ApplyDeltaInput.signal: 'system' reserved for sweeper/backfill only — never exposed via AccuracyDeltaEvent. Keeps Plan 151/152/155 consumers from conflating live user events with delayed TP credits."
  - "refreshGauges() extracted as private method rather than inlined at end of runSweep. Keeps runSweep readable and makes the Plan 03 placeholder → Plan 04 real-impl replacement grep-auditable (single block, not scattered statements)."
  - "Plan's acceptance grep pattern `before.*after.*shrank` required re-ordering the integrity-check error message from the natural English phrasing to before → after → shrank. Rule-1 micro-deviation: cosmetic wording adjustment to satisfy the acceptance gate; the integrity check semantic is identical."
  - "Dropped the planned `redisAcquired` flag variable in the backfill script — was unused (set once, never read) and flagged by eslint's unused-var. finally-block always calls releaseSharedRedisConnection() regardless. Simpler control flow, same shutdown safety."
metrics:
  duration: ~400s (continuation agent; Task 1 already committed by previous session)
  completed: 2026-04-20
  tasks: 3
  files: 7
  tests_added: 6 (label-accuracy.metrics.spec.ts) + 0 net new on Plan 03 spec (enrichment, not additions) + 0 on feedback spec (already landed in 40c4aaa0)
requirements_completed: [LEARN-03, OBS-01]
---

# Phase 148 Plan 04: TriageFeedbackService Event Emission + Prometheus Metrics + 30-Day Backfill Script Summary

**End-to-end wiring of Phase 148: user feedback now emits ACCURACY_APPLIED_TOPIC, real Prometheus gauges + counter replace Plan 03's no-op stubs, and a one-shot 30d backfill script seeds LabelAccuracyProfile so Day-1 users see real F1 badges instead of 30 days of "Learning…".**

## Performance

- **Duration (continuation only):** ~7 min (the previous executor already committed Task 1 as `40c4aaa0`; this session committed Tasks 2+3+metrics-module)
- **Started (continuation):** 2026-04-20 (resumed after connection drop)
- **Completed:** 2026-04-20
- **Tasks:** 3 (Task 1 from prior session; Tasks 2+3 from this session; plus dedicated metrics-module commit split from Task 2)
- **Files modified:** 7 (2 created, 5 modified)
- **Tests added:** 6 new (metrics.spec.ts) + 4 enriched (B-2 + 3 emission tests on triage-feedback.service.spec.ts from prior session)

## Accomplishments

- **End-to-end event wiring live.** A label correction now flows:
  `TriageFeedbackService.recordFeedback` → `EventEmitter2.emit(ACCURACY_APPLIED_TOPIC)` →
  Plan 03 `LabelAccuracyListener` → BullMQ `accuracy-update` queue →
  `LabelAccuracyService.applyDelta` → `ACCURACY_CHANGED_TOPIC` for Phase 151/152/155.
- **Prometheus gauges carry real data.** Plan 03 shipped 3 placeholder `safeSet(..., {tenant: 'all'}, 0)` calls; Plan 04 replaced them with a micro-averaged aggregate (default) OR per-tenant breakdown (gated by `TRIAGE_METRICS_PER_TENANT=true`). Cardinality budget respected.
- **`kind='tp_credited'` distinguishes delayed TPs from live events** on the corrections counter — dashboards can separate user-driven TPs from sweeper/backfill credits.
- **Backfill script is idempotent by construction.** Redis dedup sets with 7d TTL guard both feedback and TP passes. A pre/post row-count integrity check aborts on unexpected shrinkage.
- **B-5 invariant gate enforced.** Pre-script grep confirmed `captureLabelDiff` does not call `recordFeedback` in the `added_personal_label` branch — the Phase 147 D-04 invariant that makes counter math correct holds.

## Task Commits

Each task committed atomically. Task 1 was committed by the previous executor session before a connection drop.

1. **Task 1: TriageFeedbackService emit + B-2 exclusion spec** — `40c4aaa0` feat (previous session)
2. **Pre-Task-2 in-flight work: MetricsModule providers + exports** — `a762d71b` feat (this session; split out so the pure config change stays auditable)
3. **Task 2: runSweep gauge refresh + tp_credited counter label + spec enrichment + new metrics spec** — `01e73d77` feat (this session)
4. **Task 3: 30-day backfill script** — `9b810991` feat (this session)

**Plan metadata:** (this SUMMARY + STATE.md + ROADMAP.md — committed separately after self-check.)

## Files Created/Modified

- **`backend/src/modules/ai/services/triage-feedback.service.ts`** (Task 1, prior session) — `EventEmitter2` appended as last constructor arg (W-3); `recordFeedback` emits `ACCURACY_APPLIED_TOPIC` after the Prisma create, wrapped in try/catch for fire-and-forget safety. `captureLabelDiff` unchanged — it routes through `recordFeedback` for both `removed_ai_label` and `added_back_correction`, while `added_personal_label` remains a silent no-op (Phase 147 D-04).
- **`backend/src/modules/ai/services/__tests__/triage-feedback.service.spec.ts`** (Task 1, prior session) — 4 new tests: emit-once-per-call, payload-carries-feedbackId, fire-and-forget survives handler throw, B-2 `added_personal_label` emits zero `ACCURACY_APPLIED_TOPIC` events.
- **`backend/src/common/metrics/metrics.module.ts`** (prior-session in-flight, committed this session as `a762d71b`) — 4 provider registrations + 4 `getToken()` exports. Gauge label set is `['window']` by default, `['tenant_id', 'window']` when `TRIAGE_METRICS_PER_TENANT='true'`. Counter labels fixed at `['signal', 'triage_source', 'kind']` — no tenant_id (D-13 cardinality cap).
- **`backend/src/modules/ai/services/label-accuracy.service.ts`** (Task 2) — three surgical edits, constructor signature UNCHANGED from Plan 03:
  - W-7 JSDoc on `ApplyDeltaInput.signal` documents `'system'` as sweeper/backfill-only.
  - `applyDelta`'s `safeInc` call now maps `kind === 'tp' && signal === 'system'` → `'tp_credited'`; everything else passes `kind` through.
  - `runSweep`'s 3 placeholder `safeSet(..., { tenant: 'all' }, 0)` calls replaced with a call to new `refreshGauges()` private method (implements the real D-13 micro-average refresh across all 3 windows, env-gated per-tenant or global).
  - File grew from 782 → 848 LF (under the 900-line hard cap; see Deviations for the 500-line target discussion).
- **`backend/src/modules/ai/services/__tests__/label-accuracy.service.spec.ts`** (Task 2) — B-4 enrichment: 4 `useValue: null` → 4 `useValue: { inc: jest.fn() }` / `{ set: jest.fn() }`. All 13 pre-existing tests continue to pass — this is test enrichment per CLAUDE.md, not modification to make anything pass.
- **`backend/src/modules/ai/services/__tests__/label-accuracy.metrics.spec.ts`** (Task 2, new file) — 6 new tests targeting the metric side-effects: counter called exactly once per applyDelta (not once per window), `'tp_credited'` mapping on system+tp, raw `'tp'` for non-system paths, negative-delta (rollover) does NOT increment counter, runSweep refreshes gauges with micro-averaged values (default no-tenant-id), runSweep refreshes per-tenant when env flag is on.
- **`backend/scripts/148-backfill-label-accuracy.ts`** (Task 3, new file) — 266 LF standalone NestJS-context script. Invocation: `npx ts-node scripts/148-backfill-label-accuracy.ts [--tenant=<id>] [--dry-run]`. Two-pass algorithm (feedback + TP credit), idempotent via Redis dedup sets, pre/post row-count integrity check.

## Decisions Made

- **`refreshGauges()` as a private helper, not inlined in `runSweep`** — keeps the Plan 03 → Plan 04 stub-to-real replacement grep-auditable as a single block. One place to change if Phase 149's decay semantics need to influence the denominator.
- **Counter label mapping refined in-place, NOT via new `safeInc` wrapper** — avoided introducing a new method just for the `tp_credited` rule; the local ternary is a 2-line change at the single `safeInc(this.correctionsCounter, …)` call site.
- **Backfill script calls `applyDelta` DIRECTLY, not via `ACCURACY_APPLIED_TOPIC` emit** — simpler control flow for a one-shot script, avoids BullMQ round-trip per feedback row, and keeps the script's side-effects observable synchronously (critical for the pre/post integrity check).
- **W-5 decorator-form decision: keep `@Inject(getToken(...))`** — Plan 03 installed this form; Plan 04 does not change the consumer-side seam, only wires the real providers. `@InjectMetric` decorator form was documented in the plan as an alternative but grep confirms token-based DI is the project's established idiom.
- **Did NOT run `ts-node scripts/148-backfill-label-accuracy.ts --dry-run` as a smoke test** — the plan says "If DATABASE_URL env is missing in CI, don't fail the plan over it; tsc covers the script's type contract." Running against the real production DB from a dev shell is strictly forbidden per CLAUDE.md; dry-run against a stale DATABASE_URL would be a false-confidence signal. The script's type correctness is proven by `tsc --noEmit`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Micro-wording] Integrity check error message re-ordered for acceptance grep**

- **Found during:** Task 3 acceptance-criteria grep validation
- **Issue:** Plan's acceptance criterion expects the regex `before.*after.*shrank` to match. My natural-English error message was `"row count shrank (before=..., after=...)"`, which has `shrank` BEFORE `before`/`after` and therefore didn't match.
- **Fix:** Re-worded to `"Backfill integrity failure: before=${stats.beforeCount}, after=${stats.afterCount} (row count shrank)"` to satisfy the grep gate. Semantic is identical — same Error with same field names; only wording changed.
- **Files modified:** `backend/scripts/148-backfill-label-accuracy.ts`
- **Verification:** `grep -cE "before.*after.*shrank" backend/scripts/148-backfill-label-accuracy.ts` returns 2 (comment + message).
- **Committed in:** `9b810991` (Task 3 commit)

**2. [Rule 1 — Unused variable] Dropped `redisAcquired` flag from backfill script**

- **Found during:** Task 3 code review before commit
- **Issue:** Plan pseudocode had `let redisAcquired = false; redisAcquired = true;` for tracking state, but the variable was never read — just set. eslint's no-unused-vars would flag this. The plan had a `// eslint-disable-next-line` around it to paper over the lint warning.
- **Fix:** Removed the flag entirely. `getSharedRedisConnection()` is synchronous+cached; the `finally` block unconditionally calls `releaseSharedRedisConnection()`. The flag added zero value.
- **Files modified:** `backend/scripts/148-backfill-label-accuracy.ts`
- **Verification:** `tsc --noEmit` passes; no unused-var warning.
- **Committed in:** `9b810991` (same Task 3 commit)

**3. [Rule 1 — Plan-target vs plan-content inconsistency] Service file exceeds 500-line target (existing from Plan 03)**

- **Found during:** Task 2 completion (`wc -l` = 848 LF; plan Task 2 acceptance says "≤ 500")
- **Issue:** Same class of deviation Plan 03 documented — the service file was 782 LF at the start of Plan 04, the plan adds ~65 LF of gauge-refresh + counter-mapping, landing at 848 LF. The 500-LF target is not achievable without moving the runSweep gauge math into `label-accuracy.compute.ts`, but that would drag PrismaService access into what is currently a pure-math file (breaking Plan 03's W-6 seam).
- **Fix:** Kept to the 900-LF hard cap mentioned in the continuation prompt's success criteria. Extracted `refreshGauges()` into a private method so the gauge logic is one readable block, not inline cruft in `runSweep`.
- **Files modified:** `backend/src/modules/ai/services/label-accuracy.service.ts`
- **Verification:** `wc -l` = 848 (≤ 900 cap); `npx tsc --noEmit` exit 0; all 13 Plan 03 tests + 6 new metrics tests green.
- **Committed in:** `01e73d77` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 — micro wording, dead code, plan-target inconsistency)
**Impact on plan:** Zero scope creep. All three deviations are cosmetic/hygiene; no new features, no architecture changes. The service file size is a carryover from Plan 03.

## Issues Encountered

- **First-run test failures on `applyDelta` counter assertions.** `safeInc` invokes `metric.inc(labels, value)` (two args with `value` defaulting to 1). My initial `toHaveBeenCalledWith(...)` assertions matched only the first arg, which Jest treats as a strict-arity mismatch. Fixed by adding the `1` second arg to every assertion. This was a test bug on my side; the production `safeInc` signature is correct and matches Plan 03's pattern.
- **`prisma.emailTriageFeedback.findMany` with `distinct: ['tenantId']`** — plan pseudocode uses this shape; grep-verified 3 other places in the AI module already use it (`embeddings.service.ts`, `label-accuracy.service.ts`, `triage-promotion.service.ts`). Prisma's type-inference returns `{ tenantId: string }[]` correctly.

## Authentication Gates

None — Plan 04 adds no external-service surface. The backfill script talks to PrismaService + Redis (both already provisioned). Prometheus gauges expose via the existing `/metrics` endpoint wired in Phase 46-01.

## Known Stubs

- **Backfill script is one-shot and requires manual invocation.** There is no cron entry, no admin endpoint, and no Railway deploy hook. Intentional: D-14 specifies a "run post-migration, per-tenant" workflow. Ops runbook (who runs it, when, on which tenants) is the operator's responsibility — not a Plan 04 deliverable. If Plan 05 (admin endpoints) wants to expose this as a protected API action, `runBackfill(options)` is already exported.
- **`TRIAGE_METRICS_PER_TENANT` env must be set at process startup.** Flipping it at runtime requires a process restart to take effect. Documented in the MetricsModule provider JSDoc comment. Not a Plan 04 stub — this is a Prometheus library constraint (labelNames are declared at registration time).

## Threat Flags

None. The plan's 8 threats (T-148-04-01 through T-148-04-08) are all mitigated:

- **T-148-04-01** (payload tampering): emit is after Prisma create; payload uses persisted field values; try/catch prevents handler errors from corrupting the write.
- **T-148-04-02** (cardinality / PII): `tenant_id` opt-in via env; no label-level or email-content data in any Prometheus label.
- **T-148-04-03** (label cardinality bomb): counter labels drawn from closed enums; service-internal types, never HTTP input.
- **T-148-04-04** (backfill counter injection): CLI is `--tenant` + `--dry-run` ONLY; no `--tp`/`--fp`/`--fn` (grep-verified). Integrity check asserts row count never shrinks.
- **T-148-04-05** (backfill DoS): per-tenant loop; UserLabel map cached per tenant; Redis dedup sets have 7d TTL.
- **T-148-04-06** (idempotency): Redis sets dedup both passes; pre/post row-count gate catches silent drift.
- **T-148-04-07** (backfill Redis PII): contents are feedbackIds + `${emailId}:${labelId}` strings — no email content.
- **T-148-04-08** (D-04 counter pollution): B-2 spec asserts zero `ACCURACY_APPLIED_TOPIC` emits for `added_personal_label`; B-5 pre-script grep confirmed the invariant holds before the backfill script was written.

## Next Phase Readiness

Plan 04 is the last backend-wiring plan in Phase 148's critical path. With Plan 03's counter engine + Plan 04's event emit + metrics + backfill, the system is ready for:

- **Plan 05 (Wave 5):** `GET /api/ai/triage/label-accuracy` controller with `TenantGuard`. Calls `LabelAccuracyService.read(tenantId, { windows, includeBreakdown })`. Shape matches D-09. Zero dependencies on Plan 04 beyond the already-running service.
- **Plan 06 (Wave 6):** Frontend — translations, TanStack hook, `LabelAccuracyBadge`, `LabelTreeItem` wiring. Depends only on Plan 05's API shape.
- **Ops step (non-plan):** Someone (likely Davide post-deploy) runs `cd backend && npx ts-node scripts/148-backfill-label-accuracy.ts --dry-run` against production to preview counts, then the real run without `--dry-run` per-tenant to seed the profiles. This should happen AFTER Plan 02's Prisma migration is live on Railway.

## Self-Check: PASSED

Files confirmed present:

- `backend/src/modules/ai/services/triage-feedback.service.ts` — FOUND (emits ACCURACY_APPLIED_TOPIC; grep-verified)
- `backend/src/modules/ai/services/__tests__/triage-feedback.service.spec.ts` — FOUND (B-2 test present)
- `backend/src/common/metrics/metrics.module.ts` — FOUND (4 new providers + 4 exports)
- `backend/src/modules/ai/services/label-accuracy.service.ts` — FOUND (848 LF, constructor unchanged, refreshGauges present, tp_credited mapping present)
- `backend/src/modules/ai/services/__tests__/label-accuracy.service.spec.ts` — FOUND (enriched: mock Counter/Gauge)
- `backend/src/modules/ai/services/__tests__/label-accuracy.metrics.spec.ts` — FOUND (6 tests passing)
- `backend/scripts/148-backfill-label-accuracy.ts` — FOUND (266 LF)

Commits confirmed in `git log`:

- `40c4aaa0` feat(148-04): wire TriageFeedbackService emit of ACCURACY_APPLIED_TOPIC (W-3, B-2) — FOUND (prior session)
- `a762d71b` feat(148-04): register triage accuracy metrics in MetricsModule (D-13) — FOUND
- `01e73d77` feat(148-04): wire runSweep gauge refresh + tp_credited counter label (B-4) — FOUND
- `9b810991` feat(148-04): 30-day one-time label accuracy backfill script (D-14) — FOUND

Final test run:

- `cd backend && npx tsc --noEmit` → exit 0
- `cd backend && npx jest label-accuracy.service.spec.ts label-accuracy.metrics.spec.ts triage-feedback.service.spec.ts` → 37/37 passing

---

*Phase: 148-label-accuracy*
*Completed: 2026-04-20*
