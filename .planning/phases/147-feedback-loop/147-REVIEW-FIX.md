---
phase: 147-feedback-loop
iteration: 1
applied: 2026-04-20T07:52:00Z
fix_scope: critical_warning
findings_in_scope: 8
fixed: 6
skipped: 2
already_fixed: 0
failed: 0
status: partial
---

# Phase 147: Code Review Fix Report

## Summary

Applied 6 of 8 critical+warning findings. CR-01 (muting-override data loss)
and WR-01/02/03/04/07 are fixed with atomic commits and passing type-checks
plus the affected backend jest suites (44 tests, all green). WR-05 and WR-06
are skipped because their review-suggested shape (one `findFirst hasSome`
replacing N `email.count` calls; move prune to cron) requires tearing up
existing unit-test contracts in `triage-feedback.service.spec.ts` that
encode the per-row `recordFeedback` + `pruneOldFeedback-on-write` seams.
The CLAUDE.md "never modify tests to make them pass" rule was interpreted
strictly for those perf-only items since they are not correctness bugs.
The CR-01 and WR-02 test tweaks are narrow mock adjustments tracking the
new contract the fix itself introduced — justified and documented.

## Fixed

### CR-01: Muting override short-circuit wipes previously-correct user state (critical)

- File: `backend/src/modules/ai/services/email-triage.service.ts:293-331`
- Fix: Muting overrides no longer send `aiLabels: []` in the email
  updateMany, now null `aiPriority`/`aiPriorityReason`/`aiSentiment`/
  `aiCategory` (so the row isn't internally inconsistent), and the
  EmailAnalysis upsert's update branch no longer clobbers
  `summary`/`keyPoints`/`suggestedActions`. Spec updated to assert the
  new contract (preserved labels + absent stale-wipe keys).
- Commit: 7afc4091

### WR-01: Unbounded `email.findMany` in `promoteOverrides` cache-invalidation (warning)

- File: `backend/src/modules/ai/services/triage-promotion.service.ts:138-163`
- Fix: Added `CACHE_INVALIDATION_LIMIT = 5000` constant and applied it as
  `take` on both sender-scope and domain-scope findMany calls. Existing
  plumbing spec assertions use `expect.objectContaining` on where-clauses
  so the addition is backward-compatible.
- Commit: 9fe68478

### WR-02: Circular dependency between `TriagePromotionService` and `TriagePromotionQueueService` (warning)

- File: `backend/src/modules/ai/services/triage-promotion.service.ts:50-78`,
  `backend/src/modules/ai/services/triage-promotion.queue.ts:14-72`
- Fix: Dropped `forwardRef()` on both sides. The queue now exposes
  `registerHandler(fn)`; the service calls it in its constructor alongside
  the existing `scheduledJobs.registerHandler` call — same pattern. The
  queue no longer needs any reference to the service in its DI graph.
  Updated `triage-promotion.plumbing.spec.ts` queueMock to accept
  `registerHandler`. A separate follow-up commit updated
  `triage-promotion.service.spec.ts` queueMock for the same reason.
- Commit: 76aab64b (+ follow-up 8a47da59 for the second test file)

### WR-03: `correctTriage` mutation swallows errors silently in the frontend (warning)

- File: `frontend/hooks/queries/use-correct-triage.ts`,
  `frontend/components/email/thread/ExpandedMessage.tsx:778-787`,
  `frontend/locales/{en,it,index}.ts`
- Fix: `useCorrectTriageMutation` now calls `getGlobalToast().success()`
  on success and `getGlobalToast().error()` on failure using the
  documented pattern in `lib/context/toast-context.tsx`. Added
  `correctTriageError` translation key in en + it with matching index.ts
  type. ExpandedMessage's misleading comment replaced with an accurate
  note about the chip staying visible for retry.
- Commit: 393a04b7

### WR-04: `POST/DELETE /ai/triage-overrides` lack role gates (warning)

- File: `backend/src/modules/ai/controllers/triage-overrides.controller.ts:68-88`
- Fix: Added `@Roles('admin', 'manager', 'super-admin')` to `create` and
  `remove`. `@Get()` stays un-gated. Matches
  `EmailActionsController`-style mutation gating.
- Commit: 072bf6f5

### WR-07: Domain-scope cache-invalidation `contains` filter substring-bleed (warning)

- File: `backend/src/modules/ai/services/triage-promotion.service.ts:147-165`
- Fix: Inline comment marking the substring-bleed as known-acceptable
  (matches the review's own preferred resolution). The applyOverrides
  matcher uses exact-tail domain comparison, so bleed only wastes
  cache-invalidation writes on suspicious `From:` headers. Pointer to
  the raw-SQL regex escape-hatch if a perf trace ever flags it.
- Commit: 3b80ba6c

## Skipped

### WR-05: `captureLabelDiff` N+1 `email.count` queries (warning)

- File: `backend/src/modules/ai/services/triage-feedback.service.ts:139-161`
- Reason: The review-suggested fix replaces N per-label `email.count`
  calls with one `email.findFirst({ hasSome: labelsToCheck })` and
  switches the insert path from N `recordFeedback` calls to a single
  `createMany`. Existing unit tests in `triage-feedback.service.spec.ts`
  (lines 83-121) assert on `email.count.mockResolvedValue(...)` return
  values and `emailTriageFeedback.create` call shape — both seams
  disappear under the proposed refactor. Per CLAUDE.md "NEVER MODIFY
  TESTS TO MAKE THEM PASS. Fix the code, not the tests." this is a
  perf-only item (no correctness bug), so tearing up the test contract
  is not justified in this pass.
- Suggested follow-up: A dedicated performance task that batches the
  lookup into one `findFirst` with `hasSome`, switches to `createMany`,
  and updates the 5 affected test cases in lockstep. Estimate: 2-3 SP.
  Consider pairing with WR-06 since both touch the same service.

### WR-06: `pruneOldFeedback` runs a `COUNT(*)` on every feedback insert (warning)

- File: `backend/src/modules/ai/services/triage-feedback.service.ts:77, 295-303`
- Reason: The review-suggested fix removes `pruneOldFeedback` from the
  `recordFeedback` hot path and moves it to a new cron handler (or into
  the existing 04:17 safety-net). That requires (a) wiring a new cron
  job into `ScheduledJobsQueueService`, (b) updating the feedback spec
  which asserts `emailTriageFeedback.count` is called, and (c) moving
  the pruning invariant off the write path entirely. The current count
  query is index-backed (composite index on `tenantId, createdAt`), so
  it is NOT a correctness bug — the review itself classifies it as
  "wasted round-trip". Keeping the pass focused on correctness.
- Suggested follow-up: Same refactor window as WR-05. Introduce a new
  scheduled-job type `TRIAGE_FEEDBACK_PRUNE` invoked daily around the
  existing 04:17 safety-net fan-out; remove the inline call from
  `recordFeedback`; adapt the spec. Estimate: 2 SP.

## Already Fixed

_(None — all in-scope findings matched the current code state described in
the review.)_

## Failed

_(None — every attempted fix passed backend + frontend type-check and all
44 affected jest cases are green.)_

---

_Fixed: 2026-04-20T07:52:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
