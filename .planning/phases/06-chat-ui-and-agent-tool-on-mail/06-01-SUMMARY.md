---
phase: 06-chat-ui-and-agent-tool-on-mail
plan: 01
subsystem: ui
tags: [react, mui, hooks, i18n, email-actions, quick-actions]

# Dependency graph
requires:
  - phase: 02-ai-chat-overhaul
    provides: ViewContext type and useVoltAgentChat hook
provides:
  - useEmailChatActions hook for context-aware email actions
  - Email action translations (EN/IT)
  - QuickActions email context section
affects: [06-02, 06-03, email-thread-chat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Context-aware action rendering based on ViewContext
    - Chip-based compact action UI for thread context

key-files:
  created:
    - frontend/hooks/use-email-chat-actions.ts
  modified:
    - frontend/components/ai/AiDashboard/QuickActions.tsx
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts

key-decisions:
  - "Chip-based UI for email actions (compact, distinct from main grid)"
  - "Optional emailActions type in index.ts for backward compatibility"
  - "Theme palette colors for action distinction (primary/secondary/success/warning)"

patterns-established:
  - "Context-aware quick actions: check viewContext.currentView to conditionally render"
  - "Action hook pattern: useXxxChatActions(viewContext) returns action configs"

# Metrics
duration: 7min
completed: 2026-02-07
---

# Phase 06 Plan 01: Context-Aware Email Quick Actions Summary

**useEmailChatActions hook with Reply/Summarize/Archive/Label actions shown as chips when viewing email thread**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-07T09:59:45Z
- **Completed:** 2026-02-07T10:06:59Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Created useEmailChatActions hook returning context-aware email actions
- Added emailActions translations in EN and IT (reply, summarize, archive, addLabel, sectionTitle)
- Updated QuickActions to show email-specific chips above main grid when in thread view
- All TypeScript and lint checks pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Create email chat actions hook** - `3df83554` (feat)
2. **Task 2: Add email action translations** - `eeddb01c` (feat)
3. **Task 3: Add email context section to QuickActions** - `cf0793e0` (feat)

## Files Created/Modified

- `frontend/hooks/use-email-chat-actions.ts` - New hook returning email-specific actions when viewContext indicates thread view
- `frontend/components/ai/AiDashboard/QuickActions.tsx` - Added email actions chips section, imported Archive/Tag icons
- `frontend/locales/en.ts` - Added emailActions translations
- `frontend/locales/it.ts` - Added emailActions translations (Italian)
- `frontend/locales/index.ts` - Added emailActions TypeScript type (optional for backward compat)

## Decisions Made

1. **Chip-based UI for email actions** - Chips are compact and visually distinct from the main quick action grid, making it clear these are context-specific actions
2. **Optional emailActions type** - Made emailActions optional in TypeScript interface to maintain backward compatibility with existing code
3. **Theme palette colors** - Used theme.palette.primary/secondary/success/warning.main for action colors to maintain design consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Pre-commit hook was initially blocking commits due to DEPRECATED markers in unrelated files from previous work. Resolved by unstaging all files and only staging task-specific files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Email chat actions hook ready for use by EmailChatPanel (06-02)
- QuickActions shows context-aware email actions when viewing thread
- Foundation set for integrating AI chat directly into email thread view

---
*Phase: 06-chat-ui-and-agent-tool-on-mail*
*Completed: 2026-02-07*
