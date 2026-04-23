---
phase: 149-temporal-decay
plan: 01
subsystem: ai
tags: [triage, decay, exp, half-life, jest, typescript, pure-util]

requires:
  - phase: 147-feedback-loop
    provides: "weightCorrection single-arg helper stub + TriageFeedbackService.getSuggestions call site (line 240)"
  - phase: 148-label-accuracy
    provides: "TP_IMPLICIT_WINDOW_DAYS = 14 constant (Phase 148 D-01 invariant; lives in same file)"
provides:
  - "weightCorrection(ageDays, opts?: { halfLifeDays?, minWeight? }) — exponential-decay primitive"
  - "WeightCorrectionOpts interface exported for downstream call sites (Plans 02/03/05)"
  - "9 property-based D-13 invariants locked in jest spec (precision-tuned)"
  - "TP_IMPLICIT_WINDOW_DAYS = 14 export preserved verbatim (Phase 148 D-01 contract)"
affects:
  - "149-02 (TriageCorrectionService.getFewShotExamples migration — removes divergence)"
  - "149-03 (TriageLearningService time-aware EMA — consumes halfLifeDays via opts)"
  - "149-05 (TriageBackfillSchedulerService processDecayGc — consumes weighted-count math)"
  - "147 D-12 divergence note (closes automatically once Plan 02 lands)"

tech-stack:
  added: []
  patterns:
    - "Pure-util DI-free math primitive with opts bag — mirrors ai-chat/services/reranking.service.ts"

key-files:
  created: []
  modified:
    - backend/src/modules/ai/utils/triage-correction-weight.ts
    - backend/src/modules/ai/utils/__tests__/triage-correction-weight.spec.ts

key-decisions:
  - "D-01 signature applied verbatim: weightCorrection(ageDays, opts?) with halfLifeDays=14 / minWeight=0 defaults"
  - "D-13 precision-3 on the D-12 kill-switch test adjusted to precision-2 (math: exp(-LN2/9999*30) ≈ 0.998, differs from 1 by ~0.002, outside precision-3 threshold 0.0005; invariant unchanged)"
  - "TP_IMPLICIT_WINDOW_DAYS kept in this file — same 14-day value but distinct concept (TP credit window vs decay half-life); documented inline that they must be tuned independently"
  - "Formula mirrors reranking.service.ts verbatim (Math.exp((-Math.LN2 / halfLifeDays) * ageDays)); minWeight default 0 (not 0.5 like reranking's MIN_RECENCY_FACTOR) because the triage domain wants stale corrections to decay toward zero for GC"

patterns-established:
  - "Pure util + opts bag: services inject ConfigService and pass halfLifeDays via opts; helper stays DI-free"
  - "Clock-skew defensive guard: ageDays <= 0 returns 1 (prevents exp(positive) > 1 overweighting)"
  - "Single-arg backward compat: existing call sites (TriageFeedbackService line 240) compile unchanged"

requirements-completed: [LEARN-04]

duration: ~20 min
completed: 2026-04-23
---

# Phase 149 Plan 01: Exponential-Decay weightCorrection Summary

**Swapped flat 30-day TTL weightCorrection helper for exponential-decay primitive (14-day half-life, opts bag) mirroring reranking.service.ts; locked 9 D-13 property-based invariants in jest; preserved TP_IMPLICIT_WINDOW_DAYS=14 verbatim.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-23T07:03Z
- **Completed:** 2026-04-23T07:23Z
- **Tasks:** 2 (both TDD, RED → GREEN)
- **Files modified:** 2

## Accomplishments

- Helper reshaped from binary `ageDays <= 30 ? 1 : 0` to `max(minWeight, exp(-LN2 / halfLifeDays * max(0, ageDays)))` with optional `{ halfLifeDays?, minWeight? }` opts bag.
- Phase 147 D-12 divergence is now mechanically resolvable: Plan 02 just swaps the inlined `Math.exp(-ageDays / 14)` in `TriageCorrectionService.getFewShotExamples` for a call to this helper — no math drift possible.
- TriageFeedbackService semantics auto-flipped: its line-240 `weightCorrection(ageDays)` single-arg call now returns a continuous value in (0, 1] instead of 1|0 — the downstream `w === 0 continue` early-return becomes effectively dormant (harmless; raw-count gate still enforces `raw >= 3`).
- D-12 kill switch validated: `weightCorrection(30, { halfLifeDays: 9999 }) ≈ 0.998` — flipping the env var essentially disables decay without a code change.
- TP_IMPLICIT_WINDOW_DAYS = 14 export survived untouched (Phase 148 D-01 invariant; inline comment clarifies it's independent from the new decay half-life).

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite spec with D-13 property-based invariants** — `1ecf0212` (test)
   - RED state confirmed against flat-TTL helper: 4/9 tests fail (half-life, 2x half-life, custom halfLifeDays, minWeight clamp).
   - 5 tests pass incidentally because the flat helper happens to match boundary cases (age=0, negative ages, monotone, bounded).
2. **Task 2: Swap helper to exponential decay with opts bag** — `ea8302cb` (feat)
   - GREEN state: 9/9 invariants pass. Sibling `wilson-interval.spec.ts` still passes (18/18 total in `utils/__tests__/`).

_TDD gate:_ `test(...)` commit precedes `feat(...)` commit in git log — RED/GREEN sequence observed.

## Files Modified

- `backend/src/modules/ai/utils/triage-correction-weight.ts` — flat-TTL helper replaced with exponential decay + `WeightCorrectionOpts` interface; `TP_IMPLICIT_WINDOW_DAYS` preserved; file remains 100% pure (no imports).
- `backend/src/modules/ai/utils/__tests__/triage-correction-weight.spec.ts` — 7 flat-TTL cases replaced with 9 D-13 property-based invariants; same import path; no DI/mocks/timers.

## Before / After

**Helper (before):**

```typescript
export function weightCorrection(ageDays: number): number {
  return ageDays <= 30 ? 1 : 0;
}
```

**Helper (after):**

```typescript
export function weightCorrection(
  ageDays: number,
  opts?: WeightCorrectionOpts,
): number {
  const halfLifeDays = opts?.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const minWeight = opts?.minWeight ?? DEFAULT_MIN_WEIGHT;
  if (ageDays <= 0) return 1;
  const decay = Math.exp((-Math.LN2 / halfLifeDays) * ageDays);
  return Math.max(decay, minWeight);
}
```

**Spec (before):** 7 `toBe(1)` / `toBe(0)` flat-TTL boundary cases.
**Spec (after):** 9 D-13 invariants — age 0, 14 (half-life), 28 (2× HL), monotone, bounded, custom halfLifeDays, minWeight clamp, clock-skew defensive, D-12 kill switch.

## Decisions Made

- Followed D-01 signature and PATTERNS.md copy-ready body verbatim. No alternative shapes considered — the primitive is locked for the rest of the phase.
- Kept `TP_IMPLICIT_WINDOW_DAYS` in the same file with a comment clarifying it is independent from the decay half-life. Moving it would violate Phase 148 D-01 ("Single source of truth"); duplicating it would create drift risk.
- Did NOT touch `TriageFeedbackService.getSuggestions` line 241's `if (w === 0) continue;` — PATTERNS.md explicitly allows it to stay (dead-ish but harmless). Rule 2 does not apply: the promotion math gate (`raw >= 3`) is the load-bearing correctness guard, not the `w === 0` early-exit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] D-12 kill-switch test precision was numerically too strict**

- **Found during:** Task 2 verification (GREEN run had 1/9 failing).
- **Issue:** Plan body (`149-01-PLAN.md` Task 1 action block + `149-PATTERNS.md` line 138) specified `toBeCloseTo(1, 3)` for `weightCorrection(30, { halfLifeDays: 9999 })`. Math: `exp(-LN2/9999 * 30) ≈ 0.99792`. That differs from 1 by `~0.00208`, outside precision-3's threshold of `0.0005`. The invariant itself ("kill switch keeps weight essentially 1") is correct, but the precision value was off-by-one.
- **Fix:** Adjusted assertion to `toBeCloseTo(1, 2)` (threshold 0.005) and added an inline comment documenting the math and the deviation. Invariant unchanged — D-12's semantic guarantee ("large halfLifeDays disables decay in practice") still holds at 2-decimal precision.
- **Files modified:** `backend/src/modules/ai/utils/__tests__/triage-correction-weight.spec.ts`
- **Verification:** 9/9 tests pass after the adjustment; precision-2 still clearly expresses "≈1".
- **Committed in:** `ea8302cb` (bundled with the Task 2 helper swap, since the spec change was required for the GREEN gate).

---

**Total deviations:** 1 auto-fixed (1 Rule 1 numerical-precision bug in the plan's test spec).
**Impact on plan:** Minimal. The invariant is preserved; only the numerical tolerance changed. Worth noting for downstream plans: when translating closed-form exp-decay values into `toBeCloseTo` precision, compute `|exp(-LN2/halfLife * age) - expected|` first and pick precision such that `10^(-precision) / 2 > diff`.

## Issues Encountered

- **Worktree missing `node_modules/`** — the fresh worktree had no `node_modules`. Resolved by creating an NTFS junction from `backend/node_modules` → `D:/MailAgent/backend/node_modules`. No package mutation; no `npm install` run.
- **`npm test` script references non-existent `dotenv-cli` binary** — the package installs a bin named `dotenv` (not `dotenv-cli`), but `package.json` → `"test": "dotenv-cli -e .env.test -- jest"` expects the latter. Pre-existing repo issue; not caused by this plan. Worked around by invoking `npx dotenv-cli` (resolves via the package's bin entry) or running `jest` directly.
- **Jest testMatch fails with the `.claude` path segment** — jest's glob walker skips the `.claude` hidden-directory prefix, so `testMatch: '<rootDir>/src/**/*.spec.ts'` finds 0 files when rootDir is under `D:\MailAgent\.claude\worktrees\...`. Worked around by passing `--roots "src/modules/ai/utils/__tests__" --testMatch "**/triage-correction-weight.spec.ts"` on the CLI. Purely a verification-harness concern; does not affect the shipped code.
- **Jest globalSetup runs `prisma migrate deploy` against `localhost:5433`** — which requires `test:docker:up` to be running. For this pure-util spec, used `--globalSetup "" --globalTeardown ""` to bypass (the test has zero DB/Redis/NestJS surface). CLAUDE.md DB-safety: the globalSetup targets `localhost:5433` (docker test DB), NOT production — but skipped anyway because the test doesn't need a DB.

## Threat Model Coverage

| Threat ID    | Disposition | Status |
|--------------|-------------|--------|
| T-149-01-01  | mitigate    | Covered: `if (ageDays <= 0) return 1;` guard; test 8 (`weightCorrection(-1) === 1`) locks it in. |
| T-149-01-02  | accept      | Caller-side concern (Plan 03/04/05 add `Math.max(1, parsed)` at ConfigService read sites). Helper documents the contract inline. |
| T-149-01-03  | accept      | Default constants intentionally public. |
| T-149-01-04  | mitigate    | Precision=5 on main assertions, precision=2 on the kill-switch (corrected from plan's precision=3 — see Deviations). Property tests use exact `toBeGreaterThanOrEqual`/`toBeLessThanOrEqual`. |

## Key Invariants Locked

From plan frontmatter `must_haves.truths`, all verified by jest:

- `weightCorrection(0) === 1` ✓
- `weightCorrection(14) ≈ 0.5` (default 14-day half-life) ✓
- `weightCorrection(28) ≈ 0.25` (2× half-life) ✓
- Monotonically non-increasing in `ageDays` ✓
- `weightCorrection(ageDays, { halfLifeDays: 9999 }) ≈ 1` (D-12 kill switch, precision=2 per deviation) ✓
- `weightCorrection(ageDays, { minWeight: 0.1 })` clamps at 0.1 ✓
- `TP_IMPLICIT_WINDOW_DAYS = 14` export unchanged (Phase 148 D-01) ✓
- Negative / zero `ageDays` returns 1 ✓

## User Setup Required

None — no external service configuration required. Pure code change; no env vars introduced this plan (env-driven `TRIAGE_DECAY_HALF_LIFE_DAYS` is added in later plans that consume this helper).

## Next Phase Readiness

Wave 1 complete for this plan. The helper is ready for downstream consumption:

- **Plan 02 (next, Wave 2)** — `TriageCorrectionService.getFewShotExamples` can now swap its inlined `DECAY_HALF_LIFE_DAYS = 14` constant + `Math.exp(-ageDays / DECAY_HALF_LIFE_DAYS)` for `weightCorrection(ageDays, { halfLifeDays })`. Closes 147 D-12 divergence.
- **Plan 03 (Wave 2)** — `TriageLearningService.flushSenderSignals` can use the helper for the `effectivePrevWeight = EMA_PREV_WEIGHT * exp(-LN2/halfLife * dtDays)` time-aware EMA blend.
- **Plan 05 (Wave 4)** — `TriageBackfillSchedulerService.processDecayGc` can use the helper for the weighted-count threshold math (`sum(weightCorrection(ageDays, { halfLifeDays })) < 0.3` triggers GC).

No blockers.

## Self-Check: PASSED

- Files modified exist:
  - `backend/src/modules/ai/utils/triage-correction-weight.ts` ✓
  - `backend/src/modules/ai/utils/__tests__/triage-correction-weight.spec.ts` ✓
- Commits exist:
  - `1ecf0212` (test — Task 1 RED) ✓
  - `ea8302cb` (feat — Task 2 GREEN) ✓
- Key acceptance grep checks:
  - `Math.exp(` in helper ✓
  - `-Math.LN2 / halfLifeDays` in helper ✓
  - `export const TP_IMPLICIT_WINDOW_DAYS = 14` in helper ✓
  - No `ageDays <= 30 ? 1 : 0` in helper ✓
  - No `^import ` in helper (pure util) ✓
  - 9 `it(` blocks in spec ✓
- Jest: 9/9 in `triage-correction-weight.spec`, 18/18 across both specs in `utils/__tests__/` ✓
- tsc: no errors in the two modified files ✓
- TDD gate sequence: `test(149-01)` → `feat(149-01)` in git log ✓

---

*Phase: 149-temporal-decay*
*Completed: 2026-04-23*
