---
phase: 87-ai-chat-module-fix
plan: 02
subsystem: api
tags: [nestjs, prisma, ai-chat, email-tools, retry, summary-generation]

requires:
  - phase: 87-ai-chat-module-fix
    provides: "RED tests for BUG-1, BUG-5, RACE-1 (87-00), security isolation (87-01)"
provides:
  - "reply_email replyAll CC handling (BUG-1 fix)"
  - "Summary generation triggers every 10 messages after threshold, not every message (BUG-5 fix)"
  - "withPrismaRetry on all conversation service transactions (RACE-1 fix)"
affects: [ai-chat, email-tools, conversation-service]

tech-stack:
  added: []
  patterns: ["Modulo-based trigger gating for periodic async tasks", "withPrismaRetry wrapping all Prisma.$transaction calls"]

key-files:
  created: []
  modified:
    - backend/src/modules/ai-chat/tools/email-tools.service.ts
    - backend/src/modules/ai-chat/services/ai-chat.service.ts
    - backend/src/modules/ai-chat/services/conversation.service.ts

key-decisions:
  - "replyAll CC includes original CC + original To, minus sender address, deduplicated via Set"
  - "Summary trigger uses modulo: fires at messageCount 20, 30, 40... via (messageCount - 20) % 10 === 0"
  - "withPrismaRetry wraps all 4 transactional methods in ConversationService: saveUserMessage, saveAssistantMessage, saveToolMessage, saveToolMessagesBatch"

patterns-established:
  - "CC deduplication via Set for reply-all: new Set([...original.cc, ...original.to].filter(...))"
  - "Periodic async trigger pattern: count >= threshold && (count - threshold) % interval === 0"

requirements-completed: [BUG-1, BUG-5, RACE-1]

duration: 3min
completed: 2026-03-19
---

# Phase 87 Plan 02: High-Severity Bug Fixes Summary

**reply_email replyAll CC handling, modulo-based summary trigger, and withPrismaRetry on all conversation transactions**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-19T15:33:46Z
- **Completed:** 2026-03-19T15:36:50Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- reply_email with replyAll=true now includes original CC + To recipients (minus sender) in outbound CC field (BUG-1)
- Summary generation triggers at message counts 20, 30, 40... instead of every message after 20 (BUG-5)
- All 4 transactional methods in ConversationService wrapped with withPrismaRetry for P2002/P2034 resilience (RACE-1)
- All 8 bug-fixes.test.ts tests GREEN, zero TypeScript errors

## Task Commits

Implementation was committed prior to plan execution in a single commit:

1. **Task 1: Fix reply_email replyAll + CC handling (BUG-1) and wrap transactions with withPrismaRetry (RACE-1)** - `f3a5f720` (fix)
2. **Task 2: Fix summary generation re-triggering (BUG-5)** - `f3a5f720` (fix)

Note: All three fixes (BUG-1, BUG-5, RACE-1) were implemented and committed in `f3a5f720` before plan execution. Plan execution verified correctness via test suite and type-check.

## Files Created/Modified
- `backend/src/modules/ai-chat/tools/email-tools.service.ts` - replyAll CC handling: reads original CC+To, deduplicates via Set, passes to queueSend
- `backend/src/modules/ai-chat/services/ai-chat.service.ts` - Summary trigger changed from `> 20` to `(messageCount - 20) % 10 === 0`
- `backend/src/modules/ai-chat/services/conversation.service.ts` - All 4 transactional methods wrapped with withPrismaRetry

## Decisions Made
- replyAll CC builds combined list from original.cc + original.to, minus the sender address, deduplicated via Set -- prevents duplicate CC entries
- Summary trigger uses modulo arithmetic: fires at exactly 20, 30, 40 etc. -- simple, deterministic, no state required
- withPrismaRetry imported as namespace (`import * as PrismaRetry`) and used as `PrismaRetry.withPrismaRetry()` -- consistent with existing pattern

## Deviations from Plan

### Pre-committed Implementation

All three fixes (BUG-1, BUG-5, RACE-1) were already implemented and committed in `f3a5f720` before plan execution started. Plan execution verified:
1. All 8 bug-fixes.test.ts tests pass (BUG-1: 2 tests, BUG-5: 4 tests, RACE-1: 1 test, RACE-4: 1 test)
2. Zero TypeScript errors (`npx tsc --noEmit` clean)
3. Implementation matches plan requirements exactly

---

**Total deviations:** 0 (code was already correct, tests all GREEN)
**Impact on plan:** None -- implementation verified as complete and correct.

## Issues Encountered
- 4 E2E test suites fail due to Supabase compute quota exceeded (pre-existing infrastructure issue, not related to this plan)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- BUG-1, BUG-5, RACE-1 all resolved
- Ready for 87-03 (medium severity: draft sentAt, piiResolve, auto-resolve, embedding dedup, batched persistence, count-from-save)

---
*Phase: 87-ai-chat-module-fix*
*Completed: 2026-03-19*

## Self-Check: PASSED
