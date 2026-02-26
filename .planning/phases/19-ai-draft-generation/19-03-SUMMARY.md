---
phase: 19-ai-draft-generation
plan: 03
subsystem: ui
tags: [react, tanstack-query, tiptap, mui, compose, ai-draft, tone-selector]

# Dependency graph
requires:
  - phase: 19-ai-draft-generation/01
    provides: AiDraftController with generate-reply-draft, draft-feedback, draft-stats endpoints
provides:
  - useAiDraft TanStack Query hook for draft generation API
  - useRegenerateDraft mutation hook with cache invalidation
  - useRecordDraftFeedback mutation hook for send/close feedback
  - AiDraftBadge component (AI Draft chip + restore link)
  - ToneSelector component (4 tone chips: formal, casual, shorter, detailed)
  - ComposeDialog integration: auto-fetch draft on reply, populate editor, feedback on send/close
  - ComposeEditor focusEnd prop for cursor-at-end after draft population
affects: [19-04 writing style settings panel]

# Tech tracking
tech-stack:
  added: []
  patterns: [ai-draft-inline-population, tone-selector-chips, draft-feedback-on-send-close]

key-files:
  created:
    - frontend/components/email/compose/AiDraftBadge.tsx
    - frontend/components/email/compose/ToneSelector.tsx
    - frontend/hooks/queries/use-ai-draft.ts
  modified:
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts
    - frontend/lib/api/ai.ts
    - frontend/hooks/queries/index.ts
    - frontend/components/email/compose/ComposeDialog.tsx
    - frontend/components/email/compose/ComposeEditor.tsx

key-decisions:
  - "AI draft controls rendered above editor, not inline or side-by-side"
  - "handleDialogClose wraps onClose to capture rejection feedback before closing"
  - "Draft population useEffect keyed on aiDraft.draftId to avoid re-render loops"
  - "focusEnd uses requestAnimationFrame for one-tick delay after content render"

patterns-established:
  - "AI draft inline population: fetch via TanStack Query, populate body state, track edits for feedback"
  - "Tone selector as horizontal chip row with toggle-deselect on re-click"
  - "Draft feedback lifecycle: accepted/edited on send, rejected on close without send"

requirements-completed: [DRAFT-01]

# Metrics
duration: 12min
completed: 2026-02-26
---

# Phase 19 Plan 03: Frontend AI Draft Wiring Summary

**AI draft generation wired into ComposeDialog: auto-fetches reply draft via TanStack Query, populates TipTap editor inline, shows AiDraftBadge/ToneSelector, supports regenerate with instructions, records accept/edit/reject feedback on send and close**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-26T15:59:47Z
- **Completed:** 2026-02-26T16:11:47Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- 14 aiDraft translation keys added in en.ts, it.ts, and index.ts types
- voltAgentApi extended with generateReplyDraft, recordDraftFeedback, getDraftStats methods
- TanStack Query hooks: useAiDraft (enabled for reply/replyAll), useRegenerateDraft (mutation with cache invalidation), useRecordDraftFeedback
- AiDraftBadge component: shows "AI Draft" chip when draft is active, "Restore original" link after user edits
- ToneSelector component: 4 tone chips (formal, casual, shorter, detailed) with toggle-deselect
- ComposeDialog wiring: auto-fetches draft on reply open, populates editor body, skeleton loading, regenerate button with collapsible instruction input, draft feedback on send (accepted/edited) and close (rejected)
- ComposeEditor focusEnd prop: cursor lands at end of draft content for quick-send flow

## Task Commits

Each task was committed atomically:

1. **Task 1: Translations + API module + TanStack Query hooks** - `c57aa34c` (feat)
2. **Task 2: AiDraftBadge + ToneSelector + ComposeDialog wiring** - `49feae1d`, `c5a9d7ff`, `c238e66c` (feat)

Note: Tasks were pre-committed across multiple prior session commits that bundled Plan 19-03 work.

## Files Created/Modified
- `frontend/locales/en.ts` - Added aiDraft section with 14 translation keys
- `frontend/locales/it.ts` - Added matching Italian aiDraft translations
- `frontend/locales/index.ts` - Added aiDraft type definitions
- `frontend/lib/api/ai.ts` - Added generateReplyDraft, recordDraftFeedback, getDraftStats to voltAgentApi + DraftStats type
- `frontend/hooks/queries/use-ai-draft.ts` - NEW: 3 TanStack Query hooks (useAiDraft, useRegenerateDraft, useRecordDraftFeedback)
- `frontend/hooks/queries/index.ts` - Re-exported use-ai-draft hooks
- `frontend/components/email/compose/AiDraftBadge.tsx` - NEW: AI Draft badge with chip and restore link (46 lines)
- `frontend/components/email/compose/ToneSelector.tsx` - NEW: Tone chip selector with 4 options (39 lines)
- `frontend/components/email/compose/ComposeDialog.tsx` - Wired AI draft hooks, state, effects, UI, and feedback recording
- `frontend/components/email/compose/ComposeEditor.tsx` - Added focusEnd prop with requestAnimationFrame focus

## Decisions Made
- AI draft controls rendered in a box above the editor, not inline or side-by-side -- keeps ComposeDialog changes minimal while being visually clear
- handleDialogClose created as a wrapper around onClose to intercept dialog close events and record rejected feedback before closing
- Draft population useEffect keyed on `aiDraft?.draftId` (not `aiDraft?.body`) to trigger only on new draft arrival, avoiding re-render loops
- focusEnd implementation uses `requestAnimationFrame` to ensure TipTap editor has rendered content before focusing at end

## Deviations from Plan

None - plan executed exactly as written. All changes were pre-implemented in prior session commits and verified during this execution.

## Issues Encountered
- Task 1 and Task 2 changes were already committed in prior session commits (`c57aa34c`, `49feae1d`, `c5a9d7ff`, `c238e66c`) that executed Plan 19-02 and bundled Plan 19-03 work. This execution verified correctness and created the SUMMARY documentation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Frontend draft generation flow is fully wired and ready for user testing
- Backend API must be running with Prisma migration applied for AiDraftFeedback model
- Plan 19-04 (writing style settings panel) can proceed

## Self-Check: PASSED

- [x] `AiDraftBadge.tsx` exists (46 lines)
- [x] `ToneSelector.tsx` exists (39 lines)
- [x] `use-ai-draft.ts` exists (62 lines)
- [x] voltAgentApi.generateReplyDraft method present
- [x] aiDraft translations in en.ts, it.ts, index.ts
- [x] ComposeDialog wires useAiDraft, AiDraftBadge, ToneSelector
- [x] ComposeEditor has focusEnd prop
- [x] `npx tsc --noEmit` passes cleanly

---
*Phase: 19-ai-draft-generation*
*Completed: 2026-02-26*
