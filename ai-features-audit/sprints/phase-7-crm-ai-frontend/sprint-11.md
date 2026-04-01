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

### T-1101: Fix hardcoded currency in GovernanceDashboard [2 SP] ✅ DONE
- [x] formatCost uses Intl.NumberFormat with useLocale(). Addresses: **CRM-H1**

### T-1102: Fix hardcoded locale in ForecastDashboard [2 SP] ✅ DONE
- [x] formatCurrency uses useLocale() instead of hardcoded 'it-IT'. Addresses: **CRM-H2**

### T-1103: Add aria-label to GovernanceDashboard tabs [1 SP] ✅ DONE
- [x] Tabs container + each Tab gets aria-label. Addresses: **CRM-M1**

### T-1104: Add error display to ForecastDashboard [2 SP] ✅ DONE
- [x] Error state already existed. Improved retry to use refetchForecast(). Addresses: **CRM-M2**

### T-1105: Add empty state to NBASection [2 SP] ✅ DONE (in S10 T-1003)
- [x] Already fixed in Sprint 10. Addresses: **CRM-M3**

### T-1106: Persist GovernanceDashboard tab state [1 SP] ✅ DONE
- [x] localStorage (pmsync:governance-tab). Addresses: **CRM-L1**

### T-1107: Add AI feature discovery hints [2 SP] ✅ DONE
- [x] Primary-colored dot next to unvisited AI sidebar items. localStorage tracking. Addresses: **CRM-L2**

### T-1108: Verify ForecastChart responsive on mobile [1 SP] ✅ DONE
- [x] Recharts ResponsiveContainer already handles this. No changes needed.

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
