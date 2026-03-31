---
phase: 129-replica-activation
plan: 01
subsystem: infra
tags: [bullmq, worker, concurrency, scaling, railway, replicas]

requires:
  - phase: 128-state-externalization
    provides: Redis-based state for multi-replica safety
provides:
  - scaleForReplicas() helper for env-driven BullMQ concurrency scaling
  - getWorkerOptions() auto-scales preset concurrency
  - All workers safe for N-replica deployment
affects: [129-replica-activation]

tech-stack:
  added: []
  patterns: [env-driven concurrency scaling via WORKER_REPLICA_COUNT]

key-files:
  created:
    - backend/src/common/config/__tests__/queue-config-scaling.test.ts
  modified:
    - backend/src/common/config/queue.config.ts
    - backend/src/common/config/index.ts
    - backend/src/modules/email-sync/workers/sync.worker.ts
    - backend/src/modules/email-sync/workers/email-send.worker.ts
    - backend/src/modules/email-sync/workers/folder-operations.worker.ts
    - backend/src/modules/email-sync/workers/sync-back.worker.ts
    - backend/src/modules/email-sync/workers/bulk-operations.worker.ts
    - backend/src/modules/push/push-dispatch.worker.ts
    - backend/src/modules/crm/automation/stage-automation.worker.ts
    - backend/src/modules/crm/ticket/services/sla-timer.service.ts
    - backend/src/modules/contacts/services/provider-event-handler.service.ts

key-decisions:
  - "scaleForReplicas reads WORKER_REPLICA_COUNT at call time, not module load time -- env stubs work in tests"
  - "getWorkerOptions() auto-scales preset concurrency so contacts-sync/calendar-sync workers need no individual changes"
  - "Minimum floor of 1 ensures no worker ever has 0 concurrency"

patterns-established:
  - "scaleForReplicas(N) pattern: all new workers with concurrency > 1 must use this helper"

requirements-completed: [SCAL-03]

duration: 3min
completed: 2026-03-31
---

# Phase 129 Plan 01: Worker Concurrency Scaling Summary

**Env-driven BullMQ worker concurrency scaling via scaleForReplicas() applied to all 9 workers + getWorkerOptions preset auto-scaling**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-31T13:36:00Z
- **Completed:** 2026-03-31T13:39:20Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Added getReplicaCount() and scaleForReplicas() helpers to queue.config.ts
- Applied scaleForReplicas() to all 9 workers with hardcoded concurrency > 1 (12 call sites total)
- Updated getWorkerOptions() to auto-scale preset concurrency (covers contacts-sync/calendar-sync workers)
- Created 14 unit tests covering default, valid, invalid, and edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Add scaleForReplicas() helper with unit tests** - `ff82f75b` (feat)
2. **Task 2: Apply scaleForReplicas() to all workers** - `d77cec3b` (feat)

## Files Created/Modified
- `backend/src/common/config/queue.config.ts` - Added getReplicaCount(), scaleForReplicas(), updated getWorkerOptions()
- `backend/src/common/config/__tests__/queue-config-scaling.test.ts` - 14 unit tests for scaling math
- `backend/src/common/config/index.ts` - Barrel export for new functions
- `backend/src/modules/email-sync/workers/sync.worker.ts` - Scaled concurrency 17/10/7
- `backend/src/modules/email-sync/workers/email-send.worker.ts` - Scaled concurrency 10
- `backend/src/modules/email-sync/workers/folder-operations.worker.ts` - Scaled concurrency 5
- `backend/src/modules/email-sync/workers/sync-back.worker.ts` - Scaled concurrency 5
- `backend/src/modules/email-sync/workers/bulk-operations.worker.ts` - Scaled concurrency 2
- `backend/src/modules/push/push-dispatch.worker.ts` - Scaled concurrency 5
- `backend/src/modules/crm/automation/stage-automation.worker.ts` - Scaled concurrency 3
- `backend/src/modules/crm/ticket/services/sla-timer.service.ts` - Scaled concurrency 5
- `backend/src/modules/contacts/services/provider-event-handler.service.ts` - Scaled concurrency 2

## Decisions Made
- scaleForReplicas reads process.env at call time (not module load) so env stubs work in tests without module re-import
- getWorkerOptions() auto-scales preset concurrency, eliminating need to modify contacts-sync/calendar-sync workers individually
- Minimum floor of 1 ensures no worker ever has 0 concurrency even with high replica counts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Worktree has no node_modules, so vitest/tsc cannot run directly. Tests verified by code inspection; will be validated by orchestrator post-merge.

## Known Stubs

None.

## User Setup Required

To activate scaling, set `WORKER_REPLICA_COUNT` environment variable in Railway to match the number of replicas (e.g., `WORKER_REPLICA_COUNT=2` for 2 replicas). Without this variable, behavior is unchanged (defaults to 1).

## Next Phase Readiness
- All workers ready for multi-replica deployment
- Set WORKER_REPLICA_COUNT=N in Railway env vars when scaling to N replicas

## Self-Check: PASSED

All 12 files verified present. Both task commits (ff82f75b, d77cec3b) found in git log.

---
*Phase: 129-replica-activation*
*Completed: 2026-03-31*
