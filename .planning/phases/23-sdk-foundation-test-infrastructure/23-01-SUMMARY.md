---
phase: 23-sdk-foundation-test-infrastructure
plan: 01
subsystem: ai
tags: [ai-sdk, mistral, nestjs, embedding, provider, generateText, embed]

# Dependency graph
requires: []
provides:
  - MistralModule (@Global NestJS module exporting MistralProviderService)
  - MistralProviderService.getChatModel() returning AI SDK LanguageModel
  - MistralProviderService.getEmbeddingModel() returning AI SDK EmbeddingModel
  - Typed error classes (MistralRateLimitError, MistralAuthError, etc.)
  - All AI services rewired to use AI SDK functions instead of @mistralai/mistralai
affects: [24-backend-core-pipeline, 25-tools-rag, 26-non-chat-ai, 28-cleanup-voltagent-deletion]

# Tech tracking
tech-stack:
  added: []
  patterns: [AI SDK generateText/embed/embedMany with MistralProviderService DI, thin provider pattern]

key-files:
  created:
    - backend/src/modules/mistral/mistral.module.ts
    - backend/src/modules/mistral/mistral-provider.service.ts
    - backend/src/modules/mistral/mistral-error.ts
    - backend/src/modules/mistral/index.ts
  modified:
    - backend/src/app.module.ts
    - backend/src/modules/ai/ai.module.ts
    - backend/src/modules/ai/services/mistral.service.ts
    - backend/src/modules/ai/services/mistral-embedding.service.ts
    - backend/src/modules/ai/services/mistral-rag.service.ts
    - backend/src/modules/ai/services/batch-indexing.service.ts
    - backend/src/modules/ai/services/embedding-search.service.ts
    - backend/src/modules/ai/services/knowledge-base.service.ts
    - backend/src/modules/ai/services/embedding/index.ts
    - backend/src/modules/compliance/compliance.module.ts
    - backend/src/modules/compliance/services/gdpr.service.ts

key-decisions:
  - "AI SDK maxOutputTokens replaces maxTokens (API change in ai@6.x)"
  - "BatchIndexingService stubbed to no-op rather than deleted (sync services depend on it)"
  - "GdprService MistralAgentCleanup dependency removed (agents no longer used after VoltAgent removal)"
  - "EmbeddingModel type is not generic in ai@6.0.77 (union type, not EmbeddingModel<string>)"

patterns-established:
  - "Thin provider pattern: MistralProviderService exposes model factories, callers use AI SDK functions directly"
  - "Backward-compatible _client parameter: replaced with unknown type and ignored for migration"

requirements-completed: [MSDK-01, MSDK-02]

# Metrics
duration: 17min
completed: 2026-02-27
---

# Phase 23 Plan 01: MistralModule Provider + SDK Consolidation Summary

**Standalone @Global MistralModule with AI SDK provider, all 6 @mistralai/mistralai service imports rewired to generateText/embed/embedMany, 5 dead code files deleted (~1250 LOC removed)**

## Performance

- **Duration:** 17 min
- **Started:** 2026-02-27T14:23:29Z
- **Completed:** 2026-02-27T14:40:25Z
- **Tasks:** 2/2
- **Files modified:** 16 (4 created, 5 deleted, 11 modified)

## Accomplishments
- Created standalone MistralModule with MistralProviderService wrapping @ai-sdk/mistral createMistral()
- Rewired MistralService, MistralEmbeddingService, MistralRagService to use AI SDK generateText/embed/embedMany
- Deleted 5 dead code files: MistralAgentCleanupService, MistralBatchProvider, MistralEmbeddingProvider, EmbeddingProviderService, embedding-provider.types.ts
- Net code reduction: ~1250 lines removed (1466 deleted, 213 added)
- Zero @mistralai/mistralai imports remain in backend/src/modules/ai/services/ (voltagent/ retained for Plan 02)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create MistralModule with provider service and typed errors** - `1471f1d5` (feat)
2. **Task 2: Rewire all @mistralai/mistralai imports to AI SDK via MistralProviderService** - `c044aae4` (feat)

## Files Created/Modified
- `backend/src/modules/mistral/mistral.module.ts` - @Global NestJS module
- `backend/src/modules/mistral/mistral-provider.service.ts` - getChatModel() + getEmbeddingModel()
- `backend/src/modules/mistral/mistral-error.ts` - Typed error hierarchy (4 error classes)
- `backend/src/modules/mistral/index.ts` - Barrel export
- `backend/src/app.module.ts` - Added MistralModule import
- `backend/src/modules/ai/ai.module.ts` - Removed EmbeddingProviderService, MistralAgentCleanupService, BatchIndexing references
- `backend/src/modules/ai/services/mistral.service.ts` - generateText() replaces Mistral.chat.complete()
- `backend/src/modules/ai/services/mistral-embedding.service.ts` - embed()/embedMany() replaces Mistral.embeddings.create()
- `backend/src/modules/ai/services/mistral-rag.service.ts` - generateText() replaces direct client calls
- `backend/src/modules/ai/services/batch-indexing.service.ts` - Stubbed to no-op (Batch API removed)
- `backend/src/modules/ai/services/knowledge-base.service.ts` - Removed createMistralClient() calls
- `backend/src/modules/ai/services/embedding-search.service.ts` - Removed createMistralClient() call
- `backend/src/modules/compliance/services/gdpr.service.ts` - Removed MistralAgentCleanup dependency
- `backend/src/modules/compliance/compliance.module.ts` - Removed AiModule forwardRef import

## Decisions Made

1. **maxOutputTokens not maxTokens**: AI SDK v6.0.77 uses `maxOutputTokens` in generateText/streamText. The research docs showed `maxTokens` but the actual TypeScript types require `maxOutputTokens`.

2. **BatchIndexingService stubbed instead of deleted**: The Batch API has no AI SDK equivalent, and `BatchIndexingService` is injected into 3 sync services (Gmail, IMAP, Microsoft). Deleting it would cascade into sync module changes. Stubbed to no-op with warning log instead.

3. **EmbeddingModel is not generic**: In `ai@6.0.77`, `EmbeddingModel` is a union type (`string | EmbeddingModelV3 | EmbeddingModelV2<string>`), not `EmbeddingModel<string>` as documented in research. Fixed the provider return type.

4. **Backward-compatible _client parameter**: `generateEmbedding` and `generateBulkEmbeddings` keep their `_client?: unknown` parameter for backward compatibility with callers that pass `undefined`, but the parameter is ignored internally.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed EmbeddingModel type mismatch**
- **Found during:** Task 1 (MistralProviderService creation)
- **Issue:** Research docs said `EmbeddingModel<string>` but `ai@6.0.77` has non-generic `EmbeddingModel` type
- **Fix:** Changed return type from `EmbeddingModel<string>` to `EmbeddingModel`
- **Files modified:** backend/src/modules/mistral/mistral-provider.service.ts
- **Verification:** TypeScript compiles clean
- **Committed in:** 1471f1d5 (Task 1 commit)

**2. [Rule 3 - Blocking] Fixed maxTokens -> maxOutputTokens API change**
- **Found during:** Task 2 (MistralService rewire)
- **Issue:** AI SDK v6 uses `maxOutputTokens`, not `maxTokens` as shown in research examples
- **Fix:** Replaced all `maxTokens` with `maxOutputTokens` in generateText() calls
- **Files modified:** backend/src/modules/ai/services/mistral.service.ts, mistral-rag.service.ts
- **Verification:** TypeScript compiles clean
- **Committed in:** c044aae4 (Task 2 commit)

**3. [Rule 3 - Blocking] Stubbed BatchIndexingService (sync service dependency)**
- **Found during:** Task 2 (dead code deletion)
- **Issue:** Plan said delete MistralBatchProvider; BatchIndexingService depends on it and is injected in 3 sync services
- **Fix:** Stubbed BatchIndexingService to no-op (preserves interface, logs warnings)
- **Files modified:** backend/src/modules/ai/services/batch-indexing.service.ts
- **Verification:** TypeScript compiles clean, sync services unaffected
- **Committed in:** c044aae4 (Task 2 commit)

**4. [Rule 2 - Missing Critical] Removed MistralAgentCleanup from GDPR service**
- **Found during:** Task 2 (dead code deletion)
- **Issue:** GdprService has @Optional @Inject of deleted MistralAgentCleanupService
- **Fix:** Removed import, injection, and agent cleanup call from purgeExternalTenantData()
- **Files modified:** backend/src/modules/compliance/services/gdpr.service.ts, compliance.module.ts
- **Verification:** TypeScript compiles clean, GDPR service still functional (agents are dead code)
- **Committed in:** c044aae4 (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 missing critical)
**Impact on plan:** All auto-fixes necessary for compilation and correctness. No scope creep.

## Issues Encountered
None beyond the deviations listed above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MistralProviderService is available globally via @Global MistralModule
- All AI services in services/ use AI SDK functions (generateText, embed, embedMany)
- VoltAgent directory still has @mistralai/mistralai imports -- addressed in Plan 02
- BullMQ embedding queues (EmailEmbeddingQueueService, ContactEmbeddingQueueService) compile against rewired MistralEmbeddingService
- Ready for Plan 02: VoltAgent deletion, Vitest setup, re-embed script, E2E gate

---
*Phase: 23-sdk-foundation-test-infrastructure*
*Completed: 2026-02-27*
