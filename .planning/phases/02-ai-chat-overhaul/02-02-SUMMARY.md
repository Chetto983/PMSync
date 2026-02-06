---
phase: 02-ai-chat-overhaul
plan: 02
subsystem: ai
tags: [voltagent, chat, prompts, context-aware, nestjs, react]

# Dependency graph
requires:
  - phase: 01-ai-infrastructure
    provides: VoltAgent module with core chat infrastructure
provides:
  - ViewContext type for tracking user's current view
  - SuggestedPromptsService for context-aware prompts
  - GET /suggested-prompts endpoint
  - QuickActions with dynamic prompt support
affects: [02-03, 03-auto-triage, embedded-chat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ViewContext type shared between frontend and backend
    - Ref-based transport body for fresh context in AI SDK
    - Icon mapping pattern for dynamic Lucide icons

key-files:
  created:
    - backend/src/modules/ai/voltagent/services/suggested-prompts.service.ts
  modified:
    - backend/src/modules/ai/voltagent/voltagent.module.ts
    - backend/src/modules/ai/voltagent/voltagent.controller.ts
    - frontend/hooks/use-voltagent-chat.ts
    - frontend/components/ai/AiDashboard/QuickActions.tsx
    - frontend/components/ai/AiDashboard/index.tsx

key-decisions:
  - "Option B: Separate /suggested-prompts endpoint instead of metadata in streaming response"
  - "ViewContext ref pattern for fresh values in AI SDK transport body"
  - "Icon mapping object for dynamic Lucide icon resolution"

patterns-established:
  - "ViewContext type: currentView + optional selected item IDs"
  - "Context-aware prompt generation via switch on currentView"
  - "Dynamic prompts fallback to static when customPrompts not provided"

# Metrics
duration: 18min
completed: 2026-02-06
---

# Phase 02 Plan 02: Contextual Prompts with ViewContext Summary

**SuggestedPromptsService generates view-specific prompts (inbox, thread, calendar, etc.) via /suggested-prompts endpoint, with frontend ViewContext flowing through transport**

## Performance

- **Duration:** 18 min
- **Started:** 2026-02-06T16:40:00Z
- **Completed:** 2026-02-06T16:58:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Created SuggestedPromptsService with prompts for 6 views (inbox, thread, calendar, contacts, compose, default)
- Added GET /suggested-prompts endpoint to VoltAgent controller
- ViewContext type flows from frontend hook through transport to backend
- QuickActions supports dynamic prompts from backend with icon mapping

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SuggestedPromptsService backend** - `3a0ea40c` (feat)
2. **Task 2: Wire viewContext through transport and add endpoint** - `670477bb` (feat)
3. **Task 3: Make QuickActions consume viewContext** - `b074c0bc` (feat)

## Files Created/Modified

- `backend/src/modules/ai/voltagent/services/suggested-prompts.service.ts` - NEW: Context-aware prompt generation service
- `backend/src/modules/ai/voltagent/voltagent.module.ts` - Register SuggestedPromptsService in providers/exports
- `backend/src/modules/ai/voltagent/voltagent.controller.ts` - Add /suggested-prompts endpoint and viewContext DTO
- `frontend/hooks/use-voltagent-chat.ts` - Add ViewContext type and pass through transport
- `frontend/components/ai/AiDashboard/QuickActions.tsx` - Accept customPrompts and viewContext props
- `frontend/components/ai/AiDashboard/index.tsx` - Create viewContext and pass to hook/QuickActions

## Decisions Made

1. **Separate endpoint (Option B)**: Chose GET /suggested-prompts over embedding in chat streaming response for cleaner separation of concerns
2. **Ref pattern for viewContext**: Used useRef + useEffect pattern to ensure fresh viewContext in AI SDK transport body (same pattern as conversationId)
3. **Icon mapping object**: Created explicit iconMap object to resolve string icon names to Lucide components

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

1. **File reverted by linter**: Frontend use-voltagent-chat.ts was reverted after commit (possibly by pre-commit hook or linter). Re-applied changes and used `git commit --amend` to include them.
   - Resolution: Standard git workflow, no impact on functionality

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ViewContext infrastructure complete, ready for:
  - 02-03: Streaming response improvements
  - Embedding chat in email/calendar views (will update viewContext based on route)
  - Backend can enhance prompts with i18n based on locale parameter

---
*Phase: 02-ai-chat-overhaul*
*Completed: 2026-02-06*
