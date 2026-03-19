---
phase: 86-ai-chat-bug-fix-migrate-to-official-patterns
plan: 01
subsystem: ui
tags: [assistant-ui, react, tool-rendering, deprecation-cleanup, chain-of-thought]

# Dependency graph
requires:
  - phase: 77-ai-control-plane-hitl-tool-governance
    provides: HITL approval card, tool governance metadata
provides:
  - TOOL_RENDERERS map (20 tool names -> function components)
  - FallbackToolRenderer with HITL approval support
  - ToolDispatcher pattern for ChainOfThought tool routing
  - AllToolUIs mount pattern removed
affects: [ai-chat, tool-rendering, hitl-approval]

# Tech tracking
tech-stack:
  added: []
  patterns: [ToolCallMessagePartProps function components, ToolDispatcher for ChainOfThought by-name routing]

key-files:
  created: []
  modified:
    - frontend/src/components/chat/tool-uis/index.tsx
    - frontend/src/components/chat/tool-uis/FallbackToolUI.tsx
    - frontend/src/components/chat/ChatChainOfThought.tsx
    - frontend/src/components/chat/ChatPage.tsx
    - frontend/src/components/chat/AssistantMessage.tsx

key-decisions:
  - "Used ToolDispatcher pattern in ChainOfThought instead of MessagePrimitive.Content tools.by_name (ChainOfThought and tools are mutually exclusive in assistant-ui types)"
  - "Removed 'use client' from pure render tool UIs (no hooks), kept on TriageToolUI/ConversationToolUI/FallbackToolUI"

patterns-established:
  - "ToolCallMessagePartProps<Args, Result> function components for all tool renderers"
  - "ToolDispatcher: check TOOL_RENDERERS[toolName] then fall back to FallbackToolRenderer"
  - "TOOL_RENDERERS const map object as single source of truth for tool-to-renderer mapping"

requirements-completed: []

# Metrics
duration: 11min
completed: 2026-03-19
---

# Phase 86 Plan 01: Tool UI Migration Summary

**Replaced all 21 makeAssistantToolUI calls with ToolCallMessagePartProps function components and ToolDispatcher routing pattern**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-19T13:15:57Z
- **Completed:** 2026-03-19T13:27:08Z
- **Tasks:** 2
- **Files modified:** 20

## Accomplishments
- Converted 16 tool UI files (21 makeAssistantToolUI calls) to plain function components with Renderer suffix
- Created TOOL_RENDERERS map (20 entries) and ToolDispatcher for by-name routing inside ChainOfThought
- Deleted AllToolUIs barrel mount pattern from ChatPage
- Zero makeAssistantToolUI, AllToolUIs, or FallbackToolUIRender references remain in codebase

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert all 15 tool UI files** - `246a261d` (feat)
2. **Task 2: Wire tool renderers and delete AllToolUIs** - `5227e6c6` (feat)

## Files Created/Modified
- `frontend/src/components/chat/tool-uis/EmailSearchToolUI.tsx` - 3 renderers: EmailSearch, ListEmails, SemanticSearch
- `frontend/src/components/chat/tool-uis/EmailListToolUI.tsx` - EmailListRenderer
- `frontend/src/components/chat/tool-uis/EmailContentToolUI.tsx` - EmailContentRenderer
- `frontend/src/components/chat/tool-uis/FollowUpToolUI.tsx` - FollowUpRenderer
- `frontend/src/components/chat/tool-uis/ContactToolUI.tsx` - ContactRenderer
- `frontend/src/components/chat/tool-uis/EventToolUI.tsx` - EventRenderer
- `frontend/src/components/chat/tool-uis/CountToolUI.tsx` - CountRenderer
- `frontend/src/components/chat/tool-uis/FolderToolUI.tsx` - FolderRenderer
- `frontend/src/components/chat/tool-uis/AnalysisToolUI.tsx` - AnalysisRenderer
- `frontend/src/components/chat/tool-uis/MemoryToolUI.tsx` - MemoryRenderer, MemorySearchRenderer
- `frontend/src/components/chat/tool-uis/BriefingToolUI.tsx` - BriefingRenderer
- `frontend/src/components/chat/tool-uis/CrmToolUI.tsx` - CrmRenderer
- `frontend/src/components/chat/tool-uis/TriageToolUI.tsx` - TriageRenderer (with HITL)
- `frontend/src/components/chat/tool-uis/ConversationToolUI.tsx` - AskUserRenderer, SaveMemoryRenderer
- `frontend/src/components/chat/tool-uis/ReminderToolUI.tsx` - CreateReminderRenderer, ListRemindersRenderer
- `frontend/src/components/chat/tool-uis/FallbackToolUI.tsx` - FallbackToolRenderer (renamed from FallbackToolUIRender)
- `frontend/src/components/chat/tool-uis/index.tsx` - TOOL_RENDERERS map + FallbackToolRenderer re-export
- `frontend/src/components/chat/ChatChainOfThought.tsx` - ToolDispatcher + updated imports
- `frontend/src/components/chat/ChatPage.tsx` - Removed AllToolUIs mount
- `frontend/src/components/chat/AssistantMessage.tsx` - Unchanged (ChainOfThought handles tool routing)

## Decisions Made
- **ToolDispatcher pattern over MessagePrimitive.Content tools.by_name:** The assistant-ui type system enforces mutual exclusivity between `ChainOfThought` and `tools` on `MessagePrimitive.Content`. Since ChatChainOfThought is the established CoT pattern, tool dispatching was implemented inside the ChainOfThought's `tools.Fallback` slot via a `ToolDispatcher` component that checks `TOOL_RENDERERS[toolName]` before falling back to `FallbackToolRenderer`.
- **Removed 'use client' from pure render files:** Files without hooks (EmailSearchToolUI, EmailListToolUI, etc.) had 'use client' removed since they are pure render functions. Kept on ConversationToolUI (useThreadRuntime, useCallback), TriageToolUI (HITL approval), FallbackToolUI (HITL approval).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ChainOfThought and tools.by_name are mutually exclusive in assistant-ui types**
- **Found during:** Task 2 (wiring AssistantMessage)
- **Issue:** Plan specified adding `tools: { by_name: TOOL_RENDERERS, Fallback: FallbackToolRenderer }` to MessagePrimitive.Content alongside ChainOfThought, but the type union `StandardComponents | ChainOfThoughtComponents` makes them mutually exclusive.
- **Fix:** Created ToolDispatcher component inside ChatChainOfThought that routes tool calls to TOOL_RENDERERS by name, falling back to FallbackToolRenderer. This achieves the same by-name dispatch but through the ChainOfThought Fallback slot.
- **Files modified:** frontend/src/components/chat/ChatChainOfThought.tsx, frontend/src/components/chat/AssistantMessage.tsx
- **Verification:** npx tsc --noEmit passes cleanly
- **Committed in:** 5227e6c6

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary adaptation to assistant-ui type constraints. Same functional outcome achieved through different wiring point.

## Issues Encountered
None beyond the type incompatibility handled as deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All deprecated makeAssistantToolUI usage eliminated
- Tool rendering uses static config pattern compatible with assistant-ui 0.12.x
- Ready for next plans in Phase 86 (thread persistence, additional cleanup)

---
*Phase: 86-ai-chat-bug-fix-migrate-to-official-patterns*
*Completed: 2026-03-19*
