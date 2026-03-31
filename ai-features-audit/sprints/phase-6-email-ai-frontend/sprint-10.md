# Sprint 10 — Compose AI & Dashboard Widgets

| Campo | Valore |
|-------|--------|
| **Phase** | 6 — Email AI Frontend |
| **Sprint** | 10 |
| **SP** | 16 |
| **Objective** | Fix all hardcoded values in compose AI, add error handling to widgets, use theme tokens, fix tone callback |
| **Addresses** | EF-H1, EF-H2, EF-H3, EF-H4, EF-M1, EF-M2, EF-M3, EF-M4, EF-L1, EF-L2 |

---

## Sprint Backlog

### T-1001: Replace hardcoded gradient in AiComposeMenu [1 SP]
- [ ] Read `AiComposeMenu.tsx` — locate line 170 gradient
- [ ] Replace with theme-based gradient: `theme.palette.primary.main` to `theme.palette.primary.light`
- [ ] Addresses: **EF-H1**

### T-1002: Replace hardcoded placeholders in AIInlineMenu [1 SP]
- [ ] Read `AIInlineMenu.tsx` — locate line 123 fallback strings
- [ ] Add `t.email.composer.aiInlineModify` and `t.email.composer.aiInlineDescribe` to locales
- [ ] Replace hardcoded strings with translation calls
- [ ] Addresses: **EF-H2**

### T-1003: Add error handling to NBASection [2 SP]
- [ ] Read `NBASection.tsx` — locate silent error swallow at line 57
- [ ] Replace `return null` with error alert: "Unable to load recommendations"
- [ ] Add retry button
- [ ] Log error to console for debugging
- [ ] Addresses: **EF-H3**

### T-1004: Replace hardcoded sample in WritingStyleSettings [1 SP]
- [ ] Read `WritingStyleSettings.tsx` — locate line 264
- [ ] Add `t.settings.writingStylePanel.samplePlaceholder` to locales (EN + IT)
- [ ] Replace hardcoded "Dear John..." with translation
- [ ] Addresses: **EF-H4**

### T-1005: Add error toast to follow-up snooze mutation [2 SP]
- [ ] Read `FollowUpWidget.tsx` — locate snooze handler
- [ ] Add `onError` callback to mutation: show error toast
- [ ] Add loading state to snooze button while mutation pending
- [ ] Addresses: **EF-M1**

### T-1006: Fix tone selection callback in AiComposeMenu [2 SP]
- [ ] Read `AiComposeMenu.tsx` — locate `handleToneSelect`
- [ ] Pass selected tone to `onCompose` callback as parameter
- [ ] Verify parent component receives and uses tone for draft generation
- [ ] Addresses: **EF-M2**

### T-1007: Autofocus refinement input in AIInlineMenu [1 SP]
- [ ] Read `AIInlineMenu.tsx` — locate input element
- [ ] Add `autoFocus` when content appears (not on initial mount)
- [ ] Use `useEffect` with content dependency to trigger focus
- [ ] Addresses: **EF-M3**

### T-1008: Replace hardcoded priority colors with theme tokens [2 SP]
- [ ] Read `AiTriageWidget.tsx` — locate PRIORITY_CONFIG (lines 32-38)
- [ ] Replace inline hex colors with `theme.palette.error.main`, `warning.main`, etc.
- [ ] Addresses: **EF-M4**

### T-1009: Fix FollowUpWidget locale formatting [2 SP]
- [ ] Read `FollowUpWidget.tsx` — locate date formatting (line 36)
- [ ] Replace Italian-only locale check with user's actual locale from settings
- [ ] Use `useLocale()` hook or equivalent
- [ ] Addresses: **EF-L2**

### T-1010: Verify AiDraftBadge animation smoothness [1 SP]
- [ ] Read `AiDraftBadge.tsx` — check Fade usage
- [ ] Verify parent properly wraps with transition group if needed
- [ ] Addresses: **EF-L1**

### T-1011: Add test for AiTriageWidget rendering [1 SP]
- [ ] Verify existing `AiTriageWidget.test.tsx` covers all priority levels
- [ ] Add test for consent-denied state
- [ ] Add test for empty triage results

---

## Dependencies

- None (frontend-only sprint)

## Risks

1. **T-1006** — Changing `onCompose` signature may break parent components. Check all callers.
2. **T-1008** — Theme tokens must work in both light and dark mode.

## Definition of Done

- [ ] No hardcoded colors, gradients, or strings in compose AI components
- [ ] NBASection shows error state instead of silent failure
- [ ] Follow-up snooze shows error toast on failure
- [ ] Tone selection passed through to compose callback
- [ ] Priority colors use theme semantic tokens
- [ ] Date formatting respects user locale
- [ ] All strings translatable (EN + IT)
- [ ] `npx tsc --noEmit` passes on frontend
