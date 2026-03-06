---
phase: 45-forwardref-burn-down
plan: 01
subsystem: backend
tags: [nestjs, dependency-injection, forwardRef, technical-debt]

requires: []
provides:
  - "Bootstrap smoke test for DI chain validation"
  - "10 forwardRef removed from DLQ + worker/queue services"
affects: [45-forwardref-burn-down]

tech-stack:
  added: []
  patterns: ["Plain injection for @Global services (no forwardRef needed)", "Same-module provider injection without forwardRef"]

key-files:
  created:
    - "backend/src/__tests__/module-bootstrap.spec.ts"
  modified:
    - "backend/src/modules/email-sync/services/bulk-operations-queue.service.ts"
    - "backend/src/modules/email-sync/services/email-send-queue.service.ts"
    - "backend/src/modules/email-sync/services/provider-sync-back-queue.service.ts"
    - "backend/src/modules/email-sync/workers/bulk-operations.worker.ts"
    - "backend/src/modules/email-sync/workers/email-send.worker.ts"
    - "backend/src/modules/email-sync/workers/folder-operations.worker.ts"
    - "backend/src/modules/email-sync/workers/sync-back.worker.ts"
    - "backend/src/modules/email-sync/workers/sync.worker.ts"
    - "backend/src/modules/email/services/email-send.service.ts"

key-decisions:
  - "Focused bootstrap test (queue services only) instead of full AppModule -- ESM module issues (autumn-js, query-string) prevented full module compilation in Jest"
  - "Plain constructor injection replaces @Inject(forwardRef(() => X)) for both @Global services and same-module providers"

patterns-established:
  - "DI smoke test pattern: Test.createTestingModule with mock providers validates injection chains"
  - "@Global services never need forwardRef at injection site"
  - "Same-module providers in NestJS resolve without forwardRef"

requirements-completed: [DEBT-01, DEBT-05, TEST-08]

duration: 6min
completed: 2026-03-06
---

# Phase 45 Plan 01: DLQ + Worker/Queue forwardRef Burn-down Summary

**Bootstrap smoke test + 10 forwardRef removed from DLQ injections and same-module worker/queue services (18 -> 8 remaining)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-06T08:40:32Z
- **Completed:** 2026-03-06T08:46:25Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Created DI chain bootstrap smoke test that validates queue services compile with plain injection
- Removed 3 forwardRef from DLQ injections (Cluster D: DeadLetterQueueService is @Global)
- Removed 7 forwardRef from worker/queue same-module injections (Cluster B: NestJS resolves same-module deps)
- Zero TypeScript compilation errors after all removals
- forwardRef count reduced from 18 to 8 (remaining are module-level imports only)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create module bootstrap smoke test** - `8eae1216` (test)
2. **Task 2: Remove 10 unnecessary forwardRef** - `0d84e4cc` (fix, committed by concurrent plan-02 executor)

## Files Created/Modified
- `backend/src/__tests__/module-bootstrap.spec.ts` - DI chain smoke test for queue services
- `backend/src/modules/email-sync/services/bulk-operations-queue.service.ts` - Removed DLQ forwardRef
- `backend/src/modules/email-sync/services/email-send-queue.service.ts` - Removed DLQ forwardRef
- `backend/src/modules/email-sync/services/provider-sync-back-queue.service.ts` - Removed DLQ forwardRef
- `backend/src/modules/email-sync/workers/sync.worker.ts` - Removed SyncSchedulerService forwardRef
- `backend/src/modules/email-sync/workers/bulk-operations.worker.ts` - Removed 2 forwardRef (queue + sync-back)
- `backend/src/modules/email-sync/workers/email-send.worker.ts` - Removed EmailSendQueueService forwardRef
- `backend/src/modules/email-sync/workers/folder-operations.worker.ts` - Removed RealtimeEventsService forwardRef
- `backend/src/modules/email-sync/workers/sync-back.worker.ts` - Removed ProviderSyncBackQueueService forwardRef
- `backend/src/modules/email/services/email-send.service.ts` - Removed EmailSendQueueService forwardRef

## Decisions Made
- Focused bootstrap test uses mock providers instead of full AppModule (ESM module issues with autumn-js/query-string prevent full compilation in Jest)
- Plain constructor injection replaces all @Inject(forwardRef(() => X)) patterns for both @Global and same-module providers

## Deviations from Plan

### Concurrent Execution Overlap

Task 2 file changes were committed by the concurrent plan-02 executor (commit 0d84e4cc) which also needed these same forwardRef removals as prerequisites. The removals are verified correct and the bootstrap test passes.

**Total deviations:** 1 (concurrent commit overlap -- no duplicate work, changes verified)
**Impact on plan:** None -- all changes are in place and verified.

## Issues Encountered
- ESM module imports (autumn-js via query-string) prevented full AppModule compilation in Jest; resolved by using focused test with mock providers
- Concurrent executor (plan-02) committed the same forwardRef removals; verified via git log and grep counts

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 8 forwardRef remain (all module-level imports), ready for plan-02/plan-03 to address
- Bootstrap smoke test provides safety net for future removals

---
*Phase: 45-forwardref-burn-down*
*Completed: 2026-03-06*
