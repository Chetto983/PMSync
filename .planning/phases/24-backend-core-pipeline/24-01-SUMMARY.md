---
phase: 24-backend-core-pipeline
plan: 01
subsystem: api
tags: [ai-sdk-v6, nestjs, prisma, streaming, sse, mistral, conversation]

# Dependency graph
requires:
  - phase: 23-sdk-foundation
    provides: MistralProviderService, AI SDK v6 installation, VoltAgent cleanup
provides:
  - AiConversation and AiMessage Prisma models with indexes
  - AiChatModule (NestJS module with controller, services, DTOs)
  - POST /ai/chat streaming endpoint via pipeUIMessageStreamToResponse
  - ConversationService with rolling summary + recent verbatim history
  - AiChatService with streamText + createUIMessageStream pipeline
  - GET /ai/chat/conversations and DELETE /ai/chat/conversations/:id endpoints
affects: [24-02-PLAN, 25-frontend-chat, 27-assistant-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [createUIMessageStream-wrapping-streamText, ModelMessage-not-CoreMessage, rolling-summary-history]

key-files:
  created:
    - backend/src/modules/ai-chat/ai-chat.module.ts
    - backend/src/modules/ai-chat/controllers/ai-chat.controller.ts
    - backend/src/modules/ai-chat/services/ai-chat.service.ts
    - backend/src/modules/ai-chat/services/conversation.service.ts
    - backend/src/modules/ai-chat/dto/chat-request.dto.ts
    - backend/src/modules/ai-chat/dto/chat-response.dto.ts
    - backend/src/modules/ai-chat/constants/system-prompt.ts
    - backend/src/modules/ai-chat/index.ts
    - backend/prisma/migrations/20260302_add_ai_conversation_models/migration.sql
  modified:
    - backend/prisma/schema.prisma
    - backend/src/app.module.ts
    - backend/src/modules/ai/controllers/ai.controller.ts

key-decisions:
  - "AI SDK v6 uses ModelMessage (not CoreMessage) -- CoreMessage was removed in v5 migration"
  - "Migration SQL created manually (DB offline), to be applied on deploy"
  - "MistralService removed from AiController constructor since only chat() used it"

patterns-established:
  - "createUIMessageStream wrapping streamText with writer.merge(result.toUIMessageStream()) for NestJS streaming"
  - "AbortController from req.on('close') for cancellation support"
  - "Rolling summary + last 10 messages verbatim for conversation context"
  - "Fire-and-forget async summary generation after 20+ messages"

requirements-completed: [AI-01, AI-04]

# Metrics
duration: 11min
completed: 2026-03-02
---

# Phase 24 Plan 01: Core Pipeline Skeleton Summary

**AiChatModule with streamText + pipeUIMessageStreamToResponse streaming pipeline, Prisma conversation persistence, and rolling summary history**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-02T08:19:30Z
- **Completed:** 2026-03-02T08:30:09Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- AiConversation and AiMessage Prisma models created with tenant-isolated indexes and cascade deletes
- AiChatService orchestrates full streaming pipeline: conversation load -> streamText -> persist
- POST /ai/chat replaces old synchronous chat handler with SSE streaming
- ConversationService handles CRUD, rolling summary generation, and history building
- GET /ai/chat/conversations and DELETE /ai/chat/conversations/:id for conversation management
- Old chat() handler removed from AiController with zero route conflicts

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Prisma models and run migration** - `d1b0045e` (feat)
2. **Task 2a: Create AiChatModule internals** - `48387ef2` (feat)
3. **Task 2b: Wire AiChatModule and remove old handler** - `a2c2ad89` (feat)

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added AiConversation and AiMessage models with relations to Tenant and User
- `backend/prisma/migrations/20260302_add_ai_conversation_models/migration.sql` - Migration SQL for new tables
- `backend/src/modules/ai-chat/ai-chat.module.ts` - NestJS module registering controller and services
- `backend/src/modules/ai-chat/controllers/ai-chat.controller.ts` - POST /ai/chat (streaming), GET conversations, DELETE conversation
- `backend/src/modules/ai-chat/services/ai-chat.service.ts` - Chat orchestration with streamText + createUIMessageStream
- `backend/src/modules/ai-chat/services/conversation.service.ts` - Conversation CRUD and history building
- `backend/src/modules/ai-chat/dto/chat-request.dto.ts` - Input validation with class-validator
- `backend/src/modules/ai-chat/dto/chat-response.dto.ts` - Type definitions for SSE stream chunks
- `backend/src/modules/ai-chat/constants/system-prompt.ts` - Server-side system prompt
- `backend/src/modules/ai-chat/index.ts` - Barrel export
- `backend/src/app.module.ts` - Added AiChatModule import
- `backend/src/modules/ai/controllers/ai.controller.ts` - Removed old chat() handler and MistralService dependency

## Decisions Made
- **ModelMessage over CoreMessage:** AI SDK v6 renamed CoreMessage to ModelMessage. Discovered during compilation -- corrected immediately.
- **Manual migration SQL:** Database offline so `prisma migrate dev` could not run. Created migration SQL manually matching Prisma's output format. To be applied on deploy.
- **MistralService cleanup:** Removed from AiController constructor since only the (now deleted) chat() method used it. Other methods use EmailInsightsService and KnowledgeBaseService.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] AI SDK v6 type rename: CoreMessage -> ModelMessage**
- **Found during:** Task 2a (conversation.service.ts compilation)
- **Issue:** Plan specified `import type { CoreMessage } from 'ai'` but `CoreMessage` was removed in AI SDK v5. The v6 equivalent is `ModelMessage`.
- **Fix:** Changed all references from `CoreMessage` to `ModelMessage` in conversation.service.ts
- **Files modified:** backend/src/modules/ai-chat/services/conversation.service.ts
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** 48387ef2 (Task 2a commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Type rename required for compilation. No scope creep.

## Issues Encountered
- Database offline prevented running `prisma migrate dev`. Created migration SQL manually and ran `prisma generate` to get the client types. Migration will be applied when database is available.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Core pipeline skeleton complete, ready for Plan 02 to wire PII tokenization, audit logging, consent guard, rate limiting, and HITL approval
- AiChatModule exports both AiChatService and ConversationService for Plan 02 to inject cross-cutting concerns
- No tools defined yet (empty tool set) -- Plan 02 or Phase 25 adds tools

## Self-Check: PASSED

All 10 created files verified present. All 3 task commits verified in git log.

---
*Phase: 24-backend-core-pipeline*
*Completed: 2026-03-02*
