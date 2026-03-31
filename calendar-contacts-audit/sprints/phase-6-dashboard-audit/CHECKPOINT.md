# Sprint 11 — Checkpoint

## Status

- **Sprint:** 11 — Dashboard: Widget Consolidation & Consistency
- **Last Task Completed:** T-1105 — Remove duplicate dashboard stats query
- **Next Task:** Sprint 12 (Legacy Purge)
- **Tasks Done:** 5/5
- **SP Completed:** 12/12
- **Last Updated:** 2026-03-31 22:30

## Audit Findings Addressed

- DASH-H1: PredictiveInsightsWidget duplicates BriefingWidget data — ✅ removed, widget count 10→8
- DASH-H2: DeadlinesWidget uses AI-guessed deadlines as primary source — ✅ fixed: calendar-only
- DASH-H4: StaleContactsWidget fallback uses different algorithm — ✅ fixed: CRM-only, no fallback
- DASH-M1: Inconsistent consent gating across widgets — ✅ fixed: AiTriage, FollowUp, TrendCharts gated
- DASH-M3: Duplicate dashboard stats query — ✅ already resolved in S10

## Last Modified Files

- frontend/components/dashboard/widgets/PredictiveInsightsWidget.tsx (deleted)
- frontend/components/dashboard/widgets/AiTriageWidget.tsx (added consent gating)
- frontend/components/dashboard/widgets/FollowUpWidget.tsx (added consent gating)
- frontend/components/dashboard/widgets/TrendChartsWidget.tsx (added consent gating)
- frontend/components/dashboard/dashboard/widget-registry.ts (removed insights)
- frontend/lib/dashboard/widget-registry.ts (removed insights)
- frontend/lib/dashboard/presets.ts (removed insights from presets)
- frontend/stores/dashboard-store.ts (removed insights from WidgetId)
- frontend/hooks/queries/use-dashboard.ts (calendar-only deadlines, CRM-only stale contacts, enabled params)
- frontend/locales/en.ts (removed insights translations)
- frontend/locales/it.ts (removed insights translations)
- frontend/locales/index.ts (removed insights type)

## Key Decisions Made

- BriefingWidget already shows same data as PredictiveInsightsWidget via chips — no content migration needed
- DeadlinesWidget: calendar events are facts, AI-extracted deadlines are guesses — removed AI source entirely
- StaleContactsWidget: CRM score is authoritative — removed contactsApi fallback with different algorithm
- Consent rules: email CONTENT → ai_email_processing, email ANALYTICS → email_analytics, COUNTS only → no consent
- useTriagedEmails and useImportantEmails now accept `enabled` parameter for consent gating

## Blockers / Notes

- None

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
