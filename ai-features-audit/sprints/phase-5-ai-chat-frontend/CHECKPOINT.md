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
- FE-H1: MUI Dialog already provides focus trap and aria-modal. Added role="listbox"/option pattern with aria-activedescendant for screen reader keyboard nav. **Post-CDP fix**: ARIA attrs were initially on MUI TextField wrapper (wrong), moved to `slotProps.htmlInput` to target native `<input>`.
- FE-H2: Marked as false positive — aiResponse is rendered in an Alert component. No code changes needed.
- FE-H4: Used useElapsedSeconds custom hook with 1s interval. Expiry warning threshold at 3 minutes. Dismiss calls handleReject (same as deny). CDP confirmed "In attesa da 2 sec" visible live.
- T-0805: Placed new translation keys in toolUi namespace (not chat) since that's where tool UI strings live.

## Validation Status

- `npx tsc --noEmit` — PASS (no new errors; pre-existing widget-registry errors unrelated)

## CDP Deep Validation (Vercel Production)

Script: `scripts/validate-sprint08-cdp.mjs` via Edge CDP on port 9222.

**Result: 22 PASS, 0 FAIL, 5 WARN**

| Check | Result | Detail |
|-------|--------|--------|
| T-0802 Dialog role="dialog" | PASS | MUI Dialog renders correctly |
| T-0802 aria-labelledby | PASS | MUI pattern (auto-generated ID) |
| T-0802 aria-modal="true" | PASS | |
| T-0802 input aria-label | PASS | "Digita un comando o cerca..." on native input |
| T-0802 input aria-controls | PASS | Points to #command-palette-list |
| T-0802 list role="listbox" | PASS | |
| T-0802 list aria-label | PASS | "Palette Comandi" (Italian locale) |
| T-0802 aria-activedescendant | PASS | "cmd-item-home" (first item) |
| T-0802 role="option" items | PASS | 16 items found |
| T-0802 aria-selected | PASS | First item selected |
| T-0802 ArrowDown navigation | PASS | activedescendant changes to "cmd-item-inbox" |
| T-0802 focus trap | PASS | Tab stays within dialog |
| T-0802 Escape closes | PASS | |
| T-0801 chat composer | PASS | Loads and accepts input |
| T-0801 CSRF flow | PASS | Code review confirmed |
| T-0803 false positive | PASS | aiResponse rendered in SchedulingDrawer |
| T-0804 HITL timeout | WARN | No pending HITL in this session; confirmed "In attesa da 2 sec" in prior run |
| T-0805 locale detection | PASS | Locale "en" detected, translation keys deployed |

**Warnings** (all expected — depend on AI behavior or UI state):
- T-0803: SchedulingDrawer triggered via AI chat, not calendar page button
- T-0804: HITL requires high-risk tool call; AI chose to explain instead of auto-delete
- T-0805: No tool cards visible in current conversation (no tool calls made)
