---
phase: 109-graph-rag-pipeline
plan: 01
subsystem: database, ai
tags: [prisma, postgresql, graph, rag, entity-extraction, llm, zod, ai-sdk]

requires:
  - phase: 108-hitl-approval-routing
    provides: "Stable AI chat pipeline to extend with graph RAG"
provides:
  - "GraphNode and GraphEdge Prisma models for entity graph storage"
  - "AIMemory nullable contactId/emailId FK columns for entity anchoring"
  - "AiRunLedger rawContextTokens/assembledContextTokens columns for token tracking"
  - "EntityExtractionService for LLM-based email entity extraction"
  - "Contact node upsert on contact embedding (no LLM)"
  - "Fire-and-forget extraction wired into embedding pipeline"
affects: [109-02, 109-03, 109-04, 109-05]

tech-stack:
  added: [gpt-tokenizer]
  patterns: [entity-graph-adjacency-list, fire-and-forget-extraction, toggle-via-env-var]

key-files:
  created:
    - backend/src/modules/ai/services/entity-extraction.service.ts
  modified:
    - backend/prisma/schema.prisma
    - backend/src/modules/ai/services/knowledge-base.service.ts
    - backend/src/modules/ai/ai.module.ts
    - backend/package.json

key-decisions:
  - "Used findFirst + create/update instead of upsert for GraphNode (no unique constraint on tenantId+externalId pair)"
  - "Contact extraction is direct mapping without LLM call (cost optimization)"
  - "Entity node deduplication uses externalId for contacts, label+nodeType for topics"
  - "Edge weight incremented by 0.1 on repeated encounters (relationship strength signal)"
  - "Used OpenRouterProviderService.getChatModel() with AI_MODEL_SIMPLE for extraction (consistent with briefing pattern)"

patterns-established:
  - "GraphNode/GraphEdge adjacency list: tenant-scoped graph with JSONB metadata and optional vector column"
  - "Fire-and-forget extraction: .catch(err => logger.warn()) after embedding success"
  - "ENTITY_EXTRACTION_ENABLED env var toggle for cost/rate control"

requirements-completed: [GRAG-03]

duration: 33min
completed: 2026-03-25
---

# Phase 109 Plan 01: Entity Graph Schema + Extraction Service Summary

**GraphNode/GraphEdge Prisma models with LLM-based entity extraction piggybacked on embedding pipeline, toggle-able via ENTITY_EXTRACTION_ENABLED env var**

## Performance

- **Duration:** 33 min
- **Started:** 2026-03-25T07:58:16Z
- **Completed:** 2026-03-25T08:31:17Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- GraphNode and GraphEdge models added to Prisma schema with tenant-scoping, GIN trigram index on labels, and unique constraint on edges
- AIMemory model extended with nullable contactId/emailId FK columns for entity anchoring (GRAG-03)
- AiRunLedger extended with rawContextTokens/assembledContextTokens for token tracking
- EntityExtractionService created: LLM-based extraction for emails, direct mapping for contacts
- Extraction wired into KnowledgeBaseService as fire-and-forget after successful embedding

## Task Commits

Each task was committed atomically:

1. **Task 1: Prisma schema -- GraphNode, GraphEdge + AIMemory FKs + AiRunLedger columns** - `811af0be` (feat)
2. **Task 2: EntityExtractionService + wire into embedding queues** - `d3679651` (feat)

## Files Created/Modified
- `backend/prisma/schema.prisma` - Added GraphNode, GraphEdge models; AIMemory contactId/emailId; AiRunLedger token columns; Tenant relations
- `backend/src/modules/ai/services/entity-extraction.service.ts` - New service: LLM email extraction + direct contact mapping + graph node/edge upserts
- `backend/src/modules/ai/services/knowledge-base.service.ts` - Wired entity extraction after email and contact embedding creation
- `backend/src/modules/ai/ai.module.ts` - Registered EntityExtractionService in providers and exports
- `backend/package.json` - Added gpt-tokenizer dependency

## Decisions Made
- Used `findFirst` + `create`/`update` pattern instead of Prisma `upsert` for GraphNode, because there is no unique constraint on the `tenantId + externalId` pair (externalId is nullable and not unique by itself)
- Contact extraction skips LLM calls entirely -- direct metadata mapping is sufficient and avoids unnecessary API costs
- Entity deduplication strategy: contacts use externalId from unified_contacts, topics use label + nodeType + tenantId
- Edge weight increments by 0.1 on repeated encounters, providing a "relationship strength" signal for future graph scoring
- Zod v4 API: `z.record()` requires explicit key schema (`z.record(z.string(), z.unknown())`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Zod v4 API change for z.record()**
- **Found during:** Task 2 (EntityExtractionService)
- **Issue:** Zod v4 requires 2 arguments for `z.record()` (key schema + value schema), plan examples used Zod v3 single-arg syntax
- **Fix:** Changed `z.record(z.unknown())` to `z.record(z.string(), z.unknown())`
- **Files modified:** entity-extraction.service.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** d3679651

**2. [Rule 3 - Blocking] Prisma InputJsonValue type incompatibility**
- **Found during:** Task 2 (EntityExtractionService)
- **Issue:** `Record<string, unknown>` not assignable to Prisma's `Prisma.InputJsonValue` type
- **Fix:** Changed metadata types to use `Prisma.InputJsonValue` directly, added explicit casts at call sites
- **Files modified:** entity-extraction.service.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** d3679651

**3. [Rule 1 - Bug] CreateEmailEmbeddingOptions missing to/cc fields**
- **Found during:** Task 2 (wiring into KnowledgeBaseService)
- **Issue:** Plan suggested passing `options.to` and `options.cc` but `CreateEmailEmbeddingOptions` interface does not have these fields
- **Fix:** Set `to: null` in extraction params; extraction prompt still works from body content
- **Files modified:** knowledge-base.service.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** d3679651

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All auto-fixes necessary for TypeScript compilation. No scope creep.

## Issues Encountered
- Worktree lacked node_modules; used main repo's node_modules for Prisma generate and tsc validation
- `db push` succeeded cleanly since all new columns are nullable and new tables have no data constraints

## User Setup Required
None - no external service configuration required. ENTITY_EXTRACTION_ENABLED defaults to 'true'.

## Next Phase Readiness
- GraphNode/GraphEdge tables exist and are populated by embedding pipeline
- EntityExtractionService exported from AiModule, available for ai-chat module injection
- gpt-tokenizer installed, ready for Plan 02 (context assembly token budgeting)
- AIMemory FK columns ready for Plan 04 (memory anchoring)
- AiRunLedger token columns ready for Plan 02 (token tracking telemetry)

---
*Phase: 109-graph-rag-pipeline*
*Completed: 2026-03-25*
