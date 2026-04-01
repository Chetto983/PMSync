# Sprint 20 — Checkpoint

## Stato

- **Sprint:** 20 — Contextual Sidebar & Activity Timeline
- **Last Task Completed:** T-2007 — AI Suggestions feed widget
- **Next Task:** Sprint complete — all tasks done
- **Tasks Done:** 7/7
- **SP Completed:** 18/18
- **Last Updated:** 2026-04-01 16:00

## Last Modified Files

- frontend/components/common/EntityContextSidebar.tsx
- frontend/components/common/ActivityTimeline.tsx
- frontend/components/common/index.ts
- frontend/components/dashboard/CrmSuggestionsFeed.tsx
- frontend/components/contacts/ContactDetail.tsx
- frontend/components/contacts/contact-detail/ContactCrmTab.tsx
- frontend/components/email/utils/email-formatters.ts
- frontend/pages/dashboard/email/thread/[threadId].tsx
- frontend/pages/dashboard/email.tsx
- frontend/lib/api/crm-context.ts
- frontend/lib/api/crm-activities.ts
- frontend/lib/api/crm-suggestions.ts
- frontend/hooks/queries/use-crm-context.ts
- frontend/hooks/queries/use-crm-activities.ts
- frontend/hooks/queries/use-crm-suggestions.ts
- frontend/locales/en.ts, it.ts, index.ts
- backend/src/modules/crm/context/ (module, controller, service, dto)
- backend/src/modules/crm/crm.module.ts

## Key Decisions Made

- EntityContextSidebar uses persistent MUI Drawer (320px, right-anchored)
- CRM context endpoint aggregates account, deals, tickets, activities in single call
- by-email lookup uses raw SQL with jsonb_array_elements for JSONB email matching
- Activity timeline uses cursor-based pagination via useInfiniteQuery
- Controller path: `crm/context/*` and `crm/activities/:entityType/:entityId`
- Suggestions feed grouped by type with confidence progress bar
- Email thread sidebar hidden on mobile (md breakpoint)
- mapEmailToThreadMessage extracted to email-formatters.ts to keep page under 500 lines

## Bugs Found & Fixed

- **BUG: by-email 400 VALIDATION_ERROR** — Malformed `From` headers missing closing `>` caused `extractEmailAddress` to return raw string. Fixed with fallback regex + email format validation guard in hook.
- **Pre-existing: churn 404** — `/crm/churn/contact/:id` 404 for contacts without churn data. Not Sprint 20.

## Patterns Established

- CRM context: `frontend/lib/api/crm-context.ts` + `use-crm-context.ts`
- CRM activities: `frontend/lib/api/crm-activities.ts` + `use-crm-activities.ts` (useInfiniteQuery)
- CRM suggestions: `frontend/lib/api/crm-suggestions.ts` + `use-crm-suggestions.ts`
- Reusable components: `EntityContextSidebar`, `ActivityTimeline` in `components/common/`
- Contact CRM tab: `ContactCrmTab.tsx` in `contact-detail/`
- Dashboard widget: `CrmSuggestionsFeed.tsx` in `components/dashboard/`

## Blockers / Notes

- Sprint 20 COMPLETE — all tasks done
- CrmSuggestionsFeed component exists but not wired into dashboard page yet (dashboard integration is a separate task)

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Circular deps: ✅ zero
- Railway deploy: ✅ /health 200, all CRM endpoints 401 (auth guard active)
- Vercel deploy: ✅ pages serving (307 = auth redirect)
- Production validation (7/8 PASS):
  - CRM tab on contacts: ✅ 4 tabs (Dettagli, Attività, Note, CRM), all sections render
  - CRM sidebar on email: ✅ renders with Italian translations
  - by-email fix deployed: ✅ no more 400 validation errors
  - CRM API errors: ✅ zero (excluding pre-existing churn 404)
  - Mobile viewport: ✅ contacts render correctly at 375px
  - Dashboard: ✅ page loads (widget component exists, not yet integrated)
- Scripts: `validate-sprint20-real.mjs`, `validate-sprint20-focused.mjs`
