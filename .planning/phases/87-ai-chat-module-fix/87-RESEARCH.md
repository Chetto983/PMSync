# Phase 87: AI-CHAT-MODULE FIX - Research

**Researched:** 2026-03-19
**Domain:** NestJS backend / AI chat module bug fixes, security, race conditions, dead code
**Confidence:** HIGH

## Summary

This phase addresses 8 bugs, 4 race conditions, 5 dead code items, and 6 rule violations found in the AI-Chat module audit. All findings were confirmed by direct code inspection. The codebase already has a `PrismaRetryService` (with `withPrismaRetry` standalone function) that handles P2002/P2034 with exponential backoff -- this should be reused for RACE-1, not hand-rolled.

The two largest files (ai-chat.service.ts at 673 lines, productivity-tools.service.ts at 565 lines) need splitting to comply with the 500-line rule. ai-chat.service.ts has clear seams: streaming orchestration, title/summary generation, tool set creation. productivity-tools.service.ts splits naturally by tool group: email-productivity (list/star/read/label) vs follow-up management.

**Primary recommendation:** Execute in 4 passes per CONTEXT.md priority order. Each pass should be a separate plan with its own type-check verification.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Pass 1: Critical security (BUG-2, RULE-1) -- must land first
- Pass 2: High severity (BUG-1, BUG-5, RACE-1, RULE-2)
- Pass 3: Medium severity (BUG-3, BUG-6, BUG-7, BUG-8, RACE-2/3/4)
- Pass 4: Low / cleanup (DEAD-1-5, RULE-3 file splits, PRACTICE-1/2/3)
- BUG-2: getConversation and deleteConversation must check userId in addition to tenantId
- RULE-1: All message queries (getMessagesForContext, getRecentMessages, getMessageCount, getOlderMessages) must include tenantId filter via conversation join or direct column
- BUG-1: reply_email must read and use replyAll parameter, include CC recipients from original email
- BUG-3: draft_email must NOT set sentAt -- remove `sentAt: new Date()`
- BUG-5: maybeTriggerSummaryGeneration must check message count since last summary (not just total > 20). Only trigger every N messages (e.g., every 10 after threshold)
- BUG-6: delete_contact must call _piiResolve on contactId before using it
- BUG-7: Remove 30-min auto-resolve fallback from getOrCreateConversation -- frontend now always sends real conversationId via eager initialize()
- BUG-8: Deduplicate embedding save in save_memory -- pick one storage path (embeddingsService.saveEmbedding) and remove raw SQL
- RACE-1: Add P2002/P2034 retry wrapper for all Prisma transactions in conversation.service
- RACE-2: Make title/summary generation use the message count at time of save, not a separate query
- RACE-3: getOrCreateConversation TOCTOU -- moot after BUG-7 fix removes auto-resolve
- RACE-4: persistToolResults must use a single transaction for all tool results
- DEAD-1: Remove ToolsServiceInterface from tools/index.ts
- DEAD-2: Remove chat-response.dto.ts entirely
- DEAD-3: Remove tenantId = 'system' default parameters
- DEAD-4: Remove unused _conversationId params from tool services
- DEAD-5: Remove unused _piiResolve params from ProductivityToolsService and ReminderToolsService (but FIX the ones that should use it first -- BUG-6)
- RULE-3: Split ai-chat.service.ts (673 lines) into focused modules
- RULE-3: Split productivity-tools.service.ts (565 lines) into focused modules

### Claude's Discretion
- Prisma retry wrapper implementation details (exponential backoff timing, max retries)
- How to split ai-chat.service.ts (by concern: streaming, title/summary, persistence)
- How to split productivity-tools.service.ts (by tool group)
- Whether to add sequence column for message ordering (PRACTICE-2) -- assess effort

### Deferred Ideas (OUT OF SCOPE)
- BUG-4: Timezone-aware todayOnly filter (needs user timezone from frontend -- larger change)
- RULE-5: Prisma.raw() for vectors -- acceptable with validation; not a real risk
- RULE-6: Abort signal propagation to tools -- nice-to-have, no user impact
- PRACTICE-4: Prompt caching -- provider-managed, not actionable client-side
- RULE-4: HITL consistency audit -- separate phase, touches system prompt + all tool definitions
</user_constraints>

## Standard Stack

### Core (already in codebase -- no new dependencies)
| Library | Purpose | Location |
|---------|---------|----------|
| `PrismaRetryService` | P2002/P2034 retry with exponential backoff | `backend/src/common/services/prisma-retry.service.ts` |
| `withPrismaRetry` | Standalone retry function (no DI needed) | Same file, exported function |
| `EmbeddingsService` | Canonical embedding storage via `saveEmbedding()` | `backend/src/modules/ai/services/embeddings.service.ts` |
| `PrismaService` | Database access with `$transaction()` | `backend/src/prisma/prisma.service.ts` |

### No New Dependencies
This phase is purely internal refactoring and bug-fixing. Zero npm installs needed.

## Architecture Patterns

### Recommended File Split: ai-chat.service.ts (673 lines)

Current `AiChatService` does too much: streaming, persistence, title/summary gen, tool creation. Split by concern:

```
backend/src/modules/ai-chat/services/
  ai-chat.service.ts          # Slim orchestrator: streamChat() + constructor (~250 lines)
  chat-persistence.service.ts  # persistToolResults, serializeToolResult (~80 lines)
  chat-enrichment.service.ts   # maybeGenerateSmartTitle, maybeTriggerSummaryGeneration, getRuntimeContextMetadata (~200 lines)
```

**Key constraint:** `createToolSet` stays in `AiChatService` because it wires all tool services that are DI-injected into the constructor. Moving it would require either a separate module or passing 9+ services.

**Alternative (simpler):** Extract only `maybeGenerateSmartTitle` + `maybeTriggerSummaryGeneration` + `getRuntimeContextMetadata` into a `ChatEnrichmentService`. The `persistToolResults` + `serializeToolResult` are small enough to stay. This gets ai-chat.service.ts under 500 lines with minimal import changes.

**Recommendation:** Go with the simpler alternative -- extract enrichment only. The persistence methods are tightly coupled to the `onStepFinish` callback and moving them adds indirection without value.

### Recommended File Split: productivity-tools.service.ts (565 lines)

Split by domain:

```
backend/src/modules/ai-chat/tools/
  email-productivity-tools.service.ts  # list_email_index, star_email, mark_email_read, label_email (~340 lines)
  follow-up-tools.service.ts           # list_follow_ups, update_follow_up (~130 lines)
  productivity-tools.service.ts        # Barrel re-export or thin wrapper (~30 lines, could remove)
```

**Key constraint:** Both sub-services need DI registration in `ai-chat.module.ts`. The `createToolSet()` in `AiChatService` must merge tools from both. Update the imports in `tools/index.ts`.

### Pattern: PII Resolution via Closure

The codebase uses a closure pattern where `piiResolve` is passed from `AiChatService.createToolSet()` to each tool service's `getTools()`. Tools that handle user-provided IDs (contactId, emailId) must call `piiResolve` before using those IDs.

**How it works in tools that DO use it correctly (e.g., `update_contact`):**
```typescript
execute: async (args) => {
  const resolved = (await piiResolve(
    args as unknown as Record<string, unknown>,
  )) as typeof args;
  // Use resolved.contactId -- PII tokens replaced with real values
  await this.contactsService.updateContact(tenantId, resolved.contactId, ...);
}
```

**BUG-6 fix:** `delete_contact` currently uses `_piiResolve` (underscore prefix = unused). Change to:
```typescript
private buildDeleteContact(tenantId: string, piiResolve: PiiResolveFn) {
  // ...
  execute: async (args) => {
    const resolved = (await piiResolve(args as unknown as Record<string, unknown>)) as typeof args;
    await this.contactsService.deleteContact(tenantId, resolved.contactId);
    return truncateToolResult({ contactId: resolved.contactId, deleted: true });
  },
}
```

### Pattern: Tenant + User Isolation

**Current gap (BUG-2):** `getConversation` and `deleteConversation` check `tenantId` but not `userId`. The controller passes `req.user.tenantId` but the service never verifies the requesting user owns the conversation.

**Fix pattern:** Add `userId` parameter to both methods:
```typescript
async getConversation(conversationId: string, tenantId: string, userId: string): Promise<AiConversation | null> {
  return this.prisma.aiConversation.findFirst({
    where: { id: conversationId, tenantId, userId, updatedAt: { gte: this.getRetentionCutoff() } },
  });
}
```

**Impact:** Controller already has `req.user.userId` available. Just pass it through.

### Pattern: Message Query Tenant Isolation (RULE-1)

**Current gap:** `getMessagesForContext`, `getRecentMessages`, `getMessageCount`, `getOlderMessages` all query by `conversationId` only with no tenant filter. If someone guesses a conversation ID, the message data leaks.

**Fix strategy:** These methods are always called after a conversation is loaded (which does check tenantId). However, defense-in-depth requires adding a tenant check. Two approaches:
1. **Join through conversation:** Add `where: { conversation: { tenantId } }` to message queries
2. **Add tenantId column to AiMessage:** Requires migration -- too heavy for this phase

**Recommendation:** Use approach 1 (join). Add tenantId parameter to all four methods and use Prisma's relation filter:
```typescript
where: { conversationId, conversation: { tenantId } }
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Prisma retry on P2002/P2034 | Custom retry loop | `withPrismaRetry()` from `common/services/prisma-retry.service.ts` | Already tested, handles exponential backoff + jitter |
| Embedding storage | Raw SQL `UPDATE SET vector` | `embeddingsService.saveEmbedding()` | Handles validation, proper vector format, indexed FK fields per CLAUDE.md |
| Tool result serialization | Per-tool JSON assembly | Existing `serializeToolResult()` method | Already handles all AI SDK v6 fields |

## Common Pitfalls

### Pitfall 1: Breaking the Controller Signatures
**What goes wrong:** Adding `userId` to `getConversation`/`deleteConversation` breaks the controller and any other callers.
**How to avoid:** Use grep to find ALL call sites before changing method signatures. The controller is the primary caller but `streamChat` also calls `getOrCreateConversation`.

### Pitfall 2: Transaction Scope in persistToolResults
**What goes wrong:** Wrapping all tool results in a single `$transaction` but forgetting that `touchConversationTx` is called inside each `saveToolMessage`.
**How to avoid:** For RACE-4, create one transaction that saves all tool messages and touches the conversation once. Don't call `saveToolMessage` in a loop -- inline the creates.

### Pitfall 3: Summary Generation Re-triggering
**What goes wrong:** After fixing BUG-5, summary still generates on every message above threshold.
**How to avoid:** Track message count at time of last summary (store in AiConversation.metadata or check existing summary + message count math). Simplest: trigger when `(messageCount - 20) % 10 === 0`.

### Pitfall 4: File Split Import Breakage
**What goes wrong:** Splitting files breaks barrel exports in `tools/index.ts` and imports in `ai-chat.module.ts`.
**How to avoid:** After every split, run `npx tsc --noEmit` from backend. Update `tools/index.ts` barrel exports. Update `ai-chat.module.ts` providers array.

### Pitfall 5: Dual Embedding Save Paths (BUG-8)
**What goes wrong:** Removing the raw SQL path but forgetting that `embeddingsService.saveEmbedding` stores in the `embeddings` table, NOT the `ai_memories.vector` column.
**What to keep:** Keep `embeddingsService.saveEmbedding()` (canonical path for semantic search). Remove the raw SQL `UPDATE ai_memories SET vector`. The `MemoryService.getRelevantMemories()` searches the `ai_memories.vector` column -- this will break if we remove the raw SQL without also updating memory retrieval to use the embeddings table instead.
**Correct fix:** Check if `MemoryService.getRelevantMemories()` queries `ai_memories.vector` or `embeddings` table. If it queries `ai_memories.vector`, we must either: (a) keep the raw SQL update, or (b) update `getRelevantMemories` to query the embeddings table. Option (b) is the canonical path per CLAUDE.md: "use indexed FK fields, NEVER JSONB metadata path queries."

### Pitfall 6: reply_email CC/BCC Handling (BUG-1)
**What goes wrong:** `queueSend` already supports `cc?: string[]` in `SendEmailDto`. But the original email's `cc` field in the Email model is `String[]` (array). The tool must extract CC recipients from the original email when `replyAll` is true.
**How to avoid:** Read original email's `cc` and `to` fields. When `replyAll: true`, set `cc` to original CC recipients + original To recipients (minus the current user's address if available).

## Code Examples

### Using withPrismaRetry for Conversation Service (RACE-1)
```typescript
// Source: backend/src/common/services/prisma-retry.service.ts
import { withPrismaRetry } from '../../../common/services/prisma-retry.service';

async saveUserMessage(conversationId: string, content: string): Promise<AiMessage> {
  return withPrismaRetry(
    async () => {
      const [message] = await this.prisma.$transaction(async (tx) => {
        const created = await tx.aiMessage.create({
          data: { conversationId, role: 'user', content: { type: 'text', text: content } },
        });
        await this.touchConversationTx(tx, conversationId);
        return [created];
      });
      return message;
    },
    { loggerName: 'ConversationService.saveUserMessage' },
  );
}
```

### Batched persistToolResults Transaction (RACE-4)
```typescript
// All tool results saved in one transaction instead of N separate ones
private async persistToolResults(
  conversationId: string,
  stepIndex: number,
  toolResults: StepResult<ToolSet>['toolResults'],
): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    for (const toolResult of toolResults) {
      await tx.aiMessage.create({
        data: {
          conversationId,
          role: 'tool',
          content: this.serializeToolResult(toolResult),
          toolCallId: toolResult.toolCallId,
          stepIndex,
        },
      });
    }
    // Touch conversation once, not per message
    await tx.aiConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  });
}
```

### BUG-2: Adding userId Check to getConversation
```typescript
async getConversation(
  conversationId: string,
  tenantId: string,
  userId: string,  // NEW parameter
): Promise<AiConversation | null> {
  return this.prisma.aiConversation.findFirst({
    where: {
      id: conversationId,
      tenantId,
      userId,  // BOLA fix
      updatedAt: { gte: this.getRetentionCutoff() },
    },
  });
}
```

### BUG-3: Remove sentAt from draft_email
```typescript
// Line 435 of email-tools.service.ts -- remove sentAt: new Date()
const draft = await this.prisma.email.create({
  data: {
    tenantId,
    providerId: provider.id,
    externalId: `draft-${Date.now()}`,
    from: '',
    to: [resolved.to],
    subject: resolved.subject,
    bodyText: resolved.body,
    bodyHtml: resolved.body,
    snippet: resolved.body.slice(0, 200),
    folder: 'Drafts',
    isDraft: true,
    isRead: true,
    // sentAt: new Date(), -- REMOVED: drafts are not sent
    receivedAt: new Date(),
  },
});
```

## State of the Art

No external library changes needed. This is purely internal code quality work.

| Old Pattern | New Pattern | Impact |
|-------------|-------------|--------|
| Message queries without tenant filter | Relation filter `conversation: { tenantId }` | Defense-in-depth security |
| Per-message saveToolMessage in loop | Single $transaction for batch | Atomicity + performance |
| Manual retry logic | `withPrismaRetry()` | Consistent retry behavior |
| Dual embedding storage (raw SQL + service) | Single `embeddingsService.saveEmbedding()` path | Deduplication, simpler maintenance |

## Open Questions

1. **Memory retrieval path after BUG-8**
   - What we know: `save_memory` saves to both `ai_memories.vector` (raw SQL) and `embeddings` table (service). `MemoryService.getRelevantMemories()` queries `ai_memories.vector`.
   - What's unclear: Should we migrate `getRelevantMemories()` to use the embeddings table, or keep the raw SQL write to `ai_memories.vector`?
   - Recommendation: Keep writing to `ai_memories.vector` for now (it's the retrieval path), remove only the `embeddingsService.saveEmbedding()` call (the duplicate). This is the simpler, safer path. The full canonicalization is tracked in AICP-05/06 for Phase 82.

2. **PRACTICE-2: Sequence column for message ordering**
   - What we know: Messages currently use `createdAt` for ordering. Two messages created in the same millisecond could have indeterminate order.
   - What's unclear: How often this actually occurs in practice.
   - Recommendation: Skip for this phase. Requires a migration + backfill. Low risk in practice because tool results are saved sequentially. Flag for Phase 82 if needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (*.test.ts) + Jest (*.spec.ts) |
| Config file | `backend/vitest.config.ts` |
| Quick run command | `cd backend && npx vitest run --reporter=verbose` |
| Full suite command | `cd backend && npx vitest run` |

### Phase Requirements -> Test Map

| Bug/Issue | Behavior | Test Type | Automated Command | File Exists? |
|-----------|----------|-----------|-------------------|-------------|
| BUG-2 | getConversation/deleteConversation check userId | unit | `cd backend && npx vitest run src/modules/ai-chat/__tests__/conversation.test.ts -t "userId"` | Needs new tests |
| RULE-1 | Message queries include tenantId filter | unit | `cd backend && npx vitest run src/modules/ai-chat/__tests__/conversation.test.ts -t "tenantId"` | Needs new tests |
| BUG-1 | reply_email uses replyAll + CC | unit | `cd backend && npx vitest run src/modules/ai-chat/__tests__/email-tools.test.ts -t "replyAll"` | File does not exist |
| BUG-3 | draft_email no sentAt | unit | `cd backend && npx vitest run src/modules/ai-chat/__tests__/email-tools.test.ts -t "draft"` | File does not exist |
| BUG-5 | Summary triggers every N messages | unit | `cd backend && npx vitest run src/modules/ai-chat/__tests__/ai-chat-e2e.test.ts -t "summary"` | Partial coverage |
| BUG-6 | delete_contact calls piiResolve | unit | `cd backend && npx vitest run src/modules/ai-chat/__tests__/contact-tools.test.ts` | File does not exist |
| BUG-7 | No auto-resolve fallback | unit | `cd backend && npx vitest run src/modules/ai-chat/services/conversation.service.unit.test.ts -t "auto-resolve"` | Exists |
| BUG-8 | Single embedding save path | unit | `cd backend && npx vitest run src/modules/ai-chat/__tests__/tools-rag-e2e.test.ts -t "save_memory"` | Exists |
| RACE-1 | P2002/P2034 retry on transactions | unit | `cd backend && npx vitest run src/common/services/__tests__/prisma-retry.service.spec.ts` | Exists (for service, need integration) |
| RACE-4 | Batched tool result persistence | unit | `cd backend && npx vitest run src/modules/ai-chat/__tests__/conversation.test.ts -t "persistTool"` | Needs new test |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit`
- **Per wave merge:** `cd backend && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/modules/ai-chat/__tests__/security-isolation.test.ts` -- covers BUG-2 + RULE-1 (userId/tenantId checks)
- [ ] Existing `conversation.test.ts` and `conversation.service.unit.test.ts` cover some cases but need augmentation for userId parameter changes

## Sources

### Primary (HIGH confidence)
- Direct code inspection of all files listed in CONTEXT.md
- `backend/src/common/services/prisma-retry.service.ts` -- verified PrismaRetryService API + `withPrismaRetry` standalone function
- `backend/src/modules/email/services/email-send.service.ts` -- verified `SendEmailDto` supports `cc?: string[]`
- `backend/prisma/schema.prisma` -- verified AiConversation has userId, AiMessage has no tenantId column

### Secondary (MEDIUM confidence)
- Prisma relation filter `conversation: { tenantId }` is standard Prisma pattern for join-based filtering

## Metadata

**Confidence breakdown:**
- Bug locations/fixes: HIGH -- all confirmed by direct code reading
- Security fixes (BUG-2, RULE-1): HIGH -- straightforward parameter addition
- File split strategy: HIGH -- clear seams identified, line counts verified
- BUG-8 embedding dedup: MEDIUM -- requires decision on retrieval path (documented in Open Questions)
- RACE-1 retry integration: HIGH -- existing `withPrismaRetry` utility ready to use

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable internal codebase, no external dependencies)
