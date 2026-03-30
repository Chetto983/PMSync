---
phase: 117-email-send-reply-forward
plan: 01
subsystem: email
tags: [s3, attachments, forward, send, reply, validation, playwright-cdp]

requires:
  - phase: 116-attachments-search
    provides: "Validation helpers, CDP pattern, attachment download endpoints"
provides:
  - "StorageService.getObject(key) for downloading S3 objects as Buffer"
  - "Forward emails now include original attachments fetched from S3"
  - "Validation scripts for WRITE-01..05 (send/reply/forward) across all providers"
affects: [117-02, 122-cross-cutting]

tech-stack:
  added: []
  patterns: ["S3 object download via GetObjectCommand stream-to-Buffer", "Per-provider validation with results collector pattern"]

key-files:
  created:
    - scripts/validate-email-send.mjs
    - scripts/lib/validate-email-send.mjs
  modified:
    - backend/src/modules/email/services/storage.service.ts
    - backend/src/modules/email/services/email-send.service.ts
    - .gitignore

key-decisions:
  - "Graceful degradation on attachment fetch failure: skip individual attachments with logger.warn rather than failing the entire forward"
  - "Null-check storagePath before getObject call to handle metadata-only attachments"

patterns-established:
  - "StorageService.getObject pattern: GetObjectCommand + stream iteration to Buffer"
  - "Validation lib per-provider results: { name, checks, passed, failed, failures } with setResultsCollector"

requirements-completed: [WRITE-01, WRITE-02, WRITE-03, WRITE-04, WRITE-05]

duration: 6min
completed: 2026-03-27
---

# Phase 117 Plan 01: Email Send/Reply/Forward Bug Fix & Validation Summary

**Fixed forward-attachments bug (WRITE-05) by adding StorageService.getObject and wiring original attachment fetch into forwardEmail, plus validation scripts for all 5 WRITE requirements**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-27T07:44:48Z
- **Completed:** 2026-03-27T07:51:09Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Fixed the confirmed forward-attachments bug: forwardEmail now fetches original attachments from S3 via StorageService.getObject and merges them with user-provided attachments
- Added StorageService.getObject(key): Promise<Buffer> method for downloading S3 objects
- Created validation orchestrator + lib scripts covering WRITE-01..05 with per-provider iteration

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix forward-attachments bug** - `abbf1e23` (fix)
2. **Task 2: Create validation scripts** - `22164b19` (feat)

## Files Created/Modified
- `backend/src/modules/email/services/storage.service.ts` - Added getObject(key) method using GetObjectCommand + stream-to-Buffer
- `backend/src/modules/email/services/email-send.service.ts` - Injected StorageService, updated forwardEmail to include attachments in Prisma query, fetch from S3, merge with user attachments
- `scripts/validate-email-send.mjs` - Orchestrator accepting --provider flag, CDP connection, report output
- `scripts/lib/validate-email-send.mjs` - Per-provider send/reply/forward validation with assertTrue/assertEqual assertions
- `.gitignore` - Added negation entries for new validation scripts

## Decisions Made
- Graceful degradation: individual attachment fetch failures are logged as warnings and skipped, rather than failing the entire forward operation
- Null-check on storagePath before calling getObject, since Prisma schema allows nullable storagePath for metadata-only attachments
- apiPost signature follows existing validation-helpers.mjs: (context, path, body, cookieHeader, csrfToken) -- plan had wrong order, corrected during execution

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Null storagePath guard in forwardEmail**
- **Found during:** Task 1 (tsc --noEmit)
- **Issue:** Prisma EmailAttachment.storagePath is `string | null`, causing TS2345 when passed to getObject(key: string)
- **Fix:** Added null check with `continue` and logger.warn for attachments without storagePath
- **Files modified:** backend/src/modules/email/services/email-send.service.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** abbf1e23

**2. [Rule 3 - Blocking] .gitignore blocking new validation scripts**
- **Found during:** Task 2 (git add)
- **Issue:** Scripts directory has a blanket ignore with selective negation entries; new files were being ignored
- **Fix:** Added `!scripts/validate-email-send.mjs` and `!scripts/lib/validate-email-send.mjs` negation entries
- **Files modified:** .gitignore
- **Verification:** git add succeeded
- **Committed in:** 22164b19

**3. [Rule 1 - Bug] Fixed assertTrue/assertEqual call signatures in validation lib**
- **Found during:** Task 2 (reading validation-helpers.mjs)
- **Issue:** Plan showed assertTrue(condition, label, results) but actual signature is assertTrue(condition, label) with module-level collector
- **Fix:** Removed extra results parameter, used setResultsCollector per-provider pattern matching validate-attachments-search.mjs
- **Files modified:** scripts/lib/validate-email-send.mjs
- **Verification:** `node --input-type=module -e "import { validateEmailSend } from '...'"` succeeds
- **Committed in:** 22164b19

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Forward-attachments bug fixed, ready for production validation
- Validation scripts ready to run against live providers via Edge CDP
- Plan 02 (if exists) can proceed with draft/scheduled send or additional write operations

---
*Phase: 117-email-send-reply-forward*
*Completed: 2026-03-27*
