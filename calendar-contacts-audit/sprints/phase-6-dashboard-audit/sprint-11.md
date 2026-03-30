# Sprint 11 — Dashboard: Widget Consolidation & Consistency

| Key | Value |
|-----|-------|
| Phase | 6 — Dashboard Audit |
| Sprint | 11 |
| SP | 12 |
| Objective | Remove redundant widgets, fix data inconsistencies, enforce consistent consent gating |
| Addresses | DASH-H1, DASH-H2, DASH-H4, DASH-M1, DASH-M3 |

## Sprint Backlog

### T-1101: Deduplicate BriefingWidget and PredictiveInsightsWidget [4 SP]

- [ ] Read `BriefingWidget.tsx` — shows urgent emails, deadlines, follow-ups, stale contacts
- [ ] Read `PredictiveInsightsWidget.tsx` — aggregates useBriefing, useDeadlines, useFollowUps, useStaleContacts
- [ ] These two widgets show overlapping data with different presentations
- [ ] Decision: keep BriefingWidget (AI summary = unique value), remove PredictiveInsightsWidget
- [ ] Move any unique insights from PredictiveInsightsWidget into BriefingWidget as expandable section
- [ ] Remove `insights` widget ID from `widget-registry.ts`
- [ ] Update `CustomizeDrawer.tsx`
- [ ] Remove unused query hooks if no other consumer exists
- [ ] Test: BriefingWidget shows all data that InsightsWidget had

### T-1102: Fix DeadlinesWidget — calendar only, no AI guessing [2 SP]

- [ ] Read `DeadlinesWidget.tsx` — primary: aiChatApi.getUpcomingDeadlines(), fallback: calendarApi
- [ ] Calendar events with deadlines are facts. AI-extracted deadlines from emails are guesses.
- [ ] Remove AI deadline extraction as primary source
- [ ] Use ONLY `calendarApi.listEvents()` with filter for events that have deadline semantics
- [ ] If no calendar events: show empty state "No upcoming deadlines" (not AI-guessed ones)
- [ ] Remove `aiChatApi.getUpcomingDeadlines()` call from this widget
- [ ] Test: widget shows only real calendar events, not hallucinated deadlines

### T-1103: Fix StaleContactsWidget — CRM only, remove fallback [2 SP]

- [ ] Read `StaleContactsWidget.tsx` — primary: crmApi.getStaleContacts(), fallback: contactsApi
- [ ] CRM relationship scoring is authoritative. Manual calculation from contactsApi is a different algorithm.
- [ ] Remove `contactsApi.listContacts()` fallback
- [ ] If CRM API fails: show error state, not a different number from a different algorithm
- [ ] Test: CRM API down → error message, not wrong data

### T-1104: Enforce consistent consent gating across all widgets [2 SP]

- [ ] Read all 10 widgets — check which require consent and which don't
- [ ] Current state: BriefingWidget requires `ai_email_processing`, TrendChartsWidget requires `email_analytics`
- [ ] But UnreadEmailsWidget, PriorityInboxWidget show email data WITHOUT consent check
- [ ] Rule: widgets that show email CONTENT need `ai_email_processing` consent
- [ ] Rule: widgets that show email COUNTS only do NOT need consent
- [ ] Apply consent check consistently:
  - Counts only (no consent): UnreadEmails badge, TodayEvents count
  - Email content (consent required): AiTriageWidget, BriefingWidget, FollowUpWidget
  - Analytics (consent required): TrendChartsWidget
- [ ] Test: without consent → content widgets show "Enable AI processing" prompt

### T-1105: Remove duplicate dashboard stats query [2 SP]

- [ ] Read `useDashboardStats()` in `use-dashboard.ts`
- [ ] After T-1001 (S10), dashboard counts come from unified source
- [ ] Remove `useDashboardStats()` if it's now fully replaced by `useUnifiedEmailCounts()`
- [ ] Clean up `dashboard-keys.ts` — remove unused query keys
- [ ] Verify no other component depends on `useDashboardStats()`
- [ ] Test: no duplicate email count queries in network tab

## Dependencies

- S10 (triage as source of truth established)

## Risks

- R1: Removing InsightsWidget may remove genuinely useful predictions
- Mitigation: Move unique content into BriefingWidget expandable section
- R2: Removing AI deadlines may reduce widget usefulness
- Mitigation: Users who want AI deadline extraction can use AI chat directly

## Definition of Done

- [ ] PredictiveInsightsWidget removed, unique data moved to BriefingWidget
- [ ] DeadlinesWidget shows only calendar events
- [ ] StaleContactsWidget uses CRM only (no fallback)
- [ ] Consent gating consistent across all widgets
- [ ] No duplicate email count queries
- [ ] Widget count reduced from 10 to 8 (removed: priority, insights)
- [ ] `npx tsc --noEmit` passes (frontend)
- [ ] All translations updated
