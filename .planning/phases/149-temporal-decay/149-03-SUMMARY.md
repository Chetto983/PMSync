---
phase: 149-temporal-decay
plan: 03
subsystem: ai
tags: [triage, decay, ema, time-aware, redis-ttl, nestjs, configservice]

requires:
  - phase: 149-01
    provides: "weightCorrection helper (reference only — D-02 inlines the same formula for locality, not imported)"
  - phase: 147-feedback-loop
    provides: "SenderBehaviorScore.lastUpdated ISO string field (already in Redis hash payload; previously unused)"
provides:
  - "Time-aware EMA blend in TriageLearningService.blendScores — effective prevWeight = base * exp(-ln2/halfLifeDays * max(0, dtDays))"
  - "Env-driven halfLifeDays (TRIAGE_DECAY_HALF_LIFE_DAYS, default 14, clamped >= 1)"
  - "Redis TTL computed per-flush as halfLifeDays * 4 * 86400 (D-03 outer hygiene backstop)"
  - "D-12 kill switch in effect: TRIAGE_DECAY_HALF_LIFE_DAYS=9999 disables decay operationally without code change"
affects:
  - "149-05 (TriageBackfillSchedulerService.processDecayGc can reuse same env var; sender scores Redis hash still fills same shape but now decays naturally)"
  - "AttentionScoreService consumers of SenderBehaviorScore — values now reflect time-weighted history; stale senders decay toward currScore faster"

tech-stack:
  added: []
  patterns:
    - "ConfigService injection (non-optional) for env-driven tuning — matches TriageBackfillSchedulerService constructor idiom"
    - "Inline decay formula with caller-side clamp — caller owns halfLifeDays validity, helper is pure math"
    - "Runtime-computed Redis TTL from injected config — replaces module-level const"

key-files:
  created: []
  modified:
    - backend/src/modules/ai/services/triage-learning.service.ts
    - backend/src/modules/ai/services/__tests__/triage-learning-redis.spec.ts

key-decisions:
  - "Task 1 (additive) split from Task 2 (atomic rewrite) per plan — keeps every intermediate tsc state GREEN"
  - "Inlined the exp-decay math in blendScores instead of importing weightCorrection — matches reranking.service.ts private-math style, keeps blendScores a pure module function; importable helper is available for future call sites"
  - "Math.max(0, dtDays) applied BOTH at the compute site (flushSenderSignals) AND in blendScores — belt-and-braces against clock skew (T-149-03-03)"
  - "Number.isFinite(prevMs) guard in flushSenderSignals falls back to dtDays=0 on corrupt ISO — conservative (treats as fresh; keeps blend stable per T-149-03-01)"
  - "Updated triage-learning-redis.spec.ts to provide ConfigService mock — Rule 2 auto-add (otherwise existing tests break at runtime, the DI validation happens at Test.createTestingModule.compile())"
  - "Trimmed verbose docstrings by ~9 LF to stay under 500-LF budget (ended at 499 LF)"

patterns-established:
  - "Env-tuned decay primitive pattern: onModuleInit reads env → parseInt radix 10 → Number.isFinite guard → Math.max(1, ...) clamp → cached on `this.halfLifeDays`"
  - "Corrupt-ISO defensive read: `Date.parse(iso)` + `Number.isFinite(prevMs)` before arithmetic"
  - "Per-flush TTL compute replaces module-level const when TTL depends on runtime config"

requirements-completed: [LEARN-04]

duration: ~25 min
completed: 2026-04-23
---

# Phase 149 Plan 03: Time-aware EMA + decay-scaled Redis TTL in TriageLearningService

**Made `blendScores` time-aware by scaling prevWeight with `exp(-ln2/halfLife * dtDays)`, wired `SenderBehaviorScore.lastUpdated` into `flushSenderSignals` as the dt source, and replaced the flat 30d `REDIS_TTL_SECONDS` constant with a runtime-computed `halfLifeDays * 4 * 86400` backstop. Env tuning via `TRIAGE_DECAY_HALF_LIFE_DAYS` (default 14, clamped >= 1). D-12 kill switch verified: halfLifeDays=9999 leaves prevWeight essentially unscaled.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-23 (Wave 2)
- **Tasks:** 2 (split per plan; Task 1 additive-only, Task 2 atomic rewrite)
- **Files modified:** 2
- **Commits:** 2

## Accomplishments

- **Task 1 — ADDITIVE wiring (`a7af58c0`)**: Injected `ConfigService` (non-optional) as the second constructor param, added the `halfLifeDays` class field, and moved env reads into `onModuleInit` with the T-149-03-02 clamp. `REDIS_TTL_SECONDS`, `EMA_PREV_WEIGHT`, `blendScores`, and `flushSenderSignals` all preserved verbatim. `tsc --noEmit` at baseline (17 pre-existing errors in unrelated files, zero new). Updated `triage-learning-redis.spec.ts` to provide a `ConfigService` mock in both `Test.createTestingModule` builders — otherwise the existing 7 tests would fail at the DI-resolve step once ConfigService became non-optional.
- **Task 2 — ATOMIC rewrite (`e09c24e9`)**: Extended `blendScores` signature from 3 → 5 params (added `dtDays`, `halfLifeDays`), replaced body's `prevWeight` derivation with the decay formula (`effectivePrevWeight = basePrevWeight * exp(-ln2/halfLifeDays * max(0, dtDays))`), and kept all four field-blend lines unchanged. Rewrote `flushSenderSignals` to compute `dtDays` from `prev.lastUpdated` with `Number.isFinite(prevMs)` guard + `Math.max(0, ...)` clock-skew guard. Replaced `REDIS_TTL_SECONDS` call with a per-flush `redisTtlSeconds = this.halfLifeDays * 4 * 86400`. Deleted the module-level `REDIS_TTL_SECONDS = 30 * 24 * 3600` constant. Updated file-level docstring + `EMA_PREV_WEIGHT` docstring to reflect new semantics.
- **D-12 kill switch verified**: at `halfLifeDays=9999`, the TTL becomes `9999 * 4 * 86400 ≈ 3.46e9 seconds ≈ 109,586 days` — effectively unbounded (Redis accepts it; it's within `EXPIRE`'s int range). The blend decayFactor at any realistic dtDays stays `exp(-LN2/9999 * dtDays) ≈ 1.0`, so prevWeight stays at baseline 0.7 — flipping the env essentially disables the time-aware behavior without a code change.
- **Multi-tenant invariant preserved**: every `REDIS_KEY_PREFIX` usage in the file is immediately followed by `:${tenantId}` (lines 316, 341, 440, 445). Spot-checked via grep after each task.
- **Tests pass**: 7/7 in `triage-learning-redis.spec.ts` after the ConfigService mock addition.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire ConfigService + halfLifeDays (ADDITIVE)** — `a7af58c0`
   - `backend/src/modules/ai/services/triage-learning.service.ts`: +27 LF, −1 LF (import, field, ctor param, onModuleInit env read + clamp, log line)
   - `backend/src/modules/ai/services/__tests__/triage-learning-redis.spec.ts`: +mock + 2 provider entries (Rule 2 auto-add — keeps existing tests green)
2. **Task 2: Time-aware EMA + decay-scaled TTL (ATOMIC)** — `e09c24e9`
   - `backend/src/modules/ai/services/triage-learning.service.ts`: +45 LF, −13 LF (blendScores signature+body, flushSenderSignals dt compute + TTL + call site, `REDIS_TTL_SECONDS` const deleted, file-level docstring + `EMA_PREV_WEIGHT` docstring updated)

_Split rationale:_ Task 1 is additive-only so the intermediate state (ConfigService wired but blend untouched) compiles cleanly under `tsc --noEmit`. Task 2 bundles `REDIS_TTL_SECONDS` deletion with the call-site rewrite + `blendScores` signature extension in a single atomic diff — otherwise the intermediate state would have either (a) a dangling `REDIS_TTL_SECONDS` reference or (b) a `blendScores` that consumers call with the wrong arity.

## Files Modified

- `backend/src/modules/ai/services/triage-learning.service.ts` — 499 LF (under the 500 budget). Key diffs: imports (+1), class fields (+1), constructor sig (+1 non-optional param), onModuleInit body (env read + clamp block), `blendScores` (signature 3→5 params, body's prevWeight replaced with decay-scaled derivation), `flushSenderSignals` (dtDays compute + NaN-safe read + per-flush TTL), module-level const deletion, two docstring rewrites.
- `backend/src/modules/ai/services/__tests__/triage-learning-redis.spec.ts` — Added `ConfigService` import + `mockConfigService` object + 2 provider entries in both `Test.createTestingModule` builders. No assertion changes (existing 7 tests still express their original behavior and pass unchanged).

## Before / After

**`blendScores` signature (before):**

```typescript
function blendScores(
  prev: SenderBehaviorScore,
  curr: SenderBehaviorScore,
  prevWeight: number,
): SenderBehaviorScore {
  const currWeight = 1 - prevWeight;
  // ...convex blend of 4 fields...
}
```

**`blendScores` signature (after):**

```typescript
function blendScores(
  prev: SenderBehaviorScore,
  curr: SenderBehaviorScore,
  basePrevWeight: number,
  dtDays: number,
  halfLifeDays: number,
): SenderBehaviorScore {
  const decayFactor = Math.exp(
    (-Math.LN2 / halfLifeDays) * Math.max(0, dtDays),
  );
  const prevWeight = basePrevWeight * decayFactor;
  const currWeight = 1 - prevWeight;
  // ...convex blend of 4 fields (unchanged)...
}
```

**`flushSenderSignals` blend + TTL (before):**

```typescript
const blended = prevScore
  ? blendScores(prevScore, newScore, EMA_PREV_WEIGHT)
  : newScore;
// ...
await this.redis.expire(`${REDIS_KEY_PREFIX}:${tenantId}`, REDIS_TTL_SECONDS);
```

**`flushSenderSignals` blend + TTL (after):**

```typescript
const prevScore = await this.getSenderBehavior(tenantId, senderEmail);
let dtDays = 0;
if (prevScore) {
  const prevMs = Date.parse(prevScore.lastUpdated);
  if (Number.isFinite(prevMs)) {
    dtDays = Math.max(0, (Date.now() - prevMs) / 86_400_000);
  }
}

const blended = prevScore
  ? blendScores(prevScore, newScore, EMA_PREV_WEIGHT, dtDays, this.halfLifeDays)
  : newScore;

// Phase 149 D-03: TTL = 4× half-life (~56d default) as outer hygiene backstop.
const redisTtlSeconds = this.halfLifeDays * 4 * 86400;
// ...
await this.redis.expire(`${REDIS_KEY_PREFIX}:${tenantId}`, redisTtlSeconds);
```

**Module-level const (before):**

```typescript
const REDIS_TTL_SECONDS = 30 * 24 * 3600; // 30 days
const EMA_PREV_WEIGHT = 0.7;
```

**Module-level const (after):**

```typescript
// REDIS_TTL_SECONDS — deleted (computed per-flush from this.halfLifeDays)
const EMA_PREV_WEIGHT = 0.7; // docstring updated: "base" weight, semantics via D-02
```

## Numerical invariants locked

From plan `must_haves.truths`, all verifiable inline:

- `dtDays = 0` → `decayFactor = exp(0) = 1` → `prevWeight = basePrevWeight = 0.7` (identical to pre-Phase-149) ✓
- `dtDays = halfLifeDays` (14 default) → `decayFactor = exp(-LN2) = 0.5` → `prevWeight ≈ 0.35` (half of base) ✓
- `dtDays = 2 * halfLifeDays` (28 default) → `decayFactor = 0.25` → `prevWeight ≈ 0.175` ✓
- `dtDays = 30` at default 14-day half-life → `decayFactor ≈ 0.226` → `prevWeight ≈ 0.158` (currScore dominates) ✓
- D-12 kill switch: `halfLifeDays = 9999`, `dtDays = 30` → `decayFactor = exp(-LN2/9999 * 30) ≈ 0.99792` → `prevWeight ≈ 0.6985` ≈ base ✓

## Multi-tenant invariant preservation (T-149-03-04)

All Redis key usages grep-verified as `${REDIS_KEY_PREFIX}:${tenantId}`:

```
64:const REDIS_KEY_PREFIX = 'triage:sender-scores';
316:        `${REDIS_KEY_PREFIX}:${tenantId}`,   // getSenderBehavior HGET
341:        `${REDIS_KEY_PREFIX}:${tenantId}`,   // getTopSenderScores HGETALL
440:        `${REDIS_KEY_PREFIX}:${tenantId}`,   // flushSenderSignals HSET (post-edit)
445:        `${REDIS_KEY_PREFIX}:${tenantId}`,   // flushSenderSignals EXPIRE (post-edit, now redisTtlSeconds)
```

No bare `REDIS_KEY_PREFIX` usage — every match has `:${tenantId}` adjacent. Plan edits touched lines 440+445; both use the same tenant-scoped template preserved verbatim. Cross-tenant leak surface unchanged (T-149-03-04 disposition = accept, and the disposition holds — Plan 03 did not broaden tenant-scoping surface).

## Threat Model Coverage

| Threat ID    | Disposition | Status |
|--------------|-------------|--------|
| T-149-03-01  | mitigate    | Covered: `Number.isFinite(prevMs)` guard in flushSenderSignals around `Date.parse`; fallback `dtDays = 0` treats corrupt ISO as fresh (conservative, keeps blend math finite). |
| T-149-03-02  | mitigate    | Covered: `onModuleInit` uses `Math.max(1, Number.isFinite(rawHalfLife) ? rawHalfLife : 14)`. Env=`0` → clamped to 1; env=`NaN`/garbage → falls back to 14. |
| T-149-03-03  | mitigate    | Covered: `Math.max(0, dtDays)` applied BOTH in flushSenderSignals compute (line 421) AND in blendScores (line 113). Clock-skew defensive — if server clock goes backward, prevWeight stays at base (does not inflate). |
| T-149-03-04  | accept      | Plan 03 did not change the tenant-scoping surface. All 4 `REDIS_KEY_PREFIX` usages preserve `:${tenantId}` adjacency. Getter, top-scores, HSET, EXPIRE — all tenant-scoped. |
| T-149-03-05  | mitigate    | Covered: `redisTtlSeconds = this.halfLifeDays * 4 * 86400`, with halfLifeDays already clamped >= 1 at init. Minimum TTL = 4 days (345,600s), maximum at D-12 kill switch halfLifeDays=9999 ≈ 3.46e9s (Redis supports it). Never NaN, never negative. |
| T-149-03-06  | accept      | ConfigService is globally scoped via @nestjs/config — same trust boundary as every other service that reads env vars. No new privilege surface. |

All mitigations applied; no disposition escalated.

## Decisions Made

- **Kept the exp-decay math inlined in `blendScores` instead of importing `weightCorrection`.** `blendScores` is a pure module function (not a service method); importing the Plan-01 helper would work but would also import its opts-bag signature, creating two call conventions in the same file. Matches the canonical `reranking.service.ts` style where the formula is inlined in a private method. Future call sites that want the helper can still import it from `utils/triage-correction-weight.ts`.
- **Did NOT rename `EMA_PREV_WEIGHT`.** The plan renames the param inside `blendScores` (`prevWeight` → `basePrevWeight`) to signal the semantic shift to the reader, but the module-level const stays named. Updated the const's docstring to clarify it's now the "base" weight (pre-decay). Renaming would cascade to no-op imports and add churn.
- **Inlined NaN-safe `Date.parse` read.** Rule 2 (auto-add missing defensive code): the plan's acceptance criteria list `Number.isFinite(prevMs)` as mandatory, matching T-149-03-01. Added the guard plus the `Math.max(0, ...)` clock-skew guard inline rather than extracting a `computeDtDays(iso)` helper — the whole block is 6 LF and single-use.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical functionality] Updated `triage-learning-redis.spec.ts` to provide a ConfigService mock**

- **Found during:** Task 1, after reading the existing spec.
- **Issue:** Task 1 makes `ConfigService` a non-optional DI param. The existing spec's `Test.createTestingModule({ providers: [TriageLearningService, ...] })` did not declare a ConfigService provider — NestJS DI resolution would throw at `.compile()` with "Nest can't resolve dependencies of the TriageLearningService (RedisConnectionService, ?, ...)". The plan's `action` block doesn't mention this, but the plan's `success_criteria #8` requires "if a spec exists for this service, it still passes."
- **Fix:** Added a `mockConfigService = { get: jest.fn((key, def) => def ?? '14') }` + a `{ provide: ConfigService, useValue: mockConfigService }` entry in both `Test.createTestingModule` builders (main `beforeEach` + the shutdown-safety inner builder). No assertion changes.
- **Files modified:** `backend/src/modules/ai/services/__tests__/triage-learning-redis.spec.ts`
- **Verification:** 7/7 tests pass after the addition; 0 changes to assertion logic (existing tests still express their original behavior). Not "modifying tests to make them pass" — the TEST HARNESS had a missing required provider; the assertions are untouched.
- **Committed in:** `a7af58c0` (bundled with the Task 1 service edit — both changes required for the Task 1 GREEN gate).

**2. [Rule 1 — Bug] Trimmed blendScores + EMA_PREV_WEIGHT docstrings to stay under 500-LF budget**

- **Found during:** Task 2 post-edit verification.
- **Issue:** After applying the plan's verbatim docstring (6-paragraph block on blendScores) + keeping EMA_PREV_WEIGHT's new multi-line docstring, the file measured 508 LF — 8 over the 500-LF budget specified in `success_criteria #8` and `acceptance_criteria` ("File line count stays under 500 LF target"). The plan's projection ("current 450 + ~20-line diff = ~470") underestimated the docstring overhead.
- **Fix:** Tightened the blendScores header docstring from 15 LF to 7 LF (kept the formula, the Boyd/Luxenberg citation, and both threat-model refs) and the `EMA_PREV_WEIGHT` docstring from 5 LF to 4 LF. All load-bearing information preserved — just prose compression. Final file: 499 LF.
- **Files modified:** `backend/src/modules/ai/services/triage-learning.service.ts`
- **Verification:** `wc -l` returns 499; `tsc --noEmit` unchanged at baseline; all grep invariants still pass; tests 7/7.
- **Committed in:** `e09c24e9` (bundled with Task 2 atomic rewrite — the trim is part of the same diff as the blend/TTL changes).

---

**Total deviations:** 2 auto-fixed (1 Rule 2 missing test harness, 1 Rule 1 LF-budget fix).
**Impact on plan:** Minimal. Both deviations preserve every plan invariant. No architectural changes, no semantics drift.

## Issues Encountered

- **Initial edit went to wrong filesystem path.** The Edit tool was invoked with absolute path `D:\MailAgent\backend\...` (main repo) instead of `D:\MailAgent\.claude\worktrees\agent-a9d89ba0\backend\...` (worktree). Detected via `git status` reporting clean tree after several edits. Self-corrected: reverted main-repo changes via `git checkout --` from the main repo root, then re-applied all edits using the explicit worktree absolute path. Final state is clean in both repos (main repo untouched; worktree has the plan changes). No history rewriting needed because the reverted changes were never committed. Time cost: ~3 min.
- **Worktree lacks `backend/node_modules/`.** Created an NTFS junction from the worktree's `backend/node_modules` to a populated sibling worktree (`agent-a233d67f`) — the main repo's `backend/node_modules` was empty. No `npm install` run; no package mutation.
- **Baseline of 17 pre-existing tsc errors in the sibling worktree's prisma client** (stale `labelAccuracyProfile`, `labelAccuracySourceBreakdown`, `triageSource`, `signal` properties). All in unrelated files; zero in `triage-learning.service.ts`. Tracked as baseline before any edit; confirmed unchanged at 17 after every commit.
- **Jest globalSetup runs `prisma migrate deploy` against `localhost:5433`.** Bypassed with `--globalSetup "" --globalTeardown ""` for the pure-mock triage-learning-redis spec — this test has zero DB surface. CLAUDE.md DB-safety compliance: the globalSetup targets the LOCAL docker test DB, NOT production, but still skipped because the target spec doesn't need it.

## Known Stubs

None. The implementation wires `lastUpdated` (previously tracked but unused) end-to-end. No placeholder fields, no TODO markers, no hardcoded empty data.

## Key Invariants Locked

From plan `must_haves.truths`, all verifiable in the committed file:

- `blendScores applies time-decayed prevWeight based on dt` ✓ (line 115)
- `effectivePrevWeight = EMA_PREV_WEIGHT * exp(-ln2/halfLife * max(0, dtDays))` ✓ (lines 112-115)
- `flushSenderSignals computes dtDays from SenderBehaviorScore.lastUpdated ISO string` ✓ (line 419)
- `REDIS_TTL_SECONDS = halfLifeDays * 4 * 86400` ✓ (line 437) — now a per-flush local (module const deleted)
- `halfLifeDays read from TRIAGE_DECAY_HALF_LIFE_DAYS env, default 14, clamped to min 1` ✓ (lines 207-214)
- `Recent sender signals dominate naturally; stale scores decay before GC runs` ✓ (D-02/D-03 math, proven via the numerical invariants above)
- `Multi-tenant invariant preserved: every Redis key still scoped by `{tenantId}`` ✓ (4/4 REDIS_KEY_PREFIX usages tenant-scoped)

## User Setup Required

**Optional — env var tuning only:**

- `TRIAGE_DECAY_HALF_LIFE_DAYS=14` (default). Set a larger value (e.g., `30`) to remember history longer; set `9999` as the D-12 kill switch to effectively disable time-aware decay without a code change.
- No new secrets, no new external dependencies, no migration, no schema change.

Production readiness: the change is backward-compatible for every existing `SenderBehaviorScore` record. `lastUpdated` is already populated on every blend since the field was added; parsing it as a dt source just uses data already in Redis. Existing TTL backstop extends from 30d to ~56d at default half-life (14d × 4), which is longer retention but the decay math does the real aging — sender scores will converge toward current behavior faster than before.

## Next Phase Readiness

- **Plan 02 (Wave 2, parallel):** Independent — does not consume this plan's changes. Both land in the same wave merge.
- **Plan 05 (Wave 4):** `TriageBackfillSchedulerService.processDecayGc` will read the same `TRIAGE_DECAY_HALF_LIFE_DAYS` env var. Config pattern established here (ConfigService → parseInt radix 10 → Math.max(1, finite-check)) is the canonical idiom to reuse.
- No blockers.

## Self-Check: PASSED

- **Files modified exist:**
  - `backend/src/modules/ai/services/triage-learning.service.ts` ✓ (499 LF)
  - `backend/src/modules/ai/services/__tests__/triage-learning-redis.spec.ts` ✓
- **Commits exist:**
  - `a7af58c0` (feat — Task 1 additive DI wiring) ✓
  - `e09c24e9` (feat — Task 2 atomic blend + TTL rewrite) ✓
- **Key acceptance grep checks:**
  - `import { ConfigService } from '@nestjs/config';` ✓
  - `private readonly configService: ConfigService` ✓
  - `private halfLifeDays: number` ✓
  - `TRIAGE_DECAY_HALF_LIFE_DAYS` ✓
  - `Math.max(1, ` ✓ (T-149-03-02 clamp)
  - `dtDays: number` in blendScores ✓
  - `halfLifeDays: number` in blendScores ✓
  - `Math.exp(` with `-Math.LN2 / halfLifeDays` ✓
  - `Date.parse(prevScore.lastUpdated)` ✓
  - `Math.max(0, (Date.now() - prevMs) / 86_400_000)` ✓
  - `this.halfLifeDays * 4 * 86400` ✓ (D-03 TTL)
  - `const REDIS_TTL_SECONDS` NOT present ✓ (deleted)
  - `30 * 24 * 3600` NOT present ✓ (flat TTL literal gone)
  - `EMA_PREV_WEIGHT` still present ✓ (semantics shifted)
  - Every `REDIS_KEY_PREFIX` has `:${tenantId}` adjacent ✓
- **Tests:** 7/7 in `triage-learning-redis.spec.ts` ✓
- **tsc:** baseline 17 pre-existing errors unchanged; 0 errors in modified files ✓
- **File line count:** 499 < 500 ✓
- **TDD gate sequence:** Task 1 and Task 2 are `feat(...)` commits (not RED/GREEN test-first because the existing spec was preserved verbatim on assertions — only the provider mock was added as Rule 2 auto-fix, bundled with the Task 1 feat). No test-first → implementation sequence is expected for this plan since the plan's action blocks specify behavior changes, not new test cases.

---

*Phase: 149-temporal-decay*
*Completed: 2026-04-23*
