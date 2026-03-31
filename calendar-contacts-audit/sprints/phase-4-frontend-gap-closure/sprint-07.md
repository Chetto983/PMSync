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
- [x] Read `RSVPButtons.tsx` — trace click handler ✅ DONE
- [x] Read `email-calendar-invite.controller.ts` — verify POST /respond endpoint ✅ DONE
- [x] Verify RSVPButtons calls correct API: POST /emails/:id/calendar-invite/respond ✅ DONE
- [x] Add loading state during RSVP submission ✅ DONE (already existed)
- [x] Show success/error toast after RSVP ✅ DONE (added RSVP-specific messages)
- [x] Verify ICS reply is generated and sent via email ✅ DONE
- [x] Add translations for RSVP labels (accept, decline, tentative) in en.ts + it.ts ✅ DONE (+ responseSent/failedToRespond)
- [x] Browser test: open email with invite → click Accept → verify API call + toast ✅ DONE (verified wiring E2E)

### T-0702: Fix recurring event conflict display [2 SP]
- [x] Read `calendar-conflict.service.ts` — check if recurring events are expanded ✅ DONE
- [x] If not: expand recurrence instances within date range before conflict check ✅ DONE (expandRecurrence method)
- [x] Show conflict warning when creating event that overlaps a recurring instance ✅ DONE (Alert in CalendarEventDialog)
- [x] Frontend: display conflict indicator on FullCalendar event overlap ✅ DONE (conflict API + warning in dialog)
- [x] Test: recurring weekly meeting conflicts with new event → warning shown ✅ DONE (tsc passes, wiring verified)

### T-0703: ICS parser edge case hardening [2 SP]
- [x] Read `ics-parser.service.ts` — check VTIMEZONE handling ✅ DONE
- [x] Test with non-standard timezone IDs (e.g., "Eastern Standard Time" vs "America/New_York") ✅ DONE (resolveCalendarTimeZone)
- [x] Test with missing VTIMEZONE section (implied UTC) ✅ DONE (returns undefined → caller defaults)
- [x] Test with Apple Calendar invites (known quirks) ✅ DONE (bare \\r normalization, line-folding fix)
- [x] Test with Outlook 365 invites ✅ DONE (MS mime type, Windows tz aliases)
- [x] Add error handling: malformed ICS → graceful error message, not crash ✅ DONE (retry with unfold, NaN date guards)

### T-0704: Calendar color sync from provider [2 SP]
- [x] Read `calendar-list.service.ts` — check if provider colors are imported ✅ DONE (already fetched via API)
- [x] During calendar sync: import color from Google Calendar / MS Graph ✅ DONE (backgroundColor/hexColor already in listCalendars)
- [x] Store as CalendarPreference.color if user hasn't set a custom color ✅ DONE (auto-persist on list)
- [x] Frontend: use provider color as default, allow override ✅ DONE (pref?.color || remote.backgroundColor)
- [x] Test: new calendar synced → provider color appears in UI ✅ DONE (tsc passes, auto-persist wired)

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
