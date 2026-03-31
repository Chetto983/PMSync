# Sprint 11 — Forecast, Governance & NBA

| Campo | Valore |
|-------|--------|
| **Phase** | 7 — CRM AI Frontend |
| **Sprint** | 11 |
| **SP** | 13 |
| **Objective** | Fix hardcoded currency/locale, add accessibility, add error/empty states, persist tab state |
| **Addresses** | CRM-H1, CRM-H2, CRM-M1, CRM-M2, CRM-M3, CRM-L1, CRM-L2 |

---

## Sprint Backlog

### T-1101: Fix hardcoded currency in GovernanceDashboard [2 SP]
- [ ] Read `GovernanceDashboard.tsx` — locate `$` formatting (lines 92-93)
- [ ] Use `Intl.NumberFormat` with user's locale and currency from tenant settings
- [ ] Add `t.aiGovernance.costLabel` translations
- [ ] Addresses: **CRM-H1**

### T-1102: Fix hardcoded locale in ForecastDashboard [2 SP]
- [ ] Read `ForecastDashboard.tsx` — locate `it-IT` formatting (lines 72-77)
- [ ] Replace with dynamic locale from `useLocale()` or user settings
- [ ] Verify currency format works for EUR, USD, GBP
- [ ] Addresses: **CRM-H2**

### T-1103: Add aria-label to GovernanceDashboard tabs [1 SP]
- [ ] Read `GovernanceDashboard.tsx` — locate Tab components
- [ ] Add `aria-label` to Tabs container: "AI Governance metrics"
- [ ] Add `aria-label` to each Tab: "Accuracy", "Costs", "Drift", "Models"
- [ ] Addresses: **CRM-M1**

### T-1104: Add error display to ForecastDashboard [2 SP]
- [ ] Read `ForecastDashboard.tsx` — locate error state handling
- [ ] Add Alert component when forecast query fails
- [ ] Include "Retry" button to refetch
- [ ] Addresses: **CRM-M2**

### T-1105: Add empty state to NBASection [2 SP]
- [ ] Read `NBASection.tsx` — locate render logic
- [ ] When no actions and no error: show "No AI recommendations available" message
- [ ] Use appropriate icon (Lightbulb or similar) with translatable text
- [ ] Addresses: **CRM-M3**

### T-1106: Persist GovernanceDashboard tab state [1 SP]
- [ ] Read `GovernanceDashboard.tsx` — locate tab state
- [ ] Use URL search param (`?tab=costs`) or localStorage to persist active tab
- [ ] Restore tab on return navigation
- [ ] Addresses: **CRM-L1**

### T-1107: Add AI feature discovery hints [2 SP]
- [ ] Add tooltip hints on AI-related sidebar menu items
- [ ] Add "New" badge on first-time AI features (dismissed after first click)
- [ ] Use localStorage to track first-visit state
- [ ] Translations for tooltip texts in EN + IT
- [ ] Addresses: **CRM-L2**

### T-1108: Verify ForecastChart responsive on mobile [1 SP]
- [ ] Read `ForecastChart` sub-component — check chart container sizing
- [ ] Verify chart doesn't overflow or clip on 375px viewport
- [ ] Add `responsive: true` to Chart.js config if missing

---

## Dependencies

- None (frontend-only sprint)

## Risks

1. **T-1101/T-1102** — Currency from tenant settings may not be set. Need sensible default (EUR for IT locale).
2. **T-1107** — Feature hints must not be annoying. One-time display with easy dismiss.

## Definition of Done

- [ ] Currency formatting uses user locale (not hardcoded `$` or `it-IT`)
- [ ] GovernanceDashboard tabs have ARIA labels
- [ ] ForecastDashboard shows error alert with retry on query failure
- [ ] NBASection shows empty state message when no recommendations
- [ ] GovernanceDashboard tab persisted across navigations
- [ ] AI feature discovery hints for new users
- [ ] Forecast chart responsive on mobile
- [ ] `npx tsc --noEmit` passes on frontend
