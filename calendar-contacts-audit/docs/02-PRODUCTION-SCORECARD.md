# Calendar & Contacts Audit — Production Scorecard

**Last updated:** 2026-03-30 (initial baseline)
**Target:** >= 9.0/10 across all categories

## Scorecard

| # | Category | Score | Status | Notes |
|---|----------|-------|--------|-------|
| 1 | Calendar CRUD (create/read/update/delete events) | ?/10 | Not tested | Pending S01 |
| 2 | Calendar Sync (Google + Microsoft incremental) | ?/10 | Not tested | Pending S02 |
| 3 | Calendar Webhooks (push notifications, renewal) | ?/10 | Not tested | Pending S02 |
| 4 | Calendar Invites (ICS parse/generate, RSVP) | ?/10 | Not tested | Pending S01 |
| 5 | Contacts CRUD (create/read/update/delete, VIP) | ?/10 | Not tested | Pending S03 |
| 6 | Contacts Sync (Google + Microsoft delta) | ?/10 | Not tested | Pending S04 |
| 7 | Contacts Import (vCard, email extraction) | ?/10 | Not tested | Pending S04 |
| 8 | Contacts Deduplication & Merge | ?/10 | Not tested | Pending S09 |
| 9 | Frontend Calendar (FullCalendar, dialogs, RSVP) | ?/10 | Not tested | Pending S07 |
| 10 | Frontend Contacts (list, detail, import, filters) | ?/10 | Not tested | Pending S08 |
| 11 | Provider Token Management (refresh, expiry, fallback) | ?/10 | Not tested | Pending S05-S06 |
| 12 | Data Consistency (no orphans, correct relations) | ?/10 | Not tested | Pending S11 |
| 13 | Reminders (CRUD, complete, filter) | ?/10 | Not tested | Pending S03 |
| 14 | Legacy Cleanup (dead code removed, CRM wired) | ?/10 | Not tested | Pending S10 |

**Overall: ?/10**

## Scoring Criteria

| Score | Meaning |
|-------|---------|
| 10/10 | Perfect — all edge cases handled, tested, production-validated |
| 9/10 | Excellent — minor polish items remaining, no bugs |
| 8/10 | Good — works correctly, some edge cases not covered |
| 7/10 | Acceptable — core flow works, known gaps exist |
| 6/10 | Needs work — some features broken or missing |
| <6/10 | Failing — critical issues, not production-ready |

## Validation Commands

```bash
# Backend type-check
cd backend && npx tsc --noEmit

# Frontend type-check
cd frontend && npx tsc --noEmit

# Backend tests (calendar + contacts)
cd backend && npx jest --testPathPattern="calendar|contacts|reminder" --no-coverage

# Production health
curl -s https://backend-production-78e1.up.railway.app/health

# Calendar endpoints
curl -s https://backend-production-78e1.up.railway.app/api/v1/calendar/calendars
curl -s https://backend-production-78e1.up.railway.app/api/v1/calendar/events

# Contact endpoints
curl -s https://backend-production-78e1.up.railway.app/api/v1/contacts
curl -s https://backend-production-78e1.up.railway.app/api/v1/contacts/counts
```
