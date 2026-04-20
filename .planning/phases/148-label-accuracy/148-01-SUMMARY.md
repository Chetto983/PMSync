---
phase: 148-label-accuracy
plan: 01
subsystem: backend/ai/triage
tags: [prisma-schema, bullmq, cron, utility, phase-148, wave-1]
dependency_graph:
  requires: []
  provides:
    - LabelAccuracyProfile
    - LabelAccuracySourceBreakdown
    - Tenant.labelAccuracyProfiles
    - Tenant.labelAccuracySourceBreakdowns
    - wilsonInterval
    - TP_IMPLICIT_WINDOW_DAYS
    - QUEUE_NAMES.TRIAGE_ACCURACY_UPDATE
    - ScheduledJobType.TRIAGE_ACCURACY_SWEEP
  affects:
    - 148-02 (migration — consumes schema diff)
    - 148-03 (service/listener/sweeper — consumes all six primitives)
    - 148-04 (backfill — consumes TP_IMPLICIT_WINDOW_DAYS + models)
    - 148-05 (API — consumes models)
    - 148-06 (frontend — indirect via API)
tech_stack:
  added: []
  patterns:
    - compound @@id PK without surrogate id (first use in PMSync)
    - no-FK labelId String (survives label rename/delete)
    - single-source constant export for cross-plan primitives (B-1 pattern)
key_files:
  created:
    - backend/src/modules/ai/utils/wilson-interval.ts
    - backend/src/modules/ai/utils/__tests__/wilson-interval.spec.ts
  modified:
    - backend/prisma/schema.prisma
    - backend/src/modules/ai/utils/triage-correction-weight.ts
    - backend/src/common/config/queue.config.ts
    - backend/src/common/services/scheduled-jobs.queue.ts
decisions:
  - Compound `@@id([tenantId, labelId, windowKey])` instead of surrogate `id String @id` — natural key is the lookup key; skipping surrogate avoids an unused B-tree index. Diverges from Phase 147 TriageOverride (which needed surrogate for API) — Phase 148 never exposes individual rows by id.
  - `labelId` stored as plain `String` (no FK to UserLabel) — deliberate so historical accuracy survives label rename/delete without cascade destruction.
  - `TP_IMPLICIT_WINDOW_DAYS = 14` appended to existing Phase 147 helper (`triage-correction-weight.ts`) instead of creating a new constants file — single source of truth, Phase 149 will swap the same file to exponential decay.
  - Cron slot `'37 4 * * *'` chosen deliberately 20 min off Phase 147's `'17 4'` and off the `'0 3'`/`'0 4'` clusters (anti-thundering-herd rule).
  - `triageSource` as `String` (not Prisma enum) — rationale: Prisma enums require separate migration statements; the set (`'llm' | 'rule' | 'llm+rule'`) is fixed and enforced at write-time by LabelAccuracyService (Plan 03).
metrics:
  duration: 568s (~9.5 min)
  completed: 2026-04-20
  tasks: 3
  files: 6
  tests_added: 9
---

# Phase 148 Plan 01: Schema Additions, Wilson Utility, Queue/Cron Registration Summary

Consumer-less foundation for Phase 148 per-label accuracy profiles — two new Prisma models (LabelAccuracyProfile + LabelAccuracySourceBreakdown), Wilson-score interval utility with 9 unit tests, queue/cron registration, and the TP_IMPLICIT_WINDOW_DAYS=14 single-source-of-truth export — all landed atomically so Wave 2's migration has a stable schema diff and Wave 3+'s services/API/frontend can import primitives without cross-wave scavenging.

## What Was Built

### 1. Prisma Schema Additions (commit `801001b9`)

**New model: `LabelAccuracyProfile`** — per-label rolling-window accuracy counters.
- **PK:** `@@id([tenantId, labelId, windowKey])`
- **Windows:** `'7d' | '30d' | 'all'` — 3 rows per label per tenant.
- **Counters:** `tp Int`, `fp Int`, `fn Int`, `sampleSize Int` (all @default(0))
- **Materialized metrics:** `precision Float?`, `recall Float?`, `f1 Float?`, `wilsonPrecLow/High Float?`, `wilsonRecLow/High Float?`, `lastUpdatedAt DateTime @default(now()) @updatedAt`
- **Indexes:** `@@index([tenantId, labelId])`, `@@index([tenantId, windowKey])`
- **Cascade:** `tenant Tenant @relation(..., onDelete: Cascade)` + `@@map("label_accuracy_profiles")`.

**New model: `LabelAccuracySourceBreakdown`** — per-triageSource dimension of the same counters.
- **PK:** `@@id([tenantId, labelId, triageSource, windowKey])`
- **triageSource:** `'llm' | 'rule' | 'llm+rule'` (mirrors `EmailAnalysis.triageSource`)
- Same counter/metric columns as `LabelAccuracyProfile`.
- **Indexes:** `@@index([tenantId, labelId])`, `@@index([tenantId, triageSource])`
- **Cascade:** `onDelete: Cascade` + `@@map("label_accuracy_source_breakdowns")`.

**Tenant model extended** (line 90-91 of `schema.prisma`):
```prisma
labelAccuracyProfiles         LabelAccuracyProfile[]
labelAccuracySourceBreakdowns LabelAccuracySourceBreakdown[]
```

**No migration file generated** — Plan 02 owns that via `npx prisma migrate dev --name 148_label_accuracy_profiles`.

### 2. `wilsonInterval` Utility + Tests (commit `8bd5253a`)

Created `backend/src/modules/ai/utils/wilson-interval.ts` — a zero-dependency pure function implementing the Wilson score interval at 95% confidence:

$$
\text{low, high} = \frac{p + \frac{z^2}{2n} \mp z\sqrt{\frac{p(1-p)}{n} + \frac{z^2}{4n^2}}}{1 + \frac{z^2}{n}}
$$

with `z = 1.96` (95% CI), `p = successes/total`, `n = total`.

**Formula reference:** Wikipedia "Binomial proportion confidence interval" §Wilson score interval. Also referenced by Evidently AI for multi-label classifier precision/recall. Wilson is preferred over the normal approximation at small n and near the boundaries.

**Edge cases:**
- `total === 0` → `{ low: 0, high: 0 }` (defensive — no NaN)
- Negative inputs → clamped to 0
- `successes > total` → clamped to `total`
- Returned values always ∈ [0, 1] × [0, 1]

**Test suite (9 specs) in `wilson-interval.spec.ts`:**
1. `[0, 0]` for total=0 (NaN defense)
2. `[0, 0]` for negative total
3. Clamps `successes > total` to `total`
4. `(1, 1)` never claims 100% — Wilson core property
5. `(0, 1)` never claims 0% as upper — Wilson mirror property
6. `(50, 50)` returns values in [0.9, 1]
7. **D-11 threshold derivation:** half-width at n=20, p=0.8 is ~15% (width ∈ [0.26, 0.36])
8. Interval narrows as n grows (monotonic)
9. `low <= high` invariant across edge cases

All 9 pass in 0.4s. Existing Phase 147 `triage-correction-weight.spec.ts` (6 specs) still green — 15/15 total.

### 3. `TP_IMPLICIT_WINDOW_DAYS = 14` Export (commit `8bd5253a`, B-1 fix)

Appended to `backend/src/modules/ai/utils/triage-correction-weight.ts` — single source of truth for the 14-day implicit-correct window (D-06 / D-14). The existing `weightCorrection(ageDays)` function and its JSDoc are untouched.

**Consumers (future plans, not wired this plan):**
- Plan 03 `label-accuracy.service.ts`: `TP_SLICE_UPPER = TP_IMPLICIT_WINDOW_DAYS`, `TP_SLICE_LOWER = TP_IMPLICIT_WINDOW_DAYS + 1`
- Plan 04 `scripts/148-backfill-label-accuracy.ts`: `LOOKBACK_TP_UPPER_DAYS = TP_IMPLICIT_WINDOW_DAYS`, `LOOKBACK_TP_LOWER_DAYS = TP_IMPLICIT_WINDOW_DAYS + BACKFILL_LOOKBACK_DAYS`

Rationale for placement in `triage-correction-weight.ts`: Phase 149 will swap `weightCorrection` for exponential decay with the same 14-day half-life. Keeping both constants adjacent prevents silent divergence between rollover math and decay math.

### 4. Queue + Cron Registration (commit `2ffe1ff6`)

**`QUEUE_NAMES.TRIAGE_ACCURACY_UPDATE = 'accuracy-update'`** added to `backend/src/common/config/queue.config.ts` after Phase 147's `TRIAGE_PROMOTE_OVERRIDES`. Dedup key documented inline: `accuracy:${tenantId}:${feedbackId}:${labelId}:${kind}` for Plan 03 listener to avoid double-count on BullMQ retry.

**`ScheduledJobType.TRIAGE_ACCURACY_SWEEP = 'triage-accuracy-sweep'`** added to `backend/src/common/services/scheduled-jobs.queue.ts` enum (adjacent to Phase 147 `TRIAGE_PROMOTION_SAFETY_NET`) + bound to cron pattern `'37 4 * * *'` (daily 04:37) in `SCHEDULED_JOB_PATTERNS`.

**Cron slot rationale (D-06 anti-thundering-herd):** 20 minutes off Phase 147's `'17 4 * * *'`, and deliberately off the existing `'0 3 * * *'` / `'0 4 * * *'` clusters. Exactly one occurrence of `'37 4 * * *'` in the file (negative-grep-verified).

## Success Criteria Check

| Criterion | Evidence |
|-----------|----------|
| Prisma schema has 2 new models + 2 new Tenant relations | `grep` returns 1 for each `model`, `@@id`, `@@map`, relation; 2 new `onDelete: Cascade`, 4 new `wilson*` columns |
| `prisma validate` exits 0 | Confirmed (pre-existing `SetNull` warning is unrelated) |
| `prisma format` exits 0 | Confirmed |
| `wilsonInterval` with 9 unit tests green | 9/9 pass; 15/15 including pre-existing Phase 147 spec |
| No imports on new util | `grep -c '^import' wilson-interval.ts` returns 0 |
| `QUEUE_NAMES.TRIAGE_ACCURACY_UPDATE = 'accuracy-update'` | Line 432 of queue.config.ts — single occurrence |
| `ScheduledJobType.TRIAGE_ACCURACY_SWEEP` at cron `'37 4 * * *'` | Enum at L93, pattern binding at L138 — exactly once |
| Slot collision check | `grep -cE "'37 4 \* \* \*'"` returns 1 (not 0, not 2) |
| **B-1:** `TP_IMPLICIT_WINDOW_DAYS = 14` exported once | `grep -c 'export const TP_IMPLICIT_WINDOW_DAYS = 14'` returns 1 |
| **B-1 non-regression:** `weightCorrection` preserved | `grep -c 'export function weightCorrection'` returns 1 |
| No migration generated (Wave 2 owns) | `ls migrations/ | grep 148` returns nothing |
| `tsc --noEmit` exits 0 | Confirmed after every task |

## Deviations from Plan

**None.** Plan executed exactly as written, with one cosmetic note:

- **Cosmetic:** `npx prisma format` normalized whitespace alignment across the entire `schema.prisma` file during Task 1. The commit shows `623 insertions(+), 560 deletions(-)` but the semantic diff is purely the 2 new models + 2 Tenant relation lines. This is expected behavior from the `prisma format` step the plan explicitly invokes — nothing was semantically removed (verified by `prisma validate` exit 0 and by checking no pre-existing model was dropped).

- **Minor plan drift:** Plan 3's acceptance criterion "`grep -c 'TRIAGE_PROMOTION_SAFETY_NET' ... returns 2`" now returns 3 because my new Phase 148 comment in `SCHEDULED_JOB_PATTERNS` references `TRIAGE_PROMOTION_SAFETY_NET` by name when documenting the 20-minute offset. This is an additional reference (comment only), not a deletion or rename. Both original load-bearing occurrences (enum at L90, pattern at L134) are intact.

## Known Stubs

None. All additions are fully-formed primitives; they simply have no consumers yet because Plans 03-06 haven't run.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at new trust boundaries beyond what the plan's `<threat_model>` already catalogued. Compound `@@id` includes `tenantId` as the leading column — tenant isolation enforced at the PK level, which matches the plan's T-148-01-01 mitigation.

## Next Steps

- **Plan 02 (BLOCKING):** Generate the Prisma migration SQL via `npx prisma migrate dev --name 148_label_accuracy_profiles` and commit the SQL file. Railway's deploy pipeline will apply it. DO NOT use `prisma db push` (production data was wiped 2026-04-01; hard rule in CLAUDE.md and `memory/feedback_never_db_push_production.md`).
- **Plan 03 (Wave 3):** LabelAccuracyService, LabelAccuracyListener, accuracy-update BullMQ worker, nightly sweep + window rollover handler. Imports all six primitives landed in this plan.

## Self-Check: PASSED

Files confirmed present:
- `backend/prisma/schema.prisma` — FOUND
- `backend/src/modules/ai/utils/wilson-interval.ts` — FOUND
- `backend/src/modules/ai/utils/__tests__/wilson-interval.spec.ts` — FOUND
- `backend/src/modules/ai/utils/triage-correction-weight.ts` — FOUND (modified)
- `backend/src/common/config/queue.config.ts` — FOUND (modified)
- `backend/src/common/services/scheduled-jobs.queue.ts` — FOUND (modified)

Commits confirmed in `git log`:
- `801001b9` feat(148-01): add LabelAccuracyProfile + LabelAccuracySourceBreakdown models — FOUND
- `8bd5253a` feat(148-01): add wilsonInterval util + TP_IMPLICIT_WINDOW_DAYS export — FOUND
- `2ffe1ff6` feat(148-01): register TRIAGE_ACCURACY_UPDATE queue + TRIAGE_ACCURACY_SWEEP cron — FOUND
