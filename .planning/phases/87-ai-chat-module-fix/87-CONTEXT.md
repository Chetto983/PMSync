# Phase 87: AI-CHAT-MODULE FIX - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning
**Source:** Manual audit of backend/src/modules/ai-chat/

<domain>
## Phase Boundary

Fix all bugs, race conditions, security holes, and dead code identified in the AI-Chat module audit. Covers: ai-chat.service, conversation.service, ai-chat.controller, email-tools.service, contact-tools.service, productivity-tools.service, rag-tools.service, reminder-tools.service, hybrid-search.service, memory.service, system-prompt.ts, and related DTOs/types.

Does NOT cover: new features, UI changes, or non-ai-chat modules.

</domain>

<decisions>
## Implementation Decisions

### Priority Order (locked)
- Pass 1: Critical security (BUG-2, RULE-1) — must land first
- Pass 2: High severity (BUG-1, BUG-5, RACE-1)
- Pass 3: Medium severity (BUG-3, BUG-6, BUG-7, BUG-8, RACE-2/3/4)
- Pass 4: Low / cleanup (DEAD-1-5, RULE-3 file splits, PRACTICE-1/2/3)

### Security Fixes (locked)
- BUG-2: getConversation and deleteConversation must check userId in addition to tenantId
- RULE-1: All message queries (getMessagesForContext, getRecentMessages, getMessageCount, getOlderMessages) must include tenantId filter via conversation join or direct column

### Bug Fixes (locked)
- BUG-1: reply_email must read and use replyAll parameter, include CC recipients from original email
- BUG-3: draft_email must NOT set sentAt — remove `sentAt: new Date()`
- BUG-5: maybeTriggerSummaryGeneration must check message count since last summary (not just total > 20). Only trigger every N messages (e.g., every 10 after threshold)
- BUG-6: delete_contact must call _piiResolve on contactId before using it
- BUG-7: Remove 30-min auto-resolve fallback from getOrCreateConversation — frontend now always sends real conversationId via eager initialize()
- BUG-8: Deduplicate embedding save in save_memory — keep raw SQL write to ai_memories.vector (because getRelevantMemories queries that column) and remove the embeddingsService.saveEmbedding() call (the duplicate). Full canonicalization to use a single vector store is tracked in Phase 82 (AICP-05/06). Rationale: RESEARCH.md Open Question 1 confirmed that getRelevantMemories queries ai_memories.vector directly; removing the raw SQL write would break retrieval without also migrating the query path, which is out of scope for this phase.

### Race Condition Fixes (locked)
- RACE-1: Add P2002/P2034 retry wrapper for all Prisma transactions in conversation.service
- RACE-2: Make title/summary generation use the message count at time of save, not a separate query
- RACE-3: getOrCreateConversation TOCTOU — moot after BUG-7 fix removes auto-resolve
- RACE-4: persistToolResults must use a single transaction for all tool results

### Dead Code Removal (locked)
- DEAD-1: Remove ToolsServiceInterface from tools/index.ts
- DEAD-2: Remove chat-response.dto.ts entirely
- DEAD-3: Remove tenantId = 'system' default parameters
- DEAD-4: Remove unused _conversationId params from tool services
- DEAD-5: Remove unused _piiResolve params from ProductivityToolsService and ReminderToolsService (but FIX the ones that should use it first — BUG-6)

### File Size Compliance (locked)
- RULE-3: Split ai-chat.service.ts (673 lines) into focused modules
- RULE-3: Split productivity-tools.service.ts (565 lines) into focused modules

### Claude's Discretion
- Prisma retry wrapper implementation details (exponential backoff timing, max retries)
- How to split ai-chat.service.ts (by concern: streaming, title/summary, persistence)
- How to split productivity-tools.service.ts (by tool group)
- Whether to add sequence column for message ordering (PRACTICE-2) — assess effort

</decisions>

<specifics>
## Specific References

### Files to modify
- backend/src/modules/ai-chat/controllers/ai-chat.controller.ts (BUG-2)
- backend/src/modules/ai-chat/services/conversation.service.ts (RULE-1, BUG-7, RACE-1, RACE-3)
- backend/src/modules/ai-chat/services/ai-chat.service.ts (BUG-5, RACE-2, RACE-4, DEAD-3, RULE-3)
- backend/src/modules/ai-chat/services/email-tools.service.ts (BUG-1, BUG-3)
- backend/src/modules/ai-chat/services/contact-tools.service.ts (BUG-6)
- backend/src/modules/ai-chat/services/rag-tools.service.ts (BUG-8)
- backend/src/modules/ai-chat/services/productivity-tools.service.ts (BUG-4 deprioritized, RULE-3)
- backend/src/modules/ai-chat/services/reminder-tools.service.ts (DEAD-5)
- backend/src/modules/ai-chat/tools/index.ts (DEAD-1)
- backend/src/modules/ai-chat/dto/chat-response.dto.ts (DEAD-2)

### Existing patterns to follow
- CLAUDE.md: Prisma P2002/P2034 retry with exponential backoff
- CLAUDE.md: Multi-tenant — every query must include tenantId
- CLAUDE.md: Max 500 lines per file

</specifics>

<deferred>
## Deferred Ideas

- BUG-4: Timezone-aware todayOnly filter (needs user timezone from frontend — larger change)
- RULE-5: Prisma.raw() for vectors — acceptable with validation; not a real risk
- RULE-6: Abort signal propagation to tools — nice-to-have, no user impact
- PRACTICE-4: Prompt caching — provider-managed, not actionable client-side
- RULE-4: HITL consistency audit — separate phase, touches system prompt + all tool definitions

</deferred>

---

*Phase: 87-ai-chat-module-fix*
*Context gathered: 2026-03-19 from manual audit*
