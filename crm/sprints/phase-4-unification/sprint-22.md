# Sprint 22 — Guided Empty States, Dashboard & Polish

| Campo            | Valore                                           |
| ---------------- | ------------------------------------------------ |
| **Fase**         | Phase 4 — UX Unification & Auto-Population       |
| **Date**         | 2026-05-12 → 2026-05-26                          |
| **Obiettivo**    | Every empty page explains WHY it's empty and HOW to fill it. Dashboard shows CRM health + onboarding checklist. Final polish and production validation. |
| **Capacita**     | 12 SP                                            |

---

## Sprint Backlog

### Dashboard Widgets (5 SP)

- [ ] T-2201 — **Dashboard CRM health card.** Create `frontend/components/dashboard/CrmHealthCard.tsx`: shows 4 mini-metrics (total accounts, pipeline value, unresolved tickets, CSAT average). Each metric links to its CRM page. Shows trend arrow (up/down vs. previous 30 days). Backend: add `GET /api/v1/crm/dashboard-summary` endpoint returning all 4 values + previous period for comparison. — [3 SP]
- [ ] T-2202 — **Getting-started checklist widget.** Create `frontend/components/dashboard/CrmOnboardingChecklist.tsx`: shows when CRM data is empty. Checklist items: "Connect email ✓/✗", "Sync contacts ✓/✗", "First account created ✓/✗", "First deal created ✓/✗", "First ticket resolved ✓/✗". Each item links to the relevant action. Widget hides automatically when all items are checked. Uses `GET /api/v1/crm/onboarding-status` endpoint. — [2 SP]

### Guided Empty States (4 SP)

- [ ] T-2203 — **Service Analytics guided empty state.** When all metrics are null/zero, replace KPI cards + chart with a full-page `EmptyState`: icon (BarChart3), title "No service data yet", description "Resolve tickets to see response times, SLA compliance, and CSAT metrics. As tickets are resolved, this dashboard will populate automatically.", CTA "View Tickets" linking to `/dashboard/crm/tickets`. — [1 SP]
- [ ] T-2204 — **Forecast guided empty state.** When no forecast data, show `EmptyState`: icon (TrendingUp), title "No forecast data", description "Add deals with expected close dates to generate revenue projections. The forecast model needs at least 5 closed deals to produce meaningful predictions.", CTA "View Deals". — [1 SP]
- [ ] T-2205 — **Churn guided empty state.** When no churn data, show `EmptyState`: icon (AlertTriangle), title "No churn analysis available", description "Track account activity over time to detect churn risk. The churn model activates after 30 days of account interaction history.", CTA "View Accounts". — [1 SP]
- [ ] T-2206 — **Contextual KPI "no data" labels.** In `ServiceAnalyticsDashboard.tsx`, replace generic "Nessun dato disponibile" with per-metric explanations: "No tickets resolved" (first response), "No tickets closed" (resolution time), "No SLA policies active" (SLA compliance), "No CSAT surveys sent" (CSAT average). Add translation keys for each. — [1 SP]

### Polish & Validation (3 SP)

- [ ] T-2207 — **Hardcoded string audit.** Grep all `frontend/components/dashboard/crm-*/**/*.tsx` for remaining `|| '...'` fallback patterns and bare English strings. Replace with translation keys. Add keys to `en.ts` + `it.ts`. — [1 SP]
- [ ] T-2208 — **Mobile validation 375px.** For all pages modified in Sprint 21-22, set viewport to 375x812 via Edge CDP and take screenshots. Verify: no horizontal overflow, touch targets ≥44px, fields stack to full width, breadcrumbs wrap, sidebar collapses. Fix issues found. — [1 SP]
- [ ] T-2209 — **Production validation.** Push to Railway + Vercel. Run full production validation per `crm/docs/PRODUCTION-VALIDATION.md`. Verify: health check, new endpoints (suggestions, context, dashboard-summary), browser validation via Edge CDP. Take desktop + mobile screenshots. — [1 SP]

**Totale: 12 SP**

---

## Dipendenze

- Sprint 19-21 complete (auto-population + sidebar + consistency)
- Dashboard home page exists and accepts widget components
- `EmptyState` component from `frontend/components/common/`
- Production deployment infrastructure (Railway + Vercel)

## Rischi

1. **Dashboard endpoint aggregation may be slow.** Mitigazione: Each metric is a simple COUNT/AVG query with tenantId filter. Cache with TanStack Query staleTime: 5min.
2. **Onboarding checklist items are heterogeneous (email connection vs CRM entities).** Mitigazione: Backend endpoint checks each condition independently, returns boolean array.

## Definition of Done

- [ ] Dashboard shows CRM health card with 4 metrics + trend arrows
- [ ] Dashboard shows onboarding checklist when CRM is empty
- [ ] Service Analytics, Forecast, Churn show guided empty states when no data
- [ ] Each KPI card shows contextual "no data" explanation (not generic)
- [ ] Zero remaining hardcoded English strings in CRM components
- [ ] Mobile screenshots reviewed at 375px — no overflow, no clipping
- [ ] Production validation passes: Railway health ✓, new endpoints respond, browser renders ✓
- [ ] Frontend tsc: passing
- [ ] Backend tsc: passing

---

## Phase 4 Completion Criteria

When Sprint 22 is done, validate the full Phase 4 against these criteria:

1. ✓ Email triage auto-suggests CRM accounts for business domains
2. ✓ Commercial-intent emails suggest deals
3. ✓ Support-intent emails create tickets
4. ✓ Email thread view shows CRM context sidebar
5. ✓ Contact detail has CRM tab with timeline
6. ✓ Dashboard shows suggestions feed + health card + onboarding
7. ✓ All CRM pages consistent (layout, breadcrumb, empty state, i18n)
8. ✓ Sidebar active state works on sub-routes
9. ✓ Zero hardcoded colors/strings
10. ✓ All lists persist filters in URL
11. ✓ Every empty page explains itself
