# Phase 91: Calendar, Contacts & Reminders Verification - Research

**Researched:** 2026-03-20
**Domain:** Calendar CRUD + invites, Contacts CRUD + sync + import, Reminders CRUD + Kanban -- backend API + frontend UI verification
**Confidence:** HIGH

## Summary

Phase 91 is a **verification and hotfix phase** covering three existing feature domains: calendar, contacts, and reminders. All three have complete backend controllers, services, Prisma models, frontend API modules, TanStack Query hooks, and React components already implemented. The goal is to audit each requirement end-to-end, identify failures, and fix them. No new features should be built.

The **calendar** domain is the most complex: it has a full CalendarController (events CRUD, sync, conflicts, focus-time, meeting-prep, attachments), plus a separate EmailCalendarInviteController (get invite details, RSVP respond, send invites, cancel events) that lives in the email module. The frontend uses FullCalendar with a rich component tree (sidebar, header, event dialog, event detail, RSVP buttons, recurrence picker, attendees picker). Calendar invite operations are tied to emails (invites extracted from email attachments).

The **contacts** domain has a ContactsController with full CRUD, bulk-delete, VIP toggle, vCard import (file upload + raw content), sync per-provider and sync-all, extract-from-emails, and lookup-by-emails. The frontend has a three-panel layout (sidebar, list, detail) with form dialogs for create/edit and delete confirmation. Notably, there is **no vCard import UI** in the contacts components -- the API exists but no frontend component exposes it. This is a gap that may need addressing.

The **reminders** domain is simpler: a ReminderController with create/list/get/update/complete/delete, all tenant-isolated. The frontend RemindersBoard renders a flat list with status filter chips, ReminderCard with complete/delete actions, and a create dialog. The success criteria mention a "Kanban view" but the current RemindersBoard is a **flat filtered list, not a Kanban board**. This is a potential gap.

**Primary recommendation:** Structure verification as three parallel audit streams (calendar, contacts, reminders) testing each API endpoint and frontend operation against the live deployment. Fix bugs inline. The Kanban view mention in FE-14 should be verified against actual requirements -- the current list view may be sufficient if "Kanban" refers to the status-filtered card layout already in place.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BAPI-06 | Calendar operations (list calendars, CRUD events, sync, conflicts, focus-time, meeting-prep) | CalendarController has all endpoints: GET /calendar/calendars, POST/GET/PATCH/DELETE /calendar/events, POST /calendar/sync/:providerId, GET /calendar/conflicts, GET /calendar/focus-time, GET /calendar/meeting-prep/:eventId. Frontend calendarApi module + TanStack Query hooks cover all operations. |
| BAPI-07 | Contact operations (list, create, update, delete, bulk-delete, VIP toggle, import vCard, sync, extract-from-emails) | ContactsController has all endpoints. Frontend contactsApi module covers all operations. VIP toggle: POST /contacts/:id/vip. Bulk delete: DELETE /contacts/bulk. vCard import: POST /contacts/import/vcard (file + content). Extract: POST /contacts/extract-from-emails. Sync: POST /contacts/sync/:providerId + /contacts/sync-all. No frontend vCard import UI exists (API-only). |
| BAPI-12 | Reminder operations (create, list, get, update, complete, delete) | ReminderController: POST /reminders, GET /reminders, GET /reminders/:id, PATCH /reminders/:id, POST /reminders/:id/complete, DELETE /reminders/:id. Frontend remindersApi + use-reminders hooks cover all operations. Status filter works via query params. |
| BAPI-23 | Calendar invite operations (get invite, respond, send, cancel) | EmailCalendarInviteController in email module: GET /emails/:id/calendar-invite, POST /emails/:id/calendar-invite/respond, POST /emails/calendar-invite/send, POST /emails/calendar-invite/:eventId/cancel. Uses IcsGeneratorService + IcsParserService for iTIP protocol. RSVPButtons component exists in frontend. |
| FE-07 | Calendar view renders events, create/edit/delete works, RSVP functions | Calendar component uses FullCalendar (lazy-loaded) with dayGrid/timeGrid/list plugins + interaction plugin for drag-drop. CalendarEventDialog for create, CalendarEventDetail for view/edit/delete. RSVPButtons component exists. Three custom hooks: useCalendarPreferences, useCalendarData, useCalendarHandlers. |
| FE-08 | Contacts list loads, create/edit/delete works, VIP toggle, import vCard | Contacts component has three-panel layout with ContactList, ContactDetail, ContactSidebar. ContactFormDialog for create/edit, DeleteContactDialog for delete. VIP toggle integrated in handlers. **No vCard import UI** -- only API exists. |
| FE-14 | Reminders page works (list, create, complete, delete, Kanban view) | RemindersBoard renders flat list with status filter chips, ReminderCard with complete/delete actions, ReminderCreateDialog for creation. Current implementation is a **filtered card list, not a traditional Kanban board**. The status chips (all/attivo/completato/annullato) serve as the "view" mechanism. |
</phase_requirements>

## Standard Stack

This phase uses the existing stack -- no new dependencies needed.

### Core (already installed)
| Library | Purpose | Location |
|---------|---------|----------|
| NestJS 11 | Backend framework | backend/ |
| Prisma + PostgreSQL | ORM + DB | backend/ |
| Next.js 16 + React 19 | Frontend framework | frontend/ |
| TanStack Query | Data fetching + cache | frontend/hooks/queries/ |
| MUI | UI components | frontend/components/ |
| FullCalendar | Calendar grid/views | frontend/components/dashboard/Calendar.tsx |
| ical-generator | ICS generation (invites, replies, cancellation) | backend/src/modules/calendar/services/ |
| Jest | Backend unit tests | backend/*.spec.ts |
| Playwright | E2E testing | frontend/e2e/ |

### No New Dependencies
This is a verification phase. No new libraries should be added.

## Architecture Patterns

### Backend Structure

```
backend/src/modules/calendar/
  controllers/
    calendar.controller.ts              # Events CRUD, calendars, sync, conflicts, focus-time
    calendar-webhook.controller.ts      # Push notification webhooks
  services/
    calendar.service.ts                 # Orchestrator (delegates to sub-services)
    calendar-events.service.ts          # Event CRUD logic
    calendar-list.service.ts            # Calendar list management
    calendar-conflict.service.ts        # Conflict detection
    focus-time.service.ts               # Focus block suggestions
    meeting-prep.service.ts             # Pre-meeting briefing (AI)
    calendar-sync-queue.service.ts      # BullMQ sync jobs
    ics-generator.service.ts            # ICS reply/request/cancel generation
    ics-parser.service.ts               # ICS parsing from email attachments

backend/src/modules/contacts/
  controllers/
    contacts.controller.ts              # Full CRUD + sync + import + VIP
    contacts-webhook.controller.ts      # Push notification webhooks
  services/
    contacts.service.ts                 # Core CRUD + vCard import
    contacts-sync-queue.service.ts      # BullMQ sync jobs
    relationship-score.service.ts       # CRM intelligence scores

backend/src/modules/reminder/
  controllers/
    reminder.controller.ts              # Full CRUD + complete
  services/
    reminder.service.ts                 # Core CRUD + AI parsing

backend/src/modules/email/controllers/
  email-calendar-invite.controller.ts   # Calendar invite ops (BAPI-23)
```

### Frontend Structure

```
frontend/components/
  dashboard/Calendar.tsx                # Main calendar page component
  dashboard/Contacts.tsx                # Main contacts page component
  dashboard/calendar/                   # Calendar hooks (useCalendarPreferences, useCalendarData, useCalendarHandlers)
  dashboard/contacts-page/             # Contacts hooks (useContactsPageData, useContactsPageHandlers, useContactForm, ContactDialogs)
  calendar/                            # Calendar sub-components (sidebar, header, event dialog, event detail, RSVP, recurrence, attendees, color picker)
  contacts/                            # Contact sub-components (layout, list, sidebar, detail, bulk action bar)
  reminders/                           # Reminder components (RemindersBoard, ReminderCard, ReminderCreateDialog, TelegramSettingsPanel)

frontend/lib/api/
  calendar.ts                          # Calendar API module
  contacts.ts                          # Contacts API module
  reminders.ts                         # Reminders API module

frontend/hooks/queries/
  use-calendar.ts                      # Calendar TanStack Query hooks
  use-contacts.ts                      # Contacts TanStack Query hooks
  use-reminders.ts                     # Reminders TanStack Query hooks
```

### Key Architectural Notes

1. **Calendar invites live in the email module**, not the calendar module. The EmailCalendarInviteController uses CalendarService and IcsGeneratorService from the calendar module.
2. **Contacts have role-based access**: mutation endpoints (create, update, delete, bulk-delete, VIP, import, sync) require `admin` or `super-admin` roles. List/get are open to all authenticated users.
3. **Reminders use Italian field names** (titolo, descrizione, contatto, scadenzaTesto, periodo, azione, priorita, condizioneTipo, etc.) reflecting the original Italian-language design.
4. **Calendar uses the provider pattern**: events are synced from Google/Microsoft providers. CRUD operations pass through the provider factory to the appropriate driver.

### Anti-Patterns to Avoid
- **Do not add new features**: This is verification only. No new UI components, no new endpoints.
- **Do not refactor existing code**: Fix bugs inline only.
- **Do not change API contracts**: Backend response shapes must stay the same.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Calendar grid rendering | Custom calendar grid | FullCalendar (already installed) | Complex date math, timezone handling, drag-drop |
| ICS generation/parsing | Custom ICS builder | ical-generator + ics-parser.service.ts (already built) | iTIP protocol compliance is non-trivial |
| vCard parsing | Custom VCF parser | contactsService.importFromVCard (already built) | vCard 3.0/4.0 format variations |
| Date range queries | Custom SQL | Prisma date filters (already used) | Timezone-aware range queries |

## Common Pitfalls

### Pitfall 1: Calendar Invite Controller Location
**What goes wrong:** Searching for invite endpoints in the calendar module when they live in the email module.
**Why it happens:** Logical grouping says "calendar invites" but the invite flow is email-centric (invites arrive as email attachments).
**How to avoid:** Remember: GET/POST /emails/:id/calendar-invite/* and POST /emails/calendar-invite/send live in `email-calendar-invite.controller.ts`.
**Warning signs:** 404s when testing invite endpoints against /calendar/* paths.

### Pitfall 2: Contacts Role Requirements
**What goes wrong:** API calls return 403 Forbidden for contact mutations.
**Why it happens:** ContactsController mutation endpoints require `admin` or `super-admin` roles via @Roles decorator. Regular `member` users cannot create/edit/delete contacts.
**How to avoid:** Test with an admin user. Verify the test account has the correct role.
**Warning signs:** 403 errors on POST/PATCH/DELETE /contacts endpoints.

### Pitfall 3: Reminder Italian Field Names
**What goes wrong:** Creating reminders with English field names or expecting English field names in responses.
**Why it happens:** The reminder model uses Italian naming (titolo, descrizione, priorita, azione, condizioneTipo, etc.).
**How to avoid:** Use the existing CreateReminderDto/UpdateReminderDto types which enforce the correct field names.
**Warning signs:** 400 Bad Request with validation errors, or undefined fields in responses.

### Pitfall 4: Calendar Sync Requires Active Provider
**What goes wrong:** Sync endpoint fails with 403/404.
**Why it happens:** Sync requires a providerConfig record that belongs to the tenant and has an active OAuth token.
**How to avoid:** Verify the test account has at least one connected Google/Microsoft provider with calendar enabled.
**Warning signs:** "Provider not found" or "Access denied" errors on sync endpoints.

### Pitfall 5: Reminders "Kanban View" Expectation
**What goes wrong:** Looking for a drag-and-drop Kanban board that does not exist.
**Why it happens:** FE-14 mentions "Kanban view" but the current RemindersBoard is a flat card list with status filter chips.
**How to avoid:** The current implementation groups reminders by status filter chips (all/attivo/completato/annullato). This IS the "board" view. A full drag-and-drop Kanban is not implemented and should not be built in this verification phase.
**Warning signs:** Scope creep if attempting to build a multi-column drag-and-drop board.

### Pitfall 6: No vCard Import UI
**What goes wrong:** Attempting to verify FE-08 vCard import via the frontend when no UI exists.
**Why it happens:** The backend POST /contacts/import/vcard endpoint exists and works, but no frontend component exposes it.
**How to avoid:** Verify the API endpoint directly. For FE-08, note this as a gap but do not build new UI in a verification phase.
**Warning signs:** Searching contacts page for an import button that does not exist.

## Code Examples

### Backend API Endpoints Summary

**Calendar (CalendarController):**
```
GET    /calendar/calendars                              # List calendars
POST   /calendar/calendars                              # Create calendar
PATCH  /calendar/calendars/:providerId/:calendarId      # Update calendar prefs
DELETE /calendar/calendars/:providerId/:calendarId      # Delete calendar
GET    /calendar/events                                 # List events (with filters)
GET    /calendar/events/:id                             # Get event
POST   /calendar/events                                 # Create event
PATCH  /calendar/events/:id                             # Update event
DELETE /calendar/events/:id                             # Delete event
POST   /calendar/sync/:providerId                       # Sync provider
GET    /calendar/conflicts                              # Detect conflicts
GET    /calendar/focus-time                             # Suggest focus blocks
GET    /calendar/meeting-prep/:eventId                  # Meeting briefing
GET    /calendar/events/:eventId/attachments            # List event attachments
GET    /calendar/events/:eventId/attachments/:id        # Get attachment
```

**Calendar Invites (EmailCalendarInviteController):**
```
GET    /emails/:id/calendar-invite                      # Get invite details from email
POST   /emails/:id/calendar-invite/respond              # RSVP (accept/decline/tentative)
POST   /emails/calendar-invite/send                     # Send new calendar invite
POST   /emails/calendar-invite/:eventId/cancel          # Cancel calendar event invite
```

**Contacts (ContactsController):**
```
GET    /contacts                                        # List contacts (with filters)
GET    /contacts/counts                                 # Get contact counts
GET    /contacts/relationship-scores                    # CRM intelligence scores
GET    /contacts/stale                                  # Stale contacts for re-engagement
GET    /contacts/vip/list                               # List VIP contacts
GET    /contacts/:id                                    # Get contact
GET    /contacts/:id/history                            # Get interaction history (stub)
GET    /contacts/:id/photo                              # Get contact photo
POST   /contacts                                        # Create contact (admin+)
POST   /contacts/local                                  # Create local contact (admin+)
POST   /contacts/lookup-by-emails                       # Batch email lookup (admin+)
POST   /contacts/extract-from-emails                    # Extract from emails (admin+)
POST   /contacts/import/vcard                           # Import vCard file (admin+)
POST   /contacts/sync/:providerId                       # Sync provider (admin+)
POST   /contacts/sync-all                               # Sync all providers (admin+)
POST   /contacts/:id/vip                                # Toggle VIP (admin+)
PATCH  /contacts/:id                                    # Update contact (admin+)
DELETE /contacts/bulk                                   # Bulk delete (admin+)
DELETE /contacts/:id                                    # Delete contact (admin+)
```

**Reminders (ReminderController):**
```
POST   /reminders                                       # Create reminder
GET    /reminders                                       # List reminders (filters: status, priorita, periodo)
GET    /reminders/:id                                   # Get reminder
PATCH  /reminders/:id                                   # Update reminder
POST   /reminders/:id/complete                          # Mark completed
DELETE /reminders/:id                                   # Soft-delete (status -> annullato)
```

## Identified Gaps

### Gap 1: No vCard Import UI (FE-08)
The backend supports vCard import (POST /contacts/import/vcard with file upload and raw content). The frontend contactsApi has `importFromVCard(file)` and `importFromVCardContent(content)` methods. However, no frontend component exposes this functionality. The ContactSidebar and ContactFormDialog have no import button.

**Recommendation:** Note as a known gap in verification. Do not build new UI unless explicitly requested. The API endpoint can be verified directly via curl/Swagger.

### Gap 2: Reminders "Kanban View" (FE-14)
The RemindersBoard component is a flat card list with status filter chips, not a multi-column Kanban board. The component name "RemindersBoard" suggests Kanban intent but the implementation is a filtered list.

**Recommendation:** Verify the current list view works correctly. The status chips provide equivalent functionality to a Kanban column view. Do not build a Kanban board in this verification phase.

### Gap 3: Contact History Endpoint is a Stub
GET /contacts/:id/history returns an empty array with a comment "ContactInteraction model removed (dead code)". The frontend ContactActivityFeed component exists but will always show empty state.

**Recommendation:** Note as known limitation. The stub endpoint returns valid HTTP 200 with empty array, which is correct behavior. Do not attempt to fix.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (backend), Playwright (frontend E2E) |
| Config file | backend/jest.config.ts, frontend/playwright.config.ts |
| Quick run command | `cd backend && npx jest --testPathPattern="calendar\|contacts\|reminder" --no-coverage -t "specific test"` |
| Full suite command | `cd backend && npx jest --no-coverage` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BAPI-06 | Calendar CRUD, sync, conflicts, focus-time | manual + existing unit | Backend unit tests exist for conflict, events, list, sync services | Existing |
| BAPI-07 | Contacts CRUD, bulk-delete, VIP, vCard import, sync | manual + existing unit | Backend unit tests exist for sync, cache, webhook services | Existing |
| BAPI-12 | Reminders CRUD, complete, delete | manual | No dedicated reminder controller tests found | Gap |
| BAPI-23 | Calendar invite get/respond/send/cancel | manual | ICS parser tests exist; no invite controller tests | Partial |
| FE-07 | Calendar UI renders, CRUD works, RSVP | manual (CDP) | Visual regression snapshot exists (calendar-chromium-win32.png) | Partial |
| FE-08 | Contacts UI renders, CRUD works, VIP toggle | manual (CDP) | Visual regression snapshots exist (contacts, contact-detail) | Partial |
| FE-14 | Reminders page list/create/complete/delete | manual (CDP) | No E2E test for reminders page | Gap |

### Sampling Rate
- **Per task commit:** `cd frontend && npx tsc --noEmit && cd ../backend && npx tsc --noEmit`
- **Per wave merge:** `cd backend && npx jest --no-coverage --forceExit`
- **Phase gate:** Type-check green + manual verification checklist complete

### Wave 0 Gaps
None -- existing test infrastructure covers backend unit tests. Frontend verification is manual/CDP-based, consistent with Phase 89 and 90 patterns.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all backend controllers, services, frontend API modules, components, and hooks
- Prisma schema inspection for CalendarEvent, Contact, and Reminder models
- Existing Phase 90 research pattern for verification phase structure

### Secondary (MEDIUM confidence)
- Existing E2E test files for visual regression patterns (calendar/contacts snapshots exist)
- Phase 89/90 plan structures for verification workflow patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all code inspected directly, no new dependencies
- Architecture: HIGH - full controller/service/component tree mapped
- Pitfalls: HIGH - identified from actual code inspection (role guards, Italian names, missing UI)
- Gaps: HIGH - confirmed by absence of code (no vCard UI, no Kanban columns)

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable -- verification phase, no moving targets)
