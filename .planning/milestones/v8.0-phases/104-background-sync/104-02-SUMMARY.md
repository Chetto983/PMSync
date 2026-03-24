---
phase: 104-background-sync
plan: 02
subsystem: ui
tags: [background-sync, service-worker, replay-engine, offline, pwa, zustand]

# Dependency graph
requires:
  - phase: 104-background-sync
    plan: 01
    provides: IndexedDB offline action queue, Zustand pendingCount store, offline-aware useUpdateEmail
provides:
  - Replay engine hook (replayQueuedActions) with TTL enforcement and toast notifications
  - SW BackgroundSync handler relaying to client via postMessage
  - OfflineBanner with MUI Badge pending count indicator
  - Logout cleanup integration (clearActionQueue)
  - useOfflineActions hook mounted in Layout for app-wide coverage
affects: [105-push-notifications, offline-ui, sync-status]

# Tech tracking
tech-stack:
  added: []
  patterns: [SW postMessage relay for authenticated replay, replay lock for concurrent event dedup]

key-files:
  created:
    - frontend/hooks/use-offline-actions.ts
    - frontend/hooks/use-offline-actions.test.ts
  modified:
    - frontend/sw.ts
    - frontend/components/layout/OfflineBanner.tsx
    - frontend/lib/logout-cleanup.ts
    - frontend/lib/logout-cleanup.test.ts
    - frontend/components/layout/Layout.tsx
    - frontend/lib/offline-action-queue.ts
    - frontend/hooks/queries/use-emails.ts

key-decisions:
  - "SW sync handler relays via postMessage (cannot make authenticated API calls with httpOnly cookies)"
  - "Replay lock (module-level let) prevents double-replay from simultaneous online+sync events"
  - "requestBackgroundSync exported from offline-action-queue.ts for reuse across mutation hooks"

patterns-established:
  - "SW BackgroundSync as Chromium-only progressive enhancement, online event as primary replay path"
  - "Module-level replay lock with _resetReplayLock test helper for concurrent event dedup"

requirements-completed: [SYNC-02, SYNC-03]

# Metrics
duration: 8min
completed: 2026-03-23
---

# Phase 104 Plan 02: Background Sync Replay Engine Summary

**Replay engine with online event + SW BackgroundSync, TTL expiry with warning toasts, OfflineBanner pending count badge, and logout cleanup wiring**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-23T16:19:40Z
- **Completed:** 2026-03-23T16:28:08Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Replay engine hook auto-triggers on online event and SW postMessage, replays queued actions sequentially
- Expired actions (>30min TTL) discarded with warning toast, valid actions replayed with success/partial-failure toasts
- SW BackgroundSync handler relays to client page (cannot make authenticated API calls directly)
- OfflineBanner shows MUI Badge with pending action count when offline with queued actions
- clearOfflineData includes clearActionQueue for sign-out data security
- 9 unit tests for replay engine covering all paths (empty, expired, partial failure, lock, mixed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Replay engine hook + unit tests** - `0b4d87aa` (feat)
2. **Task 2: SW sync handler + OfflineBanner badge + logout cleanup + Layout wiring** - `cef2b118` (feat)

## Files Created/Modified
- `frontend/hooks/use-offline-actions.ts` - Replay engine with online event listener, SW message listener, TTL enforcement
- `frontend/hooks/use-offline-actions.test.ts` - 9 unit tests for replay logic
- `frontend/sw.ts` - BackgroundSync sync event handler with postMessage relay
- `frontend/components/layout/OfflineBanner.tsx` - Badge with pending count when offline
- `frontend/lib/logout-cleanup.ts` - Added clearActionQueue to sign-out cleanup
- `frontend/lib/logout-cleanup.test.ts` - Updated tests for action queue clearing
- `frontend/components/layout/Layout.tsx` - Mounted useOfflineActions hook
- `frontend/lib/offline-action-queue.ts` - Added requestBackgroundSync helper
- `frontend/hooks/queries/use-emails.ts` - Called requestBackgroundSync after enqueueAction

## Decisions Made
- SW sync handler relays via postMessage rather than making API calls directly (httpOnly cookies not accessible in SW)
- Module-level replay lock prevents double-execution from simultaneous online + BackgroundSync events
- requestBackgroundSync exported from offline-action-queue.ts (collocated with queue logic) rather than inline in use-emails.ts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed logout-cleanup test failure from new import**
- **Found during:** Task 2 (logout cleanup wiring)
- **Issue:** Adding `clearActionQueue` import to logout-cleanup.ts broke existing tests (idb-keyval not mocked)
- **Fix:** Added `jest.mock('./offline-action-queue')` to logout-cleanup.test.ts and added test for clearActionQueue call
- **Files modified:** frontend/lib/logout-cleanup.test.ts
- **Verification:** All 6 logout-cleanup tests pass
- **Committed in:** cef2b118 (Task 2 commit)

**2. [Rule 3 - Blocking] Fixed SW TypeScript errors for ExtendableEvent and clients**
- **Found during:** Task 2 (SW sync handler)
- **Issue:** `ExtendableEvent` type and `self.clients` not available in tsconfig (no WebWorker lib)
- **Fix:** Extended `self` type declaration with `clients` property, used `Event & { tag?: string; waitUntil?: ... }` instead of `ExtendableEvent`
- **Files modified:** frontend/sw.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** cef2b118 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full background sync pipeline complete: offline queue -> replay engine -> SW sync -> UI feedback
- Phase 104 (background-sync) fully complete
- Ready for Phase 105 (push notifications) which may need Prisma PushSubscription model

---
*Phase: 104-background-sync*
*Completed: 2026-03-23*
