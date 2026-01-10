# Semantic Memory Search Implementation Plan

## Goal
Implement semantic vector search for AI memories and integrate context into chat.

## Current State
- **AIMemory model**: NO vector column, uses text search (`mode: 'insensitive'`)
- **Embedding system**: MistralService.generateEmbedding() with `mistral-embed` (1024 dim)
- **pgvector**: Already set up with HNSW index on `embeddings` table
- **Context injection**: Episodic lessons injected at lines 835-900 in voltagent.service.ts

## Implementation Steps

### Step 1: Add Vector Column to AIMemory
**File**: `backend/prisma/schema.prisma`

Add to AIMemory model:
```prisma
vector Unsupported("vector(1024)")?
```

### Step 2: Create Migration
**File**: `backend/prisma/migrations/[timestamp]_ai_memory_vector/migration.sql`

```sql
-- Add vector column
ALTER TABLE "ai_memories" ADD COLUMN "vector" vector(1024);

-- Create HNSW index for fast similarity search
CREATE INDEX "ai_memories_vector_hnsw_idx"
  ON "ai_memories"
  USING hnsw (vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

### Step 3: Update AIMemoryService
**File**: `backend/src/modules/ai/voltagent/services/ai-memory.service.ts`

Changes:
1. Inject `MistralService` dependency
2. Modify `storeMemory()` to generate embedding
3. Add `searchMemoriesSemantic()` method using raw SQL with cosine distance
4. Update `updateMemory()` to regenerate embedding on content change

### Step 4: Update MemoryIntelligenceService
**File**: `backend/src/modules/ai/voltagent/services/memory-intelligence.service.ts`

Changes:
1. Modify `getRelevantContext()` to use semantic search
2. Add optional LLM re-ranking using `MEMORY_SEARCH_PROMPT`
3. Format memories for injection into chat

### Step 5: Integrate into Chat Context
**File**: `backend/src/modules/ai/voltagent/voltagent.service.ts`

Inject memory context at line ~840 (after episodic lessons, before conversation history):
```typescript
// 3.65. Inject long-term memory context
const memoryContext = await this.memoryIntelligenceService?.getRelevantContext(
  options.tenantId,
  options.userId,
  processedMessage
);
if (memoryContext) {
  enhancedMessage = `[User Memory]\n${memoryContext}\n\n---\n\n${enhancedMessage}`;
}
```

Update BOTH `chat()` and `streamChat()` methods.

### Step 6: Validation Script
**File**: `backend/scripts/test-memory-semantic.ts`

Test with real data:
1. Store test memories with embeddings
2. Search semantically (not exact text match)
3. Verify cosine similarity scores
4. Test chat context injection

## Files to Modify

| File | Changes |
|------|---------|
| `backend/prisma/schema.prisma` | Add vector column |
| `backend/prisma/migrations/...` | Create HNSW index |
| `backend/src/modules/ai/voltagent/services/ai-memory.service.ts` | Add MistralService, semantic search |
| `backend/src/modules/ai/voltagent/services/memory-intelligence.service.ts` | Use semantic search, add re-ranking |
| `backend/src/modules/ai/voltagent/voltagent.service.ts` | Inject memory context (lines 840, 1250) |
| `backend/src/modules/ai/voltagent/voltagent.module.ts` | Ensure dependencies registered |

## Architecture

```
User Message
     │
     ▼
┌─────────────────────────────────────────┐
│          voltagent.service.ts           │
│                                         │
│  1. Generate query embedding            │
│  2. memoryIntelligenceService           │
│     .getRelevantContext(message)        │
│  3. Inject into enhancedMessage         │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│     MemoryIntelligenceService           │
│                                         │
│  1. Generate embedding for query        │
│  2. Semantic search (cosine distance)   │
│  3. Optional: Re-rank with LLM          │
│  4. Return formatted context            │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│         AIMemoryService                 │
│                                         │
│  searchMemoriesSemantic():              │
│    SELECT * FROM ai_memories            │
│    WHERE tenantId = ? AND userId = ?    │
│    ORDER BY vector <-> $queryVector     │
│    LIMIT 10                             │
└─────────────────────────────────────────┘
```

## Cost Considerations
- Embedding generation: ~0.0001$/query (mistral-embed is cheap)
- Re-ranking with LLM: Optional, ~0.001$/query (mistral-small)
- Default: Semantic search only, no re-ranking (fast + cheap)
