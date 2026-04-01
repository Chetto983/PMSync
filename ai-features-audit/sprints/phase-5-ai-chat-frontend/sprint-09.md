# Sprint 09 — Tool Renderers, HITL & Mobile

| Campo | Valore |
|-------|--------|
| **Phase** | 5 — AI Chat Frontend |
| **Sprint** | 09 |
| **SP** | 12 |
| **Objective** | Add validation to tool renderers, improve accessibility, fix mobile keyboard nav, translate suggestion chips |
| **Addresses** | FE-H3, FE-M1, FE-M2, FE-M3, FE-L1 |

---

## Sprint Backlog

### T-0901: Add data validation to all tool renderers [4 SP] ✅ DONE
- [x] Read all 14 tool UI components in `frontend/src/components/chat/tool-uis/`
- [x] Add runtime type checking: validate expected fields before destructuring
- [x] Show FallbackToolUI on malformed data (not crash)
- [x] Add error boundary wrapper around each tool renderer
- [x] Test: pass malformed data to each renderer, verify graceful degradation
- [x] Addresses: **FE-H3**

### T-0902: Add ARIA labels to interactive tool elements [2 SP] ✅ DONE
- [x] Audit all buttons, links, and clickable elements in tool UIs
- [x] Add `aria-label` to icon-only buttons (e.g., copy, expand, navigate)
- [x] Add `role` attributes where missing
- [x] Addresses: **FE-M1**

### T-0903: Fix mobile chat layout keyboard accessibility [2 SP]
- [ ] Read `ChatMobileLayout` — trace hamburger menu interaction
- [ ] Add keyboard shortcut to toggle thread list (Escape or dedicated key)
- [ ] Ensure menu toggle is focusable and has `aria-label`
- [ ] Test: navigate entire mobile chat flow using keyboard only
- [ ] Addresses: **FE-M2**

### T-0904: Translate ChatSuggestions quick-reply chips [2 SP]
- [ ] Read `ChatSuggestions.tsx` — locate suggestion text
- [ ] Add suggestion strings to `frontend/locales/en.ts` and `it.ts`
- [ ] Replace hardcoded text with translation keys
- [ ] Addresses: **FE-M3**

### T-0905: Reduce ChatPage skeleton flash [1 SP]
- [ ] Read `ChatPage.tsx` — trace `mounted` ref guard
- [ ] Use CSS opacity transition instead of conditional render (no layout shift)
- [ ] Or: use `useIsomorphicLayoutEffect` to set mounted before paint
- [ ] Addresses: **FE-L1**

### T-0906: Verify chat error boundary catches tool render crashes [1 SP]
- [ ] Read `PageErrorBoundary` wrapper around ChatPage
- [ ] Verify tool renderer crash doesn't crash entire chat — only shows fallback for that tool
- [ ] Test: throw in a tool renderer, verify chat continues working

---

## Dependencies

- S08 complete (CSRF caching, CommandPalette a11y)

## Risks

1. **T-0901** — 14 tool UIs is a lot of surface area. Prioritize the most-used tools first.
2. **T-0903** — Mobile keyboard support may conflict with OS-level gestures.

## Definition of Done

- [ ] All tool renderers handle malformed data gracefully (no crashes)
- [ ] Interactive tool elements have ARIA labels
- [ ] Mobile chat navigable via keyboard
- [ ] Suggestion chips translated (EN + IT)
- [ ] ChatPage skeleton flash minimized
- [ ] Error boundary verified for tool renderer isolation
- [ ] `npx tsc --noEmit` passes on frontend
