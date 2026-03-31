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
- [ ] Read `frontend/lib/api/ai.ts` — locate CSRF token fetching
- [ ] Add session-level CSRF cache: store token after first fetch, reuse until 401
- [ ] On 401: refresh CSRF token and retry original request (once)
- [ ] Measure: requests should drop from 2 round-trips to 1
- [ ] Addresses: **FE-C1**

### T-0802: Add focus trap and ARIA labels to CommandPalette [3 SP]
- [ ] Read `CommandPalette/index.tsx` — audit current accessibility
- [ ] Add `aria-label` to dialog, search input, and list items
- [ ] Add `role="dialog"` and `aria-modal="true"`
- [ ] Implement focus trap: Tab cycles within modal, Escape closes
- [ ] Add `aria-activedescendant` for keyboard navigation highlight
- [ ] Addresses: **FE-H1**

### T-0803: Fix SchedulingDrawer — render or remove aiResponse [3 SP]
- [ ] Read `calendar/ai/SchedulingDrawer.tsx` — trace aiResponse state
- [ ] If aiResponse is meant to be displayed: add UI section showing AI suggestions
- [ ] If aiResponse is dead code: remove state variable and related logic
- [ ] Clean up any other unused state in the component
- [ ] Addresses: **FE-H2**

### T-0804: Add HITL approval timeout display [3 SP]
- [ ] Read `HitlApprovalCard.tsx` — audit current UI
- [ ] Add timestamp display: "Waiting for X minutes"
- [ ] Add auto-expiry warning: visual indicator when approaching timeout
- [ ] Add "Cancel" button to dismiss stale approvals
- [ ] Addresses: **FE-H4**

### T-0805: Add translations for all chat UI strings [2 SP]
- [ ] Grep for hardcoded English strings in `frontend/src/components/chat/`
- [ ] Add missing strings to `frontend/locales/en.ts` and `it.ts`
- [ ] Replace hardcoded strings with `t.ai.chat.*` calls

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
