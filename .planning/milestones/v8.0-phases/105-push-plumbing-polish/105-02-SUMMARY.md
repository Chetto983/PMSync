---
phase: 105-push-plumbing-polish
plan: 02
subsystem: ui
tags: [pwa, service-worker, push-notifications, mui, react]

# Dependency graph
requires:
  - phase: 105-push-plumbing-polish-01
    provides: usePushSubscription hook, pushApi module, SW push/notificationclick handlers
provides:
  - NotificationSettings component with push toggle in Settings page
  - UpdateSnackbar component for controlled SW updates
  - useSwUpdate hook for detecting waiting service workers
  - Push unsubscribe on logout via clearOfflineData
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Controlled SW update flow: remove skipWaiting, use SKIP_WAITING message + snackbar"
    - "Feature-gated settings section: return null when browser API unsupported"

key-files:
  created:
    - frontend/hooks/use-sw-update.ts
    - frontend/hooks/__tests__/use-sw-update.test.ts
    - frontend/components/layout/UpdateSnackbar.tsx
    - frontend/components/dashboard/settings/NotificationSettings.tsx
  modified:
    - frontend/sw.ts
    - frontend/components/layout/Layout.tsx
    - frontend/components/dashboard/Settings.tsx
    - frontend/components/dashboard/settings/useSettingsState.ts
    - frontend/lib/logout-cleanup.ts

key-decisions:
  - "Controlled SW updates via SKIP_WAITING message pattern instead of auto skipWaiting"
  - "NotificationSettings returns null when push unsupported (feature gating)"
  - "Push unsubscribe on logout is best-effort -- does not block signout flow"

patterns-established:
  - "Controlled SW update: remove skipWaiting:true, add message listener, detect via useSwUpdate hook"
  - "Settings section feature gating: component returns null when browser API not available"

requirements-completed: [PUSH-01, PUSH-04, PLSH-01, PLSH-02]

# Metrics
duration: 4min
completed: 2026-03-24
---

# Phase 105 Plan 02: Push Notification UI & SW Update Snackbar Summary

**Push toggle in Settings with permission/denied/loading states, SW update snackbar with controlled skipWaiting, and push cleanup on logout**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-24T08:05:12Z
- **Completed:** 2026-03-24T08:09:22Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- SW update snackbar with controlled skipWaiting flow (remove auto-skip, add SKIP_WAITING message handler, useSwUpdate hook, UpdateSnackbar component)
- NotificationSettings component with push toggle, permission-denied warning, loading/error states, feature-gated by browser support
- Push subscription unsubscribed on logout via clearOfflineData to prevent cross-user notification leak

## Task Commits

Each task was committed atomically:

1. **Task 1: SW skipWaiting change + useSwUpdate hook + UpdateSnackbar + Layout wiring** - `cc99fd69` (feat)
2. **Task 2: NotificationSettings component + Settings wiring + logout cleanup** - `e10170b7` (feat)

## Files Created/Modified
- `frontend/sw.ts` - Removed skipWaiting:true, added SKIP_WAITING message handler and skipWaiting() type declaration
- `frontend/hooks/use-sw-update.ts` - Hook to detect waiting SW and trigger controlled update
- `frontend/hooks/__tests__/use-sw-update.test.ts` - 4 unit tests for useSwUpdate hook
- `frontend/components/layout/UpdateSnackbar.tsx` - Snackbar showing "new version available" with reload button
- `frontend/components/layout/Layout.tsx` - Wired UpdateSnackbar between InstallPromptBanner and CookieConsent
- `frontend/components/dashboard/settings/NotificationSettings.tsx` - Push toggle with all states (supported, denied, loading, error)
- `frontend/components/dashboard/Settings.tsx` - Added notifications section with Bell icon and NotificationSettings rendering
- `frontend/components/dashboard/settings/useSettingsState.ts` - Added 'notifications' to SettingsSection type
- `frontend/lib/logout-cleanup.ts` - Added push unsubscribe step before SW cache clearing

## Decisions Made
- Controlled SW update via SKIP_WAITING message pattern -- user sees snackbar, clicks reload, SW activates
- NotificationSettings returns null when push is unsupported (PUSH-04 feature gating)
- Push unsubscribe on logout is best-effort with nested try/catch -- does not block signout

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added skipWaiting() to self type declaration in sw.ts**
- **Found during:** Task 1
- **Issue:** TypeScript error TS2339: skipWaiting not on WorkerGlobalScope type
- **Fix:** Added `skipWaiting(): void;` to the self type declaration
- **Files modified:** frontend/sw.ts
- **Committed in:** cc99fd69

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type declaration fix necessary for compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 105 (push-plumbing-polish) is now complete
- All push notification UI, SW update flow, and logout cleanup are wired
- Ready for validation

---
*Phase: 105-push-plumbing-polish*
*Completed: 2026-03-24*
