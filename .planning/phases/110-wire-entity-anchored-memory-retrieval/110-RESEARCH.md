# Phase 110: Wire Entity-Anchored Memory Retrieval - Research

**Researched:** 2026-03-25
**Domain:** NestJS service wiring (EntityGraphService -> MemoryService -> ContextAssemblyService -> AiChatService)
**Confidence:** HIGH

## Summary

Phase 110 closes the last Graph RAG gap (GRAG-04): entity-anchored memories exist in the database (contactId/emailId FK columns on AIMemory, added in Phase 109) and `getMemoriesByEntity()` exists on MemoryService, but **nothing calls it**. The graph traversal in `prepareChatAgent()` (ai-chat.service.ts lines 254-283) finds entity nodes via `findSeedNodes()` + `traverse()`, but never extracts contact/email externalIds from the traversal results to fetch their anchored memories. The memories passed to `contextAssemblyService.assemble()` come only from `getRelevantMemories()` (vector/direct-load), not entity-anchored lookup.

The fix is surgical: after graph traversal returns `GraphTraversalResult[]`, extract `externalId` values from nodes with `nodeType === 'contact'` or `nodeType === 'email'`, call `memoryService.getMemoriesByEntity()` for each, merge with the vector-search memories (deduplicating by ID), and pass the combined set to context assembly. This is ~20-40 lines of code in `ai-chat.service.ts` plus a small helper method on MemoryService for batch entity memory retrieval.

**Primary recommendation:** Add a `getMemoriesByEntities()` batch method to MemoryService, wire it into `prepareChatAgent()` after graph traversal, merge results with existing vector memories, deduplicate by memory ID.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GRAG-04 | Entity-anchored memories are retrievable by direct entity lookup (not just semantic search) | `getMemoriesByEntity()` exists but is never called in the chat pipeline. Graph traversal returns nodes with `externalId` (contactId, emailId) that can be used to fetch anchored memories via FK lookup. Wiring needed in `prepareChatAgent()`. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Multi-tenant rule:** Every query MUST include tenantId
- **Embeddings:** Always use indexed FK fields (emailId, contactId), NEVER JSONB metadata path queries
- **Post-edit validation:** `cd backend && npx tsc --noEmit` after every edit
- **NEVER MODIFY TESTS TO MAKE THEM PASS** -- fix the code, not the tests
- **SCOPE CONTROL** -- do exactly what was asked, no unrequested features
- **Max 500 lines per file** -- ai-chat.service.ts is currently 822 lines, already over limit but exists as-is
- **FOLLOW EXISTING PATTERNS** -- never invent new approaches when codebase patterns exist

## Architecture Patterns

### Current Flow (Phase 109)

```
prepareChatAgent()
  |
  +-- memoryService.getRelevantMemories(tenantId, userId, query, 5)  // vector/direct-load
  |
  +-- entityGraphService.findSeedNodes(tenantId, query, 5)
  |     |
  |     +-- entityGraphService.traverse(tenantId, seedIds, { maxHops: 2 })
  |           |
  |           +-- returns GraphTraversalResult[] with { nodeId, nodeType, label, metadata, externalId? }
  |                 NOTE: externalId is on GraphNode model but NOT in GraphTraversalResult interface
  |
  +-- contextAssemblyService.assemble(graphResults, memories, fewShotExamples)
        |
        +-- Only vector-search memories passed here. Entity-anchored memories NEVER queried.
```

### Target Flow (Phase 110)

```
prepareChatAgent()
  |
  +-- memoryService.getRelevantMemories(tenantId, userId, query, 5)  // vector/direct-load
  |
  +-- entityGraphService.findSeedNodes(tenantId, query, 5)
  |     |
  |     +-- entityGraphService.traverse(tenantId, seedIds, { maxHops: 2 })
  |           |
  |           +-- returns GraphTraversalResult[] (with externalId added to interface)
  |
  +-- [NEW] Extract contact/email externalIds from traversal results
  |     |
  |     +-- memoryService.getMemoriesByEntities(tenantId, userId, entityIds)  // batch FK lookup
  |
  +-- [NEW] Merge entity memories with vector memories (deduplicate by id)
  |
  +-- contextAssemblyService.assemble(graphResults, mergedMemories, fewShotExamples)
```

### Key Code Locations

| File | What needs changing | Why |
|------|-------------------|-----|
| `backend/src/modules/ai-chat/services/entity-graph.service.ts` | Add `externalId` to `GraphTraversalResult` interface and to traverse() CTE SELECT | Traversal results must carry externalId so caller can extract entity IDs |
| `backend/src/modules/ai-chat/services/memory.service.ts` | Add `getMemoriesByEntities()` batch method | Avoid N+1 queries -- single batch call for all entity types |
| `backend/src/modules/ai-chat/services/ai-chat.service.ts` | Wire entity memory retrieval after graph traversal in `prepareChatAgent()` | The actual integration gap |

### Critical Detail: externalId Not in GraphTraversalResult

The `GraphTraversalResult` interface (entity-graph.service.ts line 15-23) does NOT include `externalId`. The `traverse()` CTE selects `n.id, n.nodeType, n.label, n.metadata` but not `n.externalId`. The `getNodesByExternalId()` method also does not return externalId in its mapped results. This must be added to both the interface and the CTE query.

### Critical Detail: GraphNode.externalId Links to Source Records

From the Prisma schema:
```
GraphNode.externalId  String?  // FK to source record (emailId, contactId, etc.)
```

So a GraphNode with `nodeType='contact'` and `externalId='abc-123'` means `abc-123` is a Contact record ID. AIMemory records anchored to that contact have `contactId='abc-123'`. The bridge is: `GraphNode.externalId` -> `AIMemory.contactId` (or `emailId`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Entity memory deduplication | Custom dedup logic with Sets | Simple Map by memory.id | IDs are cuid strings, Map lookup is O(1) |
| Batch entity memory query | N separate getMemoriesByEntity calls | Single Prisma findMany with OR conditions | Avoids N+1 database round-trips |

## Common Pitfalls

### Pitfall 1: N+1 Memory Queries
**What goes wrong:** Calling `getMemoriesByEntity()` once per entity node creates N database calls.
**Why it happens:** Graph traversal can return 10-20 nodes across contact and email types.
**How to avoid:** Add a batch method `getMemoriesByEntities()` that uses a single `findMany` with OR conditions for all entity IDs.
**Warning signs:** Log lines showing multiple sequential memory queries after graph traversal.

### Pitfall 2: Duplicate Memories in Context
**What goes wrong:** The same memory appears in both vector-search results and entity-anchored results, consuming double the token budget.
**Why it happens:** A memory anchored to a contact can also rank highly in semantic search for the same query.
**How to avoid:** Deduplicate by memory ID before passing to context assembly. Entity-anchored memories should take priority (they are deterministic, not probabilistic).
**Warning signs:** Context assembly output contains repeated memory lines.

### Pitfall 3: Missing externalId in Traverse Results
**What goes wrong:** The traversal CTE does not SELECT externalId, so caller cannot extract entity IDs.
**Why it happens:** The interface was designed for graph context assembly (nodeType, label, metadata) not for entity memory retrieval.
**How to avoid:** Add `externalId` to GraphTraversalResult interface and to both the base case and recursive case of the CTE.
**Warning signs:** Type errors when accessing `result.externalId` on traversal results.

### Pitfall 4: Token Budget Exceeded by Additional Memories
**What goes wrong:** Adding entity-anchored memories on top of vector memories pushes memory context over its 20% budget share.
**Why it happens:** Context assembly already enforces memory budget, but if we pass 15 memories instead of 5, only the first N that fit the budget get included. This is actually fine -- but the order matters.
**How to avoid:** When merging, put entity-anchored memories first (higher relevance for entity-specific queries) so they get priority within the token budget.
**Warning signs:** Entity memories truncated because vector memories consumed the budget first.

### Pitfall 5: ai-chat.service.ts Already Over 500-Line Limit
**What goes wrong:** Adding more code to an 822-line file.
**Why it happens:** The file has accumulated logic across many phases.
**How to avoid:** Keep the new code minimal (extract entity IDs + call batch method + merge = ~15 lines). Do NOT refactor the file to comply with 500-line limit -- that is out of scope for this phase.
**Warning signs:** Temptation to refactor/extract classes during this phase.

## Code Examples

### Pattern 1: Extract Entity IDs from Traversal Results

```typescript
// After graph traversal returns results:
const contactIds: string[] = [];
const emailIds: string[] = [];
for (const node of graphResults) {
  if (node.externalId) {
    if (node.nodeType === 'contact') contactIds.push(node.externalId);
    else if (node.nodeType === 'email') emailIds.push(node.externalId);
  }
}
```

### Pattern 2: Batch Entity Memory Retrieval

```typescript
// New method on MemoryService
async getMemoriesByEntities(
  tenantId: string,
  userId: string,
  contactIds: string[],
  emailIds: string[],
  limit: number = 10,
): Promise<MemoryResult[]> {
  if (contactIds.length === 0 && emailIds.length === 0) return [];

  const orConditions: Prisma.AIMemoryWhereInput[] = [];
  if (contactIds.length > 0) {
    orConditions.push({ contactId: { in: contactIds } });
  }
  if (emailIds.length > 0) {
    orConditions.push({ emailId: { in: emailIds } });
  }

  const memories = await this.prisma.aIMemory.findMany({
    where: { tenantId, userId, OR: orConditions },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true, content: true, category: true, createdAt: true },
  });

  return memories.map((m) => ({
    id: m.id,
    content: m.content,
    category: m.category,
    createdAt: m.createdAt,
  }));
}
```

### Pattern 3: Merge and Deduplicate Memories

```typescript
// Merge entity-anchored memories (priority) with vector memories, deduplicate by id
function mergeMemories(entityMemories: MemoryResult[], vectorMemories: MemoryResult[]): MemoryResult[] {
  const seen = new Set<string>();
  const merged: MemoryResult[] = [];

  // Entity-anchored first (higher relevance for entity queries)
  for (const m of entityMemories) {
    if (m.id && !seen.has(m.id)) {
      seen.add(m.id);
      merged.push(m);
    }
  }
  // Then vector-search results
  for (const m of vectorMemories) {
    if (m.id && !seen.has(m.id)) {
      seen.add(m.id);
      merged.push(m);
    }
  }
  return merged;
}
```

### Pattern 4: Updated GraphTraversalResult Interface

```typescript
export interface GraphTraversalResult {
  nodeId: string;
  nodeType: string;
  label: string;
  metadata: Record<string, unknown>;
  hop: number;
  score: number;
  edgeType?: string;
  externalId?: string | null;  // NEW: FK to source record
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29 |
| Config file | `backend/jest.config.ts` |
| Quick run command | `cd backend && npx jest --testPathPattern="memory.service\|entity-graph\|ai-chat.service" --no-coverage -x` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GRAG-04a | Graph traversal results include externalId | unit | `cd backend && npx jest --testPathPattern="entity-graph.service" -t "externalId" -x` | Existing file, needs new test |
| GRAG-04b | getMemoriesByEntities batch retrieval | unit | `cd backend && npx jest --testPathPattern="memory.service" -t "getMemoriesByEntities" -x` | Existing file, needs new test |
| GRAG-04c | Entity memories merged with vector memories in chat pipeline | unit | `cd backend && npx jest --testPathPattern="ai-chat.service" -t "entity.*memor" -x` | Needs new test (or integration test) |
| GRAG-04d | "What do I remember about [contact]?" returns entity-specific memories | integration | Manual verification via chat | Manual only |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest --testPathPattern="memory.service\|entity-graph" --no-coverage -x`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `entity-graph.service.spec.ts` -- add test for externalId in traverse results
- [ ] `memory.service.spec.ts` -- add test for `getMemoriesByEntities()` batch method
- [ ] No ai-chat.service.spec.ts exists -- integration test for entity memory wiring is manual

## Open Questions

1. **How many entity memories to fetch per query?**
   - What we know: `getMemoriesByEntity` defaults to limit=10. Vector memories default to limit=5.
   - What's unclear: Should entity memories have a separate limit or share the 5 limit?
   - Recommendation: Use limit=10 for entity memories since they are deterministic (FK lookup, no scoring noise). Context assembly's token budget will truncate naturally.

2. **Should getNodesByExternalId() be used instead of traverse() for direct entity queries?**
   - What we know: When user asks "What do I remember about Marco?", findSeedNodes via trigram will find a contact node, traverse will expand from it. The contact node itself has externalId.
   - What's unclear: For purely entity-specific queries, could we skip traversal and go straight to entity memory?
   - Recommendation: Stay with current flow (traverse first, then extract IDs). The traversal also provides useful graph context for the system prompt. Over-optimizing is out of scope.

## Sources

### Primary (HIGH confidence)
- Codebase analysis of `entity-graph.service.ts`, `memory.service.ts`, `context-assembly.service.ts`, `ai-chat.service.ts`
- Prisma schema: `AIMemory` model with `contactId`/`emailId` FK columns and indexes
- Prisma schema: `GraphNode` model with `externalId` field
- Phase 109 research and plan files

### Secondary (MEDIUM confidence)
- Phase 109 CONTEXT.md locked decisions on memory anchoring approach

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries needed, pure service wiring
- Architecture: HIGH - all pieces exist, only wiring is missing
- Pitfalls: HIGH - clear from code analysis (N+1, dedup, missing externalId)

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable -- no external dependencies)
