# Sprint 21 — UX Consistency Pass

| Campo            | Valore                                           |
| ---------------- | ------------------------------------------------ |
| **Fase**         | Phase 4 — UX Unification & Auto-Population       |
| **Date**         | 2026-04-28 → 2026-05-12                          |
| **Obiettivo**    | All CRM pages visually consistent: same layout, breadcrumbs, empty states, i18n, theme compliance, URL state. |
| **Capacita**     | 15 SP                                            |

---

## Sprint Backlog

### Navigation (4 SP)

- [x] T-2101 — **Fix sidebar active state.** In `Sidebar.tsx`, change `isActive` from `router.pathname === href` to `router.pathname === href || router.asPath.startsWith(href + '/')`. Handles sub-routes (e.g. `/dashboard/crm/accounts/123` highlights "Accounts"). — [1 SP] — ✅ DONE
- [x] T-2102 — **Sidebar expanded by default.** In `Layout.tsx`, change `collapsed` initial state from `true` to `false` on desktop. Persist to localStorage key `pmsync:sidebar-collapsed`. Read on mount. — [1 SP] — ✅ DONE
- [x] T-2103 — **Shared CrmBreadcrumb component.** Create `frontend/components/common/CrmBreadcrumb.tsx`: accepts `section` (string, e.g. "Accounts") and optional `entityName`. Renders: Dashboard (link) → CRM (link to /dashboard/crm/accounts) → {section} (link if entityName provided) → {entityName} (plain text). Use in all CRM list + detail pages. — [1 SP] — ✅ DONE
- [x] T-2104 — **Fix TicketDetail breadcrumb.** Replace inline breadcrumb in `TicketDetail.tsx` with shared `CrmBreadcrumb` component. Adds missing "CRM" level. — [1 SP] — ✅ DONE

### Layout Normalization (5 SP)

- [x] T-2105 — **Normalize AccountsList layout.** Add `maxWidth: 1200` and responsive padding `p: { xs: 2, md: 3 }`. Add `CrmBreadcrumb` at top. Replace inline empty state with shared `EmptyState` component (icon, title, description, CTA button). Replace inline delete Dialog with shared `ConfirmDialog`. — [2 SP] — ✅ DONE
- [x] T-2106 — **Normalize DealsList layout.** Add `maxWidth: 1200` and responsive padding. Add `CrmBreadcrumb`. Replace inline empty state with shared `EmptyState`. Existing `ConfirmDialog` usage is already correct. — [1 SP] — ✅ DONE
- [x] T-2107 — **Normalize TicketsList layout.** Keep existing `maxWidth: 1200`. Add `CrmBreadcrumb`. Replace inline empty state with shared `EmptyState` including CTA "Create Ticket" button. Add row-level delete action (trash icon) matching Accounts/Deals pattern. Add shared `ConfirmDialog` for delete. — [2 SP] — ✅ DONE

### i18n & URL State (3 SP)

- [x] T-2108 — **Localize Tickets pagination.** Add `labelRowsPerPage` and `labelDisplayedRows` to `TicketsList.tsx` TablePagination, matching the pattern in `AccountsList.tsx`. — [1 SP] — ✅ DONE
- [x] T-2109 — **Fix Tickets date formatting.** Replace all `toLocaleDateString()` calls in `TicketsList.tsx` and `TicketDetail.tsx` with shared `formatDateInTz` utility. — [1 SP] — ✅ DONE
- [x] T-2110 — **URL state sync for Accounts + Tickets.** Sync search, filters, and page number to URL query params (using `useRouter` push with shallow routing). Match the pattern already used in `DealsList.tsx`. — [1 SP] — ✅ DONE (already implemented in both)

### Theme Compliance (3 SP)

- [x] T-2111 — **Replace hardcoded hex colors.** Audit all files in `frontend/components/dashboard/crm-*/**/*.tsx`. Replace hardcoded hex values (#1976d2, #2e7d32, #ed6c02, #0097a7, etc.) with MUI theme tokens (theme.palette.info.main, success.main, warning.main, primary.main). Use `useTheme()` hook where needed. — [1 SP] — ✅ DONE
- [ ] T-2112 — **Fix hardcoded fallback strings.** Replace all `|| 'English Fallback'` patterns in CRM components with proper translation keys. Add missing keys to `frontend/locales/en.ts` and `it.ts`. — [1 SP]
- [ ] T-2113 — **Add missing aria-labels.** TicketDetail back button: add `aria-label`. Audit all CRM IconButtons for missing labels. — [1 SP]

**Totale: 15 SP**

---

## Dipendenze

- Sprint 19-20 complete (new components exist)
- Existing shared components: `EmptyState`, `ConfirmDialog`, `CrmBreadcrumb` (T-2103)
- `formatDateInTz` utility exists in `frontend/lib/utils/`

## Rischi

1. **Layout changes may break existing tests/screenshots.** Mitigazione: No E2E tests exist for CRM list pages; manual visual review at sprint end.
2. **URL state sync may conflict with Deals existing implementation.** Mitigazione: Read Deals implementation first, replicate exact pattern.

## Definition of Done

- [ ] All CRM list pages have breadcrumbs, maxWidth: 1200, responsive padding
- [ ] All CRM empty states use shared EmptyState component with CTA
- [ ] Sidebar highlights correctly on `/dashboard/crm/accounts/123` etc.
- [ ] Sidebar starts expanded on desktop, preference persists
- [ ] Tickets pagination is localized (Italian labels visible)
- [ ] All dates use `formatDateInTz`
- [ ] Accounts + Tickets sync filters to URL
- [ ] Zero hardcoded hex colors in CRM components
- [ ] Zero hardcoded fallback strings
- [ ] Frontend tsc: passing
- [ ] Backend tsc: passing (no changes expected)
