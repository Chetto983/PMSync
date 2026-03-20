---
phase: 91-calendar-contacts-reminders-verification
verified: 2026-03-20T16:00:00Z
status: gaps_found
score: 29/31 must-haves verified
gaps:
  - truth: "RSVPButtons render Accept/Decline/Maybe with correct mutation calls"
    status: failed
    reason: "onRSVPRespond prop is never passed to CalendarEventDetail from Calendar.tsx. The RSVPButtons component only renders when this optional prop is provided — since it is always omitted, RSVPButtons never appear in the calendar UI."
    artifacts:
      - path: "frontend/components/dashboard/Calendar.tsx"
        issue: "CalendarEventDetail rendered at line 304 without onRSVPRespond prop. There is no RSVP handler in useCalendarHandlers or any dashboard/calendar/* hook."
      - path: "frontend/components/calendar/CalendarEventDetail.tsx"
        issue: "onRSVPRespond declared as optional prop (line 107); RSVPButtons only render when prop is defined (line 402). The guard ensures silent no-op when prop is absent."
    missing:
      - "Add handleRSVPRespond function in useCalendarHandlers.ts that calls calendarApi.respondToCalendarInvite (or emailsApi.respondToCalendarInvite)"
      - "Pass onRSVPRespond={handleRSVPRespond} to CalendarEventDetail in Calendar.tsx"
      - "Add a respondToCalendarInvite mutation in frontend/hooks/queries/use-calendar.ts"
  - truth: "VIP toggle works in contact detail view"
    status: partial
    reason: "VIP toggle is implemented in ContactListItem (list row), not in ContactDetail. Plan acceptance criterion explicitly requires VIP toggle logic in ContactDetail.tsx. The underlying service (POST /contacts/:id/vip) is correctly wired; only the detail-panel UI placement is missing."
    artifacts:
      - path: "frontend/components/contacts/ContactDetail.tsx"
        issue: "No VIP toggle button, icon, or handler anywhere in the component (184 lines verified). The plan's acceptance criterion 'ContactDetail.tsx contains VIP toggle logic' is unmet."
    missing:
      - "Add VIP toggle button to ContactDetail.tsx header action area, calling onToggleVip prop (or wired to useToggleVip mutation directly)"
---

# Phase 91: Calendar, Contacts & Reminders Verification

**Phase Goal:** Verify calendar, contacts, and reminders modules end-to-end — backend API contracts (auth guards, tenant isolation, role requirements) and frontend UI rendering (proper states, hook wiring, i18n).
**Verified:** 2026-03-20T16:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

#### Plan 01 — Calendar (BAPI-06, BAPI-23, FE-07)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | CalendarController has `@UseGuards(TenantGuard)` at class level | VERIFIED | calendar.controller.ts line 35 |
| 2 | Every CalendarController method extracts `req.user.tenantId` and passes it to service calls | VERIFIED | 14 distinct tenantId assignments confirmed (lines 59, 82, 106, 121, 135, 155, 174, 186, 210, 224, 242, 256, 271, 299) |
| 3 | Calendar events CRUD endpoints delegate to CalendarService with tenantId | VERIFIED | list/get/create/update/delete all call `calendarService.<method>(tenantId, ...)` |
| 4 | Calendar sync endpoint delegates with tenantId and providerId | VERIFIED | calendar.controller.ts lines 271–287; provider.tenantId check guards against cross-tenant access |
| 5 | Conflict detection and focus-time endpoints delegate with tenantId | VERIFIED | lines 59–67 (conflicts), 82–89 (focus-time) |
| 6 | EmailCalendarInviteController has `@UseGuards(TenantGuard, RolesGuard)` at class level | VERIFIED | email-calendar-invite.controller.ts line 25 |
| 7 | Invite RSVP respond endpoint passes correct CalendarResponseType to IcsGeneratorService | VERIFIED | line 79–82: responseMap maps accept/decline/tentative to ACCEPTED/DECLINED/TENTATIVE |
| 8 | Invite send endpoint constructs ICS attachment and delegates to EmailSendService | VERIFIED | lines 160, 161: icsGenerator.generateRequest + EmailSendService delegation |
| 9 | Calendar frontend renders FullCalendar with day/week/month/list views | VERIFIED | Calendar.tsx: FullCalendar lazy-loaded with dayGrid/timeGrid/list/interaction plugins; loading Skeleton + CircularProgress |
| 10 | CalendarEventDialog opens on date click and submits create/edit form | VERIFIED | handleDateSelect → setEventDialogOpen(true) wired via useCalendarHandlers; dialog prop chain intact |
| 11 | RSVPButtons render Accept/Decline/Maybe with correct mutation calls | **FAILED** | `onRSVPRespond` never passed to CalendarEventDetail in Calendar.tsx (line 304–321); RSVPButtons conditionally rendered at CalendarEventDetail.tsx line 402 behind a guard that evaluates false always |
| 12 | Existing calendar backend spec files pass without modifications | UNCERTAIN | SUMMARY claims pass via Playwright automation; cannot re-run specs in this environment |

#### Plan 02 — Contacts (BAPI-07, FE-08)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 13 | ContactsController has `@UseGuards(TenantGuard, RolesGuard)` at class level | VERIFIED | contacts.controller.ts line 43 |
| 14 | Every ContactsController method extracts `req.user.tenantId` | VERIFIED | 20 tenantId extractions confirmed |
| 15 | Mutation endpoints (POST/PATCH/DELETE) have `@Roles` decorator | VERIFIED | 11 `@Roles` decorators present on all mutation endpoints |
| 16 | List/get endpoints open to all authenticated users (no `@Roles`) | VERIFIED | `@Get()`, `@Get(':id')`, counts, stale, vip/list, relationship-scores have no `@Roles` |
| 17 | VIP toggle endpoint delegates to contactsService with tenantId | VERIFIED | contacts.controller.ts lines 270–271: `contactsService.toggleVip(tenantId, contactId)` |
| 18 | vCard import endpoint handles file upload via FileInterceptor | VERIFIED | FileInterceptor imported (line 19); `@UseInterceptors(FileInterceptor('file'))` on import endpoint |
| 19 | Contacts frontend renders three-panel layout (sidebar, list, detail) | VERIFIED | Contacts.tsx uses ContactLayout + ContactList + ContactSidebar + ContactDetail |
| 20 | Contact create/edit dialog submits via TanStack Query mutation hooks | VERIFIED | ContactDialogs.tsx wired through useContactForm and useContactsPageHandlers |
| 21 | VIP toggle works in contact detail view | **PARTIAL** | VIP toggle is in ContactListItem (list row star icon, line 233–235) NOT in ContactDetail.tsx. Plan acceptance criterion: "ContactDetail.tsx contains VIP toggle logic" — unmet. |
| 22 | Bulk delete action bar renders on multi-select | VERIFIED | ContactBulkActionBar.tsx has delete action (line 124–136); wired in Contacts.tsx |
| 23 | Existing contacts backend spec files pass without modifications | UNCERTAIN | SUMMARY claims pass; cannot re-run specs |

#### Plan 03 — Reminders (BAPI-12, FE-14)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 24 | ReminderController has `@UseGuards(TenantGuard, RolesGuard)` at class level | VERIFIED | reminder.controller.ts line 27 |
| 25 | Every ReminderController method extracts `req.user.tenantId` | VERIFIED | All 6 endpoints (create, list, get, update, complete, delete) use `req.user.tenantId` and pass to service |
| 26 | createReminder delegates to reminderService(tenantId, userId, dto) | VERIFIED | reminder.controller.ts lines 35–37: `reminderService.createReminder(req.user.tenantId, req.user.id, dto)` |
| 27 | List reminders supports status/priorita/periodo query filters | VERIFIED | reminder.controller.ts lines 50–56: `@ApiQuery` for status (ReminderStatus enum), priorita, periodo, page, limit |
| 28 | Complete endpoint delegates to reminderService | VERIFIED | lines 98–100: `reminderService.completeReminder(tenantId, userId, id)` |
| 29 | Delete endpoint soft-deletes by setting status to annullato | VERIFIED | reminder.service.ts line 186: `data: { status: 'annullato' }`; `prisma.reminder.delete` is NOT used |
| 30 | RemindersBoard renders status filter chips (all/attivo/completato/annullato) | VERIFIED | RemindersBoard.tsx line 18: `STATUS_FILTERS = ['all', 'attivo', 'completato', 'annullato']`; Chip map at lines 47–56 |
| 31 | ReminderCard renders with title, priority badge, complete/delete actions | VERIFIED | ReminderCard.tsx: `reminder.titolo` display, prioritaColor() mapping (alta=error, media=warning, bassa=success), complete IconButton, delete IconButton |
| 32 | ReminderCreateDialog submits natural language text for AI parsing | VERIFIED | ReminderCreateDialog.tsx: TextField for `inputUtente`, `useCreateReminder()` mutation, submits `{ inputUtente }` |
| 33 | Reminders frontend handles loading, error, and empty states | VERIFIED | RemindersBoard.tsx: Skeleton (loading), Alert+retry (error), empty state with `tr.noReminders` (empty) |

**Score:** 29/31 truths verified (plus 2 uncertain — spec runs)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/modules/calendar/controllers/calendar.controller.ts` | Calendar events CRUD, sync, conflicts, focus-time with TenantGuard | VERIFIED | 305 lines; @UseGuards(TenantGuard) at class level; 13+ endpoints |
| `backend/src/modules/email/controllers/email-calendar-invite.controller.ts` | Calendar invite get/respond/send/cancel | VERIFIED | @UseGuards(TenantGuard, RolesGuard); 4 endpoints with tenantId |
| `frontend/components/dashboard/Calendar.tsx` | Main calendar page with FullCalendar | VERIFIED | 324 lines; lazy FullCalendar; 3 extracted hooks wired |
| `frontend/components/calendar/CalendarHeader.tsx` | Navigation with aria-labels and Tooltips | VERIFIED | aria-label on openSidebar (line 102), previousPeriod (line 133), nextPeriod (line 149) |
| `backend/src/modules/contacts/controllers/contacts.controller.ts` | Full CRUD, bulk-delete, VIP, vCard, sync, extract | VERIFIED | @UseGuards(TenantGuard, RolesGuard); 18+ endpoints |
| `frontend/components/dashboard/Contacts.tsx` | Main contacts page with three-panel layout | VERIFIED | useContactsPageData + useContactsPageHandlers + ContactLayout |
| `frontend/components/contacts/ContactList.tsx` | Contact list with search, scroll, selection | VERIFIED | exists; onToggleVip wired |
| `backend/src/modules/reminder/controllers/reminder.controller.ts` | Reminders CRUD + complete | VERIFIED | @UseGuards(TenantGuard, RolesGuard); 6 endpoints |
| `frontend/components/reminders/RemindersBoard.tsx` | Reminders page with status filter chips | VERIFIED | STATUS_FILTERS, loading/error/empty states, useReminders hook |
| `frontend/components/reminders/ReminderCard.tsx` | Individual reminder card with actions | VERIFIED | title, priority badge (error/warning/success), complete + delete actions |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| calendar.controller.ts | calendar.service.ts | CalendarService injection | WIRED | `calendarService.` called 10 times |
| email-calendar-invite.controller.ts | ics-generator.service.ts | IcsGeneratorService injection | WIRED | `icsGenerator.` called at lines 82, 160, 209 |
| frontend/components/dashboard/Calendar.tsx | frontend/hooks/queries/use-calendar.ts | useCalendarData hook | WIRED | useCalendarData imports from calendar hooks; data.storeEvents/filteredEvents used |
| contacts.controller.ts | contacts.service.ts | ContactsService injection | WIRED | `contactsService.` called 15+ times |
| frontend/components/dashboard/Contacts.tsx | frontend/hooks/queries/use-contacts.ts | useContactsPageData hook | WIRED | useContactsPageData wraps use-contacts queries; imported at line 17 |
| frontend/components/dashboard/Contacts.tsx | useContactsPageHandlers.ts | Handler hooks for CRUD | WIRED | useContactsPageHandlers imported and called at line 31 |
| reminder.controller.ts | reminder.service.ts | ReminderService injection | WIRED | `reminderService.` called on all 6 endpoint methods |
| frontend/components/reminders/RemindersBoard.tsx | frontend/hooks/queries/use-reminders.ts | useReminders TanStack Query hook | WIRED | useReminders, useCompleteReminder, useDeleteReminder imported and called at lines 27–29 |
| Calendar.tsx | CalendarEventDetail.tsx | onRSVPRespond prop | **NOT WIRED** | CalendarEventDetail rendered without onRSVPRespond; RSVPButtons never shown |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BAPI-06 | 91-01 | Calendar operations (list, CRUD events, sync, conflicts, focus-time, meeting-prep) | SATISFIED | All 13 CalendarController endpoints verified with tenantId |
| BAPI-23 | 91-01 | Calendar invite operations (get, respond, send, cancel) | SATISFIED | EmailCalendarInviteController 4 endpoints verified; ICS generation wired |
| FE-07 | 91-01 | Calendar view renders; create/edit/delete works; RSVP functions | PARTIAL | FullCalendar renders, event CRUD works; RSVP buttons never render (onRSVPRespond not wired) |
| BAPI-07 | 91-02 | Contact operations (list, create, update, delete, bulk-delete, VIP, vCard, sync, extract) | SATISFIED | All 18+ endpoints verified; all backend API contracts met |
| FE-08 | 91-02 | Contacts list loads; create/edit/delete works; VIP toggle; import vCard | PARTIAL | Three-panel layout works, CRUD works; VIP toggle in list not detail panel; no vCard import UI (accepted known gap) |
| BAPI-12 | 91-03 | Reminders (create, list, get, update, complete, delete) | SATISFIED | All 6 endpoints verified; soft-delete, Italian field names, tenant isolation confirmed |
| FE-14 | 91-03 | Reminders page works (list, create, complete, delete, board view) | SATISFIED | RemindersBoard with filter chips, ReminderCard, ReminderCreateDialog all verified and wired |

No orphaned requirements found — all 7 IDs declared across plans map to REQUIREMENTS.md entries.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `frontend/components/dashboard/Calendar.tsx` | 304–321 | `onRSVPRespond` prop omitted from CalendarEventDetail | Blocker | RSVPButtons never render in the calendar UI; RSVP for calendar invites silently broken |
| `frontend/components/contacts/ContactDetail.tsx` | 146–151 | Hardcoded Italian string: "Aggiungi un indirizzo email al contatto per inviare un messaggio." | Warning | i18n violation — one hardcoded Italian string in an otherwise i18n-clean component |
| `91-01-SUMMARY.md` | — | Incorrect commit hash: claims CalendarHeader fix was `fca70f28` but that commit is "fix(email): invalidate label counts" | Info | Documentation inaccuracy; actual fix is at commit `f4091610` (feat(calendar): align UI/UX). No code impact — the aria-labels ARE present in CalendarHeader.tsx. |

---

## Human Verification Required

### 1. Calendar backend specs

**Test:** Run `cd backend && npx jest --testPathPattern="calendar" --no-coverage --forceExit`
**Expected:** All calendar specs exit 0 with no failures
**Why human:** Test runner not available in verification environment; SUMMARY claims passing but commit hash discrepancy warrants independent confirmation

### 2. Contacts backend specs

**Test:** Run `cd backend && npx jest --testPathPattern="contacts" --no-coverage --forceExit`
**Expected:** All contacts specs exit 0
**Why human:** Same as above — cannot run specs in this verification environment

### 3. RSVPButtons absence in browser

**Test:** Open an email with a calendar invite; open its detail view in the calendar; confirm whether Accept/Decline/Maybe buttons appear
**Expected:** Because `onRSVPRespond` is never wired, RSVPButtons should be absent — confirming the gap
**Why human:** Browser state required; depends on having a calendar invite email in the test account

---

## Gaps Summary

Two gaps block full goal achievement:

**Gap 1 (Blocker): RSVPButtons never render.** `CalendarEventDetail` conditionally shows `RSVPButtons` only when the `onRSVPRespond` prop is defined. In `Calendar.tsx`, `CalendarEventDetail` is rendered without this prop — it is never passed. No handler exists in `useCalendarHandlers.ts` or any `dashboard/calendar/*.ts` hook. The `emails.ts` API module has `respondToCalendarInvite` at line 561, but nothing calls it from the calendar UI path. This means FE-07's "RSVP functions" criterion is unmet.

**Gap 2 (Warning): VIP toggle absent from ContactDetail.** The plan's acceptance criterion states `ContactDetail.tsx` must contain VIP toggle logic. It does not. VIP toggle is implemented in `ContactListItem.tsx` (the list row), which satisfies BAPI-07 functionally, but the plan specified the detail panel. Whether this is acceptable depends on UX intent — the list-row placement works but is less discoverable than a detail-panel action.

Structured gaps in YAML frontmatter above for `/gsd:plan-phase --gaps`.

---

_Verified: 2026-03-20T16:00:00Z_
_Verifier: Claude (gsd-verifier)_
