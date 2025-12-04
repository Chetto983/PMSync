import { Test, TestingModule } from '@nestjs/testing';
import { IcsParserService } from './ics-parser.service';

/**
 * Unit Tests for IcsParserService
 *
 * Tests ICS parsing for various formats:
 * - Google Calendar invites
 * - Outlook/Microsoft invites
 * - Apple Calendar invites
 * - Zoom meeting invites
 * - Recurring events
 * - All-day events
 */
describe('IcsParserService', () => {
  let service: IcsParserService;

  // Helper to create properly formatted ICS strings
  const ics = (...lines: string[]) => lines.join('\r\n');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IcsParserService],
    }).compile();

    service = module.get<IcsParserService>(IcsParserService);
  });

  describe('parseIcs', () => {
    it('should parse a simple meeting invitation', async () => {
      const icsContent = ics(
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Test//Test//EN',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        'UID:test-event-123@example.com',
        'DTSTAMP:20251204T100000Z',
        'DTSTART:20251210T140000Z',
        'DTEND:20251210T150000Z',
        'SUMMARY:Weekly Team Meeting',
        'DESCRIPTION:Discuss project updates',
        'LOCATION:Conference Room A',
        'ORGANIZER;CN=John Doe:mailto:john@example.com',
        'ATTENDEE;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=Jane Smith:mailto:jane@example.com',
        'SEQUENCE:0',
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR',
      );

      const result = await service.parseIcs(icsContent);

      expect(result).not.toBeNull();
      expect(result!.uid).toBe('test-event-123@example.com');
      expect(result!.method).toBe('REQUEST');
      expect(result!.summary).toBe('Weekly Team Meeting');
      expect(result!.description).toBe('Discuss project updates');
      expect(result!.location).toBe('Conference Room A');
      expect(result!.organizer.email).toBe('john@example.com');
      expect(result!.organizer.name).toBe('John Doe');
      expect(result!.attendees).toHaveLength(1);
      expect(result!.attendees[0].email).toBe('jane@example.com');
      expect(result!.attendees[0].status).toBe('NEEDS-ACTION');
      expect(result!.sequence).toBe(0);
    });

    it('should parse multiple attendees', async () => {
      const icsContent = ics(
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        'UID:multi-attendee@example.com',
        'DTSTART:20251210T140000Z',
        'DTEND:20251210T150000Z',
        'SUMMARY:Team Sync',
        'ORGANIZER:mailto:boss@example.com',
        'ATTENDEE;PARTSTAT=ACCEPTED;CN=Alice:mailto:alice@example.com',
        'ATTENDEE;PARTSTAT=DECLINED;CN=Bob:mailto:bob@example.com',
        'ATTENDEE;PARTSTAT=TENTATIVE;CN=Charlie:mailto:charlie@example.com',
        'ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:david@example.com',
        'END:VEVENT',
        'END:VCALENDAR',
      );

      const result = await service.parseIcs(icsContent);

      expect(result!.attendees).toHaveLength(4);
      expect(result!.attendees[0].status).toBe('ACCEPTED');
      expect(result!.attendees[1].status).toBe('DECLINED');
      expect(result!.attendees[2].status).toBe('TENTATIVE');
      expect(result!.attendees[3].status).toBe('NEEDS-ACTION');
    });

    it('should parse Google Calendar format', async () => {
      const icsContent = ics(
        'BEGIN:VCALENDAR',
        'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
        'VERSION:2.0',
        'CALSCALE:GREGORIAN',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        'DTSTART:20251215T090000Z',
        'DTEND:20251215T100000Z',
        'DTSTAMP:20251204T120000Z',
        'ORGANIZER;CN=Google User:mailto:user@gmail.com',
        'UID:google-event-12345@google.com',
        'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=attendee@gmail.com;X-NUM-GUESTS=0:mailto:attendee@gmail.com',
        'CREATED:20251201T100000Z',
        'DESCRIPTION:Google Calendar event description',
        'LAST-MODIFIED:20251204T120000Z',
        'LOCATION:Google Meet',
        'SEQUENCE:0',
        'STATUS:CONFIRMED',
        'SUMMARY:Google Calendar Meeting',
        'TRANSP:OPAQUE',
        'END:VEVENT',
        'END:VCALENDAR',
      );

      const result = await service.parseIcs(icsContent);

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Google Calendar Meeting');
      expect(result!.organizer.email).toBe('user@gmail.com');
      expect(result!.location).toBe('Google Meet');
    });

    it('should parse Apple Calendar format', async () => {
      const icsContent = ics(
        'BEGIN:VCALENDAR',
        'PRODID:-//Apple Inc.//Mac OS X 10.15.7//EN',
        'VERSION:2.0',
        'CALSCALE:GREGORIAN',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        'UID:apple-event-12345@icloud.com',
        'DTSTART;TZID=America/Los_Angeles:20251222T100000',
        'DTEND;TZID=America/Los_Angeles:20251222T110000',
        'DTSTAMP:20251204T120000Z',
        'SUMMARY:Apple Calendar Meeting',
        'DESCRIPTION:Apple meeting description',
        'LOCATION:Cupertino',
        'ORGANIZER;CN=Apple User:mailto:apple.user@icloud.com',
        'ATTENDEE;ROLE=REQ-PARTICIPANT;CN=Teammate:mailto:teammate@example.com',
        'SEQUENCE:0',
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR',
      );

      const result = await service.parseIcs(icsContent);

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Apple Calendar Meeting');
      expect(result!.organizer.email).toBe('apple.user@icloud.com');
      expect(result!.timezone).toBe('America/Los_Angeles');
      expect(result!.attendees[0].email).toBe('teammate@example.com');
    });

    it('should parse Outlook/Microsoft format', async () => {
      const icsContent = ics(
        'BEGIN:VCALENDAR',
        'PRODID:-//Microsoft Corporation//Outlook 16.0 MIMEDIR//EN',
        'VERSION:2.0',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        'DTSTART:20251220T150000Z',
        'DTEND:20251220T160000Z',
        'DTSTAMP:20251204T100000Z',
        'UID:040000008200E00074C5B7101A82E00800000000',
        'ORGANIZER;CN="Microsoft User":mailto:user@outlook.com',
        'ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="Attendee Name":mailto:attendee@outlook.com',
        'LOCATION:Microsoft Teams Meeting',
        'SUMMARY:Outlook Meeting',
        'DESCRIPTION:Meeting via Microsoft Teams',
        'SEQUENCE:0',
        'PRIORITY:5',
        'X-MICROSOFT-CDO-IMPORTANCE:1',
        'CLASS:PUBLIC',
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR',
      );

      const result = await service.parseIcs(icsContent);

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Outlook Meeting');
      expect(result!.organizer.email).toBe('user@outlook.com');
    });

    it('should parse Zoom meeting invite', async () => {
      const icsContent = ics(
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Zoom Video Communications Inc//Zoom//EN',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        'UID:zoom-meeting-123456789@zoom.us',
        'DTSTART:20251218T100000Z',
        'DTEND:20251218T110000Z',
        'SUMMARY:Zoom Meeting',
        'DESCRIPTION:Join Zoom Meeting\\nhttps://zoom.us/j/123456789',
        'LOCATION:https://zoom.us/j/123456789',
        'ORGANIZER:mailto:host@example.com',
        'ATTENDEE:mailto:participant@example.com',
        'URL:https://zoom.us/j/123456789',
        'END:VEVENT',
        'END:VCALENDAR',
      );

      const result = await service.parseIcs(icsContent);

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Zoom Meeting');
      expect(result!.url).toContain('zoom.us');
    });

    it('should parse CANCEL method', async () => {
      const icsContent = ics(
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'METHOD:CANCEL',
        'BEGIN:VEVENT',
        'UID:cancelled-event@example.com',
        'DTSTART:20251210T140000Z',
        'DTEND:20251210T150000Z',
        'SUMMARY:Cancelled Meeting',
        'ORGANIZER:mailto:organizer@example.com',
        'STATUS:CANCELLED',
        'SEQUENCE:1',
        'END:VEVENT',
        'END:VCALENDAR',
      );

      const result = await service.parseIcs(icsContent);

      expect(result).not.toBeNull();
      expect(result!.method).toBe('CANCEL');
      expect(result!.status).toBe('CANCELLED');
      expect(result!.sequence).toBe(1);
    });

    it('should parse REPLY method', async () => {
      const icsContent = ics(
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'METHOD:REPLY',
        'BEGIN:VEVENT',
        'UID:reply-event@example.com',
        'DTSTART:20251210T140000Z',
        'DTEND:20251210T150000Z',
        'SUMMARY:Meeting',
        'ORGANIZER:mailto:organizer@example.com',
        'ATTENDEE;PARTSTAT=ACCEPTED:mailto:attendee@example.com',
        'END:VEVENT',
        'END:VCALENDAR',
      );

      const result = await service.parseIcs(icsContent);

      expect(result).not.toBeNull();
      expect(result!.method).toBe('REPLY');
      expect(result!.attendees[0].status).toBe('ACCEPTED');
    });

    it('should handle missing optional fields gracefully', async () => {
      const icsContent = ics(
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:minimal-event@example.com',
        'DTSTART:20251210T140000Z',
        'DTEND:20251210T150000Z',
        'SUMMARY:Minimal Event',
        'END:VEVENT',
        'END:VCALENDAR',
      );

      const result = await service.parseIcs(icsContent);

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Minimal Event');
      expect(result!.description).toBeUndefined();
      expect(result!.location).toBeUndefined();
      expect(result!.attendees).toHaveLength(0);
      expect(result!.method).toBe('REQUEST'); // Default
    });

    it('should parse recurring event with RRULE', async () => {
      const icsContent = ics(
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        'UID:recurring-event@example.com',
        'DTSTART:20251210T140000Z',
        'DTEND:20251210T150000Z',
        'SUMMARY:Weekly Sync',
        'RRULE:FREQ=WEEKLY;COUNT=5',
        'ORGANIZER:mailto:organizer@example.com',
        'END:VEVENT',
        'END:VCALENDAR',
      );

      const result = await service.parseIcs(icsContent);

      expect(result).not.toBeNull();
      expect(result!.recurrence).toEqual(['FREQ=WEEKLY;COUNT=5']);
    });

    it('should parse all-day event (VALUE=DATE)', async () => {
      const icsContent = ics(
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        'UID:allday-event@example.com',
        'DTSTART;VALUE=DATE:20251224',
        'DTEND;VALUE=DATE:20251225',
        'SUMMARY:Christmas Eve',
        'ORGANIZER:mailto:organizer@example.com',
        'END:VEVENT',
        'END:VCALENDAR',
      );

      const result = await service.parseIcs(icsContent);

      expect(result).not.toBeNull();
      expect(result!.isAllDay).toBe(true);
      expect(result!.startTime).toBeInstanceOf(Date);
    });

    it('should parse timezone-aware event', async () => {
      const icsContent = ics(
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        'UID:tz-event@example.com',
        'DTSTART;TZID=Europe/Rome:20251210T150000',
        'DTEND;TZID=Europe/Rome:20251210T160000',
        'SUMMARY:Rome Meeting',
        'ORGANIZER:mailto:organizer@example.com',
        'END:VEVENT',
        'END:VCALENDAR',
      );

      const result = await service.parseIcs(icsContent);

      expect(result).not.toBeNull();
      expect(result!.timezone).toBe('Europe/Rome');
      expect(result!.startTime).toBeInstanceOf(Date);
    });

    it('should return null for invalid ICS', async () => {
      const invalidContent = 'This is not a valid ICS file';

      const result = await service.parseIcs(invalidContent);

      expect(result).toBeNull();
    });

    it('should return null for empty content', async () => {
      const result = await service.parseIcs('');

      expect(result).toBeNull();
    });

    it('should return null for ICS without VEVENT', async () => {
      const icsContent = ics(
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Test//Test//EN',
        'END:VCALENDAR',
      );

      const result = await service.parseIcs(icsContent);

      expect(result).toBeNull();
    });
  });

  describe('isValidIcs', () => {
    it('should return true for valid ICS content', () => {
      const validIcs = ics(
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:test@example.com',
        'DTSTART:20251210T140000Z',
        'SUMMARY:Test',
        'END:VEVENT',
        'END:VCALENDAR',
      );

      expect(service.isValidIcs(validIcs)).toBe(true);
    });

    it('should return false for invalid content', () => {
      expect(service.isValidIcs('Not an ICS file')).toBe(false);
      expect(service.isValidIcs('')).toBe(false);
      expect(service.isValidIcs('BEGIN:VCALENDAR\nEND:VCALENDAR')).toBe(false);
    });
  });

  describe('isCalendarAttachment', () => {
    it('should detect text/calendar MIME type', () => {
      expect(service.isCalendarAttachment('text/calendar')).toBe(true);
      expect(service.isCalendarAttachment('TEXT/CALENDAR')).toBe(true);
    });

    it('should detect application/ics MIME type', () => {
      expect(service.isCalendarAttachment('application/ics')).toBe(true);
    });

    it('should detect .ics file extension', () => {
      expect(service.isCalendarAttachment('application/octet-stream', 'meeting.ics')).toBe(true);
      expect(service.isCalendarAttachment('application/octet-stream', 'INVITE.ICS')).toBe(true);
    });

    it('should detect .ical file extension', () => {
      expect(service.isCalendarAttachment('application/octet-stream', 'event.ical')).toBe(true);
    });

    it('should return false for non-calendar types', () => {
      expect(service.isCalendarAttachment('application/pdf', 'document.pdf')).toBe(false);
      expect(service.isCalendarAttachment('image/png', 'image.png')).toBe(false);
    });
  });

  describe('Date parsing', () => {
    it('should parse UTC datetime', async () => {
      const icsContent = ics(
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:date-test@example.com',
        'DTSTART:20251225T150000Z',
        'DTEND:20251225T160000Z',
        'SUMMARY:Christmas Meeting',
        'END:VEVENT',
        'END:VCALENDAR',
      );

      const result = await service.parseIcs(icsContent);

      expect(result).not.toBeNull();
      expect(result!.startTime).toBeInstanceOf(Date);
      expect(result!.startTime.getUTCHours()).toBe(15);
      expect(result!.startTime.getUTCMinutes()).toBe(0);
    });
  });

  describe('Attendee roles', () => {
    it('should parse attendee roles correctly', async () => {
      const icsContent = ics(
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:roles-test@example.com',
        'DTSTART:20251210T140000Z',
        'DTEND:20251210T150000Z',
        'SUMMARY:Role Test',
        'ATTENDEE;ROLE=CHAIR:mailto:chair@example.com',
        'ATTENDEE;ROLE=REQ-PARTICIPANT:mailto:required@example.com',
        'ATTENDEE;ROLE=OPT-PARTICIPANT:mailto:optional@example.com',
        'END:VEVENT',
        'END:VCALENDAR',
      );

      const result = await service.parseIcs(icsContent);

      expect(result!.attendees).toHaveLength(3);
      expect(result!.attendees[0].role).toBe('CHAIR');
      expect(result!.attendees[1].role).toBe('REQ-PARTICIPANT');
      expect(result!.attendees[2].role).toBe('OPT-PARTICIPANT');
    });
  });
});
