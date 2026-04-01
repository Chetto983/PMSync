# Sprint 09 - Tool Renderers, HITL & Mobile

| Campo | Valore |
|-------|--------|
| **Phase** | 5 - AI Chat Frontend |
| **Sprint** | 09 |
| **SP** | 12 |
| **Objective** | Add validation to tool renderers, improve accessibility, fix mobile keyboard nav, translate suggestion chips |
| **Addresses** | FE-H3, FE-M1, FE-M2, FE-M3, FE-L1 |

---

## Sprint Backlog

### T-0901: Add data validation to all tool renderers [4 SP] DONE
- [x] Read all 14 tool UI components in `frontend/src/components/chat/tool-uis/`
- [x] Add runtime type checking: validate expected fields before destructuring
- [x] Show `FallbackToolUI` on malformed data instead of crashing
- [x] Add error boundary wrapper around each tool renderer
- [x] Test: pass malformed data to each renderer and verify graceful degradation
- [x] Addresses: **FE-H3**

### T-0902: Add ARIA labels to interactive tool elements [2 SP] DONE
- [x] Audit all buttons, links, and clickable elements in tool UIs
- [x] Add `aria-label` to icon-only buttons (for example copy, expand, navigate)
- [x] Add `role` attributes where missing
- [x] Addresses: **FE-M1**

### T-0903: Fix mobile chat layout keyboard accessibility [2 SP] DONE
- [x] Read `ChatMobileLayout` and trace hamburger menu interaction
- [x] Keep `Escape` close behavior and trap `Tab` focus inside the mobile sheet
- [x] Add dedicated localized labels for opening and closing the thread list
- [x] Test: navigate the mobile chat flow with keyboard-only interactions
- [x] Addresses: **FE-M2**

### T-0904: Translate ChatSuggestions quick-reply chips [2 SP] DONE
- [x] Read `ChatSuggestions.tsx` and locate suggestion text
- [x] Add suggestion strings to `frontend/locales/en.ts` and `frontend/locales/it.ts`
- [x] Translate known assistant quick actions without breaking unknown runtime suggestions
- [x] Addresses: **FE-M3**

### T-0905: Reduce ChatPage skeleton flash [1 SP] DONE
- [x] Read `ChatPage.tsx` and trace the `mounted` guard
- [x] Remove the second client-side skeleton gate so the dynamic page loader is the only loading state
- [x] Test: verify no `.chat-skeleton` markup is rendered after mount
- [x] Addresses: **FE-L1**

### T-0906: Verify chat error boundary catches tool render crashes [1 SP] DONE
- [x] Verify tool renderer crashes stay isolated to the tool card
- [x] Show localized fallback copy while preserving surrounding chat content
- [x] Test: throw from a tool renderer and verify chat continues working

---

## Dependencies

- S08 complete (CSRF caching, CommandPalette a11y)

## Risks

1. **T-0901** - 14 tool UIs is a lot of surface area. Prioritize the most-used tools first.
2. **T-0903** - Mobile keyboard support may conflict with OS-level gestures.

## Definition of Done

- [x] All tool renderers handle malformed data gracefully (no crashes)
- [x] Interactive tool elements have ARIA labels
- [x] Mobile chat navigable via keyboard
- [x] Suggestion chips translated (EN + IT)
- [x] ChatPage skeleton flash minimized
- [x] Error boundary verified for tool renderer isolation
- [x] `npx tsc --noEmit` passes on frontend
