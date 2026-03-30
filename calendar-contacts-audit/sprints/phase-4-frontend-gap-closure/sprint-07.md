# Sprint 07 — Calendar Frontend Polish & RSVP Wiring

| Key | Value |
|-----|-------|
| Phase | 4 — Frontend Gap Closure |
| Sprint | 07 |
| SP | 12 |
| Objective | Wire RSVP buttons E2E, polish calendar UI, fix recurring event conflict display |
| Addresses | CAL-H1, CAL-H3, CAL-M1, CAL-M2, CAL-L1 |

## Sprint Backlog

### T-0701: Wire RSVP buttons end-to-end [4 SP]
- [ ] Read `RSVPButtons.tsx` — trace click handler
- [ ] Read `email-calendar-invite.controller.ts` — verify POST /respond endpoint
- [ ] Verify RSVPButtons calls correct API: POST /emails/:id/calendar-invite/respond
- [ ] Add loading state during RSVP submission
- [ ] Show success/error toast after RSVP
- [ ] Verify ICS reply is generated and sent via email
- [ ] Add translations for RSVP labels (accept, decline, tentative) in en.ts + it.ts
- [ ] Browser test: open email with invite → click Accept → verify API call + toast

### T-0702: Fix recurring event conflict display [2 SP]
- [ ] Read `calendar-conflict.service.ts` — check if recurring events are expanded
- [ ] If not: expand recurrence instances within date range before conflict check
- [ ] Show conflict warning when creating event that overlaps a recurring instance
- [ ] Frontend: display conflict indicator on FullCalendar event overlap
- [ ] Test: recurring weekly meeting conflicts with new event → warning shown

### T-0703: ICS parser edge case hardening [2 SP]
- [ ] Read `ics-parser.service.ts` — check VTIMEZONE handling
- [ ] Test with non-standard timezone IDs (e.g., "Eastern Standard Time" vs "America/New_York")
- [ ] Test with missing VTIMEZONE section (implied UTC)
- [ ] Test with Apple Calendar invites (known quirks)
- [ ] Test with Outlook 365 invites
- [ ] Add error handling: malformed ICS → graceful error message, not crash

### T-0704: Calendar color sync from provider [2 SP]
- [ ] Read `calendar-list.service.ts` — check if provider colors are imported
- [ ] During calendar sync: import color from Google Calendar / MS Graph
- [ ] Store as CalendarPreference.color if user hasn't set a custom color
- [ ] Frontend: use provider color as default, allow override
- [ ] Test: new calendar synced → provider color appears in UI

### T-0705: Calendar event form DST handling [2 SP]
- [ ] Read `CalendarEventDialog.tsx` — check date/time picker timezone awareness
- [ ] Read `CalendarEventDetail.tsx` — check event display timezone
- [ ] Verify event times display correctly across timezone offsets
- [ ] Add timezone selector to event creation form (if missing)
- [ ] Test: create event in Europe/Rome timezone → displays correctly for user in US/Eastern

## Dependencies
- S01-S06 (backend verified and hardened)

## Risks
- R1: RSVP flow spans email + calendar modules — may have broken imports
- Mitigation: Trace full chain before changes
- R2: ICS parser changes may break existing working invites
- Mitigation: Test with sample invites from each provider before deploying

## Definition of Done
- [ ] RSVP buttons work E2E: click → API → ICS reply → email
- [ ] Recurring event conflicts detected and displayed
- [ ] ICS parser handles Apple, Google, Outlook invites
- [ ] Provider calendar colors imported as defaults
- [ ] Event form handles DST correctly
- [ ] `npx tsc --noEmit` passes in frontend
- [ ] Translations added for all new strings
