# Phase 109: Graph RAG Pipeline - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

AI chat produces more accurate, context-rich responses by assembling graph-expanded results within a token budget and using entity-anchored memories. Replaces current ad-hoc graph expansion with a formal entity graph model (nodes/edges + recursive CTEs), adds context assembly layer, memory anchoring, and dynamic few-shot examples.

Requirements: GRAG-01 through GRAG-06.

</domain>

<decisions>
## Implementation Decisions

### Entity Graph Model
- **Full replacement** of current `graph-expansion.service.ts` with a proper entity graph
- New `GraphNode` and `GraphEdge` tables in PostgreSQL (no external graph DB)
- Node types: contact, email, thread, calendar_event, topic, memory
- Edge types: sent, received, mentions, replies_to, about, attended, anchored_to
- Multi-hop traversal via **recursive CTEs** (deterministic, no LLM agent loops)
- Query accepts `hops` parameter controlling traversal depth
- Postgres-maximalist approach: pgvector + recursive SQL, no Apache AGE
- JSONB metadata on nodes for flexible properties
- tenantId on all graph tables (multi-tenant)

### Entity Extraction
- Piggyback on existing `email-embedding.queue.ts` and `contact-embedding.queue.ts`
- When an email is embedded, also extract entities (people, orgs, topics) and relationships
- Single pipeline, no separate extraction queue
- LLM-based extraction using the configured AI model (Mistral)

### Context Assembly
- **Structured extraction only** — no LLM summarization
- Extract key fields per node: subject, sender, date, snippet, relationship type, hop distance
- Rank by combined RRF + graph score (reuse existing reranking infrastructure)
- Fill until token budget, then truncate
- Graph structure itself provides the "summary" via relationship paths
- Deterministic, fast, predictable cost

### Memory Anchoring
- Add nullable `contactId` and `emailId` FK columns to `AIMemory` model
- Auto-anchor during `save_memory` tool execution: extract entity mentions from memory content, auto-link to matching contacts/emails
- If conversation context has an active email thread or contact, auto-anchor to those
- Memory retrieval via **graph traversal from contact node** — memories are nodes in the entity graph, linked via `anchored_to` edges

### Few-Shot Examples
- 4 structured few-shot tool chain examples covering:
  1. **Relationship queries** — "What did Marco say about the project?" → contact lookup → email search → thread expansion → context assembly
  2. **Temporal + entity queries** — "Find emails from people I met at the conference about budget" → calendar lookup → attendee extraction → email search
  3. **Memory + context queries** — "What do I know about Acme Corp's payment terms?" → memory lookup → contact graph → email history
  4. **Cross-domain correlation** — "Who should I follow up with this week?" → calendar scan → email recency → relationship scoring → prioritized list
- Dynamic injection via query router tier mapping:
  - Simple → no few-shot
  - Search → 1 relevant example
  - Multi_hop → 2-3 examples matching detected sub-pattern
- Query router enhanced to **sub-classify multi_hop** into: relationship / temporal+entity / memory / cross-domain (heuristic regex patterns)

### Token Budget
- Total RAG context budget: **4K tokens** (excluding conversation history and system prompt)
- Split: Graph results 60% (~2400 tokens) / Memories 20% (~800 tokens) / Few-shot 20% (~800 tokens)
- Token reduction measurement: log `raw_context_tokens` and `assembled_context_tokens` in `AiRunLedger`, calculate reduction ratio per run

### Claude's Discretion
- Exact node/edge table schema design (column types, indexes)
- Recursive CTE query structure and optimization
- Entity extraction prompt engineering
- Specific regex patterns for query router sub-classification
- Graph scoring algorithm (how to weight hop distance, edge type, recency)
- Migration strategy for existing graph-expansion.service.ts data

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & RAG
- `backend/src/modules/ai-chat/services/graph-expansion.service.ts` — Current graph expansion implementation being replaced
- `backend/src/modules/ai-chat/services/hybrid-search.service.ts` — RRF-based hybrid search (keyword + vector)
- `backend/src/modules/ai-chat/services/reranking.service.ts` — Recency decay + thread coherence scoring
- `backend/src/modules/ai-chat/services/query-router.service.ts` — Query complexity classification (extend for sub-patterns)
- `backend/src/modules/ai-chat/services/memory.service.ts` — Memory injection (refactor for entity-anchored retrieval)

### AI Chat Orchestration
- `backend/src/modules/ai-chat/services/ai-chat.service.ts` — Main orchestration service (context assembly integration point)
- `backend/src/modules/ai-chat/constants/system-prompt.ts` — System prompt (few-shot example injection point)
- `backend/src/modules/ai-chat/constants/tool-domains.ts` — Tool domain mapping for query router

### Tools & Embedding
- `backend/src/modules/ai-chat/tools/rag-tools.service.ts` — semantic_search + graph_context_search tools (refactor for entity graph)
- `backend/src/modules/ai/services/embeddings.service.ts` — Embedding pipeline (entity extraction integration point)
- `backend/src/modules/ai/queues/email-embedding.queue.ts` — Email embedding queue (piggyback entity extraction here)
- `backend/src/modules/ai/queues/contact-embedding.queue.ts` — Contact embedding queue

### Schema & Models
- `backend/prisma/schema.prisma` — Prisma schema (add GraphNode, GraphEdge tables; add FK columns to AIMemory)
- `backend/src/modules/ai/services/ai-run-ledger.service.ts` — Token tracking (add raw_context_tokens / assembled_context_tokens)

### Contact Graph
- `backend/src/modules/contacts/services/relationship-score.service.ts` — Relationship scoring (integrate as graph edge weight)

### External References
- https://github.com/h4gen/postgres-graph-rag — PostgreSQL-native GraphRAG approach: recursive CTEs for multi-hop, pgvector, JSONB metadata, no external graph DB
- https://techcommunity.microsoft.com/blog/adforpostgresql/introducing-the-graphrag-solution-for-azure-database-for-postgresql/4299871 — Microsoft's Graph RAG on PostgreSQL: RRF fusion, prominence signals, vector + graph combination

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `hybrid-search.service.ts`: RRF scoring can be extended with graph prominence signal
- `reranking.service.ts`: Score normalization and bonus framework reusable for graph-ranked results
- `query-router.service.ts`: Heuristic classification already handles simple/search/multi_hop — extend with sub-patterns
- `relationship-score.service.ts`: Scoring algorithm (recency/frequency/reciprocity/trend) can inform graph edge weights
- `ai-run-ledger.service.ts`: Token tracking infrastructure ready for before/after comparison
- `email-embedding.queue.ts` + `contact-embedding.queue.ts`: Existing BullMQ pipelines to piggyback entity extraction

### Established Patterns
- All queries use `tenantId` filter (multi-tenant)
- Prisma raw SQL via `Prisma.sql` for complex queries (pgvector, FTS)
- BullMQ for background processing with Redis
- Indexed FK fields for joins (never JSONB path queries for lookups)
- Tool results auto-truncated to 8KB before model ingestion

### Integration Points
- `ai-chat.service.ts` parallel context loading step — add graph context assembly here
- `rag-tools.service.ts` — `graph_context_search` tool needs refactoring to use entity graph
- `memory.service.ts` — `getRelevantMemories()` needs entity-anchored retrieval path
- `system-prompt.ts` — few-shot injection before tool definitions
- `save_memory` tool — add auto-anchoring logic during save

</code_context>

<specifics>
## Specific Ideas

- User referenced postgres-graph-rag repo: use recursive CTEs for multi-hop traversal instead of LLM agent loops — "deterministic, 10x faster"
- User wants Postgres-maximalist approach: no external graph DB, just pgvector + recursive SQL + JSONB
- Memory retrieval via graph traversal from contact node — memories are first-class graph citizens, not separate entities
- Microsoft article's RRF fusion of semantic + graph prominence signals — integrate relationship score as prominence dimension

</specifics>

<deferred>
## Deferred Ideas

- **GRAG-F01**: Materialized entity graph with pre-computed edges for <20ms expansion (future requirement in REQUIREMENTS.md)
- **GRAG-F02**: Tool consolidation — merge semantic_search + graph_context_search into unified tool (future requirement)
- Community detection / clustering within the entity graph (postgres-graph-rag roadmap Phase 3 feature)
- Apache AGE extension for native Cypher queries (decided against — recursive CTEs sufficient)

</deferred>

---

*Phase: 109-graph-rag-pipeline*
*Context gathered: 2026-03-24*
