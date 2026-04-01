# Sprint 20.1 — Checkpoint

## Stato

- **Sprint:** 20.1 — UX Anti-Patterns Remediation
- **Last Task Completed:** T-2022 — Generic error messages: add context
- **Next Task:** Sprint complete — all tasks done
- **Tasks Done:** 12/12
- **SP Completed:** 14/14
- **Last Updated:** 2026-04-01 16:00

## Last Modified Files

- frontend/components/dashboard/CrmSuggestionsFeed.tsx
- frontend/components/common/EntityContextSidebar.tsx
- frontend/components/common/ActivityTimeline.tsx
- frontend/components/contacts/ContactDetail.tsx
- frontend/components/contacts/contact-detail/ContactCrmTab.tsx
- frontend/components/dashboard/crm-kb/KBBrowsePage.tsx
- frontend/components/dashboard/crm-tickets/TicketsList.tsx
- frontend/components/dashboard/crm-accounts/AccountsList.tsx
- frontend/components/dashboard/crm-accounts/AccountContactsTab.tsx
- frontend/components/dashboard/crm-accounts/AccountDetail.tsx
- frontend/components/dashboard/crm-churn/ChurnWarningsList.tsx
- frontend/components/dashboard/crm-deals/DealContactsTab.tsx
- frontend/components/dashboard/crm-deals/DealProductsTab.tsx
- frontend/components/dashboard/crm-tickets/CreateTicketDialog.tsx
- frontend/components/dashboard/crm-kb/KBArticleEditor.tsx
- frontend/locales/en.ts, it.ts, index.ts

## Key Decisions Made

- Per-item pending state uses `Set<string>` of in-flight IDs for double-submit guard
- Dismiss confirmation uses warning variant ConfirmDialog (not danger — it's reversible via re-suggestion)
- URL state sync replicates DealsList pattern exactly (eslint-disable for router dep)
- Sidebar transition uses `theme.transitions.duration.leavingScreen` (MUI default ~195ms)
- Keyboard navigation on sidebar items uses `role="link"` + `tabIndex={0}` + Enter/Space handlers
- Error messages use existing translation namespace paths (e.g. `tc?.linkError`) with English fallbacks

## Patterns Established

- ConfirmDialog for all destructive actions (no more `window.confirm`)
- URL state sync pattern: read from `router.query` in `useState` initializer, sync back with `useEffect` + `router.replace({ shallow: true })`
- All `IconButton` components must have `aria-label` prop
- All interactive elements must be >= 44px touch target
- Required form fields must have `required` prop on MUI `TextField`

## Blockers / Notes

- Sprint 20.1 COMPLETE — all 12 tasks done, 14 SP
- Note: concurrent sessions occasionally scooped up staged CRM files into non-CRM commits. Changes are all committed but some landed in wrong commit messages. No functional impact.
- Next: Sprint 21 (check roadmap)

## Validation Status

- Backend tsc: N/A (no backend changes)
- Frontend tsc: ✅ passing (no new errors introduced)
- Circular deps: ✅ zero (no new modules)
