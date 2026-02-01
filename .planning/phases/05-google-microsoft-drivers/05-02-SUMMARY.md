---
phase: 05-google-microsoft-drivers
plan: 02
subsystem: email-drivers
tags: [gmail, microsoft-graph, send-operations, driver-split, service-extraction]

# Dependency graph
requires:
  - phase: 05-01
    provides: GmailMessageService and MicrosoftMessageService for message operations
provides:
  - GmailSendService (310 lines) with send/draft/move/delete operations
  - MicrosoftSendService (324 lines) with send/draft/move/delete operations
  - Callback pattern for cross-service dependencies (MicrosoftSendService uses resolveFolderId)
  - Batch operations with failure tracking (20% threshold)
affects: [05-03-sync-service-extraction, 05-04-facade-refactor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Callback pattern for cross-service calls (avoids circular dependencies)"
    - "Batch operations with failure tracking and threshold-based error reporting"
    - "Service initialization pattern with initialize() and clear() methods"

key-files:
  created:
    - backend/src/modules/email-sync/drivers/google/services/gmail-send.service.ts
    - backend/src/modules/email-sync/drivers/microsoft/services/microsoft-send.service.ts
  modified:
    - backend/src/modules/email-sync/drivers/drivers.module.ts

key-decisions:
  - "GmailSendService (310 lines) and MicrosoftSendService (324 lines) under 350-line target"
  - "Callback pattern used in MicrosoftSendService for folder resolution (avoids circular deps)"
  - "Services extracted but not yet wired to drivers (deferred to Plan 05-04)"

patterns-established:
  - "Callback pattern: Services accept callbacks for cross-service operations instead of direct injection"
  - "Initialize/clear lifecycle: Services initialized with external dependencies, cleared on disconnect"
  - "Batch failure tracking: Track failures, log warnings, throw if >20% failure rate"

# Metrics
duration: 4min
completed: 2026-02-01
---

# Phase 05 Plan 02: Send Service Extraction Summary

**Gmail and Microsoft send/draft/move/delete operations extracted into dedicated services under 350 lines each, using callback pattern to avoid circular dependencies**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-01T16:18:08Z
- **Completed:** 2026-02-01T16:22:06Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 updated)

## Accomplishments
- Extracted GmailSendService (310 lines) with all send/draft/move/delete operations
- Extracted MicrosoftSendService (324 lines) with all send/draft/move/delete operations
- Registered both services in DriversModule for DI
- Both services well under 350-line target
- Type check passes with no errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract GmailSendService** - `03d30ec` (feat)
2. **Task 2: Extract MicrosoftSendService** - `fd81dd0` (feat)
3. **Task 3: Update DriversModule** - `e5dd042` (feat)

## Files Created/Modified

### Created
- `backend/src/modules/email-sync/drivers/google/services/gmail-send.service.ts` (310 lines)
  - sendMessage, saveDraft, sendDraft operations
  - moveMessage, copyMessage, deleteMessage operations
  - batchMoveMessages, batchDeleteMessages operations
  - Uses MimeBuilder from common/utils for MIME encoding
  - Preserves immutable labels handling (UNREAD, STARRED, IMPORTANT, SENT, DRAFT)
  - Preserves ARCHIVE handling (remove INBOX label, not add label)
  - Preserves SENT folder skip (Gmail applies automatically)
  - executeWithRetry wrapper for rate limit/auth error handling

- `backend/src/modules/email-sync/drivers/microsoft/services/microsoft-send.service.ts` (324 lines)
  - sendMessage, saveDraft, sendDraft operations
  - moveMessage, copyMessage, deleteMessage operations
  - batchMoveMessages, batchDeleteMessages operations
  - Callback pattern for resolveFolderId (avoids circular deps)
  - Preserves BUG-3 FIX: save-then-send pattern for sendMessage
  - Preserves trash folder resolution in deleteMessage
  - Batch operations include failure tracking and 20% threshold
  - executeWithRetry wrapper for rate limit/auth error handling
  - composeToGraphMessage conversion helper for Graph API format

### Modified
- `backend/src/modules/email-sync/drivers/drivers.module.ts`
  - Added GmailSendService to providers and exports
  - Added MicrosoftSendService to providers and exports
  - Updated module documentation for Wave 1 & 2 progress

## Decisions Made

1. **Line counts under target despite comprehensive operations**
   - GmailSendService: 310 lines (target <350)
   - MicrosoftSendService: 324 lines (target <350)
   - Both include 8+ methods with full error handling
   - Rationale: Focused services without extraneous code

2. **Callback pattern for Microsoft folder resolution**
   - MicrosoftSendService uses resolveFolderIdFn callback instead of direct injection
   - Avoids circular dependency between send service and folder/driver
   - Pattern borrowed from IMAP driver (ImapSendService)
   - Rationale: Gmail doesn't need this because it uses simple label IDs

3. **Services not yet wired to drivers**
   - Services registered in DriversModule but drivers still have original code
   - Deferred to Plan 05-04 (facade refactor) for safe integration
   - Rationale: Wave-based extraction prevents breaking changes mid-phase

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - extraction was straightforward with clear separation of send operations.

## Next Phase Readiness

**Wave 2 complete.** Ready for:
- Plan 05-03: Extract sync services (folder sync, delta sync, webhook handlers)
- Plan 05-04: Refactor driver facades to delegate to extracted services

**No blockers.** All services extracted, registered, and type-checking passes.

---
*Phase: 05-google-microsoft-drivers*
*Completed: 2026-02-01*
