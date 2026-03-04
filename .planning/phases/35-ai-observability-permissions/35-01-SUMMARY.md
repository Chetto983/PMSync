---
phase: 35-ai-observability-permissions
plan: 01
subsystem: ai
tags: [telemetry, ledger, cost-tracking, mistral, ai-sdk, fire-and-forget]

# Dependency graph
requires:
  - phase: 31-foundation-cleanup
    provides: AiRunLedger Prisma schema and AiRunStatus enum
provides:
  - AiRunLedgerService with recordRun method and COST_MAP
  - Fire-and-forget ledger wiring in all 6 AI call paths
  - Unit tests for cost estimation and field mapping
  - Integration tests for briefing, chat, and mistral ledger wiring
affects: [35-02, 35-03, ai-dashboard, usage-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns: [fire-and-forget-ledger, optional-injection-telemetry, cost-map-estimation]

key-files:
  created:
    - backend/src/modules/ai/services/ai-run-ledger.service.ts
    - backend/src/modules/ai/services/__tests__/ai-run-ledger.test.ts
    - backend/src/modules/ai/services/__tests__/briefing-ledger.test.ts
    - backend/src/modules/ai-chat/__tests__/chat-ledger.test.ts
    - backend/src/modules/ai/services/__tests__/mistral-ledger.test.ts
  modified:
    - backend/src/modules/ai/ai.module.ts
    - backend/src/modules/ai/services/briefing.service.ts
    - backend/src/modules/ai/services/follow-up-detection.service.ts
    - backend/src/modules/ai/services/draft-generation.service.ts
    - backend/src/modules/ai-chat/services/ai-chat.service.ts
    - backend/src/modules/ai/services/mistral.service.ts

key-decisions:
  - "@Optional() injection for backward compatibility -- services work even if ledger unavailable"
  - "COST_MAP with 4 Mistral models, unknown models fall back to mistral-small-latest pricing"
  - "All ledger writes use .catch() fire-and-forget pattern -- never affect user response"
  - "Each retry attempt creates a separate ledger entry for accurate per-call cost tracking"

patterns-established:
  - "Fire-and-forget ledger: this.ledgerService?.recordRun({...}).catch(err => this.logger.warn(...))"
  - "Usage field mapping: AI SDK inputTokens -> Prisma promptTokens, outputTokens -> completionTokens"
  - "@Optional() AiRunLedgerService injection for all AI services"

requirements-completed: [AIOBS-01, AIOBS-02]

# Metrics
duration: 12min
completed: 2026-03-04
---

# Phase 35 Plan 01: AI Run Ledger Service Summary

**AiRunLedgerService with fire-and-forget telemetry wired into all 6 AI call paths (chat, chat-summary, briefing, follow-up-detection, draft-generation, title-gen) plus MistralService.completePrompt**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-04T08:55:13Z
- **Completed:** 2026-03-04T09:07:17Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- AiRunLedgerService with recordRun(), COST_MAP (4 Mistral models), safeInt for NaN coercion, and CorrelationContext fallback
- All 6 AI call paths instrumented with fire-and-forget ledger writes on success, retry, and failure paths
- MistralService.completePrompt return contract unchanged (still returns string) despite adding usage capture
- 17 total tests: 6 unit + 5 briefing integration + 2 chat integration + 4 mistral integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AiRunLedgerService with unit tests** - `a6b9a6b1` (feat)
2. **Task 2: Wire telemetry into generateText services** - `f5403af6` (feat)
3. **Task 3: Wire telemetry into AiChatService and MistralService** - `1cd6ce70` (feat)

## Files Created/Modified
- `backend/src/modules/ai/services/ai-run-ledger.service.ts` - Core ledger service with cost estimation
- `backend/src/modules/ai/services/__tests__/ai-run-ledger.test.ts` - 6 unit tests for ledger service
- `backend/src/modules/ai/services/__tests__/briefing-ledger.test.ts` - 5 integration tests for briefing wiring
- `backend/src/modules/ai-chat/__tests__/chat-ledger.test.ts` - 2 integration tests for chat streaming wiring
- `backend/src/modules/ai/services/__tests__/mistral-ledger.test.ts` - 4 integration tests for mistral wiring
- `backend/src/modules/ai/ai.module.ts` - AiRunLedgerService registered in providers and exports
- `backend/src/modules/ai/services/briefing.service.ts` - Ledger calls on success/retry/failure
- `backend/src/modules/ai/services/follow-up-detection.service.ts` - Ledger calls on success/retry/failure
- `backend/src/modules/ai/services/draft-generation.service.ts` - Ledger calls on success/retry/failure
- `backend/src/modules/ai-chat/services/ai-chat.service.ts` - Ledger in onFinish (chat) + maybeTriggerSummaryGeneration (chat-summary)
- `backend/src/modules/ai/services/mistral.service.ts` - Ledger in completePrompt (from promptName) + generateChatTitle (title-gen)

## Decisions Made
- **@Optional() injection**: All ledger injections use @Optional() so existing code works even if ledger is unavailable (e.g., in tests without full DI)
- **COST_MAP static pricing**: 4 Mistral models (small, ministral-3b, large, embed) with per-million-token USD rates; unknown models fall back to mistral-small-latest
- **Fire-and-forget pattern**: Every ledger call uses `.catch(err => this.logger.warn(...))` -- never awaited in the hot path, never affects user response
- **Separate ledger entries per retry**: When BriefingService/FollowUpDetection/DraftGeneration retry on schema validation failure, each attempt gets its own ledger row with independent latency timing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing TypeScript error in tools-rag-e2e.test.ts**
- **Found during:** Task 2 (commit stage, pre-commit hook failure)
- **Issue:** MistralProviderService passed where MistralEmbeddingService expected in test file -- pre-existing in working tree
- **Fix:** Included already-staged fix for MistralEmbeddingService type in test file
- **Files modified:** backend/src/modules/ai-chat/__tests__/tools-rag-e2e.test.ts
- **Verification:** npm run type-check passes clean
- **Committed in:** f5403af6 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Pre-existing type error blocked commit hook. Fix was already in working tree, just needed staging. No scope creep.

## Issues Encountered
None beyond the pre-existing type error documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AiRunLedgerService is registered and exported from AiModule, ready for Phase 35 Plan 02 (permissions/dashboard queries)
- All 6 AI call paths produce ledger data for analytics and cost monitoring
- COST_MAP can be extended when new models are added

---
*Phase: 35-ai-observability-permissions*
*Completed: 2026-03-04*
