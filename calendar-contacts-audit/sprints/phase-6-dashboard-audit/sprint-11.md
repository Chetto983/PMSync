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

- [x] Read `BriefingWidget.tsx` — shows urgent emails, deadlines, follow-ups, stale contacts ✅ DONE
- [x] Read `PredictiveInsightsWidget.tsx` — aggregates useBriefing, useDeadlines, useFollowUps, useStaleContacts ✅ DONE
- [x] These two widgets show overlapping data with different presentations ✅ DONE
- [x] Decision: keep BriefingWidget (AI summary = unique value), remove PredictiveInsightsWidget ✅ DONE
- [x] Move any unique insights from PredictiveInsightsWidget into BriefingWidget as expandable section ✅ DONE (BriefingWidget already had same data via chips)
- [x] Remove `insights` widget ID from `widget-registry.ts` ✅ DONE
- [x] Update `CustomizeDrawer.tsx` ✅ DONE (driven by WIDGETS array, auto-updated)
- [x] Remove unused query hooks if no other consumer exists ✅ DONE (hooks still used by dedicated widgets)
- [x] Test: BriefingWidget shows all data that InsightsWidget had ✅ DONE

### T-1102: Fix DeadlinesWidget — calendar only, no AI guessing [2 SP]

- [x] Read `DeadlinesWidget.tsx` — primary: aiChatApi.getUpcomingDeadlines(), fallback: calendarApi ✅ DONE
- [x] Calendar events with deadlines are facts. AI-extracted deadlines from emails are guesses. ✅ DONE
- [x] Remove AI deadline extraction as primary source ✅ DONE
- [x] Use ONLY `calendarApi.listEvents()` with filter for events that have deadline semantics ✅ DONE
- [x] If no calendar events: show empty state "No upcoming deadlines" (not AI-guessed ones) ✅ DONE
- [x] Remove `aiChatApi.getUpcomingDeadlines()` call from this widget ✅ DONE
- [x] Test: widget shows only real calendar events, not hallucinated deadlines ✅ DONE

### T-1103: Fix StaleContactsWidget — CRM only, remove fallback [2 SP]

- [x] Read `StaleContactsWidget.tsx` — primary: crmApi.getStaleContacts(), fallback: contactsApi ✅ DONE
- [x] CRM relationship scoring is authoritative. Manual calculation from contactsApi is a different algorithm. ✅ DONE
- [x] Remove `contactsApi.listContacts()` fallback ✅ DONE
- [x] If CRM API fails: show error state, not a different number from a different algorithm ✅ DONE
- [x] Test: CRM API down → error message, not wrong data ✅ DONE

### T-1104: Enforce consistent consent gating across all widgets [2 SP]

- [x] Read all 8 widgets — check which require consent and which don't ✅ DONE
- [x] Current state: BriefingWidget requires `ai_email_processing`, others don't ✅ DONE
- [x] PriorityInboxWidget already removed in S10 ✅ DONE
- [x] Rule: widgets that show email CONTENT need `ai_email_processing` consent ✅ DONE
- [x] Rule: widgets that show email COUNTS only do NOT need consent ✅ DONE
- [x] Apply consent check consistently: ✅ DONE
  - Counts only (no consent): UnreadEmails badge, TodayEvents count
  - Email content (consent required): AiTriageWidget, BriefingWidget, FollowUpWidget
  - Analytics (consent required): TrendChartsWidget
- [x] Test: without consent → content widgets show "Enable AI processing" prompt ✅ DONE

### T-1105: Remove duplicate dashboard stats query [2 SP]

- [x] Read `useDashboardStats()` in `use-dashboard.ts` ✅ DONE (already removed in S10)
- [x] After T-1001 (S10), dashboard counts come from unified source ✅ DONE
- [x] Remove `useDashboardStats()` if it's now fully replaced by `useUnifiedEmailCounts()` ✅ Already removed in S10
- [x] Clean up `dashboard-keys.ts` — remove unused query keys ✅ Already clean
- [x] Verify no other component depends on `useDashboardStats()` ✅ Confirmed: 0 references
- [x] Test: no duplicate email count queries in network tab ✅ DONE

## Dependencies

- S10 (triage as source of truth established)

## Risks

- R1: Removing InsightsWidget may remove genuinely useful predictions
- Mitigation: Move unique content into BriefingWidget expandable section
- R2: Removing AI deadlines may reduce widget usefulness
- Mitigation: Users who want AI deadline extraction can use AI chat directly

## Definition of Done

- [x] PredictiveInsightsWidget removed, unique data moved to BriefingWidget ✅
- [x] DeadlinesWidget shows only calendar events ✅
- [x] StaleContactsWidget uses CRM only (no fallback) ✅
- [x] Consent gating consistent across all widgets ✅
- [x] No duplicate email count queries ✅
- [x] Widget count reduced from 10 to 8 (removed: priority, insights) ✅
- [x] `npx tsc --noEmit` passes (frontend) ✅
- [x] All translations updated ✅
