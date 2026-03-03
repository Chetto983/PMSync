---
phase: 28-cleanup-voltagent-deletion
plan: 05
subsystem: testing
tags: [playwright, e2e, mobile, viewport, skip-guard, gap-closure]

requires:
  - phase: 28-03
    provides: "Playwright E2E test suite (5 test cases)"
provides:
  - "Viewport-aware skip guards on 3 desktop-only E2E tests"
  - "Mobile viewports (mobile-chrome, mobile-safari) skip desktop-only tests cleanly"
affects: []

tech-stack:
  added: []
  patterns:
    - "test.skip(!vp || vp.width < 768) for viewport-conditional test execution"

key-files:
  created: []
  modified:
    - "frontend/e2e/chat-e2e.spec.ts"

key-decisions:
  - "Skip guard checks page.viewportSize().width < 768 (CSS breakpoint where .chat-desktop-layout becomes display:none)"
  - "Guard placed as first line in test body before any route mocking"
  - "Briefing widget and mobile layout tests intentionally NOT guarded"

requirements-completed: [TEST-04]

duration: ~1min
completed: 2026-03-03
---

# Phase 28 Plan 05: E2E Mobile Viewport Skip Guards

**Added test.skip guards to 3 desktop-only Playwright tests for mobile viewport compatibility**

## Performance

- **Duration:** ~1 min
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added viewport-aware skip guards to 3 desktop-only tests that use `.chat-desktop-thread` locator
- Tests now skip cleanly on mobile-chrome and mobile-safari projects (viewport < 768px)
- Briefing widget test and mobile layout test remain unguarded (they work on all viewports)

## Tests Guarded

1. "sends message and receives streaming response" (line 145-146)
2. "displays tool result card for search_emails" (line 172-173)
3. "shows HITL approval card for destructive action" (line 226-227)

## Self-Check: PASSED

- [x] 3 test.skip guards in chat-e2e.spec.ts
- [x] Briefing widget test has NO skip guard
- [x] Mobile layout test has NO skip guard

---
*Phase: 28-cleanup-voltagent-deletion*
*Completed: 2026-03-03*
