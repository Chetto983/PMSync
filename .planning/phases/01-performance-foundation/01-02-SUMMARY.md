---
phase: 01-performance-foundation
plan: 02
subsystem: performance
tags: [Promise.all, BullMQ, embeddings, pgvector, N+1]

# Dependency graph
requires:
  - phase: none
    provides: []
provides:
  - Parallelized folder count API endpoint
  - Orphan embedding cleanup BullMQ job
  - ORPHAN_EMBEDDING_CLEANUP scheduled job type
affects: [02-query-optimization, embedding-maintenance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promise.all for independent async operations"
    - "BullMQ scheduled job registration pattern"
    - "Batch deletion with safety limits"

key-files:
  created:
    - backend/src/modules/ai/services/orphan-embedding-cleanup.service.ts
  modified:
    - backend/src/modules/email/controllers/folders.controller.ts
    - backend/src/common/services/scheduled-jobs.queue.ts
    - backend/src/modules/ai/ai.module.ts

key-decisions:
  - "Used Promise.all instead of for-await loop for folder count parallelization"
  - "Orphan cleanup runs weekly on Sunday at 2 AM to avoid peak hours"
  - "Batch size 500 with 20 batch limit (10k embeddings max per run)"

patterns-established:
  - "BullMQ job handler registration: registerHandler(ScheduledJobType.X, async () => { ... })"
  - "Use indexed fields (emailId, contactId) for O(log n) embedding queries, not JSONB"

# Metrics
duration: 8min
completed: 2026-02-02
---

# Phase 01 Plan 02: Parallelization and Cleanup Summary

**Parallel folder count updates via Promise.all + weekly orphan embedding cleanup via BullMQ scheduled job**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-02T19:18:00Z
- **Completed:** 2026-02-02T19:26:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- PERF-02: Folder counts now update in parallel, reducing latency by ~(N-1) * single_update_time for multi-provider users
- PERF-03: Orphan embeddings (null emailId AND null contactId) automatically cleaned weekly
- Added ORPHAN_EMBEDDING_CLEANUP to ScheduledJobType enum with cron pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Parallelize Folder Count Updates** - `f68ebd60` (perf)
2. **Task 2: Create Orphan Embedding Cleanup Service** - `34a04734` (feat, bundled with 01-01 composite index)

Note: Task 2 was committed together with 01-01 changes due to execution overlap.

## Files Created/Modified

- `backend/src/modules/email/controllers/folders.controller.ts` - Replaced sequential for-await with Promise.all
- `backend/src/modules/ai/services/orphan-embedding-cleanup.service.ts` - New service for orphan cleanup
- `backend/src/common/services/scheduled-jobs.queue.ts` - Added ORPHAN_EMBEDDING_CLEANUP enum + cron pattern
- `backend/src/modules/ai/ai.module.ts` - Registered OrphanEmbeddingCleanupService in providers/exports

## Decisions Made

1. **Promise.all for folder counts**: Each provider's folder counts are independent (different providerId), so parallel execution is safe with no cross-provider state sharing.

2. **Weekly cleanup schedule**: Sunday 2 AM chosen to avoid peak usage. Batch processing (500/batch, max 20 batches) prevents long-running transactions.

3. **Indexed field queries**: Uses emailId/contactId indexed fields for O(log n) lookups instead of metadata JSONB queries (O(n) full scan).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ScheduledJobHandler return type mismatch**
- **Found during:** Task 2 (Orphan cleanup service creation)
- **Issue:** Handler expected `Promise<void>` but cleanupOrphanEmbeddings returned `{ deleted, batches }`
- **Fix:** Wrapped handler call in async function that discards return value
- **Files modified:** backend/src/modules/ai/services/orphan-embedding-cleanup.service.ts
- **Verification:** npm run type-check passes
- **Committed in:** 34a04734

**2. [Rule 1 - Bug] Fixed pre-commit false positive for "deprecated" word**
- **Found during:** Task 2 commit attempt
- **Issue:** Comment "non-deprecated replacement" triggered pre-commit hook checking for DEPRECATED markers
- **Fix:** Reworded to "current BullMQ API replacing removeRepeatableByKey"
- **Files modified:** backend/src/common/services/scheduled-jobs.queue.ts
- **Verification:** Commit succeeded after rewording
- **Committed in:** 34a04734

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Minor fixes for type safety and pre-commit hook compatibility. No scope creep.

## Issues Encountered

- Windows bash compatibility: `cd /d` and NODE_OPTIONS not recognized. Used `--prefix` flag and direct eslint invocation as workarounds.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PERF-02 (N+1 folder counts) and PERF-03 (orphan cleanup) complete
- Ready for PERF-04 (composite indexes) execution
- Orphan cleanup job will automatically register on app startup

---
*Phase: 01-performance-foundation*
*Completed: 2026-02-02*
