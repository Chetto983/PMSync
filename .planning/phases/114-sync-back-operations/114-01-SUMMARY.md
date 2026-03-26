---
phase: 114-sync-back-operations
plan: 01
subsystem: email
tags: [gmail, sync-back, labels, validation, playwright]

requires:
  - phase: 112-full-sync-validation
    provides: validation infrastructure (validation-helpers.mjs, CDP connection, assertion helpers)
provides:
  - SYNC-13 fix: bulkAddLabels/bulkRemoveLabels sync-back to Gmail via Folder.externalId lookup
  - addLabel/removeLabel operations in EmailSyncOperation type
  - Gmail sync-back handling for addLabel/removeLabel (single + batch)
  - apiPatch and apiDelete helpers in validation-helpers.mjs
  - Sync-back validation script covering SYNC-09, SYNC-10, SYNC-11
affects: [114-02, email-sync, email-bulk-operations]

tech-stack:
  added: []
  patterns: [Folder.externalId as canonical Gmail label ID resolver, label sync-back via provider-filtered batch operations]

key-files:
  created:
    - scripts/lib/validate-syncback.mjs
    - scripts/validate-syncback.mjs
  modified:
    - backend/src/modules/email/types/sync-back.types.ts
    - backend/src/modules/email/services/gmail-sync-back.service.ts
    - backend/src/modules/email/services/email-bulk.service.ts
    - scripts/lib/validation-helpers.mjs

key-decisions:
  - "Use Folder.externalId (not a new mapping table) to resolve UserLabel names to Gmail label IDs"
  - "Filter sync-back to GOOGLE providers only since Gmail treats folders as labels"
  - "Skip sync-back silently (debug log) when no Folder match found rather than failing"

patterns-established:
  - "Label sync-back resolution: UserLabel.name -> Folder.externalId by providerId"

requirements-completed: [SYNC-09, SYNC-10, SYNC-11, SYNC-13]

duration: 20min
completed: 2026-03-26
---

# Phase 114 Plan 01: Sync-Back Operations Summary

**Fixed SYNC-13 label sync-back bug via Folder.externalId resolution, added addLabel/removeLabel to Gmail sync paths, and created validation scripts for mark-read/star/move-to-folder roundtrips**

## Performance

- **Duration:** 20 min
- **Started:** 2026-03-26T09:41:57Z
- **Completed:** 2026-03-26T10:02:04Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Fixed SYNC-13: bulkAddLabels/bulkRemoveLabels now call syncOperationsBatch for Gmail providers, resolving label IDs via Folder.externalId
- Extended EmailSyncOperation with addLabel/removeLabel operations and labelExternalId field
- Added addLabel/removeLabel handling in GmailSyncBackService (single message modify + batch batchModify)
- Created apiPatch and apiDelete helpers for validation scripts
- Created sync-back validation script covering SYNC-09 (mark-read/unread), SYNC-10 (star/unstar), SYNC-11 (move-to-folder)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix SYNC-13 label sync-back bug + add apiPatch/apiDelete helpers** - `0a40b733` (fix) - pre-existing commit by user
2. **Task 2: Create sync-back validation scripts** - `7c4c6ffa` (feat)

## Files Created/Modified
- `backend/src/modules/email/types/sync-back.types.ts` - Added addLabel/removeLabel to operation union, labelExternalId field
- `backend/src/modules/email/services/gmail-sync-back.service.ts` - Added addLabel/removeLabel cases in syncToGmail and batch grouping in syncGmailBatch
- `backend/src/modules/email/services/email-bulk.service.ts` - Added syncLabelOperationsToProviders helper, wired bulkAddLabels/bulkRemoveLabels to sync-back
- `scripts/lib/validation-helpers.mjs` - Added apiPatch and apiDelete helper functions
- `scripts/lib/validate-syncback.mjs` - Sync-back validation module (SYNC-09/10/11)
- `scripts/validate-syncback.mjs` - CLI orchestrator with --provider and --quick flags

## Decisions Made
- Used Folder.externalId as canonical Gmail label ID resolver (Folder model already maps Gmail labels since Gmail folders ARE labels)
- Filtered sync-back to GOOGLE providers only in syncLabelOperationsToProviders
- Skip sync-back with debug log when no Folder match found for a UserLabel name (rather than error)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Gitignore excluded new validation scripts**
- **Found during:** Task 2
- **Issue:** scripts/* glob in .gitignore blocked scripts/validate-syncback.mjs from being committed
- **Fix:** Added !scripts/lib/validate-syncback.mjs and !scripts/validate-syncback.mjs exceptions to .gitignore
- **Files modified:** .gitignore
- **Verification:** git add succeeded after fix
- **Committed in:** 7c4c6ffa (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Trivial gitignore addition. No scope creep.

## Issues Encountered
- Task 1 changes were already committed by user in `0a40b733` ("clean fix"). All acceptance criteria verified against existing code -- no new commit needed for Task 1.
- Pre-existing type error in labels.service.ts (unrelated to this plan) -- out of scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Sync-back validation scripts ready to run against live providers via Edge CDP
- Plan 02 checkpoint will verify remote provider state after sync-back
- All local roundtrip tests can be executed with `node scripts/validate-syncback.mjs --provider=gmail --quick`

---
*Phase: 114-sync-back-operations*
*Completed: 2026-03-26*
