---
phase: 100-pwa-foundation
plan: 02
subsystem: pwa
tags: [serwist, service-worker, next.js, vercel, pwa]

requires:
  - phase: 100-01
    provides: Serwist packages installed, PWA manifest and icons in public/

provides:
  - Service worker source file (sw.ts) with API bypass and precaching
  - Next.js config wrapped with Serwist for SW compilation
  - Vercel cache headers preventing stale sw.js
  - TypeScript types for Serwist SW APIs

affects: [103-offline-data, 104-background-sync, 105-push-notifications]

tech-stack:
  added: []
  patterns: [Serwist 9.x RuntimeCaching with matcher/handler pattern, NetworkOnly strategy for API bypass]

key-files:
  created: [frontend/sw.ts]
  modified: [frontend/next.config.js, frontend/vercel.json, frontend/tsconfig.json, frontend/.gitignore]

key-decisions:
  - "Serwist 9.x uses matcher (not urlPattern) and strategy instances (not strings) for RuntimeCaching"
  - "navigateFallbackDenylist lives in precacheOptions, not top-level Serwist options"
  - "Used WorkerGlobalScope (from Serwist types) instead of ServiceWorkerGlobalScope (requires webworker lib)"

patterns-established:
  - "SW API bypass: anchored regex /^\\/api\\/.* / with NetworkOnly handler must be first in runtimeCaching"
  - "Serwist wrapper is outermost in next.config.js chain: withSerwist(withBundleAnalyzer(nextConfig))"

requirements-completed: [FOUND-02, FOUND-03, FOUND-04]

duration: 5min
completed: 2026-03-23
---

# Phase 100 Plan 02: Service Worker + Serwist Config Summary

**Serwist service worker with anchored NetworkOnly /api/ bypass, precache manifest, Vercel no-cache headers, and TS types**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-23T09:50:22Z
- **Completed:** 2026-03-23T09:55:14Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created sw.ts with precaching, API bypass via anchored NetworkOnly regex, and filtered defaultCache
- Wrapped next.config.js with withSerwistInit as outermost wrapper (disabled in dev)
- Added Vercel Cache-Control headers for sw.js and swe-worker-*.js (no-cache for instant updates)
- Updated tsconfig.json with @serwist/next/typings for SW type declarations
- Added generated SW files to .gitignore

## Task Commits

Each task was committed atomically:

1. **Task 1: Create service worker source file (sw.ts)** - `98842b67` (feat)
2. **Task 2: Wrap next.config.js + vercel.json + tsconfig + .gitignore** - `9ca09b87` (feat)

## Files Created/Modified
- `frontend/sw.ts` - Service worker source with API bypass, precaching, runtime caching
- `frontend/next.config.js` - Added Serwist wrapper (outermost) with swSrc/swDest config
- `frontend/vercel.json` - Added Cache-Control no-cache headers for SW files
- `frontend/tsconfig.json` - Added @serwist/next/typings to types array
- `frontend/.gitignore` - Excludes generated sw.js and swe-worker-*.js files

## Decisions Made
- Serwist 9.x API differs from plan examples: uses `matcher` field (not `urlPattern`) and `NetworkOnly` class instances (not string `'NetworkOnly'`)
- `navigateFallbackDenylist` goes in `precacheOptions` (not top-level Serwist constructor)
- Used `WorkerGlobalScope & typeof globalThis` for self declaration (avoids webworker lib conflict with DOM types)
- Root .gitignore ignores `.gitignore` files globally, so `frontend/.gitignore` required `git add -f`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Serwist 9.x API incompatibility in sw.ts**
- **Found during:** Task 2 (tsc --noEmit verification)
- **Issue:** Plan specified `urlPattern` and `handler: 'NetworkOnly'` (string) which matches older Serwist/workbox API. Serwist 9.x uses `matcher` field and requires strategy instances.
- **Fix:** Changed `urlPattern` to `matcher`, `handler: 'NetworkOnly'` to `handler: new NetworkOnly()`, moved `navigateFallbackDenylist` into `precacheOptions`, used `WorkerGlobalScope` instead of `ServiceWorkerGlobalScope`
- **Files modified:** frontend/sw.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** 9ca09b87 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** API surface correction required for Serwist 9.x. All plan intent preserved -- same behavior, correct types.

## Issues Encountered
None beyond the API deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SW source ready for build-time precache manifest generation
- /api/* routes guaranteed to bypass SW (NetworkOnly + navigateFallbackDenylist)
- Vercel headers ensure browsers always check for updated SW
- Ready for Phase 103 (offline data) and Phase 104 (background sync)

---
*Phase: 100-pwa-foundation*
*Completed: 2026-03-23*
