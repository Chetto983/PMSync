# Sprint 20.1 — UX Anti-Patterns Remediation

| Campo | Valore |
| --- | --- |
| **Fase** | Phase 4 — UX Unification & Auto-Population |
| **Date** | 2026-04-01 → 2026-04-07 |
| **Obiettivo** | Fix all critical and high UX anti-patterns found during Sprint 20 production audit. Focus: feedback, destructive safety, touch targets, race conditions, URL state, accessibility. |
| **Capacita** | 14 SP |

---

## Sprint Backlog

### Critical — Fix Immediately (5 SP)

- [ ] T-2011 — **Suggestions Accept/Dismiss: loading + double-submit guard.** In `CrmSuggestionsFeed.tsx`, track per-item pending state with a `Set<string>` of in-flight IDs. Disable individual Accept/Dismiss buttons while their mutation is pending. Show `CircularProgress size={14}` inside button during mutation. Prevents double-submit and provides instant feedback. — [2 SP]
- [ ] T-2012 — **Suggestions Dismiss: add confirmation dialog.** Add a `ConfirmDialog` before `handleDismiss` executes. Message: "Dismiss this suggestion? This cannot be undone." Only for individual dismiss — bulk dismiss already has visual weight as a deliberate action. — [1 SP]
- [ ] T-2013 — **KB article delete: replace `window.confirm` with ConfirmDialog.** In `KBBrowsePage.tsx`, replace `window.confirm()` at line 82 with MUI `ConfirmDialog` component (already used in accounts/deals/tickets). Consistent UX, themed, accessible. — [1 SP]
- [ ] T-2014 — **Touch targets: increase to 44px minimum.** In `CrmSuggestionsFeed.tsx` change Accept/Dismiss `IconButton` from `sx={{ minWidth: 32, minHeight: 32 }}` to `sx={{ width: 44, height: 44 }}`. In `EntityContextSidebar.tsx` change close/toggle buttons from `size="small"` to explicit 44px. Audit all Sprint 20 components for sub-44px interactive elements. — [1 SP]

### High — Fix This Sprint (5 SP)

- [ ] T-2015 — **URL state sync: TicketsList + AccountsList + KBBrowsePage + ChurnWarningsList.** Replicate the `DealsList.tsx` URL sync pattern: read initial state from `router.query`, sync back with `router.replace({ shallow: true })` on debounced change. Cover: search, filters (status, priority, risk), page, rowsPerPage. — [3 SP]
- [ ] T-2016 — **Sidebar layout shift: add CSS transition.** In `EntityContextSidebar.tsx`, add `transition: theme.transitions.create('width', { duration: 225 })` to the Drawer container `sx`. Prevents 320px content jump on toggle. Match MUI's default drawer transition duration. — [1 SP]
- [ ] T-2017 — **ActivityTimeline Load More: add loading guard.** Accept `isLoadingMore` prop in `ActivityTimeline.tsx`. Disable "Load more" button and show spinner while `isFetchingNextPage` is true. Wire from `ContactCrmTab.tsx` where `useActivityTimeline` is consumed. — [1 SP]

### Medium — Accessibility & Polish (4 SP)

- [ ] T-2018 — **Sidebar keyboard navigation.** In `EntityContextSidebar.tsx`, make deal/ticket list items keyboard-navigable: add `tabIndex={0}`, `role="link"`, `onKeyDown` handler for Enter/Space. Items should be focusable and activatable without a mouse. — [1 SP]
- [ ] T-2019 — **Relationship strength bar: add aria-label.** In `EntityContextSidebar.tsx`, add `role="img"` and `aria-label="Relationship strength: {level}"` to the strength bar container. Screen readers can announce the value. — [0.5 SP]
- [ ] T-2020 — **Icon-only buttons: add aria-labels.** Audit all CRM components for `IconButton` without `aria-label`. Add labels to: ContactDetail edit/delete/merge buttons, EntityContextSidebar toggle/close, CrmSuggestionsFeed accept/dismiss, ActivityTimeline icons. — [0.5 SP]
- [ ] T-2021 — **Required field markers.** Add `required` prop to MUI `TextField` in: `CreateAccountDialog` (name), `CreateDealDialog` (name, pipeline, stage), `CreateTicketDialog` (subject), `KBArticleEditor` (title, body). MUI renders asterisk automatically with `required`. — [1 SP]
- [ ] T-2022 — **Generic error messages: add context.** Replace `toast.error(t.common.genericError)` in `AccountContactsTab`, `AccountDetail`, `DealContactsTab`, `DealProductsTab` with specific error keys: e.g. `t.crmAccounts.linkError ?? 'Failed to link contact'`. Add 8 new translation keys to en.ts + it.ts. — [1 SP]

**Totale: 14 SP**

---

## Dipendenze

- Sprint 20 complete (components exist)
- Existing `ConfirmDialog` component
- DealsList URL sync pattern as reference (Sprint 05)

## Rischi

1. **URL state sync touches 4 list components.** Mitigazione: identical pattern in each, copy from DealsList.
2. **Touch target increase may affect visual density.** Mitigazione: only affect icon buttons, not text buttons. Visual review at sprint end.

## Definition of Done

- [ ] Accept/Dismiss buttons disabled during mutation, spinner visible
- [ ] Dismiss shows confirmation dialog
- [ ] KB delete uses ConfirmDialog (no `window.confirm`)
- [ ] All interactive elements ≥ 44px touch target
- [ ] TicketsList, AccountsList, KBBrowsePage, ChurnWarningsList sync filters to URL
- [ ] Sidebar opens/closes with smooth transition (no content jump)
- [ ] Load More button disabled during fetch
- [ ] Sidebar items keyboard navigable (Tab + Enter)
- [ ] Strength bar has aria-label
- [ ] All icon buttons have aria-label
- [ ] Required fields show asterisk
- [ ] Error messages are specific (no generic fallbacks)
- [ ] Frontend tsc: passing
- [ ] Backend tsc: not modified
