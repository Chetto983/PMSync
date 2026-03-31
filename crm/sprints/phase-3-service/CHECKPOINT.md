# Sprint 18 — Checkpoint

## Stato
- **Sprint:** 18 — CSAT, Reports & Beta Release
- **Last Task Completed:** T-1806 — Canned responses CRUD + UI
- **Next Task:** T-1807 — Bug fixes Phase 3
- **Tasks Done:** 6/10
- **SP Completed:** 14/20
- **Last Updated:** 2026-03-31 17:00

## Last Modified Files
- backend/prisma/schema.prisma (CSATSurvey, TicketTemplate models)
- backend/src/modules/crm/ticket/services/csat.service.ts (new — BullMQ CSAT email job)
- backend/src/modules/crm/ticket/services/ticket.service.ts (CSAT hook in changeStatus)
- backend/src/modules/crm/ticket/services/ticket-template.service.ts (new — CRUD)
- backend/src/modules/crm/ticket/controllers/portal-csat.controller.ts (new — public GET/POST survey)
- backend/src/modules/crm/ticket/controllers/ticket-template.controller.ts (new — CRUD)
- backend/src/modules/crm/ticket/ticket.module.ts (wired CsatService, PortalCsatController, TicketTemplate*)
- backend/src/modules/crm/analytics/analytics.service.ts (new — CSAT agg + service metrics)
- backend/src/modules/crm/analytics/analytics.controller.ts (new — GET /csat, GET /service)
- backend/src/modules/crm/analytics/analytics.module.ts (new)
- backend/src/modules/crm/crm.module.ts (AnalyticsModule wired)
- frontend/components/portal/PortalCsatSurvey.tsx (new — 5-star MUI Rating survey page)
- frontend/pages/portal/survey/[token].tsx (new — portal survey page)
- frontend/components/dashboard/crm-analytics/ServiceAnalyticsDashboard.tsx (new)
- frontend/components/dashboard/crm-analytics/ServiceAnalyticsCharts.tsx (new — Recharts)
- frontend/pages/dashboard/crm/service-analytics.tsx (new — dynamic import)
- frontend/components/dashboard/crm-tickets/TicketDetail.tsx (canned response menu)
- frontend/components/layout/Sidebar.tsx (Service Analytics nav item)
- frontend/lib/api/crm-analytics.ts (new)
- frontend/lib/api/crm-ticket-templates.ts (new)
- frontend/hooks/queries/use-crm-analytics.ts (new)
- frontend/hooks/queries/use-crm-ticket-templates.ts (new)
- frontend/locales/en.ts (portal survey + serviceAnalytics + insertTemplate)
- frontend/locales/it.ts (portal survey + serviceAnalytics + insertTemplate)
- frontend/locales/index.ts (types for all new sections)

## Key Decisions Made
- T-1801: CSATSurvey uses ticketId @unique (one survey per ticket). Token is nanoid(21).
- T-1802: CSAT email job follows SLA timer pattern (direct BullMQ Queue+Worker). 1-hour delay. Fire-and-forget from changeStatus.
- T-1802: Contact email extracted from JSON `emails[0].value` (Contact.emails is JSONB, not a relation).
- T-1803: Survey page is at /portal/survey/[token] (no tenant slug needed — token is globally unique).
- T-1804: Raw SQL for monthly trend and service metrics (Prisma.sql composable fragments for conditional clauses).
- T-1805: Service analytics uses date range filter (last30/90/6m/all). Recharts for CSAT trend + distribution.
- T-1806: Canned response menu inserted before comment TextField. Body appended to existing comment text.
- DB push dropped search_vector tsvector column — re-applied migration SQL to restore it.

## Patterns Established
- CSAT service: backend/src/modules/crm/ticket/services/csat.service.ts (BullMQ delayed email job)
- Analytics module: backend/src/modules/crm/analytics/ (service + controller + module)
- Portal CSAT: @Public() controller at /portal/survey/:token (GET info, POST submit)
- Frontend analytics: crm-analytics API + hooks + dashboard components
- Canned responses: TicketTemplate CRUD + Menu in TicketDetail

## Blockers / Notes
- T-1807 (Bug fixes) — need to investigate any regressions from S15-S17
- T-1808 (Integration tests) — need test database setup
- T-1809 (Smoke test) — manual checklist on staging
- T-1810 (Beta release) — seed data, migration verification, git tag v0.3.0-beta

## Validation Status
- Backend tsc: ✅ passing (pre-existing errors in follow-up-crud tests excluded)
- Frontend tsc: ✅ passing (pre-existing errors in ComposeDialog/use-follow-ups excluded)
- Prisma generate: ✅ passing
- DB push: ✅ schema synced (tsvector re-applied)
