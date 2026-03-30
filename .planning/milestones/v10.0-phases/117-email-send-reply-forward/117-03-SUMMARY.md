---
phase: 117-email-send-reply-forward
plan: 03
subsystem: email
tags: [gap-closure, bugfix, outlook, messageId, rfc822, validation]

requires:
  - phase: 117-01
    provides: "Forward attachment fix, validation scripts"
  - phase: 117-02
    provides: "Live validation run identifying Outlook messageId bug"
provides:
  - "Outlook sent emails store RFC 822 internetMessageId for correct In-Reply-To threading"
  - "Graph API ID preserved as externalId for Outlook provider operations"
  - "Validation script tests Outlook reply instead of hardcoded SKIP"
  - "WRITE-03 accurately documented as infrastructure-blocked"
affects: []

tech-stack:
  added: []
  patterns: ["Post-send getMessage fetch for Microsoft to resolve RFC 822 internetMessageId"]

key-files:
  created: []
  modified:
    - backend/src/modules/email/services/email-send.service.ts
    - scripts/lib/validate-email-send.mjs
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Separate externalId/rfcMessageId params in saveSentEmail instead of single overloaded messageId"
  - "Graceful fallback: if getMessage fails for Microsoft, use Graph API ID as rfcMessageId rather than failing send"
  - "WRITE-03 marked Blocked (Infrastructure) not Complete: Railway blocks SMTP ports, no live validation possible"

patterns-established: []

requirements-completed: [WRITE-04]

duration: 5min
completed: 2026-03-27
---

# Phase 117 Plan 03: Gap Closure -- Outlook messageId Fix & WRITE-03 Correction

**Fixed Outlook saveSentEmail to store RFC 822 internetMessageId instead of Graph API ID; corrected WRITE-03 from false-Complete to Blocked**

## Performance

- **Duration:** 5 min
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments

### Task 1: Fix saveSentEmail for Microsoft providers (commit `2a50ddbe`)
- Split `saveSentEmail` signature: separate `externalId` (Graph API ID) and `rfcMessageId` (RFC 822 internetMessageId) parameters
- After `driver.sendMessage()` for Microsoft providers, added `driver.getMessage(messageId)` call to resolve the RFC 822 `internetMessageId`
- Prisma create now uses `externalId` for provider operations (move, delete) and `rfcMessageId` for `messageId` field (In-Reply-To threading)
- Graceful fallback: if getMessage fails, Graph API ID is used as fallback with a warning log

### Task 2: Update validation script and REQUIREMENTS.md (commit `137cc777`)
- Removed hardcoded Outlook reply SKIP -- replaced with graceful WARN for pre-fix emails with non-RFC822 messageIds
- Improved IMAP skip documentation with Railway port-blocking reason, code status, and REQUIREMENTS.md cross-reference
- Changed WRITE-03 from `[x] Complete` to `[ ] Blocked (Infrastructure)` with explanation about Railway SMTP port blocking
- Updated traceability table: WRITE-03 status changed from "Complete" to "Blocked (Infrastructure)"

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `2a50ddbe` | fix(117-03): store RFC 822 internetMessageId for Microsoft in saveSentEmail |
| 2 | `137cc777` | chore(117-03): update validation script and mark WRITE-03 as Blocked |

---
*Phase: 117-email-send-reply-forward*
*Completed: 2026-03-27*
