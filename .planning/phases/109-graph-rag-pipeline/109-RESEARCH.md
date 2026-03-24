# Phase 109: Graph RAG Pipeline - Research

**Researched:** 2026-03-24
**Domain:** PostgreSQL Graph RAG (recursive CTEs + pgvector + entity extraction + context assembly)
**Confidence:** HIGH

## Summary

Phase 109 replaces the current ad-hoc `GraphExpansionService` (3 parallel SQL queries on raw tables) with a proper entity graph model using `GraphNode` and `GraphEdge` tables, recursive CTE-based multi-hop traversal, structured context assembly with token budgets, entity-anchored memories, and dynamic few-shot examples. The entire implementation stays within PostgreSQL -- no external graph DB.

The existing codebase has strong foundations: `HybridSearchService` for RRF fusion, `RerankingService` for score normalization, `QueryRouterService` for complexity classification, `MemoryService` for vector-based memory retrieval, and `AiRunLedgerService` for telemetry. The main work is (1) new Prisma schema for graph tables, (2) entity extraction piggybacked on embedding queues, (3) a new `EntityGraphService` replacing `GraphExpansionService`, (4) context assembly layer with token budgeting, (5) memory anchoring via FK columns + graph edges, and (6) few-shot injection in the system prompt.

**Primary recommendation:** Build incrementally -- schema + entity extraction first, then graph traversal service, then context assembly, then memory anchoring, then few-shot examples. Each layer depends on the previous.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Full replacement of current `graph-expansion.service.ts` with proper entity graph
- New `GraphNode` and `GraphEdge` tables in PostgreSQL (no external graph DB)
- Node types: contact, email, thread, calendar_event, topic, memory
- Edge types: sent, received, mentions, replies_to, about, attended, anchored_to
- Multi-hop traversal via recursive CTEs (deterministic, no LLM agent loops)
- Postgres-maximalist approach: pgvector + recursive SQL, no Apache AGE
- JSONB metadata on nodes for flexible properties
- tenantId on all graph tables (multi-tenant)
- Entity extraction piggybacked on existing embedding queues (no separate queue)
- LLM-based extraction using Mistral
- Context assembly: structured extraction only, no LLM summarization
- Rank by combined RRF + graph score (reuse existing reranking infrastructure)
- Fill until token budget, then truncate
- Add nullable contactId and emailId FK columns to AIMemory model
- Auto-anchor during save_memory tool execution
- Memory retrieval via graph traversal from contact node
- 4 structured few-shot tool chain examples (relationship, temporal+entity, memory+context, cross-domain)
- Dynamic injection via query router tier mapping
- Query router enhanced to sub-classify multi_hop into: relationship / temporal+entity / memory / cross-domain
- Total RAG context budget: 4K tokens (split: Graph 60% / Memories 20% / Few-shot 20%)
- Token reduction measurement: log raw_context_tokens and assembled_context_tokens in AiRunLedger

### Claude's Discretion
- Exact node/edge table schema design (column types, indexes)
- Recursive CTE query structure and optimization
- Entity extraction prompt engineering
- Specific regex patterns for query router sub-classification
- Graph scoring algorithm (how to weight hop distance, edge type, recency)
- Migration strategy for existing graph-expansion.service.ts data

### Deferred Ideas (OUT OF SCOPE)
- GRAG-F01: Materialized entity graph with pre-computed edges for <20ms expansion
- GRAG-F02: Tool consolidation -- merge semantic_search + graph_context_search
- Community detection / clustering within the entity graph
- Apache AGE extension for native Cypher queries
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GRAG-01 | Context assembly produces structured summary of graph expansion results within a token budget | Context assembly layer with 4K token budget, structured field extraction, RRF+graph score ranking, token counting before injection |
| GRAG-02 | Context assembly reduces token usage by 40-60% compared to raw result injection | Structured extraction (subject/sender/date/snippet/relationship/hop) vs raw JSON; AiRunLedger raw_context_tokens / assembled_context_tokens comparison |
| GRAG-03 | AIMemory records can be anchored to a contact or email entity | Nullable contactId + emailId FK columns on AIMemory; anchored_to edges in graph |
| GRAG-04 | Entity-anchored memories are retrievable by direct entity lookup | Graph traversal from contact/email node via anchored_to edges; new getMemoriesByEntity() path in MemoryService |
| GRAG-05 | System prompt includes 3-5 few-shot tool chain examples for multi-hop queries | 4 structured examples covering relationship/temporal/memory/cross-domain patterns injected into system prompt |
| GRAG-06 | Few-shot examples are injected dynamically based on query complexity tier | QueryRouterService sub-classification of multi_hop; dynamic example selection in buildSystemPrompt |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | 6.x (existing) | Schema migration, ORM for graph tables | Already in stack, handles migrations |
| pgvector | existing extension | Vector similarity on node embeddings | Already deployed, used by HybridSearchService |
| PostgreSQL | 15+ (existing) | Recursive CTEs, JSONB, GIN indexes | Already deployed on Railway |
| BullMQ | existing | Entity extraction piggybacked on embedding jobs | Already used for email/contact embedding |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tiktoken / gpt-tokenizer | latest | Token counting for budget enforcement | Context assembly token budget |
| zod | existing | Schema validation for entity extraction output | Parse LLM extraction results |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recursive CTEs | Apache AGE (Cypher) | User explicitly rejected -- CTEs sufficient at email scale |
| LLM extraction | Regex/NER | Less accurate for topic/relationship extraction; LLM already called for embeddings |
| tiktoken | Approximate char/4 | Inaccurate for budget enforcement; tiktoken is <1ms |

**Installation:**
```bash
cd backend && npm install gpt-tokenizer
```

**Note:** `gpt-tokenizer` is a pure JS tokenizer that works without WASM. Use it for token counting in context assembly. The Mistral tokenizer follows a similar BPE scheme -- gpt-tokenizer's `cl100k_base` encoding is close enough for budget enforcement (within 5% accuracy).

## Architecture Patterns

### Recommended Project Structure
```
backend/src/modules/ai-chat/
  services/
    entity-graph.service.ts        # NEW: GraphNode/GraphEdge CRUD + recursive CTE traversal
    context-assembly.service.ts    # NEW: Token-budgeted context builder
    graph-expansion.service.ts     # DEPRECATED: Replaced by entity-graph.service.ts
    memory.service.ts              # MODIFIED: Add entity-anchored retrieval path
    query-router.service.ts        # MODIFIED: Add multi_hop sub-classification
    hybrid-search.service.ts       # UNCHANGED
    reranking.service.ts           # UNCHANGED
  constants/
    system-prompt.ts               # MODIFIED: Few-shot injection
    few-shot-examples.ts           # NEW: Structured few-shot templates
    tool-domains.ts                # UNCHANGED
  tools/
    rag-tools.service.ts           # MODIFIED: Wire entity graph into graph_context_search + save_memory anchoring

backend/src/modules/ai/services/
  entity-extraction.service.ts     # NEW: LLM-based entity+relationship extraction
  knowledge-base.service.ts        # MODIFIED: Call entity extraction after embedding

backend/prisma/
  schema.prisma                    # MODIFIED: GraphNode, GraphEdge models; AIMemory FK columns
  migrations/                      # NEW migration for graph tables + AIMemory columns + AiRunLedger columns
```

### Pattern 1: Entity Graph Schema (PostgreSQL Adjacency List)

**What:** Two tables -- nodes represent entities, edges represent relationships. JSONB metadata for flexibility. All tenant-scoped.

**When to use:** Any graph traversal query.

**Schema design:**
```sql
-- GraphNode: Entities extracted from emails/contacts/calendar
CREATE TABLE graph_nodes (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId"  TEXT NOT NULL,
  "nodeType"  TEXT NOT NULL,  -- 'contact', 'email', 'thread', 'calendar_event', 'topic', 'memory'
  "externalId" TEXT,          -- FK to source record (emailId, contactId, etc.)
  label       TEXT NOT NULL,  -- Display name / subject / topic name
  metadata    JSONB DEFAULT '{}',
  vector      vector(1024),   -- Optional embedding for semantic search on nodes
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_graph_nodes_tenant ON graph_nodes("tenantId");
CREATE INDEX idx_graph_nodes_tenant_type ON graph_nodes("tenantId", "nodeType");
CREATE INDEX idx_graph_nodes_external ON graph_nodes("tenantId", "externalId") WHERE "externalId" IS NOT NULL;
CREATE INDEX idx_graph_nodes_label_gin ON graph_nodes USING gin(label gin_trgm_ops);

-- GraphEdge: Directed relationships between nodes
CREATE TABLE graph_edges (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "tenantId"  TEXT NOT NULL,
  "sourceId"  TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  "targetId"  TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
  "edgeType"  TEXT NOT NULL,  -- 'sent', 'received', 'mentions', 'replies_to', 'about', 'attended', 'anchored_to'
  weight      FLOAT DEFAULT 1.0,
  metadata    JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_graph_edges_tenant ON graph_edges("tenantId");
CREATE INDEX idx_graph_edges_source ON graph_edges("sourceId");
CREATE INDEX idx_graph_edges_target ON graph_edges("targetId");
CREATE INDEX idx_graph_edges_type ON graph_edges("tenantId", "edgeType");
-- Composite for traversal queries
CREATE INDEX idx_graph_edges_source_type ON graph_edges("sourceId", "edgeType");
-- Prevent duplicate edges
CREATE UNIQUE INDEX idx_graph_edges_unique ON graph_edges("tenantId", "sourceId", "targetId", "edgeType");
```

### Pattern 2: Recursive CTE for Multi-Hop Traversal

**What:** Deterministic graph walk using SQL recursive CTEs, replacing LLM agent loops.

**When to use:** Any multi-hop query (relationship, temporal+entity, memory+context, cross-domain).

**Example:**
```sql
-- Multi-hop traversal from a seed node, up to N hops
WITH RECURSIVE graph_walk AS (
  -- Base case: seed node(s) from vector/FTS search
  SELECT
    n.id AS "nodeId",
    n."nodeType",
    n.label,
    n.metadata,
    0 AS hop,
    ARRAY[n.id] AS path,
    1.0::float AS score
  FROM graph_nodes n
  WHERE n."tenantId" = $1
    AND n.id = ANY($2::text[])  -- seed node IDs

  UNION ALL

  -- Recursive case: follow edges up to max_hops
  SELECT
    n2.id AS "nodeId",
    n2."nodeType",
    n2.label,
    n2.metadata,
    gw.hop + 1 AS hop,
    gw.path || n2.id,
    gw.score * e.weight * (0.7 ^ (gw.hop + 1))  -- decay by hop distance
  FROM graph_walk gw
  JOIN graph_edges e ON (e."sourceId" = gw."nodeId" OR e."targetId" = gw."nodeId")
    AND e."tenantId" = $1
  JOIN graph_nodes n2 ON n2.id = CASE
    WHEN e."sourceId" = gw."nodeId" THEN e."targetId"
    ELSE e."sourceId"
  END
  WHERE gw.hop < $3  -- max_hops parameter
    AND NOT n2.id = ANY(gw.path)  -- prevent cycles
)
SELECT DISTINCT ON ("nodeId")
  "nodeId", "nodeType", label, metadata, hop,
  MAX(score) AS score
FROM graph_walk
GROUP BY "nodeId", "nodeType", label, metadata, hop
ORDER BY "nodeId", score DESC;
```

**Graph scoring algorithm (recommended):**
- Base score from RRF rank (seed nodes get 1.0)
- Decay factor: `0.7 ^ hop_distance` (each hop reduces relevance by 30%)
- Edge weight multiplier: `sent` = 1.0, `received` = 1.0, `mentions` = 0.8, `replies_to` = 0.9, `about` = 0.7, `attended` = 0.6, `anchored_to` = 0.5
- Recency bonus: integrate existing `RerankingService.computeRecencyFactor()` via metadata.receivedAt
- Final score = `rrf_score * decay * edge_weight * recency_factor`

### Pattern 3: Structured Context Assembly

**What:** Extract key fields from graph nodes, rank by combined score, fill token budget.

**When to use:** Before injecting RAG context into system prompt.

**Example:**
```typescript
interface AssembledContext {
  graphContext: string;      // ~2400 tokens
  memoryContext: string;     // ~800 tokens
  fewShotContext: string;    // ~800 tokens
  rawTokenCount: number;     // Before assembly
  assembledTokenCount: number; // After assembly
}

// Per-node structured extraction (no LLM, just field mapping)
function assembleNodeContext(node: GraphNode, hop: number, edgeType: string): string {
  switch (node.nodeType) {
    case 'email':
      return `[Email, hop ${hop}, via ${edgeType}] Subject: ${node.metadata.subject} | From: ${node.metadata.from} | Date: ${node.metadata.receivedAt} | Snippet: ${node.metadata.snippet?.slice(0, 100)}`;
    case 'contact':
      return `[Contact, hop ${hop}] ${node.label} | ${node.metadata.company ?? ''} | ${node.metadata.jobTitle ?? ''} | Score: ${node.metadata.relationshipScore ?? 'N/A'}`;
    case 'thread':
      return `[Thread, hop ${hop}] ${node.label} | ${node.metadata.messageCount} messages`;
    case 'calendar_event':
      return `[Event, hop ${hop}] ${node.label} | ${node.metadata.startTime} | ${node.metadata.location ?? ''}`;
    case 'topic':
      return `[Topic, hop ${hop}] ${node.label}`;
    case 'memory':
      return `[Memory] ${node.label} (${node.metadata.category ?? 'general'})`;
  }
}
```

### Pattern 4: Entity Extraction (Piggybacked on Embedding)

**What:** After generating an email/contact embedding, call LLM to extract entities and relationships, then upsert into graph tables.

**When to use:** Inside `KnowledgeBaseService.createEmbeddingForEmail()` and `createEmbeddingForContact()`.

**LLM extraction prompt pattern:**
```typescript
const ENTITY_EXTRACTION_PROMPT = `Extract entities and relationships from this email.

Return JSON only:
{
  "entities": [
    { "type": "person"|"organization"|"topic", "name": "...", "metadata": {} }
  ],
  "relationships": [
    { "source": "...", "target": "...", "type": "sent"|"received"|"mentions"|"about", "metadata": {} }
  ]
}

Email:
From: {from}
To: {to}
Subject: {subject}
Body: {body_snippet}`;
```

**Critical:** Use the configured simple model (mistral-small) for extraction, not the expensive chat model. This runs on every email embedding, so cost matters.

### Anti-Patterns to Avoid
- **LLM-based context summarization:** User explicitly decided against this. Use structured field extraction only.
- **Separate entity extraction queue:** Piggyback on existing embedding queues. No new BullMQ queue.
- **JSONB path queries for lookups:** Use indexed FK fields (externalId). JSONB metadata for display-only properties.
- **Unbounded graph traversal:** Always enforce max_hops parameter (default 2, max 3). Recursive CTEs without depth limits can explode.
- **Cycle-ignorant traversal:** The `NOT n2.id = ANY(gw.path)` guard in the CTE is essential to prevent infinite loops.
- **Querying graph tables without tenantId:** Multi-tenant rule applies to all graph queries.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting | Character-based estimation | gpt-tokenizer (cl100k_base) | BPE tokenization is non-linear; char/4 can be 20% off |
| RRF fusion | Custom fusion formula | Existing HybridSearchService RRF | Already proven, handles edge cases |
| Score normalization | Custom min-max | Existing RerankingService | Already handles recency decay, thread coherence, priority |
| Graph cycle detection | Custom visited set | SQL path array in recursive CTE | Database-native, no application memory overhead |
| Entity deduplication | Exact string match | pg_trgm + vector distance (existing) | Handles "Marco" vs "Marco Rossi" vs "M. Rossi" |

## Common Pitfalls

### Pitfall 1: Recursive CTE Performance Explosion
**What goes wrong:** Recursive CTEs without proper bounds can generate exponential intermediate rows.
**Why it happens:** Dense graphs (e.g., a contact who sent 500 emails) cause fan-out at each hop.
**How to avoid:** (1) Limit max_hops to 2-3, (2) Limit intermediate row count with `LIMIT` in recursive term or pre-filter by edge type, (3) Add `WHERE hop < max_hops` in recursive case, (4) Use `DISTINCT ON` to deduplicate nodes found via multiple paths.
**Warning signs:** Graph traversal queries taking >100ms. Monitor with existing slow-query logging pattern.

### Pitfall 2: Entity Extraction Rate Limiting
**What goes wrong:** Adding LLM extraction to every email embedding doubles API calls, hitting Mistral rate limits.
**Why it happens:** Embedding queue processes 2 req/sec; adding extraction doubles to 4 req/sec.
**How to avoid:** (1) Use the cheap simple model (mistral-small), (2) Batch entity extraction where possible, (3) Make extraction optional/skippable if rate limited, (4) Consider fire-and-forget extraction that can retry independently.
**Warning signs:** 429 errors in embedding queue logs increasing after deployment.

### Pitfall 3: Stale Graph After Email Deletion
**What goes wrong:** Emails are deleted/archived but their graph nodes and edges persist, causing phantom results.
**Why it happens:** No cascade delete from source records to graph nodes.
**How to avoid:** (1) ON DELETE CASCADE from source table to graph_nodes via externalId, or (2) Periodic cleanup job, or (3) Soft-delete with `isActive` flag on graph nodes. Recommend option (1) using Prisma `onDelete: Cascade`.
**Warning signs:** Graph traversal returns nodes for emails/contacts that no longer exist.

### Pitfall 4: Token Budget Miscounting
**What goes wrong:** Context assembly exceeds 4K token budget, pushing conversation history out of context window.
**Why it happens:** Token estimation is wrong (using chars instead of tokens), or not accounting for structured format overhead.
**How to avoid:** Use gpt-tokenizer for actual BPE token counting. Include format overhead (brackets, labels, newlines) in the count. Test with real assembled contexts.
**Warning signs:** Model responses become less coherent or lose conversation context.

### Pitfall 5: AIMemory FK Migration Breaking Existing Records
**What goes wrong:** Adding non-nullable FK columns to AIMemory breaks existing records.
**Why it happens:** Prisma migration requires default value or nullable columns.
**How to avoid:** Make contactId and emailId nullable (they are optional anchors). Migration adds columns with `ALTER TABLE ai_memories ADD COLUMN "contactId" TEXT NULL`. No data loss.
**Warning signs:** Migration fails on Railway with "cannot add NOT NULL column without default".

### Pitfall 6: Few-Shot Token Overhead
**What goes wrong:** Few-shot examples consume too many tokens, leaving insufficient budget for actual RAG context.
**Why it happens:** Each multi-step tool chain example can be 200-400 tokens.
**How to avoid:** (1) Budget is 800 tokens for few-shot -- max 2-3 examples per query, (2) Simple queries get 0 examples, (3) Search gets 1, (4) Multi_hop gets 2-3. Pre-measure each example's token count.
**Warning signs:** RAG context regularly truncated to fit budget.

## Code Examples

### Entity Graph Service - Core Traversal
```typescript
// Source: Adapted from postgres-graph-rag patterns + project conventions
@Injectable()
export class EntityGraphService {
  constructor(private readonly prisma: PrismaService) {}

  async traverse(
    tenantId: string,
    seedNodeIds: string[],
    maxHops: number = 2,
    limit: number = 20,
  ): Promise<GraphTraversalResult[]> {
    return this.prisma.$queryRaw<GraphTraversalResult[]>(
      Prisma.sql`
        WITH RECURSIVE walk AS (
          SELECT n.id, n."nodeType", n.label, n.metadata,
                 0 AS hop, ARRAY[n.id] AS path, 1.0::float AS score
          FROM graph_nodes n
          WHERE n."tenantId" = ${tenantId}
            AND n.id = ANY(${seedNodeIds}::text[])
          UNION ALL
          SELECT n2.id, n2."nodeType", n2.label, n2.metadata,
                 w.hop + 1, w.path || n2.id,
                 w.score * e.weight * power(0.7, w.hop + 1)
          FROM walk w
          JOIN graph_edges e ON (e."sourceId" = w.id OR e."targetId" = w.id)
            AND e."tenantId" = ${tenantId}
          JOIN graph_nodes n2 ON n2.id = CASE
            WHEN e."sourceId" = w.id THEN e."targetId" ELSE e."sourceId"
          END
          WHERE w.hop < ${maxHops}
            AND NOT n2.id = ANY(w.path)
        )
        SELECT DISTINCT ON (id) id, "nodeType", label, metadata, hop, score
        FROM walk
        ORDER BY id, score DESC
        LIMIT ${limit}
      `,
    );
  }
}
```

### Context Assembly - Token Budget
```typescript
// Source: Project pattern from rag-tools + truncateToolResult utility
function assembleContext(
  graphResults: GraphTraversalResult[],
  memories: MemoryResult[],
  fewShotExamples: string[],
  tokenBudget: number = 4096,
): AssembledContext {
  const GRAPH_RATIO = 0.6;   // 60% = ~2400 tokens
  const MEMORY_RATIO = 0.2;  // 20% = ~800 tokens
  const FEWSHOT_RATIO = 0.2; // 20% = ~800 tokens

  const graphBudget = Math.floor(tokenBudget * GRAPH_RATIO);
  const memoryBudget = Math.floor(tokenBudget * MEMORY_RATIO);
  const fewShotBudget = Math.floor(tokenBudget * FEWSHOT_RATIO);

  // Sort graph results by score descending, fill until budget
  const sortedGraph = graphResults.sort((a, b) => b.score - a.score);
  let graphTokens = 0;
  const graphLines: string[] = [];
  for (const node of sortedGraph) {
    const line = assembleNodeContext(node);
    const lineTokens = countTokens(line);
    if (graphTokens + lineTokens > graphBudget) break;
    graphLines.push(line);
    graphTokens += lineTokens;
  }

  // Similar fill-until-budget for memories and few-shot
  // ...

  return {
    graphContext: graphLines.join('\n'),
    memoryContext: memoryLines.join('\n'),
    fewShotContext: selectedExamples.join('\n\n'),
    rawTokenCount: rawTotal,
    assembledTokenCount: graphTokens + memoryTokens + fewShotTokens,
  };
}
```

### AIMemory Anchoring in save_memory Tool
```typescript
// Source: Project pattern from rag-tools.service.ts save_memory
// After creating/updating memory, auto-anchor to entities
async function autoAnchorMemory(
  prisma: PrismaService,
  tenantId: string,
  memoryId: string,
  content: string,
  conversationContext: { contactId?: string; emailId?: string },
): Promise<void> {
  // 1. If conversation has active contact/email, anchor directly
  const updates: Record<string, string> = {};
  if (conversationContext.contactId) updates.contactId = conversationContext.contactId;
  if (conversationContext.emailId) updates.emailId = conversationContext.emailId;

  if (Object.keys(updates).length > 0) {
    await prisma.aIMemory.update({
      where: { id: memoryId },
      data: updates,
    });
  }

  // 2. Create anchored_to edges in entity graph
  // Find memory node, create edges to contact/email nodes
  // ... (graph edge creation)
}
```

### Query Router Sub-Classification
```typescript
// Source: Extending existing query-router.service.ts patterns
const MULTI_HOP_SUB_PATTERNS = {
  relationship: [
    /\b(what did|cosa ha detto)\b.*\b(say|said|tell|write|wrote)\b/i,
    /\b(interactions? with|relazione con)\b/i,
    /\b(history with|storico con)\b/i,
  ],
  temporal_entity: [
    /\b(from people|from contacts|da persone)\b.*\b(met|at|during)\b/i,
    /\b(at the|during the|al|durante)\b.*\b(conference|meeting|evento)\b/i,
  ],
  memory: [
    /\b(what do I know|remember|recall|ricordo|cosa so)\b/i,
    /\b(payment terms|contract|agreement|conditions)\b/i,
  ],
  cross_domain: [
    /\b(follow up|follow-up|should I|dovrei)\b.*\b(this week|today|tomorrow)\b/i,
    /\b(who should|chi dovrei)\b/i,
  ],
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ad-hoc SQL joins (graph-expansion.service.ts) | Formal entity graph with recursive CTEs | This phase | Multi-hop traversal, cycle detection, scored paths |
| Raw result injection | Token-budgeted structured assembly | This phase | 40-60% token reduction, predictable cost |
| Semantic-only memory retrieval | Entity-anchored + semantic hybrid | This phase | Direct lookup by contact/email, not just vector similarity |
| Static system prompt examples | Dynamic few-shot based on query complexity | This phase | Relevant examples per query type, no wasted tokens on simple queries |

**Deprecated/outdated:**
- `GraphExpansionService`: Being fully replaced by `EntityGraphService`. Keep the file but mark deprecated until migration verified.
- Current `graph_context_search` tool: Will be refactored to use entity graph traversal instead of the 3-parallel-query approach.

## Open Questions

1. **Entity extraction model cost**
   - What we know: Mistral small is ~$0.10/M input tokens. Each email extraction adds ~500 tokens.
   - What's unclear: At scale (thousands of emails), does this meaningfully increase embedding pipeline cost?
   - Recommendation: Make extraction toggle-able via env var (`ENTITY_EXTRACTION_ENABLED=true`). Log cost in AiRunLedger.

2. **Graph node deduplication for contacts**
   - What we know: Same contact can appear in multiple emails with different name formats ("Marco", "Marco Rossi", "M. Rossi").
   - What's unclear: How aggressively to merge? False positive merges are worse than false negative splits.
   - Recommendation: Use `externalId` (contactId from unified_contacts) as canonical identity. For unknown senders not in contacts, use email address as externalId. Topic nodes use label+tenantId uniqueness.

3. **Backfill strategy for existing data**
   - What we know: Thousands of existing emails have embeddings but no graph nodes/edges.
   - What's unclear: Should we backfill all existing data or only new data going forward?
   - Recommendation: Forward-only for initial deployment. Add a backfill command (like existing embedding backfill) as a follow-up. Graph will be sparse initially but grows organically.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + ts-jest |
| Config file | `backend/jest.config.ts` |
| Quick run command | `cd backend && npx jest --testPathPattern="entity-graph\|context-assembly\|query-router" --no-coverage -x` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GRAG-01 | Context assembly produces structured summary within token budget | unit | `cd backend && npx jest --testPathPattern="context-assembly" -x` | Wave 0 |
| GRAG-02 | Token reduction 40-60% vs raw injection | unit | `cd backend && npx jest --testPathPattern="context-assembly" -t "token reduction" -x` | Wave 0 |
| GRAG-03 | AIMemory records anchored to contact/email | unit | `cd backend && npx jest --testPathPattern="rag-tools" -t "anchor" -x` | Wave 0 |
| GRAG-04 | Entity-anchored memories retrievable by entity lookup | unit | `cd backend && npx jest --testPathPattern="memory.service" -t "entity" -x` | Wave 0 |
| GRAG-05 | System prompt includes few-shot examples | unit | `cd backend && npx jest --testPathPattern="few-shot\|system-prompt" -x` | Wave 0 |
| GRAG-06 | Few-shot dynamically injected by complexity tier | unit | `cd backend && npx jest --testPathPattern="query-router" -t "sub-class" -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest --testPathPattern="entity-graph\|context-assembly\|query-router\|memory.service\|rag-tools" --no-coverage -x`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/modules/ai-chat/services/entity-graph.service.spec.ts` -- covers GRAG-01, GRAG-04 (graph traversal)
- [ ] `backend/src/modules/ai-chat/services/context-assembly.service.spec.ts` -- covers GRAG-01, GRAG-02 (token budgets)
- [ ] `backend/src/modules/ai-chat/services/query-router.service.spec.ts` -- covers GRAG-06 (sub-classification, extend existing)
- [ ] `backend/src/modules/ai-chat/services/memory.service.spec.ts` -- covers GRAG-03, GRAG-04 (entity-anchored retrieval)
- [ ] `backend/src/modules/ai-chat/constants/few-shot-examples.spec.ts` -- covers GRAG-05 (example structure, token counts)
- [ ] `backend/src/modules/ai/services/entity-extraction.service.spec.ts` -- covers extraction prompt + parsing

## Sources

### Primary (HIGH confidence)
- Codebase: `graph-expansion.service.ts` -- current implementation being replaced (316 lines, 3 parallel SQL queries)
- Codebase: `hybrid-search.service.ts` -- RRF fusion pattern to reuse (269 lines)
- Codebase: `reranking.service.ts` -- score normalization pattern to reuse (169 lines)
- Codebase: `query-router.service.ts` -- complexity classification to extend (143 lines)
- Codebase: `memory.service.ts` -- memory retrieval to extend with entity anchoring (173 lines)
- Codebase: `rag-tools.service.ts` -- tool definitions to refactor (370 lines)
- Codebase: `ai-chat.service.ts` -- orchestration integration point (774 lines)
- Codebase: `system-prompt.ts` -- few-shot injection point (330 lines)
- Codebase: `ai-run-ledger.service.ts` -- telemetry for token tracking (133 lines)
- Codebase: `schema.prisma` -- AIMemory model (lines 1145-1172), AiRunLedger model (lines 1469-1495)
- Codebase: `email-embedding.queue.ts` -- embedding pipeline to piggyback (410 lines)

### Secondary (MEDIUM confidence)
- https://github.com/h4gen/postgres-graph-rag -- Postgres-maximalist GraphRAG: recursive CTEs, JSONB metadata, pgvector+graph
- https://techcommunity.microsoft.com/blog/adforpostgresql/introducing-the-graphrag-solution-for-azure-database-for-postgresql/4299871 -- Microsoft GraphRAG: RRF+prominence fusion, 40%->70% recall improvement

### Tertiary (LOW confidence)
- Token counting accuracy: gpt-tokenizer cl100k_base vs Mistral's actual tokenizer -- estimated within 5% but not verified. For budget enforcement this is acceptable.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use except gpt-tokenizer (trivial addition)
- Architecture: HIGH - recursive CTE pattern well-documented, existing codebase provides clear integration points
- Pitfalls: HIGH - identified from codebase analysis (rate limits, cascade deletes, token budget) and general PostgreSQL recursive CTE experience
- Entity extraction: MEDIUM - LLM extraction prompt engineering requires iteration; cost impact needs monitoring

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain, PostgreSQL patterns don't change)
