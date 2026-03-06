---
phase: 49-zero-circular-dependencies
plan: 03
subsystem: architecture
tags: [nestjs, forwardRef, circular-dependency, madge, global-module]

requires:
  - phase: 49-01
    provides: shared types extracted for 8 cycles
  - phase: 49-02
    provides: inline interface types and locale types for 6 cycles
provides:
  - Zero circular dependencies across entire backend/src (madge --circular clean)
  - Zero forwardRef calls in production module files
  - @Global() StorageModule with AttachmentStorageService
affects: [all-backend-modules, email, email-sync, calendar, storage]

tech-stack:
  added: []
  patterns: ["@Global() module for cross-cutting storage services to break NestJS module cycles"]

key-files:
  created: []
  modified:
    - backend/src/modules/email/storage.module.ts
    - backend/src/modules/email/email.module.ts
    - backend/src/modules/email-sync/email-sync.module.ts
    - backend/src/modules/calendar/calendar.module.ts

key-decisions:
  - "@Global() StorageModule with AttachmentStorageService+AttachmentMetricsService to break EmailModule<->EmailSyncModule cycle"
  - "Direct AiModule import in EmailSyncModule (no cycle exists -- AiModule does not import EmailSyncModule)"

patterns-established:
  - "@Global() StorageModule pattern: storage services available everywhere without module import"

requirements-completed: [DEBT-09, DEBT-10]

duration: 6min
completed: 2026-03-06
---

# Phase 49 Plan 03: Module forwardRef Elimination Summary

**@Global() StorageModule breaks EmailModule/EmailSyncModule/CalendarModule forwardRef cycle -- zero madge circular dependencies, zero forwardRef in production**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-06T09:43:20Z
- **Completed:** 2026-03-06T09:49:09Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Eliminated all 3 remaining forwardRef() calls across email.module.ts, email-sync.module.ts, calendar.module.ts
- Made StorageModule @Global() with AttachmentStorageService + AttachmentMetricsService -- breaks the cycle at its root
- madge --circular reports "No circular dependency found" across all 544 backend files
- Zero forwardRef calls remain in any production module file

## Task Commits

Each task was committed atomically:

1. **Task 1: Break EmailModule and EmailSyncModule forwardRef cycle** - `bdbdbe49` (feat)
2. **Task 2: Full madge --circular verification** - verification only (no code changes)

## Files Created/Modified
- `backend/src/modules/email/storage.module.ts` - Made @Global(), added AttachmentStorageService + AttachmentMetricsService
- `backend/src/modules/email/email.module.ts` - Removed forwardRef(() => EmailSyncModule), removed duplicate AttachmentStorageService/AttachmentMetricsService providers
- `backend/src/modules/email-sync/email-sync.module.ts` - Removed forwardRef(() => EmailModule) and forwardRef(() => AiModule), direct AiModule import
- `backend/src/modules/calendar/calendar.module.ts` - Removed forwardRef(() => EmailSyncModule), direct import

## Decisions Made
- **@Global() StorageModule** chosen over extracting SyncAuthModule because EmailSyncModule's only dependency on EmailModule was AttachmentStorageService/StorageService -- both storage concerns that naturally belong in a global storage module
- **Direct AiModule import** in EmailSyncModule: AiModule doesn't import EmailSyncModule, so forwardRef was unnecessary once the EmailModule<->EmailSyncModule cycle was broken
- **AttachmentStorageService + AttachmentMetricsService moved to StorageModule**: These are storage-concern services, logically belonging with StorageService. Removed from EmailModule providers/exports to avoid duplicate instances.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 14 madge circular dependency chains eliminated across Phase 49 (plans 01, 02, 03)
- Phase 49 complete: zero circular dependencies, zero forwardRef in production
- Backend ready for any future module restructuring without cycle concerns

---
*Phase: 49-zero-circular-dependencies*
*Completed: 2026-03-06*
