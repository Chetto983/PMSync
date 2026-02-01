---
phase: 04-service-splits
plan: 01
subsystem: api
tags: [prisma, folder-sync, p2002, p2034, retry-logic, service-extraction]

# Dependency graph
requires:
  - phase: 03-imap-driver-split
    provides: Facade pattern for service extraction, module registration patterns
provides:
  - FolderSyncQueryService with provider-agnostic folder DB operations
  - P2002/P2034 retry logic centralized for all folder syncs
  - syncFoldersToDatabase, updateFolderCounts, getFolderKeys methods
  - auditFolderSyncFromPaths, cleanupOrphanedFolders methods
affects: [04-02, 04-03, 04-04, gmail-folder-sync, microsoft-folder-sync, imap-folder-sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service extraction: copy methods, preserve retry logic, register before consumers"
    - "getFolderKeys: returns name, path, specialUse, canonical variants for email counting"

key-files:
  created:
    - backend/src/modules/email-sync/services/folder-sync-query.service.ts
    - backend/src/modules/email-sync/services/__tests__/folder-sync-query.service.spec.ts
  modified:
    - backend/src/modules/email-sync/email-sync.module.ts

key-decisions:
  - "auditFolderSyncFromPaths takes pre-fetched paths instead of fetching internally - keeps provider logic in provider services"
  - "cleanupOrphanedFolders takes explicit path list instead of calling auditFolderSync - separation of concerns"
  - "getFolderKeys is public method, not private - needed by provider services for custom counting"

patterns-established:
  - "FolderSyncQueryService pattern: shared DB ops for all provider folder syncs"
  - "P2002/P2034 retry pattern: 3 retries with 50ms*retryCount backoff"

# Metrics
duration: 12min
completed: 2026-02-01
---

# Phase 4 Plan 1: FolderSyncQueryService Extraction Summary

**Extracted shared folder database operations (P2002/P2034 retry, counts, audit, cleanup) into FolderSyncQueryService for provider-agnostic reuse**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-01T12:00:00Z
- **Completed:** 2026-02-01T12:12:00Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- Extracted syncFoldersToDatabase with P2002/P2034 retry from folder-sync.service.ts (lines 278-439)
- Extracted updateFolderCounts and updateAllFolderCounts with N+1 optimization (lines 757-969)
- Extracted getFolderKeys, audit, and cleanup methods (lines 976-1147)
- Created comprehensive unit tests (24 tests covering all methods)
- Registered service in email-sync.module.ts before FolderSyncService for DI ordering
- Final service size: 387 lines (under 500 target)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract FolderSyncQueryService** - `eb08298` (feat)
   - Created folder-sync-query.service.ts with all shared DB operations
   - Registered in email-sync.module.ts providers and exports

2. **Task 2: Create unit tests** - `1d00798` (test)
   - 24 test cases covering P2002/P2034 retry, counts, audit, cleanup
   - Note: Committed together with 04-02 files due to parallel plan execution

## Files Created/Modified

- `backend/src/modules/email-sync/services/folder-sync-query.service.ts` - FolderSyncQueryService (387 lines)
  - FolderInfo and FolderCountResult interfaces
  - syncFoldersToDatabase with P2002/P2034 retry
  - updateFolderCounts and updateAllFolderCounts
  - getFolderKeys, auditFolderSyncFromPaths, cleanupOrphanedFolders
  - deleteFoldersByPath, getDbFolderPaths, getFolders, getFolderByPath

- `backend/src/modules/email-sync/services/__tests__/folder-sync-query.service.spec.ts` - Unit tests (437 lines)
  - 24 test cases covering all service methods
  - P2002 and P2034 retry tests with mock failures
  - Count update debounce tests
  - Audit path comparison tests

- `backend/src/modules/email-sync/email-sync.module.ts` - Module registration
  - Added FolderSyncQueryService import
  - Added to providers before FolderSyncService
  - Added to exports

## Decisions Made

1. **auditFolderSyncFromPaths signature**: Takes pre-fetched path sets instead of fetching internally
   - Rationale: Provider-specific services already fetch from provider APIs; no need to re-fetch
   - Keeps provider authentication logic in provider services

2. **cleanupOrphanedFolders signature**: Takes explicit orphaned paths list
   - Rationale: Caller determines what's orphaned (from audit); service just deletes
   - Avoids circular dependency with audit method

3. **getFolderKeys visibility**: Made public instead of private
   - Rationale: Provider services need this for custom counting scenarios
   - Already used by updateFolderCounts and updateAllFolderCounts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Parallel execution coordination**: Task 2 test file was committed in 04-02's commit (1d00798) due to wave 1 parallel execution. Both plans were staging files in the same directory. Work was completed correctly; commits slightly interleaved.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- FolderSyncQueryService ready for use by provider-specific sync services
- Plans 04-02, 04-03, 04-04 can now inject FolderSyncQueryService for shared DB operations
- folder-sync.service.ts still contains all original methods; facade creation (04-04) will delegate to new service

---
*Phase: 04-service-splits*
*Plan: 01*
*Completed: 2026-02-01*
