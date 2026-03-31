# Sprint 10 — Checkpoint

## Status

- **Sprint:** 10 — Dashboard: Email Triage as Source of Truth
- **Last Task Completed:** T-1004 — Backend unified count endpoint
- **Next Task:** Sprint 11 (Dashboard Audit continued)
- **Tasks Done:** 4/4
- **SP Completed:** 15/15
- **Last Updated:** 2026-03-31 21:30

## Audit Findings Addressed

- DASH-C1: Widgets pull email data from 3 inconsistent sources — ✅ fixed: PriorityInboxWidget removed, AiTriageWidget is single priority view
- DASH-C2: Dashboard counts don't match sidebar counts — ✅ fixed: useUnifiedEmailCounts() derives from folder data (same as sidebar)
- DASH-H3: Email triage not the source of truth for priority — ✅ fixed: AiTriageWidget = AI priority + user-pinned sections

## Last Modified Files

- frontend/hooks/queries/use-unified-email-counts.ts (new — shared count hook)
- frontend/hooks/queries/use-dashboard.ts (removed dead dashboardStatsOptions/useDashboardStats)
- frontend/hooks/queries/dashboard-keys.ts (removed stats key)
- frontend/hooks/queries/index.ts (added use-unified-email-counts export)
- frontend/components/email/folders/useFolderManagement.ts (uses computeFolderCounts)
- frontend/components/dashboard/widgets/AiTriageWidget.tsx (enhanced: 2-section priority view)
- frontend/components/dashboard/widgets/PriorityInboxWidget.tsx (deleted)
- frontend/components/dashboard/widgets/UnreadEmailsWidget.tsx (badge from useUnifiedEmailCounts)
- frontend/components/dashboard/dashboard/widget-registry.ts (removed 'priority' widget)
- frontend/lib/dashboard/widget-registry.ts (removed 'priority', updated triage)
- frontend/lib/dashboard/presets.ts (removed priority-1 from presets)
- frontend/stores/dashboard-store.ts (removed 'priority' from WidgetId)
- frontend/locales/en.ts (aiTriage: added aiTriagedSection, userPinnedSection, noStarredEmails)
- frontend/locales/it.ts (same translations in Italian)
- frontend/locales/index.ts (added 3 new aiTriage fields)
- backend/src/modules/realtime/services/realtime-events.service.ts (deprecated emitUnreadCountUpdate)

## Key Decisions Made

- useUnifiedEmailCounts() uses useFolders() + useFolderMetadata() internally, returns folderCounts + inboxUnread
- computeFolderCounts() extracted as pure function for reuse by useFolderManagement
- dashboardStatsOptions/useDashboardStats removed entirely (dead code — never consumed)
- PriorityInboxWidget deleted; starred emails shown as "user-pinned" section in AiTriageWidget
- emitUnreadCountUpdate marked @deprecated (never called); emitFolderCountsUpdate is canonical
- /emails/stats endpoint kept (used by analytics) but no longer the dashboard's source of truth

## Blockers / Notes

- None

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
