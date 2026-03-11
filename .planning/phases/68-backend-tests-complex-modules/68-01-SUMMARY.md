---
phase: 68-backend-tests-complex-modules
plan: "01"
subsystem: calendar-tests
tags: [tests, calendar, ics-parser, conflict-detection, google-calendar-sync, webhook, bullmq-worker]
dependency_graph:
  requires: [68-00, phase-66-test-infrastructure, phase-67-backend-tests-simple-modules]
  provides: [BTEST-01-calendar-tests]
  affects: [68-02, 68-03, 68-04]
tech_stack:
  added: []
  patterns:
    - direct-service-instantiation-no-nestjs-di
    - jest-spyon-protected-methods
    - targeted-per-factory-cleanup-no-global-truncate
    - bullmq-worker-protected-processJob-via-any-cast
key_files:
  created:
    - backend/src/modules/calendar/services/__tests__/ics-parser.service.spec.ts
    - backend/src/modules/calendar/services/__tests__/calendar-conflict.service.spec.ts
    - backend/src/modules/calendar/services/__tests__/google-calendar-sync.service.spec.ts
    - backend/src/modules/calendar/services/__tests__/google-calendar-webhook.service.spec.ts
    - backend/src/modules/calendar/workers/__tests__/calendar-sync.worker.spec.ts
  modified:
    - backend/test/helpers/cleanup.ts
    - backend/test/helpers/factories.ts
decisions:
  - "Remove cleanupTestData() from calendar spec afterAll blocks — targeted cleanup only prevents FK violations in parallel Jest runs"
  - "Use jest.spyOn on protected fetchCalendarList/fetchEvents to avoid real Google API calls in sync service tests"
  - "IcsParserService returns single ParsedCalendarInvite (not expanded recurrences) — tests assert recurrence[] array content not event count"
  - "withoutTenantScopingAsync requires no mocking — passes through callbacks transparently in test context"
metrics:
  duration: 41min
  completed_date: "2026-03-11"
  tasks_completed: 3
  files_created: 5
  files_modified: 2
---

# Phase 68 Plan 01: Calendar Module Tests Summary

Five spec files covering calendar module services and the CalendarSyncWorker BullMQ worker — ICS parsing, conflict detection, Google Calendar sync, webhook routing, and worker processJob delegation.

## Completed Tasks

| Task | Description | Commit | Tests |
|------|-------------|--------|-------|
| 1 | IcsParserService + CalendarConflictService tests | 81837763 | 12 + 4 = 16 |
| 2 | GoogleCalendarSyncService + GoogleCalendarWebhookService tests | 80e6ee1d | 3 + 5 = 8 |
| 3 | CalendarSyncWorker processJob() tests + parallel cleanup fix | 15029fa9 | 6 |

**Total: 30 tests, 5 suites, all passing**

## Test Coverage

### ics-parser.service.spec.ts (12 tests — pure unit)
- DAILY, WEEKLY, MONTHLY, YEARLY RRULE parsing — verifies `recurrence[]` contains correct FREQ string
- All-day event: `isAllDay=true`, `startTime` is `Date` instance
- DST transition (America/New_York, 2026-03-08): timezone extracted correctly
- UTC offset (`DTSTART:YYYYMMDDTHHMMSSZ`): parsed to ISO UTC date
- Empty string and garbage input: returns `null` gracefully
- `isValidIcs` helper: true for valid, false for empty/incomplete

### calendar-conflict.service.spec.ts (4 tests — integration)
- Hard conflict: eventB fully inside eventA → severity='hard'
- Soft conflict: partial time overlap → severity='soft'
- No conflict: back-to-back events (A ends exactly when B starts) → conflicts=[]
- Cross-tenant isolation: tenant B events invisible to tenant A's detectConflicts

### google-calendar-sync.service.spec.ts (3 tests — integration)
- Success with events: fetchCalendarList + fetchEvents spied via jest.spyOn on protected methods; emitSyncStatus called once after sync
- No changes: 0 events returned; emitSyncStatus NOT called
- Token error: getProviderWithToken rejects → error propagates

### google-calendar-webhook.service.spec.ts (5 tests — integration)
- Valid channelId + resource-state=exists: addSyncJob called with correct tenantId/providerId
- Valid channelId + resource-state=sync: addSyncJob called (handshake)
- Unknown channelId: addSyncJob NOT called
- Non-calendar resourcePath: addSyncJob NOT called (path filter working)
- Missing headers: returns undefined without error

### calendar-sync.worker.spec.ts (6 tests — integration)
- Google provider: syncCalendar called with providerId; lastSyncedAt updated in DB
- Microsoft provider: microsoftCalendarSync called (not google)
- Unknown provider type (caldav): throws "Unsupported provider type"
- Non-existent provider: throws "not found"
- Last retry attempt (attemptsMade = MAX_ATTEMPTS-1): dlqService.addToDeadLetter called; alertingService.createAlert called
- Non-last attempt: dlqService NOT called

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Parallel TRUNCATE race condition causing FK violations**
- **Found during:** Task 3 verification (running all 5 specs in parallel)
- **Issue:** Phase 67 pattern calls `cleanupTestData()` (global TRUNCATE CASCADE) in each spec's `afterAll`. When 5 specs run in parallel, one spec's TRUNCATE deletes tenant rows that another spec's test is actively inserting — causing P2003 FK violation.
- **Fix:** Removed `cleanupTestData()` from calendar spec afterAll blocks. Retained targeted cleanup only (`prisma.calendarEvent.deleteMany`, `prisma.providerConfig.deleteMany`, etc.). Added comment explaining rationale.
- **Files modified:** calendar-conflict.service.spec.ts, google-calendar-sync.service.spec.ts, google-calendar-webhook.service.spec.ts, calendar-sync.worker.spec.ts
- **Commit:** 15029fa9

**2. [Rule 1 - Correction] IcsParserService.parseIcs() returns single ParsedCalendarInvite, not expanded array**
- **Found during:** Task 1 research
- **Issue:** Plan description said "DAILY recurring: 5-occurrence DAILY RRULE expands to 5 events" — but the service extracts a single invite with `recurrence[]` field, not expanded events.
- **Fix:** Tests assert on `recurrence` string array content (contains FREQ=DAILY etc.) rather than event count. This is the correct behavior — expansion happens downstream, not in IcsParserService.
- **Impact:** No code change; test assertions adjusted to match actual service contract.

### Infrastructure Extensions

**factories.ts** — Already extended by previous agent (Phase 67/68 preparation) with:
- `createTestCalendarEvent(tenantId, providerId, overrides)`
- `createTestProviderAccount(tenantId, userId, overrides)`
- `createTestContact(tenantId, overrides)`
- `createTestSubscription(tenantId, overrides)`

**cleanup.ts** — Extended TRUNCATE list with 8 new tables:
- `calendar_event_attachments`, `calendar_events`, `calendar_sync_states`, `calendar_preferences`
- `webhook_subscriptions`, `unified_contacts`, `provider_contacts`, `provider_configs`, `subscriptions`

## Self-Check: PASSED

All 5 spec files confirmed on disk. All 3 task commits confirmed in git log.
- 81837763: IcsParserService + CalendarConflictService tests
- 80e6ee1d: GoogleCalendarSyncService + GoogleCalendarWebhookService tests
- 15029fa9: CalendarSyncWorker tests + parallel cleanup fix
