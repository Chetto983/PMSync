---
phase: 87-ai-chat-module-fix
plan: 04
subsystem: ai-chat
tags: [nestjs, dead-code, file-split, refactor, cleanup]

requires:
  - phase: 87-03
    provides: Bug fixes for ai-chat module (RACE-4 saveToolMessagesBatch, BUG-5/6 fixes)
provides:
  - Dead code removed (DEAD-1 through DEAD-5)
  - ai-chat.service.ts under 500 lines via ChatEnrichmentService extraction
  - ProductivityToolsService split into EmailProductivityToolsService + FollowUpToolsService
  - NestJS module providers updated with new split services
affects: [ai-chat]

tech-stack:
  added: []
  patterns:
    - ChatEnrichmentService pattern for non-core enrichment logic (title/summary/context)
    - Focused tool service pattern (one service per domain concern)

key-files:
  created:
    - backend/src/modules/ai-chat/services/chat-enrichment.service.ts
    - backend/src/modules/ai-chat/tools/email-productivity-tools.service.ts
    - backend/src/modules/ai-chat/tools/follow-up-tools.service.ts
  modified:
    - backend/src/modules/ai-chat/services/ai-chat.service.ts
    - backend/src/modules/ai-chat/ai-chat.module.ts
    - backend/src/modules/ai-chat/tools/index.ts

key-decisions:
  - "Delete ProductivityToolsService entirely (not thin barrel) since new services fully replace it"
  - "ChatEnrichmentService holds title gen, summary gen, and runtime context metadata"
  - "EmailProductivityToolsService.getTools takes only tenantId (no userId needed for email ops)"

patterns-established:
  - "ChatEnrichmentService: extracted enrichment concern from orchestrator"
  - "Focused tool services: EmailProductivityToolsService + FollowUpToolsService instead of monolithic ProductivityToolsService"

requirements-completed: [DEAD-1, DEAD-2, DEAD-3, DEAD-4, DEAD-5, RULE-3]

duration: 14min
completed: 2026-03-19
---

# Phase 87 Plan 04: Dead Code Removal and File Splits Summary

**Removed 5 dead code items (unused interface, file, defaults, params) and split 2 oversized files under 500-line limit via 3 new focused services**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-19T15:48:29Z
- **Completed:** 2026-03-19T16:02:58Z
- **Tasks:** 3
- **Files modified:** 17

## Accomplishments
- Removed all dead code: ToolsServiceInterface, chat-response.dto.ts, tenantId='system' defaults, unused _conversationId/_piiResolve params
- Split ai-chat.service.ts from 722 to 494 lines via ChatEnrichmentService extraction
- Split ProductivityToolsService (558 lines) into EmailProductivityToolsService (382 lines) + FollowUpToolsService (219 lines)
- All 52 unit tests pass, zero TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove dead code (DEAD-1 through DEAD-5)** - `e72d52a4` (fix)
2. **Task 2: Create extracted service files for file splits** - `9663757e` (feat)
3. **Task 3: Rewire ai-chat.service.ts, productivity-tools.service.ts, and ai-chat.module.ts** - `33e3cbde` (refactor)

## Files Created/Modified
- `backend/src/modules/ai-chat/services/chat-enrichment.service.ts` - Extracted title gen, summary gen, runtime context
- `backend/src/modules/ai-chat/tools/email-productivity-tools.service.ts` - list_email_index, star, read, label tools
- `backend/src/modules/ai-chat/tools/follow-up-tools.service.ts` - list_follow_ups, update_follow_up tools
- `backend/src/modules/ai-chat/services/ai-chat.service.ts` - Slim orchestrator (494 lines)
- `backend/src/modules/ai-chat/ai-chat.module.ts` - Updated providers array
- `backend/src/modules/ai-chat/tools/index.ts` - Updated barrel exports
- `backend/src/modules/ai-chat/dto/chat-response.dto.ts` - DELETED
- `backend/src/modules/ai-chat/tools/productivity-tools.service.ts` - DELETED
- 7 tool service files - Removed _conversationId params
- 6 test files - Updated constructor signatures

## Decisions Made
- Deleted ProductivityToolsService entirely rather than keeping as barrel -- new services fully replace it
- ChatEnrichmentService extracts title gen, summary gen, runtime context from AiChatService
- Removed _conversationId from ALL tool services (not just productivity/reminder) since none used it

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed chat-ledger test for saveToolMessagesBatch API**
- **Found during:** Task 1
- **Issue:** Test expected saveToolMessage (singular) but code uses saveToolMessagesBatch (changed in Plan 03 RACE-4)
- **Fix:** Updated test mock and assertion to use saveToolMessagesBatch with batch argument format
- **Files modified:** backend/src/modules/ai-chat/__tests__/chat-ledger.test.ts
- **Verification:** Test passes
- **Committed in:** e72d52a4

**2. [Rule 1 - Bug] Removed _conversationId from ALL tool services, not just productivity/reminder**
- **Found during:** Task 1
- **Issue:** Plan mentioned productivity/reminder for DEAD-4 but grep revealed 7 tool files with unused _conversationId
- **Fix:** Removed from email, calendar, contact, folder, rag tool services too, and updated all callers
- **Files modified:** 7 tool service files + ai-chat.service.ts + 3 test files
- **Verification:** Type-check passes, all tests pass
- **Committed in:** e72d52a4

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both auto-fixes necessary for correctness. Broader _conversationId cleanup was the right call per plan's "be systematic" instruction.

## Issues Encountered
- Supabase compute quota exceeded -- 3 e2e test suites (tools-rag-real-e2e, ai-chat-e2e, conversation.test) fail on DB connection, not code. All 52 unit tests pass.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 87 complete: all 4 plans executed (security fix, race conditions, bug fixes, dead code cleanup)
- AI-chat module is clean, all files under 500 lines, no dead code
- Ready for next milestone phase

---
*Phase: 87-ai-chat-module-fix*
*Completed: 2026-03-19*
