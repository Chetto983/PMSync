---
phase: 103-offline-email-reading
plan: 02
subsystem: ui
tags: [indexeddb, service-worker, tanstack-query, logout, security]

# Dependency graph
requires:
  - phase: 103-offline-email-reading
    provides: "clearPersistedQueries from query-persist.ts (Plan 01)"
provides:
  - "clearOfflineData() function that clears IndexedDB, SW caches, and TQ cache on sign-out"
  - "All 5 signOut call sites wired with offline data cleanup before session destruction"
affects: [104-background-sync, 105-push-notifications]

# Tech tracking
tech-stack:
  added: []
  patterns: ["clearOfflineData before signOut ordering pattern"]

key-files:
  created:
    - frontend/lib/logout-cleanup.ts
    - frontend/lib/logout-cleanup.test.ts
  modified:
    - frontend/components/layout/Header.tsx
    - frontend/components/ai/CommandPalette/index.tsx
    - frontend/hooks/use-websocket.ts
    - frontend/components/dashboard/settings/useSettingsState.ts
    - frontend/lib/api-client.ts

key-decisions:
  - "Wire clearOfflineData into all 5 signOut call sites, not just Header.tsx"

patterns-established:
  - "Logout cleanup ordering: clearOfflineData() MUST run before authClient.signOut() to prevent data leak window"

requirements-completed: [SYNC-04]

# Metrics
duration: 4min
completed: 2026-03-23
---

# Phase 103 Plan 02: Sign-Out Cleanup Summary

**clearOfflineData() clears IndexedDB, SW caches, and TQ cache before session destruction across all 5 sign-out paths**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-23T14:47:25Z
- **Completed:** 2026-03-23T14:51:53Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created logout-cleanup module that clears all three offline data stores
- Wired clearOfflineData into all 5 signOut call sites (Header, CommandPalette, useWebSocket, useSettingsState, api-client interceptor)
- 5 unit tests covering IndexedDB clear, SW cache clear, TQ cache clear, caches API unavailable, and no fire-and-forget

## Task Commits

Each task was committed atomically:

1. **Task 1: Create logout-cleanup module with tests** - `70e73af3` (feat) -- pre-existing from prior session
2. **Task 2: Wire clearOfflineData into all sign-out paths** - `51cecdbd` (feat)

## Files Created/Modified
- `frontend/lib/logout-cleanup.ts` - clearOfflineData() clears IndexedDB + SW caches + TQ cache
- `frontend/lib/logout-cleanup.test.ts` - 5 unit tests for all cleanup scenarios
- `frontend/components/layout/Header.tsx` - clearOfflineData before signOut in handleLogout
- `frontend/components/ai/CommandPalette/index.tsx` - clearOfflineData before signOut
- `frontend/hooks/use-websocket.ts` - clearOfflineData before signOut on auth failure
- `frontend/components/dashboard/settings/useSettingsState.ts` - clearOfflineData before signOut
- `frontend/lib/api-client.ts` - clearOfflineData before signOut in 401 interceptor

## Decisions Made
- Wired clearOfflineData into all 5 signOut call sites found via grep, not just Header.tsx as plan specified. The plan's acceptance criteria required "Any other signOut() call sites in frontend also have clearOfflineData() wired before them."

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test type errors for tsc --noEmit compliance**
- **Found during:** Task 2 (type-check verification)
- **Issue:** Test file had spread args incompatible with jest.fn and window cast needed double assertion
- **Fix:** Changed mock factories to direct calls, used `window as unknown as Record<string, unknown>` for delete
- **Files modified:** frontend/lib/logout-cleanup.test.ts
- **Verification:** `npx tsc --noEmit` passes, all 5 tests still green
- **Committed in:** 51cecdbd (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for type-check compliance. No scope creep.

## Issues Encountered
- Task 1 files were already committed in a prior session commit (70e73af3) that included them. No re-commit needed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Offline email reading (Phase 103) fully complete: persistence + cleanup
- Ready for Phase 104 (background sync) or Phase 105 (push notifications)

---
*Phase: 103-offline-email-reading*
*Completed: 2026-03-23*
