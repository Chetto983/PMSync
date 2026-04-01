# Sprint 08 — Chat UI, Streaming & Accessibility

| Campo | Valore |
|-------|--------|
| **Phase** | 5 — AI Chat Frontend |
| **Sprint** | 08 |
| **SP** | 14 |
| **Objective** | Cache CSRF token, fix CommandPalette a11y, remove SchedulingDrawer dead code, add HITL timeout display |
| **Addresses** | FE-C1, FE-H1, FE-H2, FE-H4 |

---

## Sprint Backlog

### T-0801: Cache CSRF token per session [3 SP]
- [x] Read `frontend/lib/api/ai.ts` — locate CSRF token fetching ✅ DONE
- [x] Session-level CSRF cache already exists in api-client.ts ✅ DONE
- [x] Added CSRF 403 retry to SSE stream's raw fetch (was missing) ✅ DONE
- [x] Requests use single round-trip via existing cache ✅ DONE
- [x] Addresses: **FE-C1** ✅ DONE

### T-0802: Add focus trap and ARIA labels to CommandPalette [3 SP]
- [x] Read `CommandPalette/index.tsx` — audit current accessibility ✅ DONE
- [x] Add `aria-label` to dialog, search input, and list items ✅ DONE
- [x] MUI Dialog already provides `role="dialog"` and `aria-modal="true"` ✅ DONE
- [x] MUI Dialog already provides focus trap ✅ DONE
- [x] Add `aria-activedescendant` for keyboard navigation highlight ✅ DONE
- [x] Addresses: **FE-H1** ✅ DONE

### T-0803: Fix SchedulingDrawer — render or remove aiResponse [3 SP]
- [x] Read `calendar/ai/SchedulingDrawer.tsx` — trace aiResponse state ✅ DONE
- [x] **FALSE POSITIVE**: aiResponse IS rendered (lines 444-449, Alert component) ✅ DONE
- [x] No unused state found in component ✅ DONE
- [x] Addresses: **FE-H2** (verified — no action needed) ✅ DONE

### T-0804: Add HITL approval timeout display [3 SP]
- [x] Read `HitlApprovalCard.tsx` — audit current UI ✅ DONE
- [x] Add timestamp display: "Waiting for X minutes" ✅ DONE
- [x] Add auto-expiry warning: visual indicator when approaching timeout (3 min) ✅ DONE
- [x] Add "Dismiss" button to discard stale approvals ✅ DONE
- [x] Addresses: **FE-H4** ✅ DONE

### T-0805: Add translations for all chat UI strings [2 SP]
- [x] Grep for hardcoded English strings in `frontend/src/components/chat/` ✅ DONE
- [x] Add missing strings to `frontend/locales/en.ts` and `it.ts` ✅ DONE
- [x] Replace hardcoded strings with `t.ai.toolUi.*` calls ✅ DONE

---

## Dependencies

- S01 complete (SSE reconnection logic feeds into frontend stream handling)

## Risks

1. **T-0801** — CSRF token caching must not persist across user sessions. Clear on logout.
2. **T-0802** — Focus trap must not break keyboard shortcuts (Cmd+K to close).
3. **T-0803** — SchedulingDrawer may be used elsewhere. Check all imports before removing code.

## Definition of Done

- [ ] CSRF token cached per session — no duplicate round-trips
- [ ] CommandPalette is WCAG-compliant (focus trap, ARIA labels, keyboard nav)
- [ ] SchedulingDrawer aiResponse either rendered or removed (no dead code)
- [ ] HITL approvals show wait time and have cancel button
- [ ] All chat UI strings use translations
- [ ] `npx tsc --noEmit` passes on frontend
