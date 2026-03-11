---
phase: 68-backend-tests-complex-modules
plan: "04"
subsystem: testing
tags: [jest, subscription, billing, quota, prisma, nestjs, redis-mock]

requires:
  - phase: 66-test-infrastructure
    provides: "test helpers (factories, cleanup, prisma-test-client)"
  - phase: 68-00
    provides: "extended cleanup TRUNCATE list covering subscriptions table"

provides:
  - "SubscriptionService integration tests: idempotent get-or-create, plan tier transitions, status transitions"
  - "UsageTrackingService unit tests: cache key patterns for emails/ai/stats/reset"
  - "SubscriptionLifecycleService integration tests: trial expiry and past-due cancellation via real DB"
  - "QuotaGuard unit tests: CANCELED/PAST_DUE rejection, email/AI quota enforcement, no-decorator bypass"

affects: [phase-69, phase-70, phase-71]

tech-stack:
  added: []
  patterns:
    - "Per-tenant isolation with fresh createTestTenant() per test to avoid unique constraint on tenantId"
    - "Raw SQL backdating via $executeRawUnsafe with camelCase column names (updatedAt not updated_at)"
    - "Per-test tenant-scoped mock assertion: check calls[].some(([id]) => id === tenant.id) for shared DB tests"
    - "mockCacheService.incrBy.mock.calls typed as [string, number, unknown][] for key pattern assertions"

key-files:
  created:
    - "backend/src/modules/subscription/services/__tests__/subscription.service.spec.ts"
    - "backend/src/modules/subscription/services/__tests__/usage-tracking.service.spec.ts"
    - "backend/src/modules/subscription/services/__tests__/subscription-lifecycle.service.spec.ts"
    - "backend/src/modules/subscription/guards/__tests__/quota.guard.spec.ts"
  modified: []

key-decisions:
  - "SubscriptionLifecycleService tests use tenant-scoped mock call assertions (calls[].some) rather than toHaveBeenCalledTimes(0) to avoid cross-test contamination from DB rows left by prior tests in same suite"
  - "PostgreSQL column for Prisma updatedAt field is camelCase 'updatedAt' (not snake_case) — $executeRawUnsafe must quote it"
  - "QuotaGuard @SkipQuota decorator does not exist in source; test covers equivalent behavior via null reflector return (no @RequiresQuota decorator)"
  - "Lifecycle service onModuleInit() not called in tests to avoid scheduledJobs.registerHandler side effects"

patterns-established:
  - "Backdating DB timestamps for lifecycle tests: prisma.$executeRawUnsafe with quoted camelCase column names"
  - "Shared-DB test contamination guard: assert per-tenant mock calls rather than global call counts"

requirements-completed: [BTEST-04]

duration: 15min
completed: 2026-03-11
---

# Phase 68 Plan 04: Subscription Module Tests Summary

**Four spec files covering billing state transitions, usage quota enforcement, lifecycle automation, and QuotaGuard rejection — all against real PostgreSQL or fully mocked dependencies**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-11T19:15:00Z
- **Completed:** 2026-03-11T19:30:00Z
- **Tasks:** 2
- **Files modified:** 4 created

## Accomplishments

- SubscriptionService integration tests prove idempotent get-or-create, FREE->STARTER->PROFESSIONAL plan transitions, CANCELED status transitions, and per-factory tracked cleanup against real PostgreSQL
- UsageTrackingService pure unit tests prove correct cache key patterns (tenantId + segment) for trackEmailProcessed, trackAICall, getUsage, and resetUsage with mocked CacheService
- SubscriptionLifecycleService integration tests prove TRIALING->FREE downgrade on expired `currentPeriodEnd` and PAST_DUE->CANCELED cancellation after backdated `updatedAt` exceeds 7-day grace period
- QuotaGuard pure unit tests cover all rejection paths: CANCELED, PAST_DUE, email quota exceeded, AI quota exceeded, and true return when no @RequiresQuota decorator

## Task Commits

1. **Task 1: SubscriptionService and UsageTrackingService tests** - `f4fe711c` (test)
2. **Task 2: SubscriptionLifecycleService and QuotaGuard tests** - `17572e2d` (test)

## Files Created/Modified

- `backend/src/modules/subscription/services/__tests__/subscription.service.spec.ts` - Integration tests for billing state machine against real DB
- `backend/src/modules/subscription/services/__tests__/usage-tracking.service.spec.ts` - Unit tests for Redis cache key patterns
- `backend/src/modules/subscription/services/__tests__/subscription-lifecycle.service.spec.ts` - Integration tests for scheduled lifecycle automation
- `backend/src/modules/subscription/guards/__tests__/quota.guard.spec.ts` - Unit tests for quota enforcement guard

## Decisions Made

- PostgreSQL column name for Prisma `updatedAt` is camelCase `"updatedAt"` (not `updated_at`) — requires double-quoting in raw SQL on this project's DB
- @SkipQuota decorator referenced in plan does not exist in source; replaced with equivalent test: no @RequiresQuota metadata → guard returns true without checking usage
- `onModuleInit()` deliberately not called in lifecycle service tests — it registers BullMQ handlers that require a real queue connection
- Per-tenant mock call assertions used instead of `toHaveBeenCalledTimes(0)` to prevent false failures from other tests' DB rows being picked up by `runExpiryCheck()`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed cache key pattern assertions for ai counter**
- **Found during:** Task 1 (UsageTrackingService tests)
- **Issue:** Tests asserted `:ai:` substring in key, but actual key ends with `:ai` (no trailing colon)
- **Fix:** Changed regex pattern to `/[:\s]ai$|:ai:/` to match key ending with `:ai`
- **Files modified:** usage-tracking.service.spec.ts
- **Verification:** All 7 usage-tracking tests pass
- **Committed in:** f4fe711c (Task 1 commit)

**2. [Rule 1 - Bug] Fixed raw SQL column name for backdating updatedAt**
- **Found during:** Task 2 (SubscriptionLifecycleService tests)
- **Issue:** `UPDATE subscriptions SET updated_at = $1` failed — column is `"updatedAt"` not `updated_at`
- **Fix:** Changed to `UPDATE subscriptions SET "updatedAt" = $1`
- **Files modified:** subscription-lifecycle.service.spec.ts
- **Verification:** Test passes and lifecycle service finds the backdated row
- **Committed in:** 17572e2d (Task 2 commit)

**3. [Rule 1 - Bug] Fixed lifecycle test contamination from shared DB state**
- **Found during:** Task 2 (SubscriptionLifecycleService tests)
- **Issue:** "within grace period" test failed because previous test left TRIALING row in DB, causing runExpiryCheck to find it and call updateStatus
- **Fix:** Changed global `toHaveBeenCalledTimes(0)` assertions to per-tenant `calls[].some([id]) === tenant.id` checks
- **Files modified:** subscription-lifecycle.service.spec.ts
- **Verification:** All 4 lifecycle tests pass cleanly
- **Committed in:** 17572e2d (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 × Rule 1 bug)
**Impact on plan:** All fixes corrected incorrect test assertions. No scope creep. Plan intent preserved.

## Issues Encountered

- Seed script FK violation in global setup — tests run with `--globalSetup=""` flag for Task 2 verification, which is the existing project test pattern (individual spec runs bypass global setup)
- Task 1 spec files landed in commit f4fe711c rather than a dedicated commit — pre-commit hook caused the commit command to complete before git staged the files in the intended commit message

## Next Phase Readiness

- BTEST-04 requirement satisfied with 26 passing tests across 4 spec files
- Subscription module fully covered: state transitions, usage tracking, lifecycle automation, quota enforcement
- Pattern established for backdating timestamps in lifecycle tests (raw SQL with camelCase column quoting)

---
*Phase: 68-backend-tests-complex-modules*
*Completed: 2026-03-11*
