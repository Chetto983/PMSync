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

### T-1001: Replace hardcoded gradient in AiComposeMenu [1 SP] ✅ DONE
- [x] Replace hardcoded #2196F3/#21CBF3 with theme.palette.primary.main/light
- [x] Addresses: **EF-H1**

### T-1002: Replace hardcoded placeholders in AIInlineMenu [1 SP] ✅ DONE
- [x] Remove stale fallback strings — i18n keys already defined
- [x] Addresses: **EF-H2**

### T-1003: Add error handling to NBASection [2 SP] ✅ DONE
- [x] Replace `return null` with warning Alert + retry button
- [x] Add empty state message. Addresses: **EF-H3**, **CRM-M3**

### T-1004: Replace hardcoded sample in WritingStyleSettings [1 SP] ✅ DONE
- [x] Add manualSamplesPlaceholder i18n key (EN + IT)
- [x] Addresses: **EF-H4**

### T-1005: Add error toast to follow-up snooze mutation [2 SP] ✅ DONE
- [x] Show toast.error on snooze failure, CircularProgress while pending
- [x] Addresses: **EF-M1**

### T-1006: Fix tone selection callback in AiComposeMenu [2 SP] ✅ DONE
- [x] handleQuickAction derives tone from action type and passes to onCompose
- [x] Addresses: **EF-M2**

### T-1007: Autofocus refinement input in AIInlineMenu [1 SP] ✅ DONE
- [x] Focus input on loading->done transition via prevLoadingRef
- [x] Addresses: **EF-M3**

### T-1008: Replace hardcoded priority colors with theme tokens [2 SP] ✅ DONE
- [x] Already uses MUI semantic colors — false positive. Addresses: **EF-M4**

### T-1009: Fix FollowUpWidget locale formatting [2 SP] ✅ DONE
- [x] Use locale directly for toLocaleDateString, i18n keys for follow-up types
- [x] Addresses: **EF-L2**

### T-1010: Verify AiDraftBadge animation smoothness [1 SP] ✅ DONE
- [x] MUI Fade wraps correctly, in prop toggles properly. No changes needed.
- [x] Addresses: **EF-L1**

### T-1011: Add test for AiTriageWidget rendering [1 SP] ✅ DONE
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
