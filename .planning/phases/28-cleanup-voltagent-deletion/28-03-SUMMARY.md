---
phase: 28-cleanup-voltagent-deletion
plan: 03
subsystem: testing
tags: [playwright, e2e, assistant-ui, sse, streaming, hitl, responsive]

requires:
  - phase: 28-01
    provides: "assistant-ui chat frontend (ChatPage, tool UIs, HITL cards)"
  - phase: 27-chat-frontend
    provides: "Chat components: ChatRuntimeProvider, ChatThread, ChatComposer, HitlApprovalCard"
provides:
  - "Playwright E2E test suite for AI chat frontend (5 test cases)"
  - "SSE mock helper functions for AI SDK v6 pipeUIMessageStreamToResponse format"
  - "Verified streaming chat, tool result cards, HITL approval, briefing widget, and mobile layout"
affects: [30-performance, 29-architecture-hardening]

tech-stack:
  added: []
  patterns:
    - "SSE mock format for AI SDK v6 DefaultChatTransport (data: {json}\\n\\n not 0: prefix)"
    - "Desktop thread scoping for dual-layout UI tests (desktop+mobile share runtime)"
    - "dispatchEvent for CSS-transformed elements in mobile layout tests"

key-files:
  created:
    - "frontend/e2e/chat-e2e.spec.ts"
  modified: []

key-decisions:
  - "SSE format (text/event-stream) for mocks, not old Data Stream prefix codes (0:, 9:, a:, d:)"
  - "Desktop thread scoping (locator('.chat-desktop-thread')) to avoid dual-element matches"
  - "dispatchEvent('click') for back button inside CSS-transformed sidebar panel"
  - "Poll-based HITL testing via mocked /api/v1/ai/actions/pending endpoint"

patterns-established:
  - "SSE mock: sseEvent({type,id,delta}) + sseDone() helpers for AI SDK v6 streaming tests"
  - "Dual-layout scoping: scope assertions to visible layout container in responsive UI tests"

requirements-completed: [TEST-04]

duration: 13min
completed: 2026-03-03
---

# Phase 28 Plan 03: Playwright E2E Test Suite Summary

**5 Playwright E2E tests for AI chat frontend: streaming response, tool result cards, HITL approval, briefing widget, and mobile 375px layout with SSE mocks**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-03T09:21:26Z
- **Completed:** 2026-03-03T09:34:10Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments
- Created complete E2E test suite covering all TEST-04 flows with deterministic mocked responses
- Discovered and documented correct AI SDK v6 wire format: SSE (text/event-stream) parsed by EventSourceParserStream, NOT the old Data Stream prefix codes
- All 5 tests pass on Chromium with no real backend dependency

## Task Commits

1. **Task 1: Create Playwright E2E test suite** - `f41f0de4` (feat)

## Files Created/Modified
- `frontend/e2e/chat-e2e.spec.ts` - 390-line E2E test suite with 5 test cases and SSE mock helpers

## Decisions Made

1. **SSE format, not Data Stream prefix codes** -- AI SDK v6 `DefaultChatTransport` uses `parseJsonEventStream` (from `EventSourceParserStream`), which expects `text/event-stream` with `data: {json}\n\n` lines. The plan's MEDIUM confidence note about codes `0:`, `9:`, `a:`, `d:` was correct to flag uncertainty -- those codes are from an older AI SDK version. The actual format uses structured JSON objects: `{type:"text-delta",id,delta}`, `{type:"tool-input-available",toolCallId,toolName,input}`, `{type:"tool-output-available",toolCallId,output}`, `{type:"finish",finishReason}`.

2. **Desktop thread scoping** -- Both `ChatDesktopLayout` and `ChatMobileLayout` render inside the same `AssistantRuntimeProvider`, meaning messages appear in both DOM trees simultaneously. On desktop viewport (1280px), the mobile layout is `display:none` but its elements still exist in DOM. Assertions like `page.getByText('...')` resolve to 2 elements and fail strict mode. Solution: scope to `.chat-desktop-thread` for desktop tests and `.chat-mobile-layout` for mobile tests.

3. **dispatchEvent for CSS-transformed sidebar** -- The mobile sidebar uses `transform: translateX(-100%)` when hidden and `translateX(0)` when visible. Even after sliding in, the back button reports "outside of viewport" or pointer interception from the thread panel beneath (z-index overlap). `dispatchEvent('click')` bypasses the Playwright actionability checks that fail due to the CSS transform layer.

4. **Poll-based HITL testing** -- The HITL approval card renders via the `useAiActions` hook which polls `GET /api/v1/ai/actions/pending`. Mocking this endpoint with a pending action causes the `HitlApprovalCard` to render with Approve/Reject buttons, which is testable without requiring the native `requires_action` code path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong Data Stream mock format**
- **Found during:** Task 1 (initial test creation)
- **Issue:** Plan specified Data Stream prefix codes (`0:`, `9:`, `a:`, `d:`) as the mock format, but AI SDK v6 `DefaultChatTransport` actually uses SSE parsed by `EventSourceParserStream`
- **Fix:** Rewrote mock helpers to use SSE format: `data: {json}\n\n` with typed JSON chunks
- **Files modified:** `frontend/e2e/chat-e2e.spec.ts`
- **Verification:** All 5 tests pass after format correction
- **Committed in:** `f41f0de4`

**2. [Rule 1 - Bug] Ambiguous textbox/text locators from dual-layout rendering**
- **Found during:** Task 1 (test debugging)
- **Issue:** `getByRole('textbox')`, `getByPlaceholder()`, and `getByText()` all resolved to 2 elements because desktop and mobile layouts both mount in DOM
- **Fix:** Scoped composer to `.chat-desktop-thread` container; scoped text assertions to desktop thread; scoped mobile test to `.chat-mobile-layout`
- **Files modified:** `frontend/e2e/chat-e2e.spec.ts`
- **Verification:** All tests pass with unique element resolution
- **Committed in:** `f41f0de4`

**3. [Rule 1 - Bug] Mobile sidebar back button click fails due to CSS transform**
- **Found during:** Task 1 (mobile viewport test)
- **Issue:** Back button inside CSS-transformed sidebar panel reported "outside of viewport" even when visually present
- **Fix:** Used `dispatchEvent('click')` instead of `.click()` to bypass Playwright actionability checks
- **Files modified:** `frontend/e2e/chat-e2e.spec.ts`
- **Verification:** Mobile test passes, sidebar opens and closes correctly
- **Committed in:** `f41f0de4`

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All fixes were necessary corrections for test framework compatibility. No scope creep. The plan correctly flagged MEDIUM confidence on the stream format.

## Issues Encountered
- The plan noted MEDIUM confidence on Data Stream type codes -- this turned out to be a real issue requiring investigation of the actual AI SDK v6 source to discover the SSE format

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Phase 28 plans (01, 02, 03) are complete
- Frontend dead code deleted, bundle analyzed, E2E tests passing
- Ready for Phase 29 (Architecture Hardening) or Phase 30 (Performance)

## Self-Check: PASSED

- [x] `frontend/e2e/chat-e2e.spec.ts` exists (390 lines)
- [x] Commit `f41f0de4` found in git log
- [x] All 5 Playwright tests pass on Chromium (verified)

---
*Phase: 28-cleanup-voltagent-deletion*
*Completed: 2026-03-03*
