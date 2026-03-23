---
phase: 103-offline-email-reading
plan: 01
subsystem: ui
tags: [tanstack-query, indexeddb, idb-keyval, offline, persistence, pwa]

# Dependency graph
requires:
  - phase: 101-pwa-online-status
    provides: "Online status detection for offline UX"
provides:
  - "IndexedDB query persistence module (query-persist.ts) with idb-keyval adapter"
  - "QueryClient wired with per-query persister"
  - "Email list and detail queries with 24h gcTime for offline survival"
  - "clearPersistedQueries export for sign-out cleanup"
affects: [103-02, 104-offline-actions, logout-cleanup]

# Tech tracking
tech-stack:
  added: ["@tanstack/query-persist-client-core@5.95.1", "idb-keyval@6.2.2"]
  patterns: ["experimental_createQueryPersister for per-query IndexedDB persistence", "persisterFn extraction for QueryClient type compatibility"]

key-files:
  created: ["frontend/lib/query-persist.ts", "frontend/lib/query-persist.test.ts"]
  modified: ["frontend/lib/query-client.tsx", "frontend/hooks/queries/use-emails.ts", "frontend/package.json", "frontend/jest.config.js"]

key-decisions:
  - "Return persisterFn (not whole persister object) to match QueryPersister type expected by QueryClient"
  - "Updated @tanstack/react-query from 5.91.2 to 5.95.1 to deduplicate query-core and fix type incompatibility"
  - "SSR guard verified via source assertion (jsdom cannot undefine window)"

patterns-established:
  - "idb-keyval custom store pattern: createStore('pmsync-offline', 'pmsync-query-cache') for isolated IndexedDB storage"
  - "Selective gcTime: only email list/detail get 24h gcTime; other queries keep short gcTime for memory efficiency"

requirements-completed: [OFFL-03]

# Metrics
duration: 8min
completed: 2026-03-23
---

# Phase 103 Plan 01: Query Persistence Summary

**Per-query IndexedDB persistence via experimental_createQueryPersister + idb-keyval, wired into QueryClient with 24h gcTime on email list/detail queries**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-23T14:36:02Z
- **Completed:** 2026-03-23T14:44:32Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created query-persist.ts module with idb-keyval AsyncStorage adapter, SSR guard, 24h maxAge, tq- prefix
- Wired persister into QueryClient defaultOptions via persisterFn extraction
- Increased emailsListOptions and emailDetailOptions gcTime to 24h for offline persistence survival
- 7 unit tests covering persister creation, storage delegation, clear, SSR guard, and store isolation

## Task Commits

Each task was committed atomically:

1. **Task 1: Install packages and create query-persist module with tests** - `17f17dc2` (feat)
2. **Task 2: Wire persister into QueryClient and increase email query gcTime** - `84a1196d` (feat)

## Files Created/Modified
- `frontend/lib/query-persist.ts` - idb-keyval storage adapter + experimental_createQueryPersister factory + clearPersistedQueries export
- `frontend/lib/query-persist.test.ts` - Unit tests for persister creation, storage adapter, clear, SSR guard
- `frontend/lib/query-client.tsx` - Added persister to QueryClient defaultOptions.queries
- `frontend/hooks/queries/use-emails.ts` - emailsListOptions and emailDetailOptions gcTime increased to 24h
- `frontend/package.json` - Added @tanstack/query-persist-client-core, idb-keyval; updated @tanstack/react-query
- `frontend/jest.config.js` - Added idb-keyval to transformIgnorePatterns allowlist

## Decisions Made
- Used persisterFn extraction pattern because experimental_createQueryPersister returns an object but QueryClient.defaultOptions.queries.persister expects a function (QueryPersister type)
- Updated @tanstack/react-query from 5.91.2 to 5.95.1 to resolve duplicate @tanstack/query-core causing TypeScript structural incompatibility (private field mismatch)
- SSR guard tested via source-level assertion because jsdom's window property is non-configurable

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed persisterFn type mismatch**
- **Found during:** Task 2 (wire persister into QueryClient)
- **Issue:** experimental_createQueryPersister returns an object with persisterFn property, but QueryClient.defaultOptions.queries.persister expects a function (QueryPersister type)
- **Fix:** Changed createQueryPersister() to return persister.persisterFn instead of the whole object
- **Files modified:** frontend/lib/query-persist.ts, frontend/lib/query-persist.test.ts
- **Verification:** npx tsc --noEmit passes
- **Committed in:** 84a1196d (Task 2 commit)

**2. [Rule 3 - Blocking] Fixed duplicate @tanstack/query-core causing type errors**
- **Found during:** Task 2 (wire persister into QueryClient)
- **Issue:** @tanstack/query-persist-client-core@5.95.1 installed its own @tanstack/query-core@5.95.1 alongside existing @tanstack/query-core@5.91.2, causing TypeScript private field incompatibility
- **Fix:** Updated @tanstack/react-query to 5.95.1 to deduplicate query-core
- **Files modified:** frontend/package.json, frontend/package-lock.json
- **Verification:** npm ls @tanstack/query-core shows single deduped version; npx tsc --noEmit passes
- **Committed in:** 84a1196d (Task 2 commit)

**3. [Rule 3 - Blocking] Added idb-keyval to jest transformIgnorePatterns**
- **Found during:** Task 1 (running tests)
- **Issue:** idb-keyval v6 is ESM-only; jest transformIgnorePatterns didn't allow it, causing import failures
- **Fix:** Added idb-keyval to the regex allowlist in jest.config.js
- **Files modified:** frontend/jest.config.js
- **Verification:** npx jest lib/query-persist.test.ts passes
- **Committed in:** 17f17dc2 (Task 1 commit)

**4. [Rule 1 - Bug] Fixed API name: experimental_createPersister -> experimental_createQueryPersister**
- **Found during:** Task 2 (type-check)
- **Issue:** Research doc used old API name experimental_createPersister; actual export is experimental_createQueryPersister
- **Fix:** Renamed all references in query-persist.ts and query-persist.test.ts
- **Files modified:** frontend/lib/query-persist.ts, frontend/lib/query-persist.test.ts
- **Verification:** npx tsc --noEmit passes
- **Committed in:** 84a1196d (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (1 bug, 3 blocking)
**Impact on plan:** All auto-fixes necessary for correctness and build success. No scope creep.

## Issues Encountered
- 3 pre-existing test failures (ai.test.ts, accept.test.tsx, SecurityAccountsSection.test.tsx) confirmed unrelated to this plan's changes. Not addressed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Query persistence infrastructure complete; email list and detail data will survive app restart
- Plan 103-02 (sign-out cleanup) can wire clearPersistedQueries into logout handler
- clearPersistedQueries export ready for consumption

---
*Phase: 103-offline-email-reading*
*Completed: 2026-03-23*
