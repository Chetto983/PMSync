---
phase: 28-cleanup-voltagent-deletion
plan: 01
subsystem: ui
tags: [dead-code-deletion, ai-elements, assistant-ui, type-inlining, cleanup]

# Dependency graph
requires:
  - phase: 27-chat-frontend
    provides: assistant-ui chat UI as replacement for ai-elements and AiDashboard
provides:
  - Self-contained chat/types.ts with all tool output types inlined
  - Clean frontend with zero references to ai-elements, AiDashboard, or use-voltagent-chat
  - 108 dead files deleted (69 ai-elements + 26 AiDashboard + 6 hooks + 2 components + 5 barrel/page edits)
affects: [28-02, 28-03, bundle-analysis]

# Tech tracking
tech-stack:
  added: []
  patterns: [self-contained-types-in-chat-module]

key-files:
  created: []
  modified:
    - frontend/src/components/chat/types.ts
    - frontend/components/ai/index.ts
    - frontend/hooks/ai/index.ts
    - frontend/components/email/thread/index.ts
    - frontend/pages/dashboard/email/thread/[threadId].tsx

key-decisions:
  - "components/ai/index.ts barrel kept with only CommandPalette export (direct subdirectory imports preferred)"
  - "ai-elements npm package left in package.json (out-of-scope for 28-01, handled in 28-02 bundle analysis)"
  - "Pre-existing lint warnings (17) left as-is (out-of-scope, no new warnings introduced)"

patterns-established:
  - "Self-contained types: chat/types.ts owns all tool output type definitions directly, no cross-directory re-exports"

requirements-completed: [FECLEAN-01, FECLEAN-03, MSDK-03]

# Metrics
duration: 8min
completed: 2026-03-03
---

# Phase 28 Plan 01: Frontend Dead Code Deletion Summary

**Deleted 108 dead files (22K+ LOC): ai-elements, AiDashboard, old VoltAgent hooks, EmailChatPanel -- types inlined into chat/types.ts**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-03T09:09:11Z
- **Completed:** 2026-03-03T09:17:15Z
- **Tasks:** 2
- **Files modified:** 108 (99 deleted + 5 modified + 4 deleted in task 2)

## Accomplishments
- Inlined all 337 lines of tool output types from ai-elements/tool-renderers/types.ts into chat/types.ts
- Deleted 69 ai-elements files, 26 AiDashboard files, 4 dead hooks, 2 EmailChat components (108 total)
- Cleaned 4 barrel exports and removed EmailChatPanel/Fab from thread detail page
- type-check passes clean, zero new lint errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Inline types and delete ai-elements + AiDashboard** - `837ef073` (feat)
2. **Task 2: Delete old hooks, resolve EmailChatPanel, clean barrels** - `8abe29ec` (feat)

## Files Created/Modified
- `frontend/src/components/chat/types.ts` - Self-contained type definitions (inlined from ai-elements)
- `frontend/components/ai/index.ts` - Cleaned barrel (only CommandPalette export)
- `frontend/hooks/ai/index.ts` - Removed dead VoltAgent/agent-activity re-exports
- `frontend/components/email/thread/index.ts` - Removed EmailChatPanel/Fab exports
- `frontend/pages/dashboard/email/thread/[threadId].tsx` - Removed EmailChatPanel/Fab usage and state

## Decisions Made
- components/ai/index.ts barrel kept minimal (only CommandPalette) -- live imports use direct subdirectory paths
- ai-elements npm package in package.json left for 28-02 (bundle analysis scope)
- Pre-existing lint warnings (17 total, all in unrelated files) are out-of-scope

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ChatCommandPalette export name mismatch**
- **Found during:** Task 1 (Step 5 - cleaning barrel)
- **Issue:** File ChatCommandPalette.tsx exports `CommandPalette`, not `ChatCommandPalette`
- **Fix:** Changed barrel export to `export { CommandPalette } from './ChatCommandPalette'`
- **Files modified:** frontend/components/ai/index.ts
- **Verification:** type-check passes
- **Committed in:** 837ef073 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial naming mismatch. No scope creep.

## Issues Encountered
None -- all deletions proceeded cleanly once ordering was correct (types inlined before directory deletion).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Frontend is clean of all ai-elements, AiDashboard, and old VoltAgent hook references
- Ready for 28-02 (VoltAgent reference cleanup in backend + bundle analysis)
- Ready for 28-03 (Playwright E2E test suite)

---
*Phase: 28-cleanup-voltagent-deletion*
*Completed: 2026-03-03*
