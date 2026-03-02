---
phase: 25-tools-rag
plan: 01
subsystem: ai
tags: [ai-sdk-v6, tool, zod, nestjs-di, rag, embeddings, hitl, pii]

# Dependency graph
requires:
  - phase: 24-backend-core-pipeline
    provides: AiChatService with createToolSet() closure pattern, PII resolution, HITL pipeline
provides:
  - 20 AI chat tools in 5 @Injectable() ToolsService classes
  - Email tools (send, search, read, archive, move, delete, forward, reply, draft)
  - Calendar tools (view, create, update, delete)
  - Contact tools (search, create, update)
  - Folder tools (list, create)
  - RAG tools (semantic_search, save_memory)
  - ToolsServiceInterface type for consistent getTools() signature
affects: [25-02, 25-03, 25-04, 26, 27]

# Tech tracking
tech-stack:
  added: []
  patterns: [ToolsService DI pattern, getTools() closure injection, domain service delegation]

key-files:
  created:
    - backend/src/modules/ai-chat/tools/email-tools.service.ts
    - backend/src/modules/ai-chat/tools/calendar-tools.service.ts
    - backend/src/modules/ai-chat/tools/contact-tools.service.ts
    - backend/src/modules/ai-chat/tools/folder-tools.service.ts
    - backend/src/modules/ai-chat/tools/rag-tools.service.ts
  modified:
    - backend/src/modules/ai-chat/tools/index.ts
    - backend/src/modules/ai-chat/services/ai-chat.service.ts
    - backend/src/modules/ai-chat/ai-chat.module.ts
    - backend/src/modules/ai-chat/__tests__/ai-chat-e2e.test.ts

key-decisions:
  - "delete_event maps to SCHEDULE_MEETING ActionType (DELETE_EVENT not in enum yet)"
  - "FolderToolsService uses Prisma directly (EmailFolderService is query-builder utility, not CRUD)"
  - "save_memory userId set to tenantId as placeholder (proper userId routing deferred to Phase 26)"
  - "5 needsApproval flags not 6 (no delete_contact tool per ContactToolsService spec)"

patterns-established:
  - "ToolsService pattern: @Injectable() class with getTools(tenantId, conversationId, piiResolve) returning Record<string, tool()>"
  - "PII resolution via closure: tools receive piiResolve function, call it on args before domain service calls"
  - "Domain delegation: tools are thin wrappers around existing domain services (EmailSearchService, CalendarEventsService, etc.)"

requirements-completed: [AI-02]

# Metrics
duration: 12min
completed: 2026-03-02
---

# Phase 25 Plan 01: Tools & RAG - Chat Tools Summary

**20 AI chat tools across 5 @Injectable() ToolsService classes with NestJS DI, real domain service delegation, and PII resolution via closure pattern**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-02T12:29:18Z
- **Completed:** 2026-03-02T12:41:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created 5 ToolsService classes with 20 tools covering email, calendar, contacts, folders, and RAG
- Replaced Phase 24 stub tools with real domain service calls (EmailSearchService, CalendarEventsService, ContactsService, etc.)
- Wired all ToolsService classes into AiChatModule via forwardRef imports and AiChatService via constructor DI
- Added runtime duplicate tool name detection in createToolSet()
- Updated HITL mapToolToActionType() for all 6 destructive action types

## Task Commits

Each task was committed atomically:

1. **Task 1: Create 5 ToolsService classes with all ~20 tools** - `36252f98` (feat)
2. **Task 2: Wire ToolsService classes into AiChatModule and AiChatService** - `6f804c68` (feat)

## Files Created/Modified
- `backend/src/modules/ai-chat/tools/email-tools.service.ts` - 9 email tools (383 lines)
- `backend/src/modules/ai-chat/tools/calendar-tools.service.ts` - 4 calendar tools (245 lines)
- `backend/src/modules/ai-chat/tools/contact-tools.service.ts` - 3 contact tools (221 lines)
- `backend/src/modules/ai-chat/tools/folder-tools.service.ts` - 2 folder tools (121 lines)
- `backend/src/modules/ai-chat/tools/rag-tools.service.ts` - 2 RAG tools (266 lines)
- `backend/src/modules/ai-chat/tools/index.ts` - Barrel exports + ToolsServiceInterface
- `backend/src/modules/ai-chat/services/ai-chat.service.ts` - createToolSet() merges 5 services
- `backend/src/modules/ai-chat/ai-chat.module.ts` - forwardRef imports + ToolsService providers
- `backend/src/modules/ai-chat/__tests__/ai-chat-e2e.test.ts` - Updated constructor args

## Decisions Made
- `delete_event` maps to `SCHEDULE_MEETING` ActionType since `DELETE_EVENT` is not in the Prisma enum yet. Adding it would be an architectural change (schema migration) deferred to a future phase.
- `FolderToolsService` uses PrismaService directly for folder CRUD since `EmailFolderService` is a query-builder/cache utility without list/create methods.
- `save_memory` sets `userId` to `tenantId` as a placeholder -- proper user context routing deferred to Phase 26.
- Only 5 tools have `needsApproval: true` (not 6 as listed in must_haves) because the ContactToolsService spec defines 3 tools (search/create/update) with no `delete_contact` tool.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed E2E test constructor signature**
- **Found during:** Task 2 (AiChatService wiring)
- **Issue:** `ai-chat-e2e.test.ts` directly instantiates AiChatService with old 8-param constructor; adding 5 ToolsService DI params broke it
- **Fix:** Added 5 `toolsServiceStub` arguments (`{ getTools: () => ({}) }`) to the test constructor call
- **Files modified:** `backend/src/modules/ai-chat/__tests__/ai-chat-e2e.test.ts`
- **Verification:** TypeScript compiles with zero errors
- **Committed in:** 6f804c68 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed Prisma model name for folders**
- **Found during:** Task 1 (FolderToolsService)
- **Issue:** Used `prisma.emailFolder` but Prisma model is `Folder` (mapped to `prisma.folder`)
- **Fix:** Changed to `prisma.folder`
- **Files modified:** `backend/src/modules/ai-chat/tools/folder-tools.service.ts`
- **Verification:** TypeScript compiles clean
- **Committed in:** 36252f98 (Task 1 commit)

**3. [Rule 1 - Bug] Fixed Email.to type (String[] not String)**
- **Found during:** Task 1 (EmailToolsService draft_email)
- **Issue:** Email model `to` field is `String[]` but draft creation passed a plain string
- **Fix:** Changed to `[resolved.to]` array and added required `externalId` and `sentAt` fields
- **Files modified:** `backend/src/modules/ai-chat/tools/email-tools.service.ts`
- **Verification:** TypeScript compiles clean
- **Committed in:** 36252f98 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 20 tools are wired and compiled. Ready for Plan 02 (semantic search pipeline) and Plan 03 (tool testing).
- `DELETE_EVENT` ActionType enum addition deferred (requires Prisma migration).
- `save_memory` userId placeholder needs proper user context routing in Phase 26.

## Self-Check: PASSED

All 9 key files verified present. Both task commits (36252f98, 6f804c68) verified in git log.

---
*Phase: 25-tools-rag*
*Completed: 2026-03-02*
