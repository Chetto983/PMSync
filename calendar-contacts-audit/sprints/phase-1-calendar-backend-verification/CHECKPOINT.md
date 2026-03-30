# Sprint 02 — Checkpoint

## Status

- **Sprint:** 02 — Calendar Sync, Webhooks & Token Management
- **Last Task Completed:** T-0205 — Verify calendar sync on production
- **Next Task:** Sprint 03 (Contacts Backend Verification)
- **Tasks Done:** 5/5
- **SP Completed:** 15/15
- **Last Updated:** 2026-03-30 16:20

## Audit Findings Addressed

- CAL-C1: Webhook expiry auto-renewal — ✅ BullMQ repeatable job (every 6h), tested
- CAL-C2: Google sync token expiry → full sync fallback — ✅ Fixed error detection (response.status), tested
- CAL-C3: Microsoft delta token HTTP 410 — ✅ Fixed: now checks GraphError.statusCode + error codes (syncStateNotFound, resyncRequired)
- CAL-M3: Calendar sync queue DLQ monitoring — ✅ Wired to /health endpoint with threshold alerting

## Tasks Summary

| Task | SP | Status | Key Finding |
|------|----|--------|-------------|
| T-0201 | 4 | ✅ | Webhook renewal already implemented in abstract base. Added 5 tests. |
| T-0202 | 3 | ✅ | Fixed sync token error detection: GaxiosError.response.status not error.code |
| T-0203 | 3 | ✅ | Fixed MS Graph error detection: GraphError.statusCode + syncStateNotFound/resyncRequired codes |
| T-0204 | 2 | ✅ | CalendarSyncQueueService wired to HealthService. DLQ threshold via CALENDAR_SYNC_DLQ_THRESHOLD env |
| T-0205 | 3 | ✅ | Production: 5 active Google webhooks, 4 notifications in 24h, all endpoints responding |

## Last Modified Files

- backend/src/modules/calendar/services/abstract-calendar-sync.service.ts (sync token error fix)
- backend/src/modules/calendar/services/__tests__/calendar-webhook-renewal.spec.ts (NEW)
- backend/src/modules/calendar/services/__tests__/calendar-sync-token-expiry.unit.spec.ts (NEW)
- backend/src/modules/health/services/health.service.ts (DLQ monitoring)
- backend/src/modules/health/health.module.ts (CalendarModule import)
- calendar-contacts-audit/sprints/phase-1-calendar-backend-verification/sprint-02.md

## Key Decisions Made

- T-0202/T-0203 combined into single fix: abstract base now checks response.status, statusCode, AND string error codes
- DLQ monitoring uses in-process metrics (getAllMetrics()) not getJobCounts() to avoid BullMQ type complexity
- Production validation via unauthenticated endpoint checks (webhook health is public, CRUD endpoints correctly return 401)

## Blockers / Notes

- None

## Validation Status

- Backend tsc: ✅ passing
- Calendar tests: ✅ all passing (webhook renewal 5/5 + sync token expiry 5/5)
- Health tests: ✅ 6/6 passing
- Circular deps: ✅ none (madge verified)
- Production: ✅ Railway /health 200, webhook health 200 with active subscriptions
