# Phase 25: Tools & RAG - Research

**Researched:** 2026-03-02
**Domain:** AI SDK v6 tool system, NestJS DI integration, intent routing, hybrid RAG (vector + FTS)
**Confidence:** HIGH

## Summary

Phase 25 replaces the two stub tools in `AiChatService.createToolSet()` with ~20 real tools organized into `@Injectable()` ToolsService classes, wires intent-based routing via `prepareStep` + `activeTools`, and adds hybrid search (pgvector + PostgreSQL tsvector FTS with RRF fusion).

The codebase is well-prepared. Phase 24 established the exact pattern: `tool()` from `ai` package with `inputSchema` (Zod v4), `needsApproval`, and a PII resolution closure. The existing `IntentClassifierService` provides FastText-based classification with bilingual EN/IT support and a regex fallback. Domain services (`EmailSearchService`, `EmailSendService`, `EmailCrudService`, `CalendarEventsService`, `ContactsService`) are all `@Injectable()` and exported from their respective modules. The `AIMemory` model already exists in Prisma with vector + trigram indexes.

The main work is: (1) defining ~20 tools with real `execute` bodies that call domain services, (2) grouping them into ToolsService classes injected into AiChatModule, (3) wiring `prepareStep` in `streamText` to gate `activeTools` per step via IntentClassifier, (4) adding `tsvector` columns + GIN indexes to Email/Contact/CalendarEvent tables, (5) implementing an RRF-fused hybrid search function, and (6) building a `save_memory` tool using the existing `AIMemory` model.

**Primary recommendation:** Use the existing `createToolSet()` closure pattern but extract tool definitions into separate `@Injectable()` ToolsService classes that receive domain services via NestJS DI. Each ToolsService exposes a `getTools(tenantId, conversationId, piiResolve)` method returning a `Record<string, Tool>` that `AiChatService` merges.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Tool Inventory (~20 tools):** Full ~20 tools across all domains:
  - Email (9): send_email, search_emails, read_email, archive_email, move_email, delete_email, forward_email, reply_email, draft_email
  - Calendar (4): view_calendar, create_event, update_event, delete_event
  - Contacts (3): search_contacts, create_contact, update_contact
  - Folders (2): list_folders, create_folder
  - RAG & Utility (2-3): semantic_search (unified), save_memory, recall via auto-inject
- **Unified Semantic Search:** Single `semantic_search` tool covering all sources: `{ query, sources?: ('emails'|'contacts'|'calendar')[], limit? }`
- **Memory (ChatGPT-style via mem0 philosophy):** `save_memory` tool for explicit saves. Auto-inject top-3 relevant memories into system prompt. No explicit `recall_memory` tool.
- **Email Tool Details:** `read_email` returns existing fields (snippet, bodyText truncated, triage labels/sentiment). `draft_email` creates a real draft in the email provider.
- **Tool Return Data:** All tools return rich, artifact-ready structured objects for Phase 27 frontend tool renderers.
- **Intent Routing:** No find_tool meta-tool. AI SDK v6 `prepareStep` with `activeTools`. FastText (Step 0) with Ministral 3B fallback for low confidence. Per-turn scoping.
- **Multi-step Tool Chains:** `maxSteps: 5`, `prepareStep` adjusts `activeTools` between steps.
- **HITL Approval Required (6 tools):** send_email, reply_email, forward_email (external), delete_email, delete_event, delete_contact
- **Hybrid Search (RAG):** PostgreSQL Full-Text Search (tsvector) for keyword path. Migration: add tsvector columns + GIN indexes to Email, Contact, CalendarEvent. RRF K=50, equal weights 1:1, pull 20 from each source, fuse to top 10.

### Claude's Discretion
- ToolsService class grouping and naming
- Tool granularity (separate vs consolidated) -- follow Anthropic best practices
- Calendar embedding strategy (full embed vs FTS-only)
- Exact IntentClassifier -> activeTools mapping rules
- HITL auto-expire timeout duration
- Batch HITL behavior
- Calendar tool datetime handling

### Deferred Ideas (OUT OF SCOPE)
- Background auto-extraction of memories (Phase 30+)
- User-configurable HITL preferences (future UX phase)
- HITL edit-before-approve (Phase 27 frontend)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AI-02 | ~20 tools defined as AI SDK v6 `tool()` in `@Injectable()` ToolsService classes with NestJS DI -- no factory functions, no parameter threading | Tool definitions use existing `tool()` + `inputSchema` pattern from Phase 24. Domain services injected via NestJS DI into ToolsService classes. PII resolution via closure from `AiChatService.createToolSet()`. |
| AI-03 | Intent-based tool routing serves 6-8 relevant tools per request (not all 20) | `IntentClassifierService` already exists with FastText + regex fallback. Wire into `prepareStep` callback. Map `PrimaryIntent` -> `activeTools` array. Ministral 3B fallback for low confidence via `MistralProviderService.getChatModel('ministral-3b-latest')`. |
| RAG-01 | Embedding pipeline (BullMQ queues, KnowledgeBase, pgvector storage) preserved and rewired to new AI module -- existing embeddings data intact | Pipeline is fully intact in `AiModule` (`EmailEmbeddingQueueService`, `ContactEmbeddingQueueService`, `KnowledgeBaseService`, `EmbeddingsService`). `semantic_search` tool calls `EmbeddingSearchService.search()`. No changes to existing pipeline needed. |
| RAG-02 | Hybrid search (vector + keyword with RRF fusion) preserved -- UnifiedRetriever logic survives in new module | New hybrid search combining existing vector search (`EmbeddingsService.findSimilarContent()`) with new tsvector FTS. Requires migration for tsvector columns + GIN indexes. RRF fusion as PostgreSQL function. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ai | 6.0.77 | `tool()`, `streamText`, `prepareStep`, `activeTools`, `stepCountIs` | Already in use from Phase 24 |
| zod | 4.3.6 | Tool input schemas (`inputSchema`) | Already in use; AI SDK v6 supports Zod v4 natively |
| @ai-sdk/mistral | 3.0.19 | LLM provider (chat + embeddings) | Already in use |
| @nestjs/common | (installed) | `@Injectable()`, DI, module system | NestJS is the project framework |
| bullmq | (installed) | Embedding job queues | Already running for email/contact embeddings |
| pgvector | (installed) | Vector similarity search | Already running in production |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PostgreSQL tsvector | native | Full-text search for keyword path | New -- requires migration |
| nanoid | (installed) | ID generation | Already used in EmbeddingsService |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tsvector FTS | Prisma `contains` (trigram) | tsvector is faster, supports ranking, language-aware stemming. Trigram already exists but lacks ranking and is O(n) for long text. User explicitly chose tsvector. |
| Separate search tools | Single unified `semantic_search` | User locked: single tool with `sources` filter. |

**Installation:** No new packages needed. All dependencies already installed.

## Architecture Patterns

### Recommended ToolsService Class Grouping

```
backend/src/modules/ai-chat/
├── tools/
│   ├── index.ts                   # Re-exports, type definitions
│   ├── email-tools.service.ts     # 9 email tools (~400 lines)
│   ├── calendar-tools.service.ts  # 4 calendar tools (~250 lines)
│   ├── contact-tools.service.ts   # 3 contact tools (~200 lines)
│   ├── folder-tools.service.ts    # 2 folder tools (~100 lines)
│   ├── rag-tools.service.ts       # semantic_search + save_memory (~250 lines)
│   ├── intent-router.service.ts   # prepareStep logic, intent->tools mapping (~200 lines)
│   └── hybrid-search.service.ts   # RRF fusion, tsvector + vector (~300 lines)
├── services/
│   ├── ai-chat.service.ts         # Orchestrator (modified)
│   ├── conversation.service.ts    # Unchanged
│   ├── hitl.service.ts            # Unchanged
│   └── memory.service.ts          # Memory auto-inject for system prompt (~150 lines)
```

**Rationale for grouping by domain:**
1. Each ToolsService depends on a specific domain module (EmailModule, CalendarModule, ContactsModule)
2. NestJS DI naturally groups by module imports
3. Anthropic best practices: separate tools with focused schemas reduce LLM selection errors
4. Each file stays under 500 lines per CLAUDE.md rules

### Pattern 1: ToolsService Class with DI + Closure

**What:** Each ToolsService is `@Injectable()`, receives domain services via constructor DI, exposes a `getTools()` method that returns tool definitions with closures for PII resolution.

**When to use:** Every tool domain group.

**Example:**
```typescript
// Source: Extrapolation from Phase 24 createToolSet pattern + NestJS DI
@Injectable()
export class EmailToolsService {
  constructor(
    private readonly emailSearch: EmailSearchService,
    private readonly emailCrud: EmailCrudService,
    private readonly emailSend: EmailSendService,
    private readonly emailBulk: EmailBulkService,
  ) {}

  getTools(
    tenantId: string,
    conversationId: string,
    piiResolve: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>,
  ): Record<string, ReturnType<typeof tool>> {
    return {
      search_emails: tool({
        description: 'Search emails by query text, sender, date range, or folder. Returns matching emails with subject, sender, date, and snippet.',
        inputSchema: z.object({
          query: z.string().describe('Search query: keywords, sender name, or subject'),
          folder: z.string().optional().describe('Folder to search in (e.g., INBOX, SENT)'),
          limit: z.number().min(1).max(20).optional().describe('Maximum results (default 10)'),
        }),
        execute: async (args) => {
          const resolved = await piiResolve(args as unknown as Record<string, unknown>);
          const results = await this.emailSearch.searchEmails(
            tenantId,
            resolved.query as string,
            undefined,
            (resolved.limit as number) ?? 10,
          );
          return { results, count: results.length };
        },
      }),
      // ... more email tools
    };
  }
}
```

### Pattern 2: AiChatService Merges All ToolsService Outputs

**What:** `AiChatService.createToolSet()` calls each ToolsService's `getTools()` and spreads results.

```typescript
private createToolSet(tenantId: string, conversationId: string) {
  const piiResolve = async (payload: Record<string, unknown>) =>
    this.piiResolutionService.resolvePayload(tenantId, conversationId, payload);

  return {
    ...this.emailToolsService.getTools(tenantId, conversationId, piiResolve),
    ...this.calendarToolsService.getTools(tenantId, conversationId, piiResolve),
    ...this.contactToolsService.getTools(tenantId, conversationId, piiResolve),
    ...this.folderToolsService.getTools(tenantId, conversationId, piiResolve),
    ...this.ragToolsService.getTools(tenantId, conversationId, piiResolve),
  };
}
```

### Pattern 3: prepareStep Intent Routing

**What:** Wire `IntentClassifierService` into `prepareStep` callback. Step 0 classifies, subsequent steps can expand.

```typescript
const allTools = this.createToolSet(tenantId, conversationId);
const allToolNames = Object.keys(allTools);

const result = streamText({
  model: this.mistralProvider.getChatModel(model),
  system: systemPromptWithMemory,
  messages,
  tools: allTools,
  stopWhen: stepCountIs(5),
  prepareStep: async ({ stepNumber, steps }) => {
    if (stepNumber === 0) {
      // Initial intent classification
      const classification = await this.intentRouter.classifyAndRoute(
        message, // the user's message
      );
      return { activeTools: classification.activeTools };
    }
    // Subsequent steps: expand based on previous tool calls
    const lastStep = steps[steps.length - 1];
    const expanded = this.intentRouter.expandTools(lastStep, allToolNames);
    return { activeTools: expanded };
  },
});
```

### Pattern 4: RRF Hybrid Search (PostgreSQL Function)

**What:** A Prisma `$queryRaw` call to a custom PostgreSQL function that does FULL OUTER JOIN of vector results and tsvector results with RRF scoring.

```sql
-- Migration: add tsvector column + GIN index to emails
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "fts" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce("subject", '') || ' ' ||
      coalesce(LEFT("bodyText", 5000), '') || ' ' ||
      coalesce("from", '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS "emails_fts_gin_idx" ON "emails" USING gin("fts");
```

### Pattern 5: Memory Auto-Inject

**What:** Before each chat turn, search `AIMemory` table by similarity to user message, inject top-3 into system prompt.

```typescript
// In streamChat, before creating the streamText call:
const memories = await this.memoryService.getRelevantMemories(
  tenantId, userId, message, 3
);
const systemPromptWithMemory = memories.length > 0
  ? SYSTEM_PROMPT + `\n\n## Known Facts About This User\n${memories.map(m => `- ${m.content}`).join('\n')}`
  : SYSTEM_PROMPT;
```

### Anti-Patterns to Avoid
- **Static tool exports:** Never export a `getToolSet()` from tools/index.ts. Tools MUST be created via closure for PII resolution. Phase 24 comment explicitly warns about this.
- **All tools every request:** Never pass all 20 tools without `activeTools` filtering. At 10K users this wastes tokens.
- **Direct Prisma `contains` for keyword search:** Use tsvector with `ts_rank_cd` for ranked keyword results. `contains` is unranked and slow on long text.
- **Embedding content in metadata:** Embeddings table stores vector + entity IDs only (GDPR compliance). Always hydrate from source tables.
- **JSONB metadata queries:** Use indexed `emailId`/`contactId` fields, never `metadata.path['emailId']`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vector similarity search | Custom distance calculation | `EmbeddingsService.findSimilarContent()` | Already optimized with pgvector HNSW index, tenant isolation CTE, ef_search tuning |
| Embedding generation | Direct Mistral API calls | `MistralService.generateEmbedding()` / `MistralProviderService.getEmbeddingModel()` | Rate limiting, retry, error handling built in |
| Email search | Raw Prisma queries | `EmailSearchService.searchEmails()` | Handles folder exclusion (trash/spam), RFC 6154 specialUse, pagination |
| Email sending | Direct IMAP/API calls | `EmailSendService.queueSend()` | BullMQ queue, provider abstraction, attachment handling |
| Calendar CRUD | Direct Google/Microsoft API | `CalendarEventsService` | Provider abstraction, bidirectional sync, webhook handling |
| Contact CRUD | Direct Prisma queries | `ContactsService` | Cache invalidation, provider sync, embedding queue triggers |
| Embedding queue | Custom queue system | `EmailEmbeddingQueueService` / `ContactEmbeddingQueueService` | BullMQ with DLQ, rate limiting, deduplication |
| Intent classification | LLM-only routing | `IntentClassifierService.classify()` | Sub-millisecond FastText, bilingual, with regex fallback |
| PII resolution | Manual detokenization | `piiResolve` closure from `AiChatService` | Already wired in Phase 24, Redis-backed mapping |

## Common Pitfalls

### Pitfall 1: Circular Module Dependencies with ToolsService DI
**What goes wrong:** `AiChatModule` imports `EmailModule` which imports `AiModule` which is already imported by `AiChatModule`.
**Why it happens:** Domain modules already have `forwardRef(() => AiModule)` for embedding triggers.
**How to avoid:** Use `forwardRef(() => EmailModule)` in `AiChatModule` imports. NestJS handles circular deps with forwardRef. EmailModule already exports all needed services.
**Warning signs:** `Nest cannot resolve dependencies` errors at startup.

### Pitfall 2: Zod v4 Schema Changes
**What goes wrong:** Zod v4 changed some APIs from v3. `.describe()` placement matters.
**Why it happens:** AI SDK v6 internally converts Zod to JSON Schema. If `.describe()` is not on the outermost schema, descriptions may be lost.
**How to avoid:** Always chain `.describe()` last on each field. Test that tool descriptions appear in the LLM's tool call. AI SDK v6 + Zod v4 is the project's stack and works natively.
**Warning signs:** LLM fails to select correct tool, or tool parameter descriptions are empty.

### Pitfall 3: tsvector Migration on Existing Data
**What goes wrong:** Adding a GENERATED ALWAYS STORED column rewrites every row. On a large table this locks the table.
**Why it happens:** PostgreSQL must compute tsvector for every existing row.
**How to avoid:** Use `CREATE INDEX CONCURRENTLY` for the GIN index. For the column itself, if the emails table is large, consider adding as nullable first, then backfilling in batches. For this project, the table size is manageable (single-tenant dev).
**Warning signs:** Migration hangs, connection timeouts, table locks.

### Pitfall 4: Tool Name Collisions
**What goes wrong:** Two ToolsService classes return a tool with the same name. The spread operator silently overwrites.
**Why it happens:** No compile-time check for tool name uniqueness across services.
**How to avoid:** Use domain prefixes in tool names OR add a runtime assertion in `createToolSet()` that checks for duplicate keys.
**Warning signs:** Tool randomly doesn't work; replaced by another tool's logic.

### Pitfall 5: Intent Router Misrouting Ambiguous Queries
**What goes wrong:** "Find John's meeting details and email them to Sarah" needs both email and calendar tools, but intent classifier picks only one domain.
**Why it happens:** FastText returns a single top intent. Multi-domain queries need multiple tool groups.
**How to avoid:** (1) The Ministral 3B fallback handles ambiguous queries. (2) `prepareStep` step >0 can expand `activeTools` based on prior tool results. (3) Consider always including a "base" tool set (search_emails, view_calendar, search_contacts) for common cross-domain queries.
**Warning signs:** User asks cross-domain question, LLM can't find the right tool.

### Pitfall 6: Composite Primary Keys in Prisma Queries
**What goes wrong:** Email, Contact, CalendarEvent all use `@@id([id, tenantId])` composite PKs. Forgetting `tenantId` in `findUnique` fails.
**Why it happens:** Tools pass just `emailId` from LLM, but Prisma needs both `id` AND `tenantId`.
**How to avoid:** All tool execute functions receive `tenantId` from the closure. Always pass both to Prisma queries. Use `findFirst({ where: { id, tenantId } })` instead of `findUnique` when the composite PK is awkward.
**Warning signs:** `PrismaClientKnownRequestError: Record not found` even though ID is correct.

### Pitfall 7: Missing ProviderId for Send/Draft Operations
**What goes wrong:** `EmailSendService.queueSend()` requires `providerId`, but the LLM only has `to`, `subject`, `body`.
**Why it happens:** The user's active email provider isn't passed to the tool.
**How to avoid:** Tool's `execute` function should look up the user's default/active provider from Prisma before calling send. Or pass `providerId` via the closure alongside `tenantId`.
**Warning signs:** "Provider not found" errors when sending emails.

## Code Examples

### Tool Definition with NestJS DI (Real Pattern)

```typescript
// Source: Phase 24 AiChatService.createToolSet() + NestJS conventions
import { Injectable } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { EmailSearchService } from '../../email/services/email-search.service';

@Injectable()
export class EmailToolsService {
  constructor(
    private readonly emailSearch: EmailSearchService,
  ) {}

  getTools(
    tenantId: string,
    conversationId: string,
    piiResolve: (p: Record<string, unknown>) => Promise<Record<string, unknown>>,
  ) {
    return {
      search_emails: tool({
        description: 'Search through user emails by keywords, sender, subject, or date. Returns a list of matching emails with their subject, sender, date, and preview snippet.',
        inputSchema: z.object({
          query: z.string().describe('Search query: keywords, sender name, subject text, or date reference'),
          limit: z.number().min(1).max(20).optional().describe('Max results to return (default: 10)'),
        }),
        execute: async (args) => {
          const resolved = await piiResolve(args as Record<string, unknown>);
          const results = await this.emailSearch.searchEmails(
            tenantId,
            resolved.query as string,
            undefined,
            (resolved.limit as number) ?? 10,
          );
          return { results, count: results.length };
        },
      }),
    };
  }
}
```

### prepareStep with IntentClassifier

```typescript
// Source: AI SDK v6 docs + existing IntentClassifierService
prepareStep: async ({ stepNumber, steps }) => {
  if (stepNumber === 0) {
    const { intent, confidence } = await this.intentRouter.classify(userMessage);
    if (confidence < 0.5) {
      // Fallback: use Ministral 3B for ambiguous queries
      const llmIntent = await this.intentRouter.classifyWithLlm(userMessage);
      return { activeTools: this.intentRouter.mapIntentToTools(llmIntent) };
    }
    return { activeTools: this.intentRouter.mapIntentToTools(intent) };
  }
  // Step >0: Expand based on what tools were just called
  const lastToolCalls = steps[steps.length - 1]?.toolCalls ?? [];
  const expandedTools = this.intentRouter.expandForFollowUp(lastToolCalls);
  return { activeTools: expandedTools };
},
```

### Intent-to-ActiveTools Mapping

```typescript
// Source: Derived from intent-taxonomy.ts PrimaryIntent type
const INTENT_TOOL_MAP: Record<string, string[]> = {
  // Email intents -> email tools + search
  email_search:    ['search_emails', 'semantic_search', 'read_email'],
  email_compose:   ['draft_email', 'send_email', 'search_contacts'],
  email_reply:     ['read_email', 'reply_email', 'search_emails'],
  email_forward:   ['read_email', 'forward_email', 'search_contacts'],
  email_delete:    ['search_emails', 'read_email', 'delete_email'],
  email_archive:   ['search_emails', 'archive_email'],
  email_move:      ['search_emails', 'move_email', 'list_folders'],
  email_read:      ['read_email', 'search_emails', 'semantic_search'],
  email_summarize: ['search_emails', 'read_email', 'semantic_search'],

  // Calendar intents -> calendar tools
  calendar_view:   ['view_calendar', 'search_contacts'],
  calendar_create: ['create_event', 'view_calendar', 'search_contacts'],
  calendar_update: ['update_event', 'view_calendar'],
  calendar_delete: ['delete_event', 'view_calendar'],

  // Contact intents -> contact tools
  contact_search:  ['search_contacts', 'semantic_search'],
  contact_create:  ['create_contact'],
  contact_update:  ['search_contacts', 'update_contact'],

  // Folder intents -> folder tools
  folder_list:     ['list_folders'],
  folder_create:   ['create_folder', 'list_folders'],

  // Utility intents -> no tools (LLM responds directly)
  greeting:        [],
  farewell:        [],
  thanks:          [],
  help:            [],
  settings_view:   [],
  status_check:    ['search_emails', 'view_calendar'],
  unknown:         ['search_emails', 'semantic_search', 'view_calendar'],
};
```

### Hybrid Search RRF SQL Function

```sql
-- Source: Supabase hybrid search pattern adapted for PMSync schema
CREATE OR REPLACE FUNCTION hybrid_email_search(
  p_tenant_id TEXT,
  p_query TEXT,
  p_embedding vector(1024),
  p_match_count INT DEFAULT 10,
  p_fts_weight FLOAT DEFAULT 1.0,
  p_semantic_weight FLOAT DEFAULT 1.0,
  p_rrf_k INT DEFAULT 50
)
RETURNS TABLE (
  email_id TEXT,
  subject TEXT,
  "from" TEXT,
  snippet TEXT,
  received_at TIMESTAMPTZ,
  rrf_score FLOAT
)
LANGUAGE sql STABLE AS $$
WITH fts_results AS (
  SELECT
    e.id,
    ROW_NUMBER() OVER (ORDER BY ts_rank_cd(e.fts, websearch_to_tsquery('english', p_query)) DESC) AS rank_ix
  FROM emails e
  WHERE e."tenantId" = p_tenant_id
    AND e.fts @@ websearch_to_tsquery('english', p_query)
  ORDER BY rank_ix
  LIMIT LEAST(p_match_count * 2, 40)
),
semantic_results AS (
  SELECT
    emb."emailId" AS id,
    ROW_NUMBER() OVER (ORDER BY emb.vector <-> p_embedding) AS rank_ix
  FROM embeddings emb
  WHERE emb."tenantId" = p_tenant_id
    AND emb."emailId" IS NOT NULL
  ORDER BY rank_ix
  LIMIT LEAST(p_match_count * 2, 40)
)
SELECT
  e.id AS email_id,
  e.subject,
  e."from",
  e.snippet,
  e."receivedAt" AS received_at,
  (COALESCE(1.0 / (p_rrf_k + fts.rank_ix), 0.0) * p_fts_weight +
   COALESCE(1.0 / (p_rrf_k + sem.rank_ix), 0.0) * p_semantic_weight) AS rrf_score
FROM fts_results fts
FULL OUTER JOIN semantic_results sem ON fts.id = sem.id
JOIN emails e ON COALESCE(fts.id, sem.id) = e.id AND e."tenantId" = p_tenant_id
ORDER BY rrf_score DESC
LIMIT p_match_count;
$$;
```

### Memory Auto-Inject Pattern

```typescript
// Source: CONTEXT.md mem0/ChatGPT memory decisions + existing AIMemory model
@Injectable()
export class MemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mistralProvider: MistralProviderService,
  ) {}

  async getRelevantMemories(
    tenantId: string,
    userId: string,
    query: string,
    limit: number = 3,
  ): Promise<Array<{ content: string; category: string | null }>> {
    // Generate embedding for the query
    const model = this.mistralProvider.getEmbeddingModel();
    const { embedding } = await embed({ model, value: query });

    // Vector similarity search on AIMemory table
    const results = await this.prisma.$queryRaw<
      Array<{ content: string; category: string | null; distance: number }>
    >(
      Prisma.sql`
        SELECT content, category, (vector <-> ${Prisma.raw(`'[${embedding.join(',')}]'::vector`)}) AS distance
        FROM ai_memories
        WHERE "tenantId" = ${tenantId} AND "userId" = ${userId}
          AND (vector <-> ${Prisma.raw(`'[${embedding.join(',')}]'::vector`)}) < 0.5
        ORDER BY distance ASC
        LIMIT ${limit}
      `
    );

    return results;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `parameters` in tool() | `inputSchema` in tool() | AI SDK v6 | Must use `inputSchema`, not `parameters` |
| `CoreMessage` | `ModelMessage` | AI SDK v6 | Phase 24 already uses ModelMessage |
| `stepCountIs(1)` default | `stepCountIs(20)` default | AI SDK v6 | Project overrides to `stepCountIs(5)` |
| Global `strictJsonSchema` | Per-tool `strict` property | AI SDK v6 | Can set per tool |
| Zod v3 | Zod v4 | Project dependency | `.describe()` still works, chain last |
| `Experimental_Agent` | `ToolLoopAgent` class | AI SDK v6 | Not used -- project uses raw `streamText` |
| Prisma `contains` for search | tsvector FTS | This phase | Need migration for tsvector columns |

**Deprecated/outdated:**
- `parameters` property on `tool()` -- use `inputSchema` (Phase 24 already correct)
- `CoreMessage` type -- removed in AI SDK v6; use `ModelMessage`
- `@mistralai/mistralai` SDK -- removed in Phase 23; all via `@ai-sdk/mistral`

## Open Questions

1. **Calendar Embedding Strategy**
   - What we know: CalendarEvent has title, description, location, attendees. Short structured data. Already has trigram GIN index on title.
   - What's unclear: Whether embedding calendar events provides better search than FTS-only, given their structured nature.
   - Recommendation: Start with FTS-only for calendar (tsvector on title + description). Calendar data is short and structured -- tsvector with `websearch_to_tsquery` handles it well. Embeddings can be added later if semantic search quality is insufficient.

2. **Ministral 3B Model ID for Fallback Router**
   - What we know: CONTEXT.md specifies "Ministral 3B" as LLM fallback for low-confidence intent classification.
   - What's unclear: The exact model ID for Mistral's smallest model via `@ai-sdk/mistral`.
   - Recommendation: Use `mistral-small-latest` (cheapest available via API) or check if `ministral-3b-2410` is available. The model is just for intent classification -- any small fast model works.

3. **Provider Resolution for Send/Draft Tools**
   - What we know: `EmailSendService.queueSend()` requires `providerId`. LLM doesn't know the user's provider.
   - What's unclear: Whether to auto-detect default provider or ask user.
   - Recommendation: Auto-detect: query `ProviderConfig` for the user's active email provider within the tool execute function. If multiple providers, use the first one. This can be enhanced later.

4. **tsvector Language Configuration**
   - What we know: Users are bilingual EN/IT. tsvector `to_tsvector('english', ...)` only stems English.
   - What's unclear: Whether to use 'simple' (no stemming) or create dual-language config.
   - Recommendation: Use `'simple'` configuration for tsvector, which does basic tokenization without language-specific stemming. This works for both EN and IT queries. Multi-language tsvector configs are complex and the hybrid approach compensates -- semantic search handles language-agnostic matching.

## Sources

### Primary (HIGH confidence)
- AI SDK v6 docs: `tool()` API, `prepareStep`, `activeTools` -- https://ai-sdk.dev/docs/agents/loop-control
- AI SDK v6 tools docs -- https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- AI SDK v6 migration guide -- https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0
- AI SDK zodSchema reference -- https://ai-sdk.dev/docs/reference/ai-sdk-core/zod-schema
- Supabase hybrid search (RRF pattern) -- https://supabase.com/docs/guides/ai/hybrid-search
- Anthropic advanced tool use -- https://www.anthropic.com/engineering/advanced-tool-use
- Codebase: Phase 24 `AiChatService`, `IntentClassifierService`, `EmbeddingsService`, `KnowledgeBaseService` (verified via file reads)
- Codebase: Prisma schema with `AIMemory`, `Embedding`, `Email`, `Contact`, `CalendarEvent` models

### Secondary (MEDIUM confidence)
- Zod v4 + AI SDK v6 compatibility -- https://github.com/vercel/ai/discussions/7289 (community reports, some issues exist but project is already running this combo successfully in Phase 24)

### Tertiary (LOW confidence)
- Ministral 3B model ID (`ministral-3b-2410`) -- needs verification against current Mistral API model list

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use
- Architecture: HIGH -- extends proven Phase 24 patterns with well-documented AI SDK v6 APIs
- Pitfalls: HIGH -- identified from real codebase analysis (composite PKs, circular deps, provider resolution)
- RAG/Hybrid Search: HIGH -- Supabase pattern well-documented, pgvector already in production
- Intent Routing: MEDIUM -- IntentClassifier exists but mapping rules and Ministral fallback are new

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable -- AI SDK v6 is released, Zod v4 is stable)
