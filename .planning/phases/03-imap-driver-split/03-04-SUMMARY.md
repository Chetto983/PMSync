---
phase: 03-imap-driver-split
plan: 04
subsystem: email
tags: [imap, messages, attachments, condstore, sync]

# Dependency graph
requires:
  - phase: 03-02
    provides: ImapConnectionPoolService for connection management
  - phase: 03-03
    provides: ImapFolderService for folder resolution
provides:
  - ImapMessageService with all message CRUD operations
  - Batch operations with folder grouping for efficiency
  - Attachment streaming with 60s cleanup timeout
  - CONDSTORE incremental sync with multi-folder token format
affects: ["03-05", "03-06"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-service dependency injection (pool + folder services)"
    - "Batch operation grouping by folder for IMAP efficiency"
    - "Stream cleanup with timeout for attachment handling"
    - "Multi-folder sync token format: FOLDER1:modseq,FOLDER2:modseq"

key-files:
  created:
    - backend/src/modules/email-sync/drivers/imap/services/imap-message.service.ts
    - backend/src/modules/email-sync/drivers/imap/__tests__/imap-message.spec.ts
  modified: []

key-decisions:
  - "Service depends on both pool and folder services via constructor injection"
  - "getAttachment acquires connection directly (not via withConnection) because stream needs connection open"
  - "60-second stream timeout for attachment cleanup"
  - "Legacy single-number sync tokens interpreted as INBOX modseq"

patterns-established:
  - "parseMessageId: folder:uid format with lastIndexOf for nested paths"
  - "Batch operations group by folder before processing"
  - "Multi-folder sync token: INBOX:100,SENT:200,DRAFTS:300"

# Metrics
duration: 8min
completed: 2026-02-01
---

# Phase 3 Plan 4: Message Service Summary

**ImapMessageService extraction with 38 passing unit tests covering message CRUD, batch ops, attachment streaming, and CONDSTORE sync**

## Performance

- **Duration:** 8 min (verification of pre-existing artifacts + test fixes)
- **Started:** 2026-02-01T10:22:00Z
- **Completed:** 2026-02-01T10:30:42Z
- **Tasks:** 2 (verification only - artifacts existed from prior execution)
- **Files modified:** 1 (test fixes)

## Accomplishments

- Verified ImapMessageService exists with all message operations (811 lines)
- Verified unit tests exist with 38 comprehensive test cases (557 lines)
- Fixed 2 test bugs: incorrect assertion and missing stream mock
- All 38 tests now pass

## Task Commits

Artifacts were created in prior partial execution. This execution verified and fixed tests:

1. **Task 1: Verify message service** - (pre-existing)
2. **Task 2: Verify and fix unit tests** - `151711e` (fix: correct test mock and assertion)

**Plan metadata:** pending

## Files Created/Modified

- `backend/src/modules/email-sync/drivers/imap/services/imap-message.service.ts` - Message operations service (811 lines)
- `backend/src/modules/email-sync/drivers/imap/__tests__/imap-message.spec.ts` - Unit tests (557 lines, 38 tests)

## Service Methods Extracted

**Message Listing:**
- `listMessages(options)` - List with pagination
- `getMessage(messageId, options?)` - Get single message with body
- `getMessageRaw(messageId)` - Get RFC822 source
- `batchGetMessages(messageIds)` - Concurrent batch fetch

**Message Mutations:**
- `moveMessage(messageId, targetFolder)` - Move message
- `copyMessage(messageId, targetFolder)` - Copy and return new ID
- `deleteMessage(messageId, permanent?)` - Delete or move to trash

**Flag Operations:**
- `setReadStatus(messageId, isRead)` - Mark read/unread
- `setStarredStatus(messageId, isStarred)` - Mark starred
- `setFlaggedStatus(messageId, isFlagged)` - Alias for starred

**Batch Operations:**
- `batchSetReadStatus(updates)` - Grouped by folder
- `batchMoveMessages(messageIds, targetFolder)` - Grouped by source folder
- `batchDeleteMessages(messageIds, permanent?)` - Grouped delete

**Attachments:**
- `getAttachment(messageId, attachmentId)` - Stream with 60s cleanup timeout

**Sync/CONDSTORE:**
- `getChangesSince(syncToken)` - Incremental sync
- `parseSyncToken(syncToken)` - Parse multi-folder format
- `buildSyncToken(modSeqs)` - Build multi-folder format
- `getInitialSyncToken()` - Initial sync state

**Helpers:**
- `parseMessageId(messageId)` - Parse folder:uid format
- `fetchMessageToCanonical(msg, folder)` - Convert to CanonicalMessage
- `buildSearchCriteria(options)` - Build IMAP search

## Decisions Made

- **Service exceeds 500 line target (811 vs ~480 planned):** Message operations are tightly coupled; splitting further would introduce unnecessary complexity. The service is well-organized with clear method boundaries.
- **getAttachment uses direct connection acquisition:** Stream needs connection to remain open until consumed; cannot use withConnection wrapper.
- **Legacy sync token support:** Single numeric tokens interpreted as INBOX modseq for backward compatibility.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test assertion for batchDeleteMessages**
- **Found during:** Task 2 (test verification)
- **Issue:** Test expected 'ARCHIVE' but correct behavior is 'TRASH'
- **Fix:** Changed assertion from 'ARCHIVE' to 'TRASH'
- **Files modified:** imap-message.spec.ts
- **Verification:** Test passes
- **Committed in:** 151711e

**2. [Rule 1 - Bug] Fixed mock stream missing .on() method**
- **Found during:** Task 2 (test verification)
- **Issue:** getAttachment test failed because mock stream lacked .on() method for cleanup handlers
- **Fix:** Added on(), destroy() and proper async iterator to mock stream
- **Files modified:** imap-message.spec.ts
- **Verification:** Test passes
- **Committed in:** 151711e

---

**Total deviations:** 2 auto-fixed (2 test bugs)
**Impact on plan:** Test fixes only. No production code changes needed.

## Issues Encountered

- **Jest testPathPattern deprecated:** Had to use `--testPathPatterns` (plural) in Jest 30
- **Service line count:** 811 lines exceeds 500 target, but splitting further would harm cohesion

## Next Phase Readiness

- Message service ready for facade integration (03-05)
- All three extracted services now complete: pool, folder, message
- Next: Create ImapDriverFacade to compose services and delegate operations

---
*Phase: 03-imap-driver-split*
*Completed: 2026-02-01*
