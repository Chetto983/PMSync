---
phase: 23-sdk-foundation-test-infrastructure
plan: 03
subsystem: testing
tags: [msw, sse, streaming, vitest, ai-sdk, mistral, mocking]

# Dependency graph
requires:
  - phase: 23-sdk-foundation-test-infrastructure (plan 02)
    provides: Vitest config, @ai-sdk/mistral installed, real-API test patterns
provides:
  - MSW v2 infrastructure for deterministic LLM response mocking
  - SSE streaming handler for Mistral chat completions
  - Deterministic embedding handler for Mistral embeddings
  - mswServer setup with per-test lifecycle pattern
  - Corrected MSDK-03 traceability in REQUIREMENTS.md
affects: [phase-26-integration-tests, phase-24-backend-pipeline]

# Tech tracking
tech-stack:
  added: [msw@2.12.10]
  patterns: [per-test MSW lifecycle, SSE ReadableStream mocking, deterministic vector generation]

key-files:
  created:
    - backend/src/test/msw-handlers/mistral-chat.handler.ts
    - backend/src/test/msw-handlers/mistral-embed.handler.ts
    - backend/src/test/msw-handlers/index.ts
    - backend/src/test/setup.ts
    - backend/src/test/msw-streaming.test.ts
  modified:
    - backend/package.json
    - backend/vitest.config.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Per-test MSW lifecycle (not global setupFiles) to avoid intercepting real-API tests"
  - "AI SDK v6 uses inputTokens/outputTokens not promptTokens/completionTokens"

patterns-established:
  - "MSW per-test lifecycle: import mswServer, call listen/resetHandlers/close in beforeAll/afterEach/afterAll"
  - "Deterministic embedding vectors via Math.sin(seed + i * 0.1) * 0.5 for reproducible assertions"
  - "SSE streaming via ReadableStream + TextEncoder with data: JSON\\n\\n format"

requirements-completed: [TEST-01]

# Metrics
duration: 7min
completed: 2026-02-27
---

# Phase 23 Plan 03: MSW v2 Gap Closure Summary

**MSW v2 SSE streaming handlers for deterministic Mistral API mocking, with chat completions, embeddings, and Vitest integration**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-27T15:36:18Z
- **Completed:** 2026-02-27T15:43:13Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- MSW v2.12.10 installed with SSE streaming handler that returns deterministic "Hello from MSW mock" chunks for /v1/chat/completions
- Deterministic 1024-dimension embedding handler for /v1/embeddings using seeded Math.sin vectors
- mswServer exported from setup.ts with per-test lifecycle (preserves real-API tests in src/modules/)
- 3 deterministic tests pass without any API key: generateText, streamText, embed
- MSDK-03 tracking corrected from Phase 28/Pending to Phase 23/Complete

## Task Commits

Each task was committed atomically:

1. **Task 1: Install MSW v2, create handlers and setup, create deterministic test** - `a08f2be2` (feat)
2. **Task 2: Fix REQUIREMENTS.md MSDK-03 tracking table** - `7fa469d9` (fix)

## Files Created/Modified
- `backend/src/test/msw-handlers/mistral-chat.handler.ts` - SSE streaming handler for /v1/chat/completions (stream + non-stream modes)
- `backend/src/test/msw-handlers/mistral-embed.handler.ts` - Deterministic 1024-dim embedding handler for /v1/embeddings
- `backend/src/test/msw-handlers/index.ts` - Barrel export of all MSW handlers
- `backend/src/test/setup.ts` - mswServer instance with pre-configured handlers
- `backend/src/test/msw-streaming.test.ts` - 3 deterministic tests (generateText, streamText, embed)
- `backend/package.json` - Added msw@2.12.10 as devDependency
- `backend/vitest.config.ts` - Added MSW reference comment
- `.planning/REQUIREMENTS.md` - MSDK-03 marked Phase 23 / Complete

## Decisions Made
- **Per-test MSW lifecycle instead of global setupFiles**: The existing real-API tests in src/modules/mistral/__tests__/ hit the exact same Mistral URLs that MSW handlers intercept. Global MSW activation would break those tests by returning mock data instead of real API responses. Per-test lifecycle keeps MSW active only in tests that explicitly import and start the server.
- **AI SDK v6 usage property names**: Plan specified `usage.promptTokens` and `usage.completionTokens` but AI SDK v6 `LanguageModelUsage` type uses `inputTokens` and `outputTokens`. Fixed inline during implementation (auto-fix Rule 1).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed AI SDK v6 usage property names in test assertions**
- **Found during:** Task 1 (Step 8 - TypeScript compilation)
- **Issue:** Plan specified `usage.promptTokens` and `usage.completionTokens` but AI SDK v6.0.77 `LanguageModelUsage` type uses `inputTokens` and `outputTokens`
- **Fix:** Changed to `usage.inputTokens` and `usage.outputTokens`
- **Files modified:** backend/src/test/msw-streaming.test.ts
- **Verification:** TypeScript compiles clean, all 3 tests pass
- **Committed in:** a08f2be2 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Minor property name correction. No scope change.

## Issues Encountered
None -- plan executed cleanly after the property name fix.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MSW v2 infrastructure is ready for Phase 26 integration tests (chat pipeline and non-chat AI)
- Pattern established: import mswServer, manage lifecycle per-test, assert deterministic responses
- Phase 23 is now fully complete (3/3 plans) with all verification gaps closed
- Ready to proceed to Phase 24 (Backend Core Pipeline)

---
*Phase: 23-sdk-foundation-test-infrastructure*
*Completed: 2026-02-27*
