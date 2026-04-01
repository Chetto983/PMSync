# Phase 5 — AI Chat Frontend COMPLETE (S08)

| Field | Value |
|-------|-------|
| **Status** | COMPLETE |
| **Sprint** | S08 (14 SP) |
| **Tasks** | 5/5 |
| **Next** | Sprint 09 (Phase 5 — AI Chat Frontend, continued) |

## Findings Addressed

| Finding | Severity | Status | Notes |
|---------|----------|--------|-------|
| FE-C1 | Critical | Fixed | CSRF caching already existed in api-client.ts. Added CSRF 403 retry to SSE stream's raw fetch (createChatStreamResponse) which was the only gap. |
| FE-H1 | High | Fixed | CommandPalette: aria-label on Dialog/input/list, role="listbox"/role="option", aria-activedescendant, aria-selected. MUI Dialog already provides focus trap. |
| FE-H2 | High | False Positive | aiResponse IS rendered in SchedulingDrawer (lines 444-449, Alert with Sparkles icon). No dead code found. |
| FE-H4 | High | Fixed | HitlApprovalCard: elapsed time counter (useElapsedSeconds hook), expiry warning after 3 min, Dismiss button. |
| N/A | Low | Fixed | FallbackToolUI and ChatBranchPicker hardcoded strings replaced with i18n keys (6 new keys in en/it). |

## Last Modified Files

- `frontend/lib/api/ai.ts` — CSRF 403 retry for SSE streams
- `frontend/components/ai/CommandPalette/index.tsx` — ARIA labels, listbox roles, activedescendant
- `frontend/src/components/chat/HitlApprovalCard.tsx` — elapsed time, expiry warning, dismiss button
- `frontend/src/components/chat/tool-uis/FallbackToolUI.tsx` — i18n for Running/Complete/Arguments/Details
- `frontend/src/components/chat/ChatBranchPicker.tsx` — i18n for aria-labels
- `frontend/locales/en.ts` — new keys: commandPalette.title, toolUi.running/complete/arguments/details/previousBranch/nextBranch, hitl.waitingFor/minutes/seconds/expiryWarning/dismiss
- `frontend/locales/it.ts` — Italian translations for all new keys
- `frontend/locales/index.ts` — type definitions for new keys

## Key Decisions

- FE-C1: Session-level CSRF cache was already in place. The real gap was SSE streams using raw fetch without CSRF 403 retry. Fixed by detecting CSRF_TOKEN_INVALID response, clearing cache, and replaying once.
- FE-H1: MUI Dialog already provides focus trap and aria-modal. Added role="listbox"/option pattern with aria-activedescendant for screen reader keyboard nav.
- FE-H2: Marked as false positive — aiResponse is rendered in an Alert component. No code changes needed.
- FE-H4: Used useElapsedSeconds custom hook with 1s interval. Expiry warning threshold at 3 minutes. Dismiss calls handleReject (same as deny).
- T-0805: Placed new translation keys in toolUi namespace (not chat) since that's where tool UI strings live.

## Validation Status

- `npx tsc --noEmit` — PASS (no new errors; pre-existing widget-registry errors unrelated)
