---
phase: 101-offline-shell
plan: 01
subsystem: ui
tags: [pwa, offline, service-worker, serwist, react-hook]

# Dependency graph
requires:
  - phase: 100-pwa-foundation
    provides: Serwist SW compilation, precaching, cacheOnNavigation
provides:
  - Branded offline fallback page (offline.html) with dark/light mode
  - SW fallbacks config for failed document navigations
  - useOnlineStatus hook (useSyncExternalStore-based)
  - OfflineBanner component wired into Layout
affects: [103-offline-data, 104-background-sync]

# Tech tracking
tech-stack:
  added: []
  patterns: [useSyncExternalStore for browser API subscription, SW fallbacks for offline navigation]

key-files:
  created:
    - frontend/public/offline.html
    - frontend/hooks/use-online-status.ts
    - frontend/hooks/__tests__/use-online-status.test.ts
    - frontend/components/layout/OfflineBanner.tsx
  modified:
    - frontend/sw.ts
    - frontend/next.config.js
    - frontend/components/layout/Layout.tsx
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts

key-decisions:
  - "useSyncExternalStore chosen over useState/useEffect for tear-safe online status detection"
  - "OFFL-04 confirmed via Phase 100 Serwist precaching + cacheOnNavigation -- not newly implemented"

patterns-established:
  - "useSyncExternalStore pattern for subscribing to browser APIs (navigator.onLine)"
  - "Static HTML fallback pages use inline CSS with prefers-color-scheme for dark/light mode"

requirements-completed: [OFFL-01, OFFL-02, OFFL-04]

# Metrics
duration: 5min
completed: 2026-03-23
---

# Phase 101 Plan 01: Offline Shell Summary

**Branded offline fallback page with dark/light mode, SW fallbacks for failed navigations, useOnlineStatus hook with useSyncExternalStore, and OfflineBanner in Layout**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-23T10:55:26Z
- **Completed:** 2026-03-23T11:00:01Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Static offline.html with dark/light mode, PMSync branding, and "Try Again" reload button
- SW fallbacks configured to serve offline.html when document navigation fails offline
- useOnlineStatus hook using useSyncExternalStore with 5 passing unit tests
- OfflineBanner component with MUI Collapse animation wired as topmost element in Layout
- Translation strings added for English and Italian locales

## Task Commits

Each task was committed atomically:

1. **Task 1: Create offline fallback page and configure SW precaching + fallbacks** - `8850382b` (feat)
2. **Task 2: Create useOnlineStatus hook with unit test and add translation strings** - `b9482c38` (test/RED), `8480425f` (feat/GREEN)
3. **Task 3: Create OfflineBanner component and wire into Layout** - `70c4001b` (feat)

## Files Created/Modified
- `frontend/public/offline.html` - Self-contained branded offline page with dark/light mode
- `frontend/sw.ts` - Added fallbacks config for offline document navigation
- `frontend/next.config.js` - Added additionalPrecacheEntries for offline.html
- `frontend/hooks/use-online-status.ts` - useSyncExternalStore-based online status hook
- `frontend/hooks/__tests__/use-online-status.test.ts` - 5 unit tests for the hook
- `frontend/components/layout/OfflineBanner.tsx` - MUI Alert with Collapse animation
- `frontend/components/layout/Layout.tsx` - Added OfflineBanner above ImpersonationBanner
- `frontend/locales/en.ts` - Added offlineBanner translation key
- `frontend/locales/it.ts` - Added offlineBanner translation key
- `frontend/locales/index.ts` - Added offlineBanner type field

## Decisions Made
- Used useSyncExternalStore instead of useState/useEffect for online status -- tear-safe and follows React 19 best practices
- OFFL-04 (app shell caching) confirmed as already provided by Phase 100 Serwist precaching + cacheOnNavigation; not newly implemented

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Offline fallback and connection status UI complete
- Ready for Phase 103 (offline data with TanStack Query persist) and Phase 104 (background sync)
- Manual verification recommended: build app, toggle offline in DevTools to test offline.html and banner

---
*Phase: 101-offline-shell*
*Completed: 2026-03-23*

## Self-Check: PASSED
