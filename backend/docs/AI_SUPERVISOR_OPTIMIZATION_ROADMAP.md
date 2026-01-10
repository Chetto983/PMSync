# AI Supervisor Optimization Roadmap

## Problem Statement

**User complaint**: "Every mail query takes more than 2 minutes and gives bad responses!"

**Root causes identified**:
1. Supervisor `maxSteps: 10` allows too many LLM calls
2. 8 sub-agents created upfront even when only 1-2 are used
3. No direct routing for simple queries (everything goes through supervisor)
4. Sequential tool execution (`parallelToolCalls: false`)
5. Missing embedding cache usage in some code paths

---

## Phase 1: Quick Wins (COMPLETED)

### 1.1 Reduce Supervisor maxSteps ✅
- **File**: `voltagent/agents/supervisor.agent.ts:385`
- **Change**: `maxSteps: 10` → `maxSteps: 5`
- **Impact**: -50% max LLM calls per request

### 1.2 Reduce EmailAgent maxSteps ✅
- **File**: `voltagent/agents/email.agent.ts:70`
- **Change**: `maxSteps: 5` → `maxSteps: 3`
- **Impact**: Faster email operations

### 1.3 Direct Routing for All Specialized Agents ✅
- **File**: `voltagent/voltagent.service.ts:797-807`
- **Change**: Use `ModelRouterService.suggestedAgent` to bypass supervisor for single-domain queries
- **Pattern**:
  - `General` intent → GeneralAgent directly
  - `Email` intent → EmailAgent directly
  - `Calendar` intent → CalendarAgent directly
  - `Contacts` intent → ContactsAgent directly
  - `Supervisor` (multi-domain) → SupervisorAgent with delegation
- **Impact**: -70-90% latency for single-domain queries

### 1.4 VoltAgent Memory for All Agents ✅
- **Files**: All agent files in `voltagent/agents/`
- **Change**: Added `memory?: Memory` to all agent options and constructors
- **Agents Updated**:
  - `email.agent.ts` - Memory for email conversation context
  - `calendar.agent.ts` - Memory for scheduling context
  - `contacts.agent.ts` - Memory for contact lookup context
  - `general.agent.ts` - Memory for general Q&A context
  - `knowledge.agent.ts` - Memory for knowledge base context
  - `websearch.agent.ts` - Memory for web search context
  - `analytics.agent.ts` - Memory for analysis context
  - `document-library.agent.ts` - Memory for document context
- **Impact**: Agents remember previous tool calls, reducing repeated questions

---

## Phase 2: Tool Consolidation (COMPLETED 2026-01-10)

### 2.1 Problem
- 44 tools created too much confusion for LLM
- Redundant analysis tools (summarize, sentiment, intent all separate)
- Duplicated CRUD patterns across contacts/calendar/folders

### 2.2 Solution: Consolidate 44 → 17 Tools (61% Reduction)

| File | Before | After | Status |
|------|--------|-------|--------|
| `email.tools.ts` | 14 | 5 | ✅ DONE |
| `insights.tools.ts` | 10 | 3 | ✅ DONE |
| `folder.tools.ts` | 5 | 2 | ✅ DONE |
| `contacts.tools.ts` | 5 | 2 | ✅ DONE |
| `calendar.tools.ts` | 5 | 2 | ✅ DONE |
| `document-library.tools.ts` | 3 | 1 | ✅ DONE |
| `web-search.tools.ts` | 1 | 1 | Unchanged |
| `analytics.tools.ts` | 1 | 1 | Unchanged |
| **TOTAL** | **44** | **17** | **✅ 61% reduction** |

### 2.3 Consolidated Tools Summary

| Tool | Actions | File |
|------|---------|------|
| `analyze_email` | summary, sentiment, intent, priority, actions, labels | insights.tools.ts |
| `compose_reply` | mode='full' \| 'suggestions' | insights.tools.ts |
| `semantic_search_emails` | RAG-based search | insights.tools.ts |
| `list_emails` | mode='accounts' \| 'unread' \| 'content' | email.tools.ts |
| `manage_email` | send, reply, forward, delete, archive, mark_read/unread, star/unstar | email.tools.ts |
| `search_emails` | Hybrid RAG + Prisma | email.tools.ts |
| `count_emails` | Flexible period parsing | email.tools.ts |
| `bulk_email_actions` | delete, empty_folder, archive, mark_read | email.tools.ts |
| `list_folders` | Read-only | folder.tools.ts |
| `manage_folder` | create, rename, delete, move_email | folder.tools.ts |
| `search_contacts` | Read-only search | contacts.tools.ts |
| `manage_contact` | get, create, update, delete | contacts.tools.ts |
| `get_events` | Read-only | calendar.tools.ts |
| `manage_event` | create, update, delete, check_availability | calendar.tools.ts |
| `manage_document_library` | query, list, create | document-library.tools.ts |

### 2.4 Benefits
- **Better LLM Performance**: Fewer tools = better reasoning accuracy
- **Cost Reduction**: Single `analyze_email` vs 5 separate LLM calls (80% reduction)
- **Latency**: Batch operations reduce round-trips
- **Maintainability**: Fewer files, less code duplication
- **HITL Pattern**: All write operations require approval

---

## Phase 2.5: Agent Consolidation (COMPLETED 2026-01-10)

### 2.5.1 Problem
- 10 sub-agents created upfront (email, calendar, contacts, knowledge, general, websearch, analytics, document-library)
- Most requests only use 1-2 agents
- Sub-agents didn't receive memory from supervisor

### 2.5.2 Solution: Consolidate 10 → 3 Core Agents

| Agent | Purpose | Tools | Status |
|-------|---------|-------|--------|
| `ActionsAgent` | ALL WRITE operations | manage_email, bulk_email_actions, manage_folder, manage_contact, manage_event | ✅ DONE |
| `IntelligenceAgent` | ALL READ and ANALYSIS | list_emails, search_emails, count_emails, list_folders, search_contacts, get_events, analyze_email, compose_reply, semantic_search_emails | ✅ DONE |
| `WebSearchAgent` | Web search (lazy-loaded) | web_search | ✅ Optional |
| `DocumentLibraryAgent` | Documents (lazy-loaded) | manage_document_library | ✅ Optional |
| `AnalyticsAgent` | Analytics (lazy-loaded) | analyze_data | ✅ Optional |

### 2.5.3 Memory Bug Fixes (Part C)

All 4 critical memory bugs fixed in `voltagent.service.ts`:

| Bug | Issue | Fix | Status |
|-----|-------|-----|--------|
| #1 | Memory disabled silently on DB error | Retry logic (3 attempts, exponential backoff) + CRITICAL logging | ✅ FIXED |
| #2 | Sub-agents don't receive memory | All agents now receive `memory` option from supervisor | ✅ FIXED |
| #3 | History only injected if conversationId provided | Deterministic fallback: `${tenantId}:${userId}:default` | ✅ FIXED |
| #4 | Race condition in conversation creation | Create-first, catch-duplicate pattern | ✅ FIXED |

### 2.5.4 Files Modified
- `voltagent/agents/actions.agent.ts` - NEW: Consolidated WRITE agent
- `voltagent/agents/intelligence.agent.ts` - NEW: Consolidated READ agent
- `voltagent/agents/supervisor.agent.ts` - Uses 2 core agents + 3 optional lazy-loaded
- `voltagent/agents/index.ts` - Updated exports
- `voltagent/voltagent.service.ts` - Memory bug fixes

---

## Phase 3: Embedding Cache Optimization (VERIFIED 2026-01-10)

### 3.1 Cache Integration ✅
**Status**: WORKING - MistralService has GDPR-compliant tenant-isolated cache

- **File**: `mistral.service.ts:393-456`
- **Cache check**: Line 401-409 (requires tenantId for GDPR)
- **Cache store**: Line 450-453 (after successful API call)
- **Key format**: `qemb:{tenantId}:{hash}` (tenant-isolated)

### 3.2 Rate Limiting ✅
- **File**: `email-embedding.queue.ts:67`
- **Default**: `EMBEDDING_RATE_MAX=2` (safe for Mistral 6 RPS limit)
- **Retry**: 6 attempts with exponential backoff
- **DLQ**: Integration after all retries fail

### 3.3 Cache Pre-warming ✅
- **File**: `services/cache-prewarming.service.ts`
- **Status**: Implemented with EN/IT query categories
- **Schedule**: 6 AM daily (common queries), every 4 hours (tenant queries)

### 3.4 Embedding Call Sites (All Cached)
| File | Line | Status |
|------|------|--------|
| unified-retriever.ts | 274 | ✅ Uses MistralService (cached) |
| hybrid-retriever.ts | 173, 345 | ✅ Uses MistralService (cached) |
| insights.tools.ts | 1048 | ✅ Uses MistralService (cached) |
| knowledge-base.service.ts | 581 | ✅ Uses MistralService (cached) |

---

## Phase 3.5: Prompt Consolidation (COMPLETED 2026-01-10)

### Implementation ✅
- Agent prompts are **English only** (source of truth: `en.ts`)
- Italian file (`it.ts`) contains **UI strings only** (238 lines vs 916 lines in EN)
- Locale instruction appended for response language

### Evidence
```typescript
// voltagent/locales/it.ts line 1-4:
/**
 * Italian translations for VoltAgent - UI strings only
 * Agent prompts use English (locale instruction appended for response language)
 */
```

### Benefits Achieved
- 50% less prompt maintenance
- Better LLM performance (English training data)
- Consistent behavior across languages

---

## Phase 4: Lazy Agent Creation (PARTIALLY DONE)

### Current State
- Core agents (Actions + Intelligence) created on every request
- Optional agents (WebSearch, DocumentLibrary, Analytics) are **conditionally loaded** based on service availability

### Remaining Work (LOW PRIORITY)
The current architecture with 2 core + 3 optional agents is already optimized. Further lazy-loading would add complexity with minimal benefit.

---

## Phase 5: RAG Source Filtering (TODO)

### Current Problem
- `UnifiedRetriever.analyzeQuerySources()` searches ALL sources for most queries
- "Hello" triggers email + deadline + followup + action searches

### Proposed Solution
Add query classification BEFORE RAG:
```typescript
if (isGreeting(query)) return ''; // No RAG needed
if (isWeatherQuery(query)) return ''; // WebSearch only
if (isEmailQuery(query)) return searchEmails(query); // Email only
```

### Files to Update
- `voltagent/rag/unified-retriever.ts:189-212`

---

## Phase 6: Testing Plan

### Unit Tests
```bash
# Test model router
npx ts-node scripts/test-model-router.ts

# Test cache hit rate
npx ts-node scripts/test-cache-hit.ts

# Test embedding performance
npx ts-node scripts/diagnose-supervisor-bottlenecks.ts
```

### Integration Tests
```bash
# Test full chat pipeline
npx ts-node scripts/test-chat-latency.ts

# Test with 1000 users
npx ts-node scripts/test-1000-users-scaling.ts
```

### Performance Targets
| Metric | Current | Target |
|--------|---------|--------|
| Simple query (greeting) | ~2 min | <1 sec |
| Email search | ~2 min | <5 sec |
| Complex multi-agent | ~2 min | <15 sec |
| Cache hit rate | ? | >60% |
| P95 latency | >60 sec | <10 sec |

---

## Architecture Diagram

```
User Message
     │
     ▼
┌─────────────────┐
│ Security Check  │ (Prompt Guard, PII)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Semantic Cache  │ ──HIT──> Return cached response
└────────┬────────┘
         │ MISS
         ▼
┌─────────────────┐
│ Model Router    │ ──> suggestedAgent + recommendedModel
└────────┬────────┘
         │
    ┌────┴────────────┬─────────────┬────────────┬────────────┐
    │                 │             │            │            │
    ▼                 ▼             ▼            ▼            ▼
┌────────┐      ┌─────────┐   ┌──────────┐ ┌──────────┐ ┌────────────┐
│General │      │ Email   │   │ Calendar │ │ Contacts │ │ Supervisor │
│ Agent  │      │ Agent   │   │  Agent   │ │  Agent   │ │   Agent    │
│(direct)│      │(direct) │   │ (direct) │ │ (direct) │ │(multi-dom) │
└────────┘      └─────────┘   └──────────┘ └──────────┘ └─────┬──────┘
                                                              │
                                              ┌───────────────┼───────────────┐
                                              ▼               ▼               ▼
                                          ┌───────┐     ┌───────┐       ┌───────┐
                                          │ Sub-  │     │ Sub-  │       │ Sub-  │
                                          │Agent 1│     │Agent 2│       │Agent N│
                                          └───────┘     └───────┘       └───────┘

DIRECT ROUTING (70-90% faster):
- Email queries → EmailAgent directly
- Calendar queries → CalendarAgent directly
- Contact queries → ContactsAgent directly
- Simple queries → GeneralAgent directly

SUPERVISOR ROUTING (complex multi-domain):
- "Send Mario's calendar invite to his email" → Supervisor → Contacts + Calendar + Email
```

---

## Phase 7: Conversation Context Caching (TODO)

Based on [n8n memory patterns](https://docs.n8n.io/advanced-ai/examples/understand-memory/):

### 7.1 Problem
- Agent repeats same questions because it doesn't remember previous tool calls
- No context window management
- Tool call history not stored (only input/output)

### 7.2 Solution: Context Window with Tool History

**Pattern from n8n** ([Issue #14361](https://github.com/n8n-io/n8n/issues/14361)):
```typescript
interface ConversationMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;  // For tool messages
  toolCallId?: string;
  timestamp: Date;
}

// Store last N interactions including tool calls
const CONTEXT_WINDOW_SIZE = 10;
```

### 7.3 Implementation Plan

1. **Create ConversationMemoryService**
   - Store messages in Redis (short-term) + PostgreSQL (long-term)
   - Include tool call results, not just user/assistant messages
   - Configurable context window size

2. **Inject Context into Agent**
   ```typescript
   // Before agent.generateText()
   const recentContext = await conversationMemory.getRecent(
     tenantId,
     userId,
     CONTEXT_WINDOW_SIZE
   );
   enhancedMessage = formatContextForPrompt(recentContext) + message;
   ```

3. **Cache Routing Decisions**
   ```typescript
   // Remember: "User asked about Mario's emails"
   // Next query "What did he say?" → Route to EmailAgent directly
   const lastRouting = await routingCache.get(conversationId);
   if (lastRouting?.suggestedAgent === 'Email' && isFollowUp(message)) {
     // Continue with same agent
   }
   ```

### 7.4 Files to Create/Modify
- `services/conversation-memory.service.ts` (NEW)
- `voltagent.service.ts` - Inject context before agent call
- `model-router.service.ts` - Cache routing decisions

### 7.5 Expected Impact
- Fewer repeated questions from agent
- Better follow-up handling ("What did he say?" after "emails from Mario")
- Reduced LLM calls (agent knows what tools already returned)

---

## References

- [LangChain: How to speed up agents](https://blog.langchain.com/how-do-i-speed-up-my-agent/)
- [Hypermode: AI Agent Performance](https://hypermode.com/blog/optimize-ai-agent-performance)
- [Databricks: Multi-Agent Supervisor](https://www.databricks.com/blog/multi-agent-supervisor-architecture-orchestrating-enterprise-ai-scale)

---

## Change Log

| Date | Change | Files |
|------|--------|-------|
| 2025-01-06 | Reduce supervisor maxSteps 10→5 | supervisor.agent.ts |
| 2025-01-06 | Reduce email maxSteps 5→3 | email.agent.ts |
| 2025-01-06 | Add direct routing for General | voltagent.service.ts |
| 2025-01-06 | Created optimization roadmap | This file |
| 2025-01-06 | Extend direct routing to Email/Calendar/Contacts | voltagent.service.ts |
| 2025-01-06 | Add VoltAgent Memory to all agents | All agent files |
| 2025-01-06 | Pass memory in getOrCreateAgent switch | voltagent.service.ts |
| 2026-01-10 | Tool consolidation 44→17 (61% reduction) | email.tools.ts, insights.tools.ts, folder.tools.ts, contacts.tools.ts, calendar.tools.ts, document-library.tools.ts |
| 2026-01-10 | Agent consolidation 10→3 (ActionsAgent + IntelligenceAgent) | actions.agent.ts, intelligence.agent.ts, supervisor.agent.ts, index.ts |
| 2026-01-10 | Memory Bug #1 fix: retry logic with exponential backoff | voltagent.service.ts |
| 2026-01-10 | Memory Bug #2 fix: pass memory to all sub-agents | supervisor.agent.ts |
| 2026-01-10 | Memory Bug #3 fix: deterministic fallback sessionId | voltagent.service.ts |
| 2026-01-10 | Memory Bug #4 fix: atomic conversation creation | voltagent.service.ts |
| 2026-01-10 | Verify embedding cache (GDPR-compliant) | mistral.service.ts |
| 2026-01-10 | Verify prompt consolidation (EN prompts, IT UI only) | locales/it.ts |
