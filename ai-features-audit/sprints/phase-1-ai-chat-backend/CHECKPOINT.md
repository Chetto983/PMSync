# Sprint 01 Checkpoint — Chat Engine & Conversation Management

| Field | Value |
|-------|-------|
| **Status** | COMPLETE |
| **Last Task** | T-0106 |
| **Next Task** | Sprint 02 (T-0201) |
| **Tasks Done** | 6/6 |
| **SP Done** | 15 |

## Findings Addressed

| Finding | Status | Notes |
|---------|--------|-------|
| CHAT-C1 | Fixed | SSE timeout (120s) + keepalive (30s) added to consumeChatStream |
| CHAT-C2 | Fixed | Retry with exponential backoff in streamChat(); main chat UI already had error+reload via AI SDK |
| CHAT-H1 | Fixed | Backend pagination (offset/limit) added; frontend "Load older" deferred (assistant-ui limitation) |
| CHAT-H2 | Fixed | QueryRouter already defaults to 'search'; added fallback logging to AiRunLedger |
| CHAT-H3 | Dismissed | SandboxService is NOT dead code — actively used by SandboxToolsService |
| CHAT-H4 | Already fixed | ChatEnrichmentService.maybeGenerateSmartTitle() already generates titles at 4 messages |

## Last Modified Files

- `frontend/lib/api/ai.ts` — SSE timeout, keepalive, retry with backoff
- `backend/src/modules/ai-chat/services/conversation.service.ts` — getMessagesPaginated()
- `backend/src/modules/ai-chat/controllers/ai-chat.controller.ts` — offset/limit query params
- `backend/src/modules/ai-chat/services/query-router.service.ts` — isFallback() + debug logging
- `backend/src/modules/ai-chat/services/ai-chat.service.ts` — fallback ledger logging

## Key Decisions

1. **T-0102**: Main chat UI uses AssistantChatTransport (assistant-ui) which has its own error handling via AI SDK's `useChat` error/regenerate. Custom retry only needed for legacy `consumeChatStream` path.
2. **T-0103**: assistant-ui's ThreadHistoryAdapter.load() doesn't support incremental loading. Backend pagination added for API consumers; 50-message cap already prevents memory pressure.
3. **T-0105/T-0106**: Audit findings CHAT-H3 and CHAT-H4 were incorrect — code was already active/fixed.

## Validation Status

- Backend: `npx tsc --noEmit` ✅ PASS
- Frontend: `npx tsc --noEmit` ✅ PASS
