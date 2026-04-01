# Sprint 21 — Checkpoint

## Stato

- **Sprint:** 21 — UX Consistency Pass
- **Last Task Completed:** T-2113 — Add missing aria-labels
- **Next Task:** Sprint complete — all tasks done
- **Tasks Done:** 13/13
- **SP Completed:** 15/15
- **Last Updated:** 2026-04-01 18:30

## Last Modified Files

- frontend/components/layout/Sidebar.tsx (isActive sub-route fix)
- frontend/components/layout/Layout.tsx (sidebar collapsed persist → rail refactor by concurrent session)
- frontend/components/common/CrmBreadcrumb.tsx (new shared component)
- frontend/components/common/index.ts (export CrmBreadcrumb)
- frontend/components/dashboard/crm-accounts/AccountsList.tsx (layout normalization)
- frontend/components/dashboard/crm-deals/DealsList.tsx (layout normalization)
- frontend/components/dashboard/crm-tickets/TicketsList.tsx (layout + delete + pagination + date)
- frontend/components/dashboard/crm-tickets/TicketDetail.tsx (CrmBreadcrumb + aria-label)
- frontend/components/dashboard/crm-accounts/AccountContactsTab.tsx (unnamedContact i18n)
- frontend/components/dashboard/crm-deals/DealContactsTab.tsx (unnamedContact i18n)
- frontend/components/dashboard/crm-analytics/ServiceAnalyticsDashboard.tsx (theme tokens)
- frontend/components/dashboard/crm-analytics/ServiceAnalyticsCharts.tsx (theme tokens)
- frontend/components/dashboard/crm-lead-score/LeadScoreGauge.tsx (theme-aware colors)
- frontend/components/dashboard/crm-lead-score/ScoreHistoryChart.tsx (theme tokens)
- frontend/components/dashboard/crm-kb/KBArticleEditor.tsx (aria-label)
- backend/src/modules/ai/services/ai-analytics.service.ts (CacheService.exists() fix)

## Key Decisions Made

- CrmBreadcrumb uses `crmAccounts.breadcrumb.dashboard/crm` translation keys (pre-existing)
- Chart category colors (CostsTab, AccuracyTab, SignalBreakdown) kept as data-viz hex constants — replacing with theme would over-abstract
- T-2110 URL state sync was already implemented in both Accounts and Tickets — marked as done
- Concurrent sidebar refactor (icon rail) required fixing Layout.tsx and Sidebar.tsx useSidebarOrder calls
- Backend ai-analytics `CacheService.exists()` call fixed (second arg needs `{ namespace }` wrapper)

## Patterns Established

- CrmBreadcrumb: shared component for all CRM pages (Dashboard → CRM → Section → Entity)
- EmptyState: all CRM list pages now use shared EmptyState with icon + CTA
- ConfirmDialog: all CRM list pages use shared ConfirmDialog for delete actions
- Theme-aware chart colors: use `useTheme()` + `Palette` type for SVG colors

## Blockers / Notes

- Sprint 21 COMPLETE — all 13 tasks done, 15 SP
- Concurrent sessions (sidebar refactor, AI features audit) frequently scooped CRM files into wrong commits. No functional impact — all code is committed.
- Next: Sprint 22 (Empty States & Dashboard Polish) or production validation

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Circular deps: ✅ (no new modules created)
