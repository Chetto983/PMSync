---
phase: 73-test-hardening-cleanup
plan: 02
subsystem: testing
tags: [playwright, e2e, prisma-seed, fixtures, cleanup]

requires:
  - phase: 71-frontend-e2e-tests
    provides: Real-backend E2E specs that replace mock-based ones
provides:
  - Self-resetting onboarding E2E test via prisma db seed
  - Clean fixtures.ts with only injectAuthCookie + expect
  - Removal of 8 legacy mock-based E2E specs
affects: [e2e-maintenance, test-ci]

tech-stack:
  added: []
  patterns:
    - "execSync prisma db seed in Playwright beforeAll for stateful test reset"

key-files:
  created: []
  modified:
    - frontend/e2e/onboarding.spec.ts
    - frontend/e2e/fixtures.ts

key-decisions:
  - "Use prisma db seed (not raw SQL) for cross-platform onboarding reset"
  - "Keep injectAuthCookie in fixtures.ts (used by middleware-redirects.spec.ts)"
  - "Delete all 8 mock-based specs rather than rewrite (Phase 71 real-backend specs already cover critical flows)"

patterns-established:
  - "Stateful E2E reset: use prisma db seed in file-scope beforeAll with try/catch fallback"

requirements-completed: [FE2E-04, INFRA-03]

duration: 2min
completed: 2026-03-13
---

# Phase 73 Plan 02: E2E Onboarding Reset and Legacy Spec Cleanup Summary

**Self-resetting onboarding E2E via prisma db seed, 8 legacy mock-based specs deleted, fixtures.ts stripped to minimal exports**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-13T19:26:59Z
- **Completed:** 2026-03-13T19:29:28Z
- **Tasks:** 2
- **Files modified:** 10 (1 modified, 1 rewritten, 8 deleted)

## Accomplishments
- Onboarding E2E spec now auto-resets test user state via prisma db seed in file-scope beforeAll
- Passkey browser skip verified already present in security.spec.ts at lines 219-222 (no changes needed)
- Deleted 8 legacy mock-based E2E specs that violated INFRA-04 (real backend requirement)
- Cleaned fixtures.ts to contain only injectAuthCookie and expect re-export
- Zero orphaned references to removed exports confirmed via grep

## Task Commits

Each task was committed atomically:

1. **Task 1: Add seed automation to onboarding.spec.ts and verify passkey skip** - `31b62629` (feat) -- Note: changes were bundled into prior 73-01 commit by pre-commit hook
2. **Task 2: Delete legacy mock-based E2E specs and clean fixtures.ts** - `f7c9f8c2` (chore)

## Files Created/Modified
- `frontend/e2e/onboarding.spec.ts` - Added execSync prisma db seed in file-scope beforeAll; updated guard message
- `frontend/e2e/fixtures.ts` - Rewritten to only export injectAuthCookie + expect
- `frontend/e2e/auth.spec.ts` - DELETED (mock-based)
- `frontend/e2e/compose.spec.ts` - DELETED (mock-based)
- `frontend/e2e/search-clear.spec.ts` - DELETED (mock-based)
- `frontend/e2e/keyboard-navigation.spec.ts` - DELETED (mock-based)
- `frontend/e2e/email-list.spec.ts` - DELETED (mock-based)
- `frontend/e2e/accessibility.spec.ts` - DELETED (mock-based)
- `frontend/e2e/chat-mobile.spec.ts` - DELETED (mock-based)
- `frontend/e2e/chat-e2e.spec.ts` - DELETED (mock-based)

## Decisions Made
- Used `prisma db seed` instead of raw SQL for cross-platform compatibility (Windows heredoc issues)
- Kept seed failure as soft warning (test skips gracefully if onboarding already completed)
- Confirmed passkey skip is already implemented -- no changes needed (Gap 2 from research was pre-resolved)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Task 1 changes were bundled into the 73-01 commit (31b62629) by the pre-commit hook which auto-staged modified files. The content is correct; only the commit attribution is affected.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 10 E2E spec files remain, all using real backend
- Remaining specs: admin, chat-visual-audit, middleware-redirects, onboarding, organizations, screenshot-settings, search, security, smoke, visual-regression-splits
- No blockers for subsequent plans

---
*Phase: 73-test-hardening-cleanup*
*Completed: 2026-03-13*
