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

## Phase 2: Embedding Cache Optimization (TODO)

### 2.1 Verify Cache Integration
**Current Status**: MistralService has cache at lines 391-441, BUT:
- Check if Redis is actually connected
- Check cache hit rate in production

**Test Script**:
```bash
npx ts-node scripts/test-cache-hit.ts
```

### 2.2 Cache Pre-warming
- **File**: `services/cache-prewarming.service.ts`
- **Status**: Implemented with EN/IT query categories
- **Schedule**: 6 AM daily (common queries), every 4 hours (tenant queries)

### 2.3 Embedding Call Sites Audit
| File | Line | Status |
|------|------|--------|
| unified-retriever.ts | 274 | Uses MistralService (cached) |
| hybrid-retriever.ts | 173, 345 | Uses MistralService (cached) |
| insights.tools.ts | 1048 | Uses MistralService (cached) |
| knowledge-base.service.ts | 581 | Uses MistralService (cached) |

---

## Phase 3: Prompt Consolidation (TODO)

### Current Issue
- Prompts duplicated in EN/IT in `voltagent/locales/*.ts`
- Complex maintenance, easy to diverge

### Proposed Solution
1. Keep prompts in **English only**
2. Add system instruction: "Always respond in the user's language (Italian/English)"
3. Use `locale` parameter to set response language

### Benefits
- 50% less prompt maintenance
- Better English LLM performance (most training data is English)
- Consistent behavior across languages

### Files to Update
- `voltagent/locales/en.ts` - Keep as source of truth
- `voltagent/locales/it.ts` - Remove, use EN prompts
- `voltagent/locales/index.ts` - Simplify getTranslations()

---

## Phase 4: Lazy Agent Creation (TODO)

### Current Problem
- Supervisor creates 8 sub-agents upfront in `createSupervisorAgent()`
- Most requests only use 1-2 agents
- Memory/initialization overhead

### Proposed Solution
```typescript
// Instead of creating all agents upfront:
const subAgents = [emailAgent, calendarAgent, contactsAgent, ...];

// Create agents on-demand:
const agentFactories = {
  email: () => createEmailAgent({...}),
  calendar: () => createCalendarAgent({...}),
  // ...
};
```

### Files to Update
- `voltagent/agents/supervisor.agent.ts`

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
| 2025-01-06 | Add VoltAgent Memory to all agents | email.agent.ts, calendar.agent.ts, contacts.agent.ts, general.agent.ts, knowledge.agent.ts, websearch.agent.ts, analytics.agent.ts, document-library.agent.ts |
| 2025-01-06 | Pass memory in getOrCreateAgent switch | voltagent.service.ts |
