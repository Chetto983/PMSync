---
phase: 03-imap-driver-split
plan: 05
subsystem: email
tags: [imap, idle, smtp, send, realtime, nodemailer]

# Dependency graph
requires:
  - phase: 03-02
    provides: ImapConnectionPoolService for connection management
  - phase: 03-03
    provides: ImapFolderService for folder resolution
provides:
  - ImapIdleService for real-time IDLE subscriptions
  - ImapSendService for SMTP sending and draft operations
  - Dedicated IDLE connection (not pooled) for blocking operations
  - RFC 2047 encoding for non-ASCII display names
affects: ["03-06"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dedicated connection for blocking IMAP operations (IDLE)"
    - "Exponential backoff reconnection with max attempts"
    - "Callback pattern for sendDraft to avoid circular dependencies"
    - "RFC 2047 Base64 encoding for non-ASCII email display names"

key-files:
  created:
    - backend/src/modules/email-sync/drivers/imap/services/imap-idle.service.ts
    - backend/src/modules/email-sync/drivers/imap/__tests__/imap-idle.spec.ts
    - backend/src/modules/email-sync/drivers/imap/__tests__/imap-send.spec.ts
  modified:
    - backend/src/modules/email-sync/drivers/imap/services/imap-send.service.ts

key-decisions:
  - "IDLE uses dedicated ImapFlow connection, not from pool (IDLE blocks)"
  - "sendDraft uses callbacks for getMessage/deleteMessage to avoid circular deps"
  - "RFC 2047 uses Base64 encoding (more reliable than Q-encoding)"
  - "60-second stream timeout for attachment cleanup"

patterns-established:
  - "IDLE_RECONNECT_MAX_ATTEMPTS=5, BASE_DELAY=1000ms, MAX_DELAY=30000ms"
  - "Callback pattern for cross-service operations"
  - "getIdleState() for monitoring/debugging subscription state"

# Metrics
duration: 9min
completed: 2026-02-01
---

# Phase 3 Plan 5: IDLE and Send Services Summary

**ImapIdleService and ImapSendService extraction with 29 passing unit tests covering IDLE subscriptions, SMTP sending, and draft operations**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-01T10:34:49Z
- **Completed:** 2026-02-01T10:43:38Z
- **Tasks:** 2 (IDLE service + tests, Send service refactor + tests)
- **Tests:** 29 passing (13 IDLE + 16 Send)

## Accomplishments

- Created ImapIdleService (408 lines) for real-time IDLE subscriptions
- Refactored ImapSendService (242 lines) to use ImapFolderService
- Created comprehensive unit tests: 13 for IDLE, 16 for Send
- All 29 tests pass

## Task Commits

1. **feat(03-05):** ImapIdleService with IDLE subscription management - `f791780`
   - Includes both services and both test files

## Files Created/Modified

### Created
- `backend/src/modules/email-sync/drivers/imap/services/imap-idle.service.ts` (408 lines)
- `backend/src/modules/email-sync/drivers/imap/__tests__/imap-idle.spec.ts` (219 lines)
- `backend/src/modules/email-sync/drivers/imap/__tests__/imap-send.spec.ts` (277 lines)

### Modified
- `backend/src/modules/email-sync/drivers/imap/services/imap-send.service.ts` (242 lines)
  - Changed from ImapDriverContext to SmtpConfig + userEmail
  - Added ImapFolderService dependency for folder resolution
  - Changed sendDraft signature to use callbacks

## ImapIdleService Methods

**IDLE Subscription:**
- `initialize(config)` - Initialize with IMAP configuration
- `isInitialized()` - Check if service is ready
- `subscribeToChanges(callback, folder)` - Start IDLE monitoring
- `stopIdleSubscription()` - Stop and cleanup IDLE connection
- `isActive()` - Check if subscription is active
- `getIdleState()` - Get current state for monitoring/debugging

**Internal:**
- `startIdleConnection()` - Create dedicated IDLE connection
- `cleanupIdleConnection()` - Remove listeners and close connection
- `scheduleIdleReconnect(reason, error?)` - Exponential backoff reconnection
- `setupIdleEventHandlers()` - Register exists/expunge/flags/error/close handlers
- `pathToCanonicalFolder(path)` - Convert path to canonical type via folderService

## ImapSendService Methods

**Sending:**
- `initialize(smtpConfig, userEmail)` - Initialize with SMTP configuration
- `isInitialized()` - Check if service is ready
- `getUserEmail()` - Get user email address
- `clearConfig()` - Clear configuration on disconnect
- `sendMessage(message)` - Send via SMTP and save to Sent folder

**Drafts:**
- `saveDraft(message, existingDraftId?, deleteMessage?)` - Save/update draft
- `sendDraft(draftId, getMessage, deleteMessage)` - Send draft and delete

**Internal:**
- `saveSentMessage(message)` - Save to Sent folder via IMAP APPEND
- `buildRfc822Message(message)` - Build MIME message via MimeBuilder
- `encodeRfc2047(text)` - Encode non-ASCII to Base64
- `formatEmailAddress(address)` - Format with RFC 2047 encoding

## IDLE Reconnection Constants

```typescript
IDLE_RECONNECT_MAX_ATTEMPTS = 5
IDLE_RECONNECT_BASE_DELAY_MS = 1000   // 1 second
IDLE_RECONNECT_MAX_DELAY_MS = 30000   // 30 seconds
```

Exponential backoff: `delay = min(1000 * 2^(attempts-1), 30000)`

## Decisions Made

- **IDLE uses dedicated connection:** IDLE blocks the connection, cannot be shared with pool
- **sendDraft uses callbacks:** Avoids circular dependency between SendService and MessageService
- **RFC 2047 uses Base64:** More reliable than Q-encoding for arbitrary Unicode
- **ImapFolderService for folder resolution:** Consistent folder resolution across services

## Deviations from Plan

None - plan executed exactly as written.

## Test Coverage

### ImapIdleService Tests (13)
- initialize: 2 tests (with config, before init)
- subscribeToChanges: 3 tests (fail before init, return subscription, resolve folder)
- isActive: 2 tests (when not subscribed, when subscribed)
- stopIdleSubscription: 2 tests (clean up state, safe to call multiple times)
- getIdleState: 2 tests (initial state, active state)
- subscription.unsubscribe: 1 test
- reconnection constants: 1 test

### ImapSendService Tests (16)
- initialize: 2 tests
- clearConfig: 1 test
- sendMessage: 5 tests (fail without config, send via SMTP, user email, from email, save to sent)
- saveDraft: 3 tests (save to drafts, delete existing, ignore delete failure)
- sendDraft: 2 tests (throw if not found, send and delete)
- RFC 2047 encoding: 3 tests (encode non-ASCII, ASCII passthrough, email-only)

## Next Phase Readiness

- All five extracted services now complete: pool, folder, message, idle, send
- ImapSendService was partially created in 03-06 execution, now fully refactored
- Next: 03-06 facade wiring (partially complete, may need verification)

---
*Phase: 03-imap-driver-split*
*Completed: 2026-02-01*
