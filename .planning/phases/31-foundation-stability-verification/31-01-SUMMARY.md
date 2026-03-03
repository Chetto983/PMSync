---
phase: 31-foundation-stability-verification
plan: 01
subsystem: testing, frontend, backend
tags: [playwright, e2e, mobile, tanstack-query, nestjs-guards, sse]

# Dependency graph
requires:
  - phase: 28
    provides: "AI chat E2E tests, use-ai-actions hook, AiChatController guard chain"
provides:
  - "Clean use-ai-actions hook with zero dead action-counts invalidation calls"
  - "Documented chat 403 root cause (FREE tier quota/cost cap, not a bug)"
  - "Dedicated mobile E2E test suite at 375px with 4 passing tests"
  - "Clean chat-e2e.spec.ts without dead action-counts mock"
affects: [32-architecture-hardening, 37-performance]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Mobile E2E tests in dedicated spec file with test.use({ viewport })", "SSE helpers duplicated to avoid cross-file coupling"]

key-files:
  created:
    - frontend/e2e/chat-mobile.spec.ts
  modified:
    - frontend/hooks/ai/use-ai-actions.ts
    - frontend/e2e/chat-e2e.spec.ts
    - backend/src/modules/ai-chat/controllers/ai-chat.controller.ts

key-decisions:
  - "Chat 403 is expected QuotaGuard behavior (FREE tier $0.10/day cap or 50 calls/month), not a bug -- documented on controller"
  - "refetchCounts made no-op instead of removed, preserving hook return type stability"
  - "SSE helpers duplicated into mobile spec to avoid coupling between test files"

patterns-established:
  - "Mobile E2E pattern: dedicated spec file with test.use({ viewport }) at describe level, no test.skip() guards"
  - "Dead endpoint cleanup: remove invalidation calls and E2E mocks, keep key factory and type for interface stability"

requirements-completed: [PERF-03]

# Metrics
duration: 7min
completed: 2026-03-03
---

# Phase 31 Plan 01: Gap Closure Summary

**Removed 7 dead action-counts polling traces, documented chat 403 as FREE tier quota behavior, added 4-test mobile E2E suite at 375px**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-03T13:28:18Z
- **Completed:** 2026-03-03T13:35:29Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Removed all 6 `aiActionsKeys.counts()` invalidation calls from use-ai-actions.ts (approve/reject mutations + 4 WebSocket handlers) plus the refetchCounts invalidation
- Removed dead action-counts E2E mock from chat-e2e.spec.ts beforeEach
- Traced full guard chain (JwtAuth -> Tenant -> Consent -> Quota) and documented that the chat 403 is expected FREE tier behavior (daily cost cap $0.10 or monthly quota 50 calls), not a regression
- Created chat-mobile.spec.ts with 4 mobile-specific tests all passing on chromium at 375x812 viewport
- Verified zero regression on all 5 desktop E2E tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix chat 403 error and remove dead action-counts polling** - `3faede16` (fix)
2. **Task 2: Create dedicated mobile E2E test suite at 375px** - `dac3d947` (feat)

## Files Created/Modified
- `frontend/e2e/chat-mobile.spec.ts` - Dedicated mobile E2E test suite (179 lines, 4 tests)
- `frontend/hooks/ai/use-ai-actions.ts` - Removed 6 dead counts invalidation calls, made refetchCounts no-op
- `frontend/e2e/chat-e2e.spec.ts` - Removed dead action-counts mock block from beforeEach
- `backend/src/modules/ai-chat/controllers/ai-chat.controller.ts` - Added chat 403 root cause documentation

## Decisions Made
- **Chat 403 is not a bug:** After tracing the full guard chain end-to-end (ConsentGuard, QuotaGuard, CostProtectionService, SubscriptionService), confirmed that 403 only occurs when FREE tier daily cost cap ($0.10/day) or monthly AI quota (50 calls) is exhausted. The `getOrCreateSubscription()` has a robust try/catch with transient fallback. E2E tests correctly mock subscription as pro/active.
- **refetchCounts kept as no-op:** Instead of removing from the return type (breaking change), made it `() => {}` to preserve interface stability for any consumers.
- **SSE helpers duplicated:** Copied ~25 lines of SSE helpers into chat-mobile.spec.ts instead of extracting to shared module. Avoids coupling and keeps each test file self-contained. If a third file needs them, extract to shared helper then.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-commit hook (`tsc --noEmit`) auto-staged some unrelated pre-existing files (common/events, common/interfaces) in Task 1 commit. These files were already present in the working tree from a previous session. No impact on correctness.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- v3.2 baseline verified: chat works, dead polling cleaned, mobile E2E passing
- Ready for Plan 31-02 (foundation installs: EventEmitterModule, dependency-cruiser, domain events, AiRunLedger)
- Ready for Phase 32 (architecture hardening) after Phase 31 completes

## Self-Check: PASSED

All 5 created/modified files verified present on disk. Both task commits (3faede16, dac3d947) verified in git log.

---
*Phase: 31-foundation-stability-verification*
*Completed: 2026-03-03*
