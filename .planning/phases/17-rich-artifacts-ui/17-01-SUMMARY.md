---
phase: 17-rich-artifacts-ui
plan: 01
subsystem: ui
tags: [react, tailwind, typescript, artifact-actions, tool-renderers]

# Dependency graph
requires:
  - phase: v3.0-09
    provides: SmartToolOutput dispatch system and 10 tool renderers
provides:
  - ArtifactAction discriminated union type (navigate, send-message, api-call)
  - ToolRendererProps.onAction callback for all renderers
  - ActionBar shared component for per-item icon buttons
  - BriefingResult and CrmResult data shape types
  - handleArtifactAction wiring in ChatMessages
affects: [17-02, 17-03, 17-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [action-callback-plumbing, shared-action-bar]

key-files:
  created:
    - frontend/src/components/ai-elements/tool-renderers/shared/ActionBar.tsx
  modified:
    - frontend/src/components/ai-elements/tool-renderers/types.ts
    - frontend/src/components/ai-elements/tool-renderers/SmartToolOutput.tsx
    - frontend/components/ai/AiDashboard/ChatMessages.tsx

key-decisions:
  - "Use next/router over next/navigation for ChatMessages (matches 25/29 codebase imports)"
  - "ActionBar uses title attr for tooltips (no TooltipProvider dependency)"

patterns-established:
  - "onAction prop chain: ChatMessages -> SmartToolOutput -> Renderer for action dispatch"
  - "ArtifactAction union for type-safe action routing through renderers"

# Metrics
duration: 6min
completed: 2026-02-11
---

# Phase 17 Plan 01: Action Infrastructure Summary

**ArtifactAction type system with ActionBar component and full prop-plumbing chain from ChatMessages through SmartToolOutput to all tool renderers**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-11T15:40:10Z
- **Completed:** 2026-02-11T15:46:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- ArtifactAction discriminated union with 3 action types (navigate, send-message, api-call)
- ToolRendererProps extended with onAction callback available to all 10+ renderers
- BriefingResult and CrmResult data shape types for downstream plan 17-04
- ActionBar shared Tailwind component with icon buttons and destructive variant
- handleArtifactAction in ChatMessages routes actions: navigate via router.push, send-message via onSuggestedQuestionSelect, api-call via direct execution

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend types and create ActionBar shared component** - `76861b75` (feat - from prior session, bundled with briefing.tools.ts)
2. **Task 2: Wire onAction through SmartToolOutput and ChatMessages** - `8e0d0bcb` (feat)

## Files Created/Modified
- `frontend/src/components/ai-elements/tool-renderers/types.ts` - Added ArtifactAction, onAction, BriefingResult, CrmResult
- `frontend/src/components/ai-elements/tool-renderers/shared/ActionBar.tsx` - New shared action bar component
- `frontend/src/components/ai-elements/tool-renderers/SmartToolOutput.tsx` - Forward onAction prop to renderer
- `frontend/components/ai/AiDashboard/ChatMessages.tsx` - handleArtifactAction callback with 3-way routing

## Decisions Made
- Used `next/router` (not `next/navigation`) in ChatMessages to match codebase convention (25 vs 4 occurrences)
- ActionBar uses HTML `title` attr for tooltips instead of shadcn Tooltip (avoids TooltipProvider scope issue)
- Kept `React.useCallback` pattern consistent with existing code instead of importing `useCallback` separately

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used next/router instead of next/navigation**
- **Found during:** Task 2 (ChatMessages wiring)
- **Issue:** Plan specified `next/navigation` but codebase uses `next/router` in 25/29 files including all ai/ components
- **Fix:** Imported useRouter from next/router for consistency
- **Files modified:** frontend/components/ai/AiDashboard/ChatMessages.tsx
- **Verification:** TypeScript passes, matches existing pattern

---

**Total deviations:** 1 auto-fixed (1 bug prevention)
**Impact on plan:** Correct router import for Pages Router architecture. No scope creep.

## Issues Encountered
- Task 1 was already committed in a prior session (commit 76861b75) bundled with an unrelated briefing.tools.ts file. Changes verified correct, no re-work needed.
- ChatMessages.tsx is 739 lines (pre-existing >500 line violation at 721 lines before changes). Not refactored as out of scope.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- onAction prop is available to every tool renderer via ToolRendererProps
- ActionBar component ready for use by renderers in plans 17-02, 17-03, 17-04
- BriefingResult and CrmResult types ready for BriefingRenderer and CrmRenderer

## Self-Check: PASSED

All 5 files verified present. Both commit hashes (76861b75, 8e0d0bcb) found in git log.

---
*Phase: 17-rich-artifacts-ui*
*Completed: 2026-02-11*
