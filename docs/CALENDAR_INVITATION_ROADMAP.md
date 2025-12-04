# Calendar Invitation (ICS) Implementation Roadmap

> **Status**: In Progress (Phases 1-4 shipped; Phase 5-6 advanced features/tests pending)
> **Created**: 2025-12-04
> **Priority**: High
> **Last Updated**: 2025-12-04

## Overview

Implement full calendar invitation handling for incoming meeting requests via email (.ics attachments). Users should be able to view, accept, decline, or tentatively accept calendar invitations directly from their email inbox.

---

## 2025 Best Practices & Library Selection

### Recommended Libraries (2025)

| Library | Purpose | Weekly Downloads | TypeScript | Recommendation |
|---------|---------|-----------------|------------|----------------|
| **[node-ical](https://github.com/jens-maus/node-ical)** | Parse ICS | 150k+ | Yes | **Best for parsing** - handles timezones, RRULE |
| **[ical-generator](https://github.com/sebbo2002/ical-generator)** | Generate ICS | 200k+ | Yes | **Best for generating** - v10.0.0 (Nov 2024) |
| **[ts-ics](https://github.com/Neuvernetzung/ts-ics)** | Parse + Generate | 5k+ | Native TS | **TypeScript-first**, RFC 5545 compliant |
| **[Nodemailer](https://nodemailer.com/message/calendar-events/)** | Send invites | 3M+ | Yes | **Email delivery** with calendar support |

**Already in repo**: `node-ical` and `ical-generator` are installed and used by the backend ICS services; `ical.js`/`ics` from the original TODO are not used.

### Why These Libraries?

1. **node-ical** (Parsing)
   - Handles Windows/IANA timezone mapping automatically
   - Async API for non-blocking parsing
   - Properly expands RRULE recurrences with timezone awareness
   - Requires Node.js 18+ (matches our stack)

2. **ical-generator** (Generation)
   - Most mature and actively maintained (updated Nov 2024)
   - Supports Day.js, Luxon, moment.js date objects
   - Creates RFC 5545 compliant calendars
   - Subscription calendar feeds support

3. **Nodemailer** (Email Delivery)
   - Native calendar event support with `icalEvent` option
   - Proper `Content-Type: text/calendar; method=REQUEST` headers
   - Works with Gmail, Outlook, Apple Mail

### iTIP (RFC 5546) Compliance

For calendar invitations to work across clients (Gmail, Outlook, Apple), we must follow [RFC 5546 iTIP](https://www.rfc-editor.org/rfc/rfc5546):

```
METHOD:REQUEST  -> Organizer sends meeting invite
METHOD:REPLY    -> Attendee responds (ACCEPTED/DECLINED/TENTATIVE)
METHOD:CANCEL   -> Organizer cancels meeting
```

### Key Implementation Notes (2025)

1. **Timezone Handling** (Critical!)
   - Always use IANA timezone IDs (e.g., `Europe/Rome`)
   - node-ical maps Windows timezone IDs automatically
   - Store timezone in DTSTART for recurrence expansion

2. **Email Headers** (For proper client detection)
   ```
   Content-Type: text/calendar; method=REQUEST; charset=UTF-8
   Content-Disposition: attachment; filename="invite.ics"
   ```

3. **UID Consistency**
   - Use same UID for updates/cancellations
   - Increment SEQUENCE for each update

---

## Architecture

Invitation flow: Incoming email (.ics attachment) -> Parse ICS -> Display invite UI -> User responds (accept/tentative/decline) -> Generate reply ICS -> Send response email -> Update calendar/event state.

---

## Implementation Status Snapshot (2025-12-04)

- DONE: Backend ICS parsing: `backend/src/modules/calendar/services/ics-parser.service.ts` implemented with unit tests; uses `node-ical`.
- DONE: Backend ICS generation: `backend/src/modules/calendar/services/ics-generator.service.ts` implemented with unit tests; uses `ical-generator`.
- DONE: Database fields for invites are present on `Email` in `backend/prisma/schema.prisma`.
- DONE: Email sync detects/parses .ics attachments for Gmail/Microsoft/IMAP.
- DONE: Invite read/respond endpoints in `backend/src/modules/email/controllers/emails.controller.ts` (`GET /emails/:id/calendar-invite`, `POST /emails/:id/calendar-invite/respond`), using `IcsGeneratorService` + `EmailSendService`, updating `calendarInviteStatus`, and creating/refreshing `CalendarEvent` on accept/tentative (link stored on email).
- DONE: Frontend invite card/badge + API wiring in thread list/detail with translations.
- DONE: Update/cancel handling for existing events (sync handlers set `status`/`isCancelled` when new ICS with same UID arrives).
- TODO: Deeper CalendarEvent sync (recurrence/series support), outgoing updates/cancel flows, and full E2E/API test coverage.

**Immediate priorities**
1) Recurrence + updates: support SEQUENCE handling, recurring series updates, and provider-side updates when re-responding.
2) Testing: integration/E2E coverage for accept/decline, updates/cancel, and calendar event creation/sync paths.
3) Cancellations UX: surface cancelled/updated badges in frontend and allow re-response where appropriate.

---

## Phase 1: ICS Parsing Service

### Backend Implementation

#### DONE 1.1: Install Dependencies (adjusted)
```bash
cd backend
npm install node-ical ical-generator
```

**Libraries used in codebase:**
- `node-ical` - Parse incoming .ics files (RFC 5545 compliant)
- `ical-generator` - Generate outgoing .ics files for responses

#### DONE 1.2: Create ICS Parser Service
**File:** `backend/src/modules/calendar/services/ics-parser.service.ts` (implemented)

```typescript
// Service responsibilities:
// - Parse VCALENDAR/VEVENT from .ics content
// - Extract: summary, description, dtstart, dtend, location, organizer, attendees
// - Handle RRULE (recurrence rules)
// - Parse METHOD (REQUEST, REPLY, CANCEL)
// - Handle timezone conversions (VTIMEZONE)
```

**Interface:**
```typescript
interface ParsedCalendarInvite {
  uid: string;                    // Unique event ID
  method: 'REQUEST' | 'REPLY' | 'CANCEL' | 'PUBLISH';
  sequence: number;               // Version number for updates

  // Event details
  summary: string;
  description?: string;
  location?: string;
  url?: string;

  // Timing
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  timezone?: string;

  // Recurrence
  recurrence?: string[];          // RRULE strings
  recurringEventId?: string;

  // People
  organizer: {
    email: string;
    name?: string;
  };
  attendees: Array<{
    email: string;
    name?: string;
    status: 'NEEDS-ACTION' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';
    role: 'REQ-PARTICIPANT' | 'OPT-PARTICIPANT' | 'CHAIR';
    rsvp: boolean;
  }>;

  // Raw data
  rawIcs: string;
}
```

#### DONE 1.3: Create ICS Generator Service
**File:** `backend/src/modules/calendar/services/ics-generator.service.ts` (implemented)

```typescript
// Service responsibilities:
// - Generate REPLY .ics for Accept/Decline/Tentative
// - Generate REQUEST .ics for sending invitations
// - Generate CANCEL .ics for cancellations
// - Proper iTIP (RFC 5546) compliance
```

**Methods:**
```typescript
generateReply(invite: ParsedCalendarInvite, response: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE', attendeeEmail: string): string;
generateRequest(event: CreateEventDto, organizer: { email: string; name?: string }): string;
generateCancel(invite: ParsedCalendarInvite): string;
```

#### DONE 1.4: Unit Tests for ICS Parser
**File:** `backend/src/modules/calendar/services/ics-parser.service.spec.ts`

Test cases:
- [x] Parse simple single event
- [x] Parse event with multiple attendees
- [x] Parse recurring event (RRULE)
- [x] Parse all-day event
- [x] Parse event with timezone (VTIMEZONE)
- [x] Parse meeting REQUEST
- [x] Parse meeting CANCEL
- [x] Handle malformed ICS gracefully
- [x] Parse Outlook-generated ICS
- [x] Parse Google Calendar ICS
- [x] Parse Apple Calendar ICS

#### DONE 1.5: Unit Tests for ICS Generator
**File:** `backend/src/modules/calendar/services/ics-generator.service.spec.ts`

Test cases:
- [x] Generate ACCEPTED reply
- [x] Generate DECLINED reply
- [x] Generate TENTATIVE reply
- [x] Generate event REQUEST
- [x] Generate event CANCEL
- [x] Validate generated ICS with external parser

---

## Phase 2: Email Integration

### Detect Calendar Attachments

#### DONE 2.1: Add Calendar Detection to Email Sync
**Files to modify:**
- `backend/src/modules/email-sync/services/gmail/gmail-sync.service.ts`
- `backend/src/modules/email-sync/services/microsoft/microsoft-sync.service.ts`
- `backend/src/modules/email-sync/services/imap/imap-sync.service.ts`

**Detection logic:**
```typescript
// Detect calendar invitations by:
// 1. MIME type: text/calendar, application/ics
// 2. File extension: .ics, .ical
// 3. Content-Type header with method=REQUEST

function isCalendarInvite(attachment: EmailAttachment): boolean {
  const calendarMimeTypes = ['text/calendar', 'application/ics', 'application/ical'];
  const calendarExtensions = ['.ics', '.ical', '.ifb'];

  return calendarMimeTypes.includes(attachment.mimeType?.toLowerCase()) ||
         calendarExtensions.some(ext => attachment.filename?.toLowerCase().endsWith(ext));
}
```

#### DONE 2.2: Add Database Fields for Calendar Data
**File:** `backend/prisma/schema.prisma` (fields exist: `hasCalendarInvite`, `calendarInviteData`, `calendarInviteStatus`, `calendarEventId`)

```prisma
model Email {
  // ... existing fields ...

  // Calendar invitation data (parsed from .ics attachment)
  hasCalendarInvite    Boolean   @default(false)
  calendarInviteData   Json?     // ParsedCalendarInvite
  calendarInviteStatus String?   // 'pending' | 'accepted' | 'declined' | 'tentative'
}
```

#### DONE 2.3: Parse ICS on Email Sync
**Logic:**
```typescript
// During email sync, if calendar attachment detected:
// 1. Download attachment content
// 2. Parse with IcsParserService
// 3. Store parsed data in email.calendarInviteData
// 4. Set email.hasCalendarInvite = true
```

#### DONE 2.4: Create Calendar Invite API Endpoints
**File:** `backend/src/modules/email/controllers/emails.controller.ts`

- `GET /emails/:id/calendar-invite` returns parsed invite (normalizes persisted dates).
- `POST /emails/:id/calendar-invite/respond` generates ICS REPLY via `IcsGeneratorService`, sends email with `EmailSendService`, updates `calendarInviteStatus`.

---

## Phase 3: Frontend UI

### Calendar Invite Card Component

#### DONE 3.1: Create CalendarInviteCard Component
**File:** `frontend/components/email/CalendarInviteCard/CalendarInviteCard.tsx`

```typescript
interface CalendarInviteCardProps {
  invite: ParsedCalendarInvite;
  emailId: string;
  currentStatus?: 'pending' | 'accepted' | 'declined' | 'tentative';
  onRespond: (response: 'accept' | 'decline' | 'tentative') => Promise<void>;
}
```

**UI Elements:**
- Calendar icon with event color
- Event title (summary)
- Date/time with timezone
- Location (with map link if address)
- Organizer name and email
- Attendee list (collapsible if >5)
- Response buttons: Accept, Tentative, Decline
- "Add to Calendar" link (if already responded)
- Status badge showing current response

#### DONE 3.2: Integrate into Email Thread View
**File:** `frontend/components/email/ThreadDisplay.tsx`

```typescript
// Add after email body, before attachments:
{email.hasCalendarInvite && email.calendarInviteData && (
  <CalendarInviteCard
    invite={email.calendarInviteData}
    status={email.calendarInviteStatus}
    onRespond={(response) => handleInviteRespond(email.id, response)}
  />
)}
```

#### DONE 3.3: Add Calendar Invite Badge to Email List
**File:** `frontend/components/email/ThreadListItem.tsx`

```typescript
// Show calendar icon in email list for invites
{email.hasCalendarInvite && (
  <CalendarIcon className="text-blue-500" title="Calendar Invitation" />
)}
```

#### TODO 3.4: Create Response Dialog (optional, not started)
**File:** `frontend/components/email/CalendarInviteCard/ResponseDialog.tsx`

```typescript
// Optional: Dialog for adding note with response
interface ResponseDialogProps {
  response: 'accept' | 'decline' | 'tentative';
  onConfirm: (note?: string) => void;
  onCancel: () => void;
}
```

#### DONE 3.5: Add i18n Translations (strings present in `frontend/locales/en.ts` and `frontend/locales/it.ts`)
**Files:**
- `frontend/messages/en.json`
- `frontend/messages/it.json`

```json
{
  "calendar": {
    "invitation": "Meeting Invitation",
    "when": "When",
    "where": "Where",
    "organizer": "Organizer",
    "attendees": "Attendees",
    "accept": "Accept",
    "decline": "Decline",
    "tentative": "Tentative",
    "accepted": "Accepted",
    "declined": "Declined",
    "pending": "Pending Response",
    "addToCalendar": "Add to Calendar",
    "viewInCalendar": "View in Calendar"
  }
}
```

---

## Phase 4: Response Flow

### Send Response Email

#### DONE 4.1: Respond to invites and generate ICS REPLY
**File:** `backend/src/modules/email/controllers/emails.controller.ts`

- `POST /emails/:id/calendar-invite/respond` normalizes stored invite JSON into `ParsedCalendarInvite`, validates organizer/responder emails, maps accept/decline/tentative to `CalendarResponseType`, and generates ICS REPLY via `IcsGeneratorService`.
- Response email is sent with ICS attachment and `calendarInviteStatus` is updated on the email record.

#### DONE 4.2: Integrate with Email Send Service
- Reuses `EmailSendService.sendEmail` to deliver REPLY with `text/calendar; method=REPLY` attachment (no separate service layer yet).

#### DONE 4.3: Create Calendar Event on Accept/Tentative
**Logic:**
- When user responds with accept/tentative, `EmailsController` upserts `CalendarEvent` (by iCalUID) via `CalendarService.createEvent`, stores `calendarEventId` on the email, and stamps `iCalUID` metadata. Subsequent ICS REQUEST/CANCEL with same UID updates/cancels the existing event in sync handlers.

---

## Phase 5: Advanced Features

### Updates and Cancellations

#### IN PROGRESS 5.1: Handle Meeting Updates
- Backend: SEQUENCE-aware updates applied on incoming REQUEST with higher sequence; `CalendarEvent` refreshed and recurrence/sequence metadata stored. Attendee REPLY updates attendee status.
- Frontend: CalendarInviteCard shows "Updated" badge for SEQUENCE > 0 and attendee chips reflect statuses.
- TODO: Provider sync for re-responses/series updates and richer UI badge on thread/list.

#### IN PROGRESS 5.2: Handle Meeting Cancellations
- Detect METHOD:CANCEL and mark `CalendarEvent` as cancelled; frontend shows cancelled badge and disables responses; backend blocks replies to CANCEL.
- Outbound CANCEL generation endpoint added (`POST /emails/calendar-invite/:eventId/cancel`) sending ICS CANCEL to attendees and marking event cancelled; provider cancel best-effort (Google/Microsoft).
- TODO: Optional remove-from-calendar action and UI prompts.

#### TODO 5.3: Handle Recurring Events
- Parse and persist RRULE; support single-occurrence vs series responses.
- Create recurring `CalendarEvent` records and sync series updates/cancellations (Google recurrence payload supported; Microsoft recurrence payload still needed).

### Outgoing Invitations

#### DONE 5.4: Send Meeting Invitations
- `POST /emails/calendar-invite/send` generates ICS REQUEST via `IcsGeneratorService`, sends via `EmailSendService` with `text/calendar` attachment, and creates a `CalendarEvent` with iCalUID/sequence metadata.

#### IN PROGRESS 5.5: Track Attendee Responses
- Backend: Parse incoming REPLY for existing `CalendarEvent` and update attendee status (handled in sync attachment handlers for Gmail/Microsoft/IMAP by updating attendee list on REPLY).
- UI: Attendee chips show status coloring in invite card.
- TODO: Surface per-attendee responses in thread/list UI and sync back to providers if needed.

---

## Phase 6: Testing & Validation

### Unit Tests

#### TODO 6.1: ICS Parser Tests
- [ ] Parse Google Calendar invite
- [ ] Parse Outlook invite
- [ ] Parse Apple Calendar invite
- [ ] Parse Zoom meeting invite
- [ ] Parse Teams meeting invite
- [ ] Parse recurring events
- [ ] Parse all-day events
- [ ] Handle timezone edge cases

#### TODO 6.2: ICS Generator Tests
- [ ] Generate valid ACCEPTED reply
- [ ] Generate valid DECLINED reply
- [ ] Generate valid TENTATIVE reply
- [ ] Validate output with external parser

#### TODO 6.3: API Integration Tests
- [ ] GET /emails/:id/calendar-invite
- [ ] POST /emails/:id/calendar-invite/respond
- [ ] Verify response email is sent
- [ ] Verify calendar event is created

### E2E Tests

#### TODO 6.4: Full Flow Tests
- [ ] Receive invite email -> View -> Accept -> Event in calendar
- [ ] Receive invite email -> View -> Decline -> No event created
- [ ] Receive updated invite -> View -> Re-respond
- [ ] Receive cancelled invite -> View -> Event removed

### Manual Validation

#### TODO 6.5: Cross-Client Testing
- [ ] Receive invite from Gmail -> Respond -> Verify in Gmail
- [ ] Receive invite from Outlook -> Respond -> Verify in Outlook
- [ ] Receive invite from Apple Calendar -> Respond -> Verify
- [ ] Send invite from app -> Receive response -> Update shown

---

## Dependencies

### NPM Packages
| Package | Version | Purpose |
|---------|---------|---------|
| `node-ical` | ^0.22.1 | Parse ICS files |
| `ical-generator` | ^10.0.0 | Generate ICS files |

### Database Changes
```sql
-- Add to Email table
ALTER TABLE "Email" ADD COLUMN "hasCalendarInvite" BOOLEAN DEFAULT false;
ALTER TABLE "Email" ADD COLUMN "calendarInviteData" JSONB;
ALTER TABLE "Email" ADD COLUMN "calendarInviteStatus" VARCHAR(20);
```

---

## File Structure

```
backend/src/modules/calendar/
  services/
    calendar.service.ts           (existing)
    ics-parser.service.ts         (NEW)
    ics-parser.service.spec.ts    (NEW)
    ics-generator.service.ts      (NEW)
    ics-generator.service.spec.ts (NEW)
    calendar-response.service.ts  (NEW)
  controllers/
    calendar.controller.ts        (existing)
  calendar.module.ts              (modify)

backend/src/modules/email/
  controllers/
    email-calendar.controller.ts  (NEW)
  services/
    email-send.service.ts         (modify)

frontend/components/email/
  CalendarInviteCard/
    CalendarInviteCard.tsx        (NEW)
    CalendarInviteCard.test.tsx   (NEW)
    ResponseDialog.tsx            (NEW)
    index.ts                      (NEW)
  EmailDetail/
    EmailDetail.tsx               (modify)
  EmailListItem/
    EmailListItem.tsx             (modify)
```

---

## Timeline Estimate

| Phase | Tasks | Complexity |
|-------|-------|------------|
| Phase 1 | ICS Parser/Generator | Medium |
| Phase 2 | Email Integration | Medium |
| Phase 3 | Frontend UI | Medium |
| Phase 4 | Response Flow | High |
| Phase 5 | Advanced Features | High |
| Phase 6 | Testing | Medium |

---

## References

- [RFC 5545 - iCalendar](https://datatracker.ietf.org/doc/html/rfc5545)
- [RFC 5546 - iTIP](https://datatracker.ietf.org/doc/html/rfc5546)
- [ical.js Documentation](https://github.com/kewisch/ical.js)
- [ics npm package](https://github.com/adamgibbons/ics)
