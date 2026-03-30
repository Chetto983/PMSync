# Sprint 01 — Calendar API Endpoint Verification

| Key | Value |
|-----|-------|
| Phase | 1 — Calendar Backend Verification |
| Sprint | 01 |
| SP | 13 |
| Objective | Verify all calendar endpoints work correctly, test RSVP flow end-to-end, validate invite wiring |
| Addresses | CAL-H1, CAL-H2, CAL-H4 |

## Sprint Backlog

### T-0101: Verify CalendarController CRUD endpoints [3 SP]
- [ ] Test GET /calendar/calendars — returns provider calendars
- [ ] Test POST /calendar/events — creates event, verify in DB
- [ ] Test GET /calendar/events — list with date filters
- [ ] Test GET /calendar/events/:id — single event detail
- [ ] Test PATCH /calendar/events/:id — update event fields
- [ ] Test DELETE /calendar/events/:id — soft delete, verify removal
- [ ] Confirm all endpoints enforce tenantId isolation
- [ ] Document any failing endpoints in CHECKPOINT.md

### T-0102: Verify calendar invite flow end-to-end [3 SP]
- [ ] Test GET /emails/:id/calendar-invite — extracts invite from email attachment
- [ ] Test POST /emails/:id/calendar-invite/respond — RSVP accept/decline/tentative
- [ ] Verify ICS generation (ical-generator) produces valid iTIP reply
- [ ] Verify ICS parser handles common invite formats (Google, Outlook, Apple)
- [ ] Test POST /emails/calendar-invite/send — sends new invite
- [ ] Test POST /emails/calendar-invite/:eventId/cancel — cancels event
- [ ] Document invite wiring: email module → calendar service chain

### T-0103: Verify conflict detection and AI features [2 SP]
- [ ] Test GET /calendar/conflicts — detects overlapping events
- [ ] Test with recurring events — verify recurrence expansion in conflict check
- [ ] Test GET /calendar/focus-time — returns suggested focus blocks
- [ ] Test GET /calendar/meeting-prep/:eventId — returns AI briefing
- [ ] Verify graceful degradation when AI provider unavailable
- [ ] Verify empty calendar returns sensible defaults (not errors)

### T-0104: Test calendar preference and attachment endpoints [2 SP]
- [ ] Test PATCH /calendar/calendars/:providerId/:calendarId — update color/visibility
- [ ] Test GET /calendar/events/:eventId/attachments — list attachments
- [ ] Test GET /calendar/events/:eventId/attachments/:id — download attachment
- [ ] Verify attachment size limits (CAL-M4)
- [ ] Verify preferences are tenant-isolated

### T-0105: Write missing controller-level tests [3 SP]
- [ ] Create calendar.controller.spec.ts if missing (or verify existing)
- [ ] Create email-calendar-invite.controller.spec.ts if missing
- [ ] Test auth guards (TenantGuard) on all endpoints
- [ ] Test validation pipes on DTOs (required fields, date formats)
- [ ] Run `npx tsc --noEmit` and `npx jest --testPathPattern=calendar`

## Dependencies
- None (first sprint)

## Risks
- R1: Calendar invite endpoints in email module may have broken imports after recent refactors
- Mitigation: Trace Module > Provider > Import chain before testing

## Definition of Done
- [ ] All 20+ calendar endpoints tested and documented
- [ ] RSVP flow verified: click → API → ICS → email
- [ ] Conflict detection works with simple and recurring events
- [ ] AI features degrade gracefully when provider unavailable
- [ ] `npx tsc --noEmit` passes in backend
- [ ] Test suite passes: `npx jest --testPathPattern=calendar`
