import { Test, TestingModule } from '@nestjs/testing';
import { IcsGeneratorService, CreateEventData } from './ics-generator.service';
import { ParsedCalendarInvite } from './ics-parser.service';
import * as ical from 'node-ical';

/**
 * Unit Tests for IcsGeneratorService
 *
 * Tests ICS generation for:
 * - REPLY (Accept/Decline/Tentative)
 * - REQUEST (New invitations)
 * - CANCEL (Cancellations)
 * - UPDATE (Event modifications)
 */
describe('IcsGeneratorService', () => {
  let service: IcsGeneratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IcsGeneratorService],
    }).compile();

    service = module.get<IcsGeneratorService>(IcsGeneratorService);
  });

  // Mock parsed invite for testing replies
  const mockInvite: ParsedCalendarInvite = {
    uid: 'test-event-123@example.com',
    method: 'REQUEST',
    sequence: 0,
    summary: 'Team Meeting',
    description: 'Weekly sync meeting',
    location: 'Conference Room A',
    url: 'https://zoom.us/j/123456',
    startTime: new Date('2025-12-15T14:00:00Z'),
    endTime: new Date('2025-12-15T15:00:00Z'),
    isAllDay: false,
    timezone: 'UTC',
    organizer: {
      email: 'organizer@example.com',
      name: 'John Organizer',
    },
    attendees: [
      {
        email: 'attendee1@example.com',
        name: 'Jane Attendee',
        status: 'NEEDS-ACTION',
        role: 'REQ-PARTICIPANT',
        rsvp: true,
      },
      {
        email: 'attendee2@example.com',
        name: 'Bob Attendee',
        status: 'ACCEPTED',
        role: 'OPT-PARTICIPANT',
        rsvp: true,
      },
    ],
    status: 'CONFIRMED',
    rawIcs: '',
  };

  describe('generateReply', () => {
    it('should generate ACCEPTED reply', () => {
      const result = service.generateReply(
        mockInvite,
        'ACCEPTED',
        'attendee1@example.com',
        'Jane Attendee',
      );

      expect(result).toContain('BEGIN:VCALENDAR');
      expect(result).toContain('METHOD:REPLY');
      expect(result).toContain('BEGIN:VEVENT');
      expect(result).toContain(`UID:${mockInvite.uid}`);
      expect(result).toContain('ATTENDEE');
      expect(result).toContain('ACCEPTED');
      expect(result).toContain('attendee1@example.com');
      expect(result).toContain('END:VEVENT');
      expect(result).toContain('END:VCALENDAR');
    });

    it('should generate DECLINED reply', () => {
      const result = service.generateReply(
        mockInvite,
        'DECLINED',
        'attendee1@example.com',
        'Jane Attendee',
      );

      expect(result).toContain('METHOD:REPLY');
      expect(result).toContain('DECLINED');
    });

    it('should generate TENTATIVE reply', () => {
      const result = service.generateReply(
        mockInvite,
        'TENTATIVE',
        'attendee1@example.com',
        'Jane Attendee',
      );

      expect(result).toContain('METHOD:REPLY');
      expect(result).toContain('TENTATIVE');
    });

    it('should include event details in reply', () => {
      const result = service.generateReply(
        mockInvite,
        'ACCEPTED',
        'attendee1@example.com',
      );

      expect(result).toContain(mockInvite.summary);
      expect(result).toContain('ORGANIZER');
      expect(result).toContain(mockInvite.organizer.email);
    });

    it('should preserve UID and SEQUENCE', () => {
      const result = service.generateReply(
        mockInvite,
        'ACCEPTED',
        'attendee1@example.com',
      );

      expect(result).toContain(`UID:${mockInvite.uid}`);
      expect(result).toContain(`SEQUENCE:${mockInvite.sequence}`);
    });
  });

  describe('generateRequest', () => {
    const eventData: CreateEventData = {
      summary: 'New Project Kickoff',
      description: 'Initial meeting to discuss project scope',
      location: 'Meeting Room B',
      url: 'https://meet.google.com/abc-defg-hij',
      startTime: new Date('2025-12-20T10:00:00Z'),
      endTime: new Date('2025-12-20T11:00:00Z'),
      isAllDay: false,
      timezone: 'America/New_York',
      organizer: {
        email: 'pm@example.com',
        name: 'Project Manager',
      },
      attendees: [
        { email: 'dev1@example.com', name: 'Developer 1', rsvp: true },
        { email: 'dev2@example.com', name: 'Developer 2', rsvp: true },
      ],
    };

    it('should generate REQUEST ICS', () => {
      const result = service.generateRequest(eventData);

      expect(result).toContain('BEGIN:VCALENDAR');
      expect(result).toContain('METHOD:REQUEST');
      expect(result).toContain('BEGIN:VEVENT');
      expect(result).toContain(eventData.summary);
      expect(result).toContain('END:VEVENT');
      expect(result).toContain('END:VCALENDAR');
    });

    it('should include all event details', () => {
      const result = service.generateRequest(eventData);

      expect(result).toContain(eventData.summary);
      expect(result).toContain(eventData.description!);
      expect(result).toContain(eventData.location!);
    });

    it('should include organizer', () => {
      const result = service.generateRequest(eventData);

      expect(result).toContain('ORGANIZER');
      expect(result).toContain(eventData.organizer.email);
    });

    it('should include all attendees', () => {
      const result = service.generateRequest(eventData);

      expect(result).toContain(eventData.attendees[0].email);
      expect(result).toContain(eventData.attendees[1].email);
    });

    it('should generate unique UID if not provided', () => {
      const result = service.generateRequest(eventData);

      expect(result).toMatch(/UID:\d+-[a-z0-9]+@mailagent\.app/);
    });

    it('should use provided UID', () => {
      const dataWithUid = { ...eventData, uid: 'custom-uid-123@example.com' };
      const result = service.generateRequest(dataWithUid);

      expect(result).toContain('UID:custom-uid-123@example.com');
    });

    it('should set SEQUENCE to 0 for new events', () => {
      const result = service.generateRequest(eventData);

      expect(result).toContain('SEQUENCE:0');
    });

    it('should set status to CONFIRMED', () => {
      const result = service.generateRequest(eventData);

      expect(result).toContain('STATUS:CONFIRMED');
    });
  });

  describe('generateCancel', () => {
    it('should generate CANCEL ICS', () => {
      const result = service.generateCancel(mockInvite);

      expect(result).toContain('BEGIN:VCALENDAR');
      expect(result).toContain('METHOD:CANCEL');
      expect(result).toContain('BEGIN:VEVENT');
      expect(result).toContain(`UID:${mockInvite.uid}`);
      expect(result).toContain('STATUS:CANCELLED');
      expect(result).toContain('END:VEVENT');
      expect(result).toContain('END:VCALENDAR');
    });

    it('should increment SEQUENCE', () => {
      const result = service.generateCancel(mockInvite);

      expect(result).toContain(`SEQUENCE:${mockInvite.sequence + 1}`);
    });

    it('should include all attendees', () => {
      const result = service.generateCancel(mockInvite);

      expect(result).toContain(mockInvite.attendees[0].email);
      expect(result).toContain(mockInvite.attendees[1].email);
    });

    it('should include cancellation reason if provided', () => {
      const reason = 'Meeting rescheduled to next week';
      const result = service.generateCancel(mockInvite, reason);

      expect(result).toContain(reason);
    });
  });

  describe('generateUpdate', () => {
    it('should generate UPDATE ICS with REQUEST method', () => {
      const result = service.generateUpdate(mockInvite);

      expect(result).toContain('METHOD:REQUEST');
      expect(result).toContain(`UID:${mockInvite.uid}`);
    });

    it('should increment SEQUENCE', () => {
      const result = service.generateUpdate(mockInvite);

      expect(result).toContain(`SEQUENCE:${mockInvite.sequence + 1}`);
    });

    it('should preserve all event details', () => {
      const result = service.generateUpdate(mockInvite);

      expect(result).toContain(mockInvite.summary);
      expect(result).toContain(mockInvite.description!);
      expect(result).toContain(mockInvite.location!);
    });
  });

  describe('generateDownloadable', () => {
    const eventData: CreateEventData = {
      summary: 'Conference Talk',
      description: 'Speaking at tech conference',
      location: 'Convention Center',
      startTime: new Date('2025-12-25T09:00:00Z'),
      endTime: new Date('2025-12-25T10:00:00Z'),
      organizer: {
        email: 'speaker@example.com',
        name: 'Speaker Name',
      },
      attendees: [],
    };

    it('should generate downloadable ICS without METHOD', () => {
      const result = service.generateDownloadable(eventData);

      expect(result).toContain('BEGIN:VCALENDAR');
      expect(result).toContain('BEGIN:VEVENT');
      expect(result).toContain(eventData.summary);
      // Downloadable ICS should not have METHOD (it's not a request)
    });

    it('should include event details', () => {
      const result = service.generateDownloadable(eventData);

      expect(result).toContain(eventData.summary);
      expect(result).toContain(eventData.description!);
      expect(result).toContain(eventData.location!);
    });
  });

  describe('ICS Format Validation', () => {
    it('should produce valid CRLF line endings', () => {
      const result = service.generateReply(
        mockInvite,
        'ACCEPTED',
        'test@example.com',
      );

      // ICS should use CRLF (\r\n) line endings
      expect(result).toContain('\r\n');
    });

    it('should include PRODID', () => {
      const result = service.generateRequest({
        summary: 'Test',
        startTime: new Date(),
        endTime: new Date(),
        organizer: { email: 'test@example.com', name: 'Test Organizer' },
        attendees: [],
      });

      expect(result).toContain('PRODID:');
    });

    it('should include VERSION:2.0', () => {
      const result = service.generateRequest({
        summary: 'Test',
        startTime: new Date(),
        endTime: new Date(),
        organizer: { email: 'test@example.com', name: 'Test Organizer' },
        attendees: [],
      });

      expect(result).toContain('VERSION:2.0');
    });

    it('should generate ICS that can be parsed by node-ical', async () => {
      const icsContent = service.generateRequest({
        summary: 'Parse Check',
        description: 'Ensure external parser compatibility',
        location: 'Room 101',
        startTime: new Date('2025-12-01T10:00:00Z'),
        endTime: new Date('2025-12-01T11:00:00Z'),
        organizer: { email: 'organizer@example.com', name: 'Organizer' },
        attendees: [{ email: 'guest@example.com', name: 'Guest' }],
      });

      const parsed = await ical.async.parseICS(icsContent);
      const events = Object.values(parsed).filter(
        (item): item is ical.VEvent => (item as any).type === 'VEVENT',
      );

      expect(events.length).toBeGreaterThan(0);
      const event = events[0];
      expect(event.summary).toBe('Parse Check');
      expect(event.location).toBe('Room 101');
      expect(event.organizer?.val?.toLowerCase()).toContain('organizer@example.com');
      expect(event.attendee).toBeDefined();
    });
  });
});
