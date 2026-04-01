# Sprint 20 — Checkpoint

## Stato

- **Sprint:** 20 — Contextual Sidebar & Activity Timeline
- **Last Task Completed:** T-2007 — AI Suggestions feed widget
- **Next Task:** Sprint complete — all tasks done
- **Tasks Done:** 7/7
- **SP Completed:** 18/18
- **Last Updated:** 2026-04-01 15:00

## Last Modified Files

- frontend/components/common/EntityContextSidebar.tsx
- frontend/components/common/ActivityTimeline.tsx
- frontend/components/common/index.ts
- frontend/components/dashboard/CrmSuggestionsFeed.tsx
- frontend/components/contacts/ContactDetail.tsx
- frontend/components/contacts/contact-detail/ContactCrmTab.tsx
- frontend/components/email/utils/email-formatters.ts
- frontend/pages/dashboard/email/thread/[threadId].tsx
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
- Controller path changed from `crm/context` to `crm` prefix (so activities endpoint at `crm/activities/:entityType/:entityId`)
- Suggestions feed grouped by type with confidence progress bar
- Email thread sidebar hidden on mobile (md breakpoint)
- mapEmailToThreadMessage extracted to email-formatters.ts to keep page under 500 lines

## Patterns Established

- CRM context: `frontend/lib/api/crm-context.ts` + `use-crm-context.ts`
- CRM activities: `frontend/lib/api/crm-activities.ts` + `use-crm-activities.ts` (useInfiniteQuery)
- CRM suggestions: `frontend/lib/api/crm-suggestions.ts` + `use-crm-suggestions.ts`
- Reusable components: `EntityContextSidebar`, `ActivityTimeline` in `components/common/`
- Contact CRM tab: `ContactCrmTab.tsx` in `contact-detail/`
- Dashboard widget: `CrmSuggestionsFeed.tsx` in `components/dashboard/`

## Blockers / Notes

- Sprint 20 COMPLETE — all tasks done

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Circular deps: ✅ zero
