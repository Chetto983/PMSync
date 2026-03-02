---
phase: 26-non-chat-ai-backend-testing
plan: 03
subsystem: testing
tags: [msw, vitest, integration-tests, e2e, zod, streaming, fixtures, comparison-script]

# Dependency graph
requires:
  - phase: 26-01
    provides: "BriefingService, FollowUpDetectionService, DraftGenerationService with Zod schemas"
  - phase: 26-02
    provides: "Domain services (RelationshipScore, CalendarConflict, FocusTime, MeetingPrep)"
provides:
  - "createGenerateHandler() factory in mistral-chat.handler.ts for fixture-driven MSW overrides"
  - "createStreamingHandler() factory for customizable streaming MSW overrides"
  - "3 MSW integration test suites for non-chat AI services (9 tests total)"
  - "Chat pipeline MSW integration test (4 tests: streaming, rate limiting, history, memory)"
  - "Real Mistral E2E validation gate (3 tests, CI-optional via describe.skipIf)"
  - "50-case comparison script for structured output validation"
  - "3 fixture JSON files for deterministic MSW testing"
affects: [frontend-testing, ci-pipeline, phase-27]

# Tech tracking
tech-stack:
  added: []
  patterns: [createGenerateHandler-fixture-factory, server.use-per-test-override, describe.skipIf-for-ci-optional, 50-case-comparison-script]

key-files:
  created:
    - backend/src/modules/ai/services/__tests__/briefing-msw.test.ts
    - backend/src/modules/ai/services/__tests__/follow-up-detection-msw.test.ts
    - backend/src/modules/ai/services/__tests__/draft-generation-msw.test.ts
    - backend/src/modules/ai-chat/__tests__/chat-pipeline-msw.test.ts
    - backend/src/modules/ai/services/__tests__/nonchat-real-e2e.test.ts
    - backend/scripts/compare-nonchat-output.ts
    - backend/src/test/fixtures/ai/briefing-fixture.json
    - backend/src/test/fixtures/ai/follow-up-fixture.json
    - backend/src/test/fixtures/ai/draft-fixture.json
  modified:
    - backend/src/test/msw-handlers/mistral-chat.handler.ts

key-decisions:
  - "createGenerateHandler matches system prompt keywords to fixtures (not URL path or model name)"
  - "createStreamingHandler added for chat pipeline tests (custom SSE chunks per test)"
  - "ConversationService mocked with actual method names: getOrCreateConversation, saveUserMessage, getMessagesForContext"
  - "50 comparison cases split: 20 briefing, 20 follow-up, 10 draft (varying inputs per service type)"

patterns-established:
  - "MSW fixture factory pattern: createGenerateHandler({keyword: fixture}) + server.use() per-test override"
  - "Chat pipeline MSW test pattern: all services mocked except intent router and PII detection"
  - "E2E gate pattern: describe.skipIf(!process.env.MISTRAL_API_KEY) for CI-optional real API tests"

requirements-completed: [TEST-02, TEST-03]

# Metrics
duration: 9min
completed: 2026-03-02
---

# Phase 26 Plan 03: AI Integration Tests Summary

**MSW-mocked integration tests for chat and non-chat AI pipelines with createGenerateHandler fixture factory, real Mistral E2E gate, and 50-case comparison script**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-02T15:42:05Z
- **Completed:** 2026-03-02T15:50:38Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Extended mistral-chat.handler.ts with createGenerateHandler() and createStreamingHandler() factories (no competing handler file)
- Created 3 non-chat AI MSW test suites (9 tests): briefing, follow-up detection, draft generation -- all validate via Zod schemas
- Created chat pipeline MSW test (4 tests): full message->intent->stream chain, rate limiter, conversation history, memory injection
- Created real Mistral E2E validation gate (3 tests, CI-optional) -- all pass with real API
- Created 50-case comparison script with field-by-field match reporting
- Created 3 anonymized JSON fixture files in test/fixtures/ai/

## Task Commits

Each task was committed atomically:

1. **Task 1: MSW handler factory + fixtures + non-chat AI tests** - `f5f71f92` (test)
2. **Task 2: Chat pipeline MSW test + E2E gate + comparison script** - `5f1114ba` (test)

## Files Created/Modified
- `backend/src/test/msw-handlers/mistral-chat.handler.ts` - Extended with createGenerateHandler() and createStreamingHandler() factories (210 lines)
- `backend/src/test/fixtures/ai/briefing-fixture.json` - BriefingOutput fixture with all 8 fields
- `backend/src/test/fixtures/ai/follow-up-fixture.json` - FollowUpDetectionOutput fixture with 2 detected items
- `backend/src/test/fixtures/ai/draft-fixture.json` - DraftGenerationOutput fixture with formal reply
- `backend/src/modules/ai/services/__tests__/briefing-msw.test.ts` - MSW-mocked briefing test (3 tests, 111 lines)
- `backend/src/modules/ai/services/__tests__/follow-up-detection-msw.test.ts` - MSW-mocked follow-up test (3 tests, 102 lines)
- `backend/src/modules/ai/services/__tests__/draft-generation-msw.test.ts` - MSW-mocked draft test (3 tests, 113 lines)
- `backend/src/modules/ai-chat/__tests__/chat-pipeline-msw.test.ts` - Full chat pipeline MSW test (4 tests, 298 lines)
- `backend/src/modules/ai/services/__tests__/nonchat-real-e2e.test.ts` - Real Mistral E2E gate (3 tests, 133 lines)
- `backend/scripts/compare-nonchat-output.ts` - 50-case comparison script (397 lines)

## Decisions Made
- createGenerateHandler matches system prompt keywords to fixtures -- this avoids needing per-URL routing since all non-chat services hit the same Mistral chat/completions endpoint
- Added createStreamingHandler for chat pipeline tests -- the existing mistralChatHandler returns fixed "Hello from MSW mock" chunks; custom streaming needed for meaningful pipeline verification
- ConversationService mock uses actual method names (getOrCreateConversation, saveUserMessage, getMessagesForContext) -- discovered during first test run that the plan's suggested mock names were wrong
- 50 comparison cases are procedurally generated (not 50 individual JSON files) to avoid filesystem bloat while still covering diverse input patterns

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ConversationService mock method names**
- **Found during:** Task 2 (Chat pipeline MSW test)
- **Issue:** Plan suggested mock methods `getOrCreate`, `addMessage`, `getHistory` but actual AiChatService calls `getOrCreateConversation`, `saveUserMessage`, `getMessagesForContext`
- **Fix:** Updated mock to use actual method names from ConversationService
- **Files modified:** chat-pipeline-msw.test.ts
- **Verification:** All 4 tests pass
- **Committed in:** 5f1114ba

**2. [Rule 2 - Missing Critical] Added createStreamingHandler factory**
- **Found during:** Task 2 (Chat pipeline test needed custom streaming responses)
- **Issue:** Default mistralChatHandler returns fixed "Hello from MSW mock" chunks -- insufficient for meaningful pipeline testing
- **Fix:** Added createStreamingHandler() factory to mistral-chat.handler.ts for per-test custom streaming content
- **Files modified:** mistral-chat.handler.ts
- **Verification:** Chat pipeline test uses custom chunks and verifies stream content
- **Committed in:** f5f71f92 (included with Task 1 handler extension)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes necessary for correct test behavior. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - all MSW tests run without external services. E2E tests require MISTRAL_API_KEY (auto-skipped if missing).

## Next Phase Readiness
- Phase 26 testing complete: all 3 plans delivered
- 16 tests total across MSW and E2E suites
- createGenerateHandler and createStreamingHandler factories available for future test development
- Comparison script ready for regression testing during future AI service changes

## Self-Check: PASSED

All 10 files verified present. Both commits (f5f71f92, 5f1114ba) found in git log.

---
*Phase: 26-non-chat-ai-backend-testing*
*Completed: 2026-03-02*
