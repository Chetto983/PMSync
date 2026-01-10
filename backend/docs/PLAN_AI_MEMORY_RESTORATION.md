# AI Memory System Restoration Plan

## Problem Summary
The AI memory system was removed in the "AI Refactor v2.0" (2025-01-05) as "bloat". However:
1. **Frontend still expects memory APIs** - `/dashboard/ai/memories` page is broken
2. **User confirms the feature was useful** - wants it restored
3. **Archived code exists** - `D:\MailAgent\Long Term memory\archive\memory\`
4. **Missing prompts** - The mem0-style prompts for ADD/UPDATE/DELETE/SEARCH are basic

## Current State

### Deleted Components
| Component | Status |
|-----------|--------|
| `UserProfileEmbedding` model | Deleted from schema |
| `MemoryChangeLog` model | Deleted from schema |
| `ProceduralPattern` model | Deleted from schema |
| `VoltAgentConversation` model | Deleted from schema |
| `LongTermMemoryService` | Archived (not in build) |
| Memory controller endpoints | Removed (line 712) |

### Working Components
| Component | File |
|-----------|------|
| Frontend hooks | `frontend/hooks/queries/use-memories.ts` |
| Frontend types | `frontend/lib/api/ai.ts` (Memory, MemoryType) |
| Frontend UI | `frontend/components/ai/MemoryBrowser/` |
| MistralService | For embeddings |
| PrismaService | For storage |

---

## Decision Required: Scope of Restoration

### Option A: Full Restoration (Recommended)
Restore the complete mem0-style memory system with:
- Long-term memory (facts, preferences, patterns)
- Conversation memory (VoltAgent chat history)
- Procedural patterns (learned task workflows)
- History tracking (audit log)

**Pros**: Full feature parity, learning capability
**Cons**: More migration work, bigger schema change

### Option B: Minimal Memory Only
Restore only user-facing memory (facts/preferences):
- Single `AiMemory` table
- Simple CRUD operations
- No conversation persistence
- No procedural learning

**Pros**: Simpler, faster to implement
**Cons**: Loses chat history persistence, no learning

---

## Implementation Plan (Option A)

### Phase 1: Database Schema
Add to `backend/prisma/schema.prisma`:

```prisma
// ============================================
// AI LONG-TERM MEMORY (Restored)
// ============================================
model UserProfileEmbedding {
  id            String    @id @default(cuid())
  tenantId      String
  userId        String
  content       String    @db.Text
  memoryType    String    @default("GENERAL")  // PREFERENCE, FACT, PATTERN, etc.
  confidence    Float     @default(0.5)
  source        String?   // EXPLICIT, INFERRED, CONVERSATION
  category      String?
  vector        Unsupported("vector(1024)")?
  metadata      Json?
  usageCount    Int       @default(0)
  lastUsedAt    DateTime?
  expiresAt     DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([tenantId, userId])
  @@index([tenantId, userId, memoryType])
  @@map("user_profile_embeddings")
}

model MemoryChangeLog {
  id            String    @id @default(cuid())
  tenantId      String
  userId        String
  memoryId      String
  action        String    // CREATE, UPDATE, DELETE
  previousValue String?   @db.Text
  newValue      String?   @db.Text
  metadata      Json?
  createdAt     DateTime  @default(now())

  @@index([tenantId, memoryId])
  @@map("memory_change_logs")
}
```

### Phase 2: Restore Service
Copy from archive: `D:\MailAgent\Long Term memory\archive\memory\long-term-memory.service.ts`
To: `backend/src/modules/ai/voltagent/memory/long-term-memory.service.ts`

Key methods:
- `addFact()` - Store a memory
- `getAllMemories()` - List memories
- `searchMemories()` - Semantic search
- `deleteMemory()` - Delete single
- `deleteUserMemories()` - Clear all (GDPR)
- `getStats()` - Memory statistics

### Phase 3: Controller Endpoints
Add to `voltagent.controller.ts` after line 713:

```typescript
// ========================================================================
// LONG-TERM MEMORY ENDPOINTS (Restored)
// ========================================================================

@Get('memory')
async listMemories(...) { ... }

@Get('memory/search')
async searchMemories(...) { ... }

@Post('memory')
async addMemory(...) { ... }

@Delete('memory/:id')
async deleteMemory(...) { ... }

@Delete('memory')
async clearAllMemories(...) { ... }

@Get('memory/stats')
async getMemoryStats(...) { ... }

@Get('memory/:id/history')
async getMemoryHistory(...) { ... }
```

### Phase 4: Update Frontend API
Update `frontend/lib/api/ai.ts` - replace personalizationApi stubs:

```typescript
export const personalizationApi = {
  getMemories(params) {
    return apiClient.get('/api/v1/voltagent/memory', { params });
  },
  storeMemory(payload) {
    return apiClient.post('/api/v1/voltagent/memory', payload);
  },
  deleteMemory(memoryId) {
    return apiClient.delete(`/api/v1/voltagent/memory/${memoryId}`);
  },
  // ... etc
};
```

### Phase 5: Add mem0-Style Prompts (Optional Enhancement)
Enhance extraction prompts for better fact extraction:

```typescript
const MEM0_EXTRACTION_PROMPT = `
You are a memory extraction assistant. Analyze the conversation and extract:
1. User preferences (PREFERENCE)
2. Personal facts (FACT)
3. Work patterns (PATTERN)
4. Contact notes (CONTACT_NOTE)

Return JSON:
{
  "memories": [
    {"type": "PREFERENCE", "content": "...", "importance": 0.8},
    {"type": "FACT", "content": "...", "importance": 0.7}
  ]
}
If nothing important, return {"memories": []}
`;
```

---

## Files to Modify

| File | Action |
|------|--------|
| `backend/prisma/schema.prisma` | Add 2 models |
| `backend/src/modules/ai/voltagent/memory/long-term-memory.service.ts` | Restore from archive |
| `backend/src/modules/ai/voltagent/voltagent.controller.ts` | Add 7 endpoints |
| `backend/src/modules/ai/voltagent/voltagent.module.ts` | Register service |
| `frontend/lib/api/ai.ts` | Replace stub APIs |

---

## Migration Command
```bash
cd backend
npx prisma migrate dev --name restore-ai-memory
```

---

## Validation
1. Run `npm run type-check` in both frontend and backend
2. Test `/dashboard/ai/memories` page
3. Verify add/delete/list operations work
4. Confirm multi-tenant isolation
