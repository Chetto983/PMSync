---
phase: 27-chat-frontend
plan: 03
subsystem: ui
tags: [assistant-ui, makeAssistantToolUI, hitl, tool-renderers, tailwind, approval-card]

# Dependency graph
requires:
  - phase: 27-chat-frontend
    plan: 01
    provides: AssistantMessage component, chat types re-exports, i18n strings
  - phase: 27-chat-frontend
    plan: 02
    provides: Email/data tool UIs, AllToolUIs barrel, tool-uis directory
provides:
  - AnalysisToolUI for analyze_email with sentiment/urgency/topics/suggested response
  - MemoryToolUI + MemorySearchToolUI for search_memory/memory_search
  - BriefingToolUI for get_daily_briefing with multi-section card
  - CrmToolUI for get_relationship_stats with score bars
  - TriageToolUI for bulk_email_actions with HITL requires-action handler
  - FallbackToolUI wildcard catch-all with collapsible JSON viewer
  - HitlApprovalCard with poll-based (functional) and native requires_action (code present, gated) paths
  - AssistantMessage HITL slot unconditionally rendering pending actions
  - AllToolUIs barrel extended with all analysis/AI tools + fallback
affects: [27-04, 28-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: [makeAssistantToolUI tool registration, poll-based HITL via useAiActions, native requires_action HITL via addResult, wildcard fallback tool UI]

key-files:
  created:
    - frontend/src/components/chat/tool-uis/AnalysisToolUI.tsx
    - frontend/src/components/chat/tool-uis/MemoryToolUI.tsx
    - frontend/src/components/chat/tool-uis/BriefingToolUI.tsx
    - frontend/src/components/chat/tool-uis/CrmToolUI.tsx
    - frontend/src/components/chat/tool-uis/TriageToolUI.tsx
    - frontend/src/components/chat/tool-uis/FallbackToolUI.tsx
    - frontend/src/components/chat/HitlApprovalCard.tsx
  modified:
    - frontend/src/components/chat/tool-uis/index.tsx
    - frontend/src/components/chat/AssistantMessage.tsx

key-decisions:
  - "addResult typed as any in HitlApprovalCardFromStatus to accept any tool result type (generic erasure at component boundary)"
  - "Poll-based HITL is the functional mechanism; native requires_action code path is present but gated on backend emitting requires_action status"
  - "FallbackToolUI uses wildcard toolName '*' which assistant-ui supports for catch-all matching"
  - "HitlPendingActions rendered unconditionally in AssistantMessage (shows nothing when no pending actions)"

patterns-established:
  - "Dual HITL paths: poll-based (useAiActions) for current backend, native (requires_action + addResult) for future backend update"
  - "Tool UI composition: each makeAssistantToolUI handles running/complete/incomplete states with consistent card pattern"

requirements-completed: [CHAT-03, CHAT-04]

# Metrics
duration: 11min
completed: 2026-03-02
---

# Phase 27 Plan 03: Analysis/AI Tool UIs + HITL Approval Summary

**6 analysis/AI tool renderers with makeAssistantToolUI, wildcard fallback JSON viewer, and dual-path HITL approval (poll-based functional + native requires_action gated) wired into AssistantMessage**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-02T19:53:46Z
- **Completed:** 2026-03-02T20:04:46Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Built 6 analysis/AI domain tool UIs (analyze_email, search_memory, memory_search, get_daily_briefing, get_relationship_stats, bulk_email_actions) with running/complete/error states
- Created FallbackToolUI wildcard catch-all with collapsible JSON viewer for unregistered tools
- Built HitlApprovalCard with dual paths: poll-based (functional via useAiActions) and native requires_action (code present, gated on backend)
- Wired HitlPendingActions into AssistantMessage unconditionally after MessagePrimitive.Content
- Extended AllToolUIs barrel to include all analysis/AI tools + fallback renderer

## Task Commits

Due to parallel execution with Plan 02, file commits were absorbed into Plan 02's commit chain:

1. **Task 1: Build 6 analysis/AI tool UIs + fallback** - `fd3da32d` (feat, merged into Plan 02 commit due to parallel execution race)
2. **Task 2: Build HITL card + update AssistantMessage + extend barrel** - `15b7bbd3` (docs, merged into Plan 02 docs commit due to parallel execution race)

**Note:** All files were authored by this plan's executor but committed by the Plan 02 executor due to parallel git staging. Content verified correct.

## Files Created/Modified
- `frontend/src/components/chat/tool-uis/AnalysisToolUI.tsx` - analyze_email renderer with sentiment/urgency badges, topics chips, suggested response
- `frontend/src/components/chat/tool-uis/MemoryToolUI.tsx` - search_memory + memory_search renderers with type badges and relevance scores
- `frontend/src/components/chat/tool-uis/BriefingToolUI.tsx` - get_daily_briefing multi-section card (stats, summary, follow-ups, deadlines, action items, calendar)
- `frontend/src/components/chat/tool-uis/CrmToolUI.tsx` - get_relationship_stats with score bars and interaction counts
- `frontend/src/components/chat/tool-uis/TriageToolUI.tsx` - bulk_email_actions with severity badges and requires-action HITL handler
- `frontend/src/components/chat/tool-uis/FallbackToolUI.tsx` - Wildcard catch-all with collapsible JSON args/result viewer
- `frontend/src/components/chat/HitlApprovalCard.tsx` - Dual HITL approval card (poll-based + native requires_action)
- `frontend/src/components/chat/tool-uis/index.tsx` - Extended AllToolUIs barrel with all analysis/AI tools + fallback
- `frontend/src/components/chat/AssistantMessage.tsx` - Added HitlPendingActions after MessagePrimitive.Content

## Decisions Made
- **addResult typed as any:** `HitlApprovalCardFromStatus` accepts `addResult: (result: any) => void` because each tool UI has its own result type and the approval card is tool-agnostic. TypeScript generic erasure at the component boundary makes a precise type impossible without excessive generics.
- **Poll-based HITL is the working mechanism:** The backend currently emits `data-needs-approval` chunks instead of AI SDK `requires_action` status. The poll-based approach via `useAiActions()` is what functions NOW. The native `requires_action` code path is present in TriageToolUI but will NOT activate until the backend is updated (Phase 28 or dedicated sub-task).
- **FallbackToolUI wildcard:** Used `toolName: "*"` which assistant-ui supports as a catch-all matcher. This renders for any tool that doesn't have a specific registered renderer.
- **HitlPendingActions unconditional:** The HITL slot is always rendered in AssistantMessage but returns null when there are no pending actions. This avoids conditional rendering complexity.

## Backend Prerequisite (DOCUMENTED, NOT IMPLEMENTED)

The backend currently emits a custom `data-needs-approval` chunk type for HITL instead of the AI SDK native `requires_action` status. A backend micro-update is needed (Phase 28 or a dedicated sub-task) to:
1. Emit `requires_action` status in the AI SDK stream for destructive tool calls
2. Handle `addResult()` callback from the frontend to resume tool execution

Until this backend update, the poll-based path (`useAiActions` -> `approveAction`/`rejectAction`) is the functional HITL mechanism.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] addResult type mismatch in HitlApprovalCardFromStatus**
- **Found during:** Task 1 type-check verification
- **Issue:** `addResult` from `makeAssistantToolUI<Record<string, unknown>, BulkActionResult>` is typed as `(result: BulkActionResult | ToolResponse<BulkActionResult>) => void`, but `HitlApprovalCardFromStatus` declared it as `(result: unknown) => void`. TypeScript TS2322 error.
- **Fix:** Changed `addResult` prop type to `(result: any) => void` with eslint-disable comment. The approval card is tool-agnostic and must accept any tool's addResult function.
- **Files modified:** `frontend/src/components/chat/HitlApprovalCard.tsx`
- **Verification:** `npx tsc --noEmit` passes (only pre-existing SpeechRecognition errors remain)
- **Committed in:** fd3da32d (merged into Plan 02 commit)

**2. [Rule 3 - Blocking] HitlApprovalCard created early for TriageToolUI dependency**
- **Found during:** Task 1 (TriageToolUI imports HitlApprovalCardFromStatus)
- **Issue:** TriageToolUI imports `HitlApprovalCardFromStatus` from `../HitlApprovalCard` which is a Task 2 deliverable, but Task 1 type-check would fail without it.
- **Fix:** Created HitlApprovalCard.tsx during Task 1 instead of Task 2 to unblock the type-check. Full Task 2 work then extended it (no changes needed, it was complete).
- **Files modified:** `frontend/src/components/chat/HitlApprovalCard.tsx`
- **Verification:** All 6 tool UIs + HitlApprovalCard compile cleanly
- **Committed in:** fd3da32d (merged into Plan 02 commit)

**3. [Rule 3 - Blocking] Parallel execution race condition with Plan 02**
- **Found during:** Task 1 and Task 2 commit steps
- **Issue:** Plan 02 executor committed all files (including this plan's files) due to parallel git staging. Both `git commit` attempts from this plan returned "nothing to commit, working tree clean".
- **Fix:** Verified file content is correct in the committed state. All files authored by this plan are in the repository at the expected paths with correct content. No code was lost.
- **Impact:** Commit attribution is shared with Plan 02's commits (fd3da32d, 15b7bbd3) instead of having dedicated Plan 03 commits.

---

**Total deviations:** 3 (1 bug fix, 2 blocking issues)
**Impact on plan:** All auto-fixes necessary for type safety and parallel execution. No scope creep.

## Issues Encountered
- Parallel execution race condition: Plan 02's commit absorbed Plan 03's files. Working tree was clean when Plan 03 attempted commits. All content is correct and verified.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 15 tool names registered with makeAssistantToolUI (9 email/data + 6 analysis/AI)
- FallbackToolUI provides catch-all for any future unregistered tools
- HITL approval card ready for both current (poll-based) and future (native) backends
- AllToolUIs barrel complete - ready for Plan 04 to mount inside ChatRuntimeProvider
- Backend prerequisite for native requires_action HITL documented for Phase 28

## Self-Check: PASSED

All 9 files verified present. Both commit hashes (fd3da32d, 15b7bbd3) verified in git log.

---
*Phase: 27-chat-frontend*
*Completed: 2026-03-02*
