# Calendar Module Audit Findings

Scope: backend/src/modules/calendar

## Summary
- Calendar creation is not persisted and can produce phantom calendars.
- Microsoft calendar IDs are inconsistent (defaulting to "primary" and ignoring calendarId in create).
- Webhook validation for Microsoft breaks after service restart due to non-stable clientState.
- Sync logic misses deletions in empty full-sync responses and allows duplicate jobs across priorities.
- Provider CRUD paths are duplicated and diverge from sync + token refresh logic.

## Critical Bugs
1) Create calendar does not persist
   - Impact: Newly created calendars disappear because list is derived from events/preferences.
   - Evidence: backend/src/modules/calendar/services/calendar-list.service.ts createCalendar emits realtime only.

2) Microsoft calendar ID mismatch
   - Impact: Events may be created under a non-existent "primary" calendar for Microsoft.
   - Evidence: backend/src/modules/calendar/services/calendar-events.service.ts default calendarId to "primary".
   - Evidence: backend/src/modules/calendar/services/calendar-events.service.ts createMicrosoftEvent posts to /me/events without calendarId.
   - Evidence: backend/src/modules/calendar/services/calendar-list.service.ts injects a synthetic "primary" calendar.

3) Microsoft webhook clientState not stable across restarts
   - Impact: Notifications are dropped after restart until subscriptions are recreated.
   - Evidence: backend/src/modules/calendar/services/microsoft-calendar-webhook.service.ts generates clientState with nanoid on init.

## Medium Risks
1) Full sync with zero events does not delete stale events
   - Impact: Deleted events remain in DB if provider returns empty list.
   - Evidence: backend/src/modules/calendar/services/abstract-calendar-sync.service.ts returns early when events length is 0.

2) Calendar sync job dedupe only within a single queue
   - Impact: Same provider can be queued in multiple priorities and processed multiple times.
   - Evidence: backend/src/modules/calendar/services/calendar-sync-queue.service.ts checks only the selected queue.

3) Sync worker trusts jobData.providerType
   - Impact: Malformed job data can route to wrong provider sync.
   - Evidence: backend/src/modules/calendar/workers/calendar-sync.worker.ts uses jobData.providerType instead of DB value.

4) Recurrence persistence is incomplete
   - Impact: Recurrence rules are not saved on create/update in CalendarEventsService.
   - Evidence: backend/src/modules/calendar/services/calendar-events.service.ts sets recurrence to [] and never updates it.

5) ICS parser endTime fallback can be wrong
   - Impact: If DTEND is missing, endTime becomes "now" instead of startTime.
   - Evidence: backend/src/modules/calendar/services/ics-parser.service.ts parseDate returns new Date() when input is undefined.

## Duplicate Code / Design Drift
- Two CRUD paths with different behavior:
  - backend/src/modules/calendar/services/calendar-events.service.ts uses provider APIs + DB.
  - backend/src/modules/calendar/providers/base-calendar.provider.ts writes only to DB.
- Two calendar creation patterns:
  - backend/src/modules/calendar/services/calendar-list.service.ts emits realtime only.
  - backend/src/modules/calendar/providers/base-calendar.provider.ts creates placeholder events.
- Token refresh duplicated:
  - backend/src/modules/calendar/services/calendar-events.service.ts has its own refresh logic.
  - backend/src/modules/email-sync/services/provider-token.service.ts already provides centralized refresh with locking.
- CalendarProviderFactory appears unused and uses string tokens; BaseCalendarProvider uses config.userId as tenantId, which is likely incorrect.

## Remediation Roadmap
### Phase 0 - Hotfixes (1 to 3 days)
- Persist calendar creation:
  - Option A: call provider API to create calendar and store metadata.
  - Option B: create a calendar record (new table) and use preferences for naming/color.
- Microsoft calendar handling:
  - Stop defaulting calendarId to "primary" for Microsoft.
  - Create events in /me/calendars/{calendarId}/events when calendarId is provided.
  - Remove synthetic "primary" calendar for Microsoft.
- Webhook clientState:
  - Persist per-subscription clientState (DB) or set via env config.
  - Validate per subscription record instead of a single process-level value.
- Sync correctness:
  - Handle full sync empty responses by deleting stale events.
  - Deduplicate across all priority queues using a shared lock or global lookup.
  - Validate providerType from DB in worker.
- Recurrence:
  - Persist recurrence on create/update paths.
- ICS:
  - If DTEND is missing, set endTime = startTime for non-duration events.

### Phase 1 - Calendar Data Model (1 to 2 weeks)
- Introduce a Calendar table with providerId, calendarId, name, color, isPrimary, visibility.
- Backfill from existing events and CalendarPreference.
- Update list and filters to use Calendar table instead of event aggregation.
- Remove placeholder-event approach in providers.

### Phase 2 - Consolidate Provider Paths (1 to 2 weeks)
- Choose one provider integration path (services vs providers).
- Remove CalendarProviderFactory if unused or wire it through controllers/services.
- Centralize token refresh via ProviderTokenService and remove local refresh logic.

### Phase 3 - Reliability and Tests (ongoing)
- Tests:
  - Full sync deletes stale events when provider returns empty response.
  - Recurrence persistence on create/update.
  - Webhook validation across restarts.
  - Sync job dedupe across priorities.
- Real provider scripts:
  - Run Google and Microsoft calendar sync scripts after fixes.

## Testing Status
- Not run (audit only).
