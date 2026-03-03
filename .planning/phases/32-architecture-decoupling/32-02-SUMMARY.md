---
phase: 32-architecture-decoupling
plan: 02
subsystem: infra
tags: [nestjs, di, tool-registry, forwardref, decoupling]

requires:
  - phase: 32-architecture-decoupling
    provides: "@Global() ToolRegistryModule with TOOL_REGISTRY_SERVICE provider"
provides:
  - "4 IAiTool wrappers (EmailSearchTool, CalendarTool, ContactsTool, RagTool) in domain modules"
  - "OnModuleInit self-registration pattern for all 4 domain modules"
  - "AiChatModule with zero forwardRef imports to domain modules"
  - "STORAGE_SERVICE provider registered and exported in EmailModule"
  - "TOOL_REGISTRY_SERVICE injected in AiChatService for tool discovery"
affects: [32-03, 32-04, architecture-decoupling]

tech-stack:
  added: []
  patterns: ["IAiTool wrapper + OnModuleInit self-registration in domain modules", "Direct module import replacing forwardRef"]

key-files:
  created:
    - backend/src/modules/email/tools/email-search.tool.ts
    - backend/src/modules/calendar/tools/calendar.tool.ts
    - backend/src/modules/contacts/tools/contacts.tool.ts
    - backend/src/modules/ai/tools/rag.tool.ts
  modified:
    - backend/src/modules/ai-chat/ai-chat.module.ts
    - backend/src/modules/ai-chat/services/ai-chat.service.ts
    - backend/src/modules/email/email.module.ts
    - backend/src/modules/calendar/calendar.module.ts
    - backend/src/modules/contacts/contacts.module.ts
    - backend/src/modules/ai/ai.module.ts
    - backend/src/modules/ai-chat/__tests__/ai-chat-e2e.test.ts
    - backend/src/modules/ai-chat/__tests__/chat-pipeline-msw.test.ts
    - backend/src/modules/ai-chat/__tests__/tools-rag-e2e.test.ts
    - backend/src/modules/ai-chat/__tests__/tools-rag-real-e2e.test.ts

key-decisions:
  - "Direct module imports replace forwardRef -- AiChatModule is not part of the Email<->Ai circular chain"
  - "IAiTool wrappers provide metadata and simple execute; existing ToolsService classes stay as AI SDK adapter layer with PII closures"
  - "STORAGE_SERVICE uses StorageService (S3 wrapper) via useExisting -- Plan 03 will adapt as needed"

patterns-established:
  - "IAiTool wrapper pattern: @Injectable() class implementing IAiTool in domain module's tools/ directory"
  - "OnModuleInit self-registration: domain module injects TOOL_REGISTRY_SERVICE and registers its tools"

requirements-completed: [ARCH-01, ARCH-02]

duration: 11min
completed: 2026-03-03
---

# Phase 32 Plan 02: AiChatModule Decoupling Summary

**4 IAiTool wrappers with OnModuleInit self-registration, AiChatModule zero-forwardRef, STORAGE_SERVICE provider in EmailModule**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-03T14:37:05Z
- **Completed:** 2026-03-03T14:47:36Z
- **Tasks:** 1
- **Files modified:** 14

## Accomplishments
- Created 4 IAiTool wrapper classes (EmailSearchTool, CalendarTool, ContactsTool, RagTool) in domain module tools/ directories
- Wired OnModuleInit self-registration in EmailModule, CalendarModule, ContactsModule, AiModule -- each injects TOOL_REGISTRY_SERVICE and registers its tool(s)
- Eliminated all forwardRef() calls from AiChatModule (replaced with direct imports)
- Registered STORAGE_SERVICE provider in EmailModule (useExisting: StorageService) and added to exports for Plan 03 consumption
- Injected TOOL_REGISTRY_SERVICE into AiChatService for tool discovery
- Updated 4 test files with toolRegistry stub to match new constructor signature

## Task Commits

Each task was committed atomically:

1. **Task 1: Create IAiTool wrappers and wire AiChatModule via ToolRegistry** - `37d2e0a0` (feat)

## Files Created/Modified
- `backend/src/modules/email/tools/email-search.tool.ts` - IAiTool wrapper delegating to EmailSearchService
- `backend/src/modules/calendar/tools/calendar.tool.ts` - IAiTool wrapper delegating to CalendarEventsService
- `backend/src/modules/contacts/tools/contacts.tool.ts` - IAiTool wrapper delegating to ContactsService
- `backend/src/modules/ai/tools/rag.tool.ts` - IAiTool wrapper delegating to KnowledgeBaseService
- `backend/src/modules/email/email.module.ts` - Added EmailSearchTool provider, STORAGE_SERVICE provider/export, OnModuleInit registration
- `backend/src/modules/calendar/calendar.module.ts` - Added CalendarTool provider, OnModuleInit registration
- `backend/src/modules/contacts/contacts.module.ts` - Added ContactsTool provider, OnModuleInit registration
- `backend/src/modules/ai/ai.module.ts` - Added RagTool provider, OnModuleInit registration (alongside existing config validation)
- `backend/src/modules/ai-chat/ai-chat.module.ts` - Removed forwardRef from all 4 domain module imports
- `backend/src/modules/ai-chat/services/ai-chat.service.ts` - Added TOOL_REGISTRY_SERVICE injection for discovery
- `backend/src/modules/ai-chat/__tests__/*.test.ts` - 4 test files updated with toolRegistry stub

## Decisions Made
- Direct module imports replace forwardRef because AiChatModule is not part of the Email<->Ai circular dependency chain -- the forwardRef was a defensive measure, not a necessity
- IAiTool wrappers provide metadata and simple execute(); existing ToolsService classes in AiChatModule remain as the AI SDK adapter layer with PII closures per RESEARCH.md Pitfall 4
- STORAGE_SERVICE aliased to StorageService (low-level S3 wrapper) rather than AttachmentStorageService because it's closer to the IStorageService interface contract; Plan 03 will adapt as needed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test files needed toolRegistry stub parameter**
- **Found during:** Task 1 (TypeScript compile verification)
- **Issue:** 4 test files construct AiChatService manually with positional args. Adding the new toolRegistry constructor parameter broke compilation.
- **Fix:** Added `{ getAllTools: () => [], getToolNames: () => [], getTool: () => undefined, registerTool: () => {} } as any` stub to all 4 test files
- **Files modified:** ai-chat-e2e.test.ts, chat-pipeline-msw.test.ts, tools-rag-e2e.test.ts, tools-rag-real-e2e.test.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** 37d2e0a0 (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix was necessary for compile correctness. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- ToolRegistry pattern proven: domain modules self-register, AiChatModule discovers via registry
- STORAGE_SERVICE registered in EmailModule, ready for Plan 03 to decouple AiModule's forwardRef to EmailModule
- Pattern can be replicated for remaining forwardRef edges (ProvidersModule cluster in Plan 03)

---
*Phase: 32-architecture-decoupling*
*Completed: 2026-03-03*
