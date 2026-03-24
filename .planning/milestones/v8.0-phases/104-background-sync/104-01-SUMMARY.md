---
phase: 104-background-sync
plan: 01
subsystem: ui
tags: [indexeddb, idb-keyval, zustand, offline, pwa, tanstack-query]

# Dependency graph
requires:
  - phase: 103-offline-email-reading
    provides: TanStack Query persist to IndexedDB, clearOfflineData, idb-keyval
provides:
  - IndexedDB-backed offline action queue (enqueue, dedup, TTL, cap)
  - Zustand store for reactive pendingCount
  - Offline-aware useUpdateEmail mutation hook
  - Translation strings for offline queue notifications
affects: [104-02-background-sync, sync-replay, offline-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [offline-first mutation interception, IndexedDB action queue with dedup]

key-files:
  created:
    - frontend/lib/offline-action-queue.ts
    - frontend/lib/offline-action-queue.test.ts
    - frontend/stores/offline-queue-store.ts
  modified:
    - frontend/hooks/queries/use-emails.ts
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts

key-decisions:
  - "QueuedAction.dto typed as Record<string, unknown> | object to accept UpdateEmailDto without index signature"
  - "Separate idb-keyval store (pmsync-action-queue) from query cache store (pmsync-query-cache) in same DB"

patterns-established:
  - "Offline mutation interception: check navigator.onLine in mutationFn, queue to IndexedDB, return fake response for optimistic UI"
  - "Network error fallback: catch fetch/Network errors on online path and queue instead of failing"

requirements-completed: [SYNC-01]

# Metrics
duration: 5min
completed: 2026-03-23
---

# Phase 104 Plan 01: Offline Action Queue Summary

**IndexedDB-backed offline action queue with emailId dedup, 30-min TTL, 100-action cap, wired into useUpdateEmail for offline-first mutations**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-23T16:11:41Z
- **Completed:** 2026-03-23T16:16:59Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- OfflineActionQueue module with FIFO ordering, dedup by emailId (merges dto), 30-min TTL, 100-action cap
- Zustand store exposing reactive pendingCount for UI consumption
- useUpdateEmail intercepts offline mutations and network errors, queuing to IndexedDB instead of failing
- 9 unit tests covering all queue operations including edge cases
- Translation strings for 6 offline queue notification messages (en + it)

## Task Commits

Each task was committed atomically:

1. **Task 1: Translations + OfflineActionQueue module + Zustand store + unit tests** - `cbfd9646` (feat)
2. **Task 2: Wire offline detection into useUpdateEmail mutation** - `ea27d7f9` (feat)

## Files Created/Modified
- `frontend/lib/offline-action-queue.ts` - IndexedDB-backed queue with enqueue/dequeue/clear/dedup/TTL/cap
- `frontend/lib/offline-action-queue.test.ts` - 9 unit tests for queue operations
- `frontend/stores/offline-queue-store.ts` - Zustand store for pendingCount
- `frontend/hooks/queries/use-emails.ts` - Offline interception in useUpdateEmail mutationFn + onSettled guard
- `frontend/locales/en.ts` - offlineQueue translation strings (English)
- `frontend/locales/it.ts` - offlineQueue translation strings (Italian)
- `frontend/locales/index.ts` - offlineQueue type definition on AppTranslations

## Decisions Made
- QueuedAction.dto typed as `Record<string, unknown> | object` to accept UpdateEmailDto without index signature casting
- Separate idb-keyval store name (`pmsync-action-queue`) from query cache (`pmsync-query-cache`) to avoid conflicts, same DB (`pmsync-offline`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS2322 type mismatch for QueuedAction.dto**
- **Found during:** Task 2 (wiring useUpdateEmail)
- **Issue:** `UpdateEmailDto` lacks index signature, incompatible with `Record<string, unknown>`
- **Fix:** Widened dto type to `Record<string, unknown> | object`
- **Files modified:** frontend/lib/offline-action-queue.ts
- **Verification:** `npx tsc --noEmit` passes, all 9 tests still green
- **Committed in:** ea27d7f9 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minimal type widening for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Offline action queue ready for Plan 02 (replay engine, online event listener, BackgroundSync API)
- Zustand store ready for UI badge/indicator in Plan 02
- Translation strings pre-loaded for replay notifications

---
*Phase: 104-background-sync*
*Completed: 2026-03-23*
