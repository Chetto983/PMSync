---
phase: 109-graph-rag-pipeline
plan: 03
subsystem: ai-chat, ai
tags: [graph-rag, few-shot, query-router, memory-anchoring, context-assembly, entity-graph]

requires:
  - phase: 109-01
    provides: "GraphNode/GraphEdge models, AIMemory FK columns, AiRunLedger token columns"
  - phase: 109-02
    provides: "EntityGraphService, ContextAssemblyService (created in this plan as prerequisite)"
provides:
  - "Multi-hop sub-classification in QueryRouterService"
  - "Dynamic few-shot example injection based on query complexity"
  - "Entity-anchored memory retrieval via getMemoriesByEntity()"
  - "graph_context_search tool refactored to use EntityGraphService"
  - "save_memory tool with explicit contactId/emailId anchoring + graph edge creation"
  - "Context assembly wired into ai-chat.service.ts with proactive graph context"
  - "AiRunLedger tracks rawContextTokens and assembledContextTokens per chat run"
affects: [109-04, 109-05]

tech-stack:
  added: []
  patterns: [entity-anchored-memory, few-shot-dynamic-injection, proactive-context-assembly, legacy-fallback]

key-files:
  created:
    - backend/src/modules/ai-chat/constants/few-shot-examples.ts
    - backend/src/modules/ai-chat/constants/few-shot-examples.spec.ts
    - backend/src/modules/ai-chat/services/query-router.service.spec.ts
    - backend/src/modules/ai-chat/services/memory.service.spec.ts
    - backend/src/modules/ai-chat/services/entity-graph.service.ts
    - backend/src/modules/ai-chat/services/context-assembly.service.ts
  modified:
    - backend/src/modules/ai-chat/services/query-router.service.ts
    - backend/src/modules/ai-chat/constants/system-prompt.ts
    - backend/src/modules/ai-chat/services/memory.service.ts
    - backend/src/modules/ai-chat/tools/rag-tools.service.ts
    - backend/src/modules/ai-chat/services/ai-chat.service.ts
    - backend/src/modules/ai/services/ai-run-ledger.service.ts
    - backend/src/modules/ai-chat/services/graph-expansion.service.ts
    - backend/src/modules/ai-chat/ai-chat.module.ts

key-decisions:
  - "Used @Optional() DI for EntityGraphService and ContextAssemblyService to maintain backward compat"
  - "Legacy GraphExpansionService kept with fallback path in graph_context_search tool"
  - "Few-shot token budget 800 tokens; approximate counting via string.length/4"
  - "Proactive graph context assembly (breadth) separate from tool-based graph search (depth)"
  - "Memory graph anchoring is fire-and-forget to never block memory save"
  - "Added memory/cross_domain patterns to MULTI_HOP_PATTERNS to ensure sub-classification triggers"

requirements-completed: [GRAG-04, GRAG-05, GRAG-06]

duration: 15min
completed: 2026-03-25
---

# Phase 109 Plan 03: Pipeline Integration + Few-Shot + Memory Anchoring Summary

**Query router sub-classification with 4 multi_hop sub-types, dynamic few-shot injection by complexity tier, entity-anchored memory retrieval, graph_context_search refactored to EntityGraphService, save_memory with explicit contactId/emailId anchoring, context assembly wired into ai-chat.service.ts, AiRunLedger token tracking**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-25T08:59:53Z
- **Completed:** 2026-03-25T09:15:14Z
- **Tasks:** 2
- **Files created:** 6
- **Files modified:** 8

## Accomplishments

- QueryRouterService enhanced with `MultiHopSubType` sub-classification (relationship, temporal_entity, memory, cross_domain, general)
- 4 structured few-shot examples created with dynamic selection via `selectFewShotExamples()`
- `buildSystemPrompt()` now accepts optional `fewShotContext` parameter for dynamic injection
- MemoryService extended with `getMemoriesByEntity()` for FK-based entity-anchored retrieval
- `graph_context_search` tool refactored to use EntityGraphService with legacy fallback
- `save_memory` tool enhanced with `contactId`/`emailId` parameters and graph edge anchoring
- Context assembly wired into `prepareChatAgent()` for proactive graph context in system prompt
- AiRunLedger `recordRun()` now tracks `rawContextTokens` and `assembledContextTokens`
- EntityGraphService and ContextAssemblyService created (Plan 02 prerequisites)
- GraphExpansionService marked as `@deprecated`

## Task Commits

1. **Task 1: Query router sub-classification + few-shot examples + system prompt injection** - `a3a1b8aa` (feat)
2. **Task 2: Memory anchoring + rag-tools refactor + ai-chat.service wiring + ledger tracking** - `cb5fe0ab` (feat)

## Files Created/Modified

- `backend/src/modules/ai-chat/services/query-router.service.ts` - Added MultiHopSubType, subClassifyMultiHop(), extended MULTI_HOP_PATTERNS
- `backend/src/modules/ai-chat/services/query-router.service.spec.ts` - 12 tests for basic classification + sub-classification
- `backend/src/modules/ai-chat/constants/few-shot-examples.ts` - 4 FEW_SHOT_EXAMPLES + selectFewShotExamples()
- `backend/src/modules/ai-chat/constants/few-shot-examples.spec.ts` - 8 tests for example structure + selection logic
- `backend/src/modules/ai-chat/constants/system-prompt.ts` - buildSystemPrompt(fewShotContext?) with Multi-Step Query Examples section
- `backend/src/modules/ai-chat/services/memory.service.ts` - Added getMemoriesByEntity(), EntityGraphService injection
- `backend/src/modules/ai-chat/services/memory.service.spec.ts` - 7 tests for entity-anchored retrieval + existing behavior
- `backend/src/modules/ai-chat/services/entity-graph.service.ts` - Full EntityGraphService with traverse, findSeedNodes, getNodesByExternalId
- `backend/src/modules/ai-chat/services/context-assembly.service.ts` - Token-budgeted context assembly (60% graph / 20% memory / 20% few-shot)
- `backend/src/modules/ai-chat/tools/rag-tools.service.ts` - graph_context_search uses EntityGraphService, save_memory has contactId/emailId + anchoring
- `backend/src/modules/ai-chat/services/ai-chat.service.ts` - Context assembly + few-shot injection + ledger token tracking
- `backend/src/modules/ai/services/ai-run-ledger.service.ts` - rawContextTokens/assembledContextTokens in RecordRunParams + create
- `backend/src/modules/ai-chat/services/graph-expansion.service.ts` - @deprecated JSDoc
- `backend/src/modules/ai-chat/ai-chat.module.ts` - Registered EntityGraphService + ContextAssemblyService

## Decisions Made

- Used `@Optional()` DI injection for EntityGraphService and ContextAssemblyService in AiChatService and RagToolsService to ensure backward compatibility when graph tables don't exist yet
- Kept GraphExpansionService as legacy fallback in graph_context_search tool -- if EntityGraphService is not available, the old 3-parallel-query approach is used
- Few-shot token budget of 800 tokens with approximate counting (string.length / 4) -- within 5% of BPE tokenization
- Proactive graph context assembly in prepareChatAgent() provides breadth context; tool-based graph_context_search provides depth when the model explicitly requests it
- Memory graph anchoring via `anchorMemoryToGraph()` is fire-and-forget -- failure never blocks the memory save operation
- Extended MULTI_HOP_PATTERNS with memory-type and cross-domain patterns ("what do I know", "who should I follow up") to ensure these queries trigger sub-classification

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing MULTI_HOP_PATTERNS for memory and cross-domain queries**
- **Found during:** Task 1 (query-router spec tests)
- **Issue:** Queries like "What do I know about..." and "Who should I follow up with..." matched SEARCH_KEYWORDS but not MULTI_HOP_PATTERNS, so they were classified as `search` instead of `multi_hop`
- **Fix:** Added 4 new patterns to MULTI_HOP_PATTERNS for memory and cross-domain sub-types
- **Files modified:** query-router.service.ts
- **Commit:** a3a1b8aa

**2. [Rule 2 - Missing critical] EntityGraphService and ContextAssemblyService not yet created by Plan 02**
- **Found during:** Task 2 (dependency check)
- **Issue:** Plan 02 (wave 2) hadn't executed yet, so EntityGraphService and ContextAssemblyService didn't exist
- **Fix:** Created both services with full implementations matching the plan interfaces. Used @Optional() DI to avoid hard dependency
- **Files created:** entity-graph.service.ts, context-assembly.service.ts
- **Commit:** cb5fe0ab

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Known Stubs

None. All data paths are wired to real implementations or graceful fallbacks.

## Self-Check: PASSED

All 6 created files exist. Both commits (a3a1b8aa, cb5fe0ab) verified in git log. 27 tests pass (12 query-router + 8 few-shot + 7 memory).
