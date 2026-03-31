import { Injectable, Logger } from '@nestjs/common';
import * as ical from 'node-ical';
import { resolveCalendarTimeZone } from '../utils/calendar-timezone.util';

/**
 * Parsed calendar invitation data from an ICS file
 */
export interface ParsedCalendarInvite {
  /** Unique event identifier (UID) */
  uid: string;

  /** iTIP method: REQUEST, REPLY, CANCEL, PUBLISH */
  method: 'REQUEST' | 'REPLY' | 'CANCEL' | 'PUBLISH' | 'ADD' | 'REFRESH' | 'COUNTER' | 'DECLINECOUNTER';

  /** Version number for updates (SEQUENCE) */
  sequence: number;

  /** Event title/summary */
  summary: string;

  /** Event description */
  description?: string;

  /** Event location */
  location?: string;

  /** URL (e.g., Zoom/Teams link) */
  url?: string;

  /** Start time */
  startTime: Date;

  /** End time */
  endTime: Date;

  /** Is all-day event */
  isAllDay: boolean;

  /** Timezone identifier (IANA format) */
  timezone?: string;

  /** Recurrence rules (RRULE strings) */
  recurrence?: string[];

  /** Parent recurring event ID */
  recurringEventId?: string;

  /** Event organizer */
  organizer: {
    email: string;
    name?: string;
  };

  /** Event attendees */
  attendees: Array<{
    email: string;
    name?: string;
    status: 'NEEDS-ACTION' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';
    role: 'REQ-PARTICIPANT' | 'OPT-PARTICIPANT' | 'CHAIR' | 'NON-PARTICIPANT';
    rsvp: boolean;
  }>;

  /** Event status */
  status?: 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED';

  /** Event created timestamp */
  created?: Date;

  /** Event last modified timestamp */
  lastModified?: Date;

  /** Raw ICS content */
  rawIcs: string;
}

/**
 * Service for parsing ICS (iCalendar) files
 *
 * Supports:
 * - vCalendar 2.0 (RFC 5545)
 * - iTIP methods (RFC 5546): REQUEST, REPLY, CANCEL
 * - Recurring events (RRULE)
 * - Timezone handling (VTIMEZONE)
 * - Multiple attendees
 */
@Injectable()
export class IcsParserService {
  private readonly logger = new Logger(IcsParserService.name);

  /**
   * Parse ICS content and extract calendar invitation data
   * @param icsContent - Raw ICS file content
   * @returns Parsed calendar invitation or null if invalid
   */
  async parseIcs(icsContent: string): Promise<ParsedCalendarInvite | null> {
    try {
      if (!icsContent || typeof icsContent !== 'string') {
        this.logger.warn('Invalid ICS content: empty or not a string');
        return null;
      }

      // Normalize line endings (Apple Calendar sometimes uses bare \r)
      const normalizedContent = icsContent.replace(/\r(?!\n)/g, '\r\n');

      // Parse using node-ical (async)
      let parsed: ical.CalendarResponse;
      try {
        parsed = await ical.async.parseICS(normalizedContent);
      } catch (parseError) {
        this.logger.warn(`ICS parse failed, attempting with line-folding fix: ${parseError instanceof Error ? parseError.message : parseError}`);
        // Some ICS files have broken line folding — try unfolding manually
        const unfolded = normalizedContent.replace(/\r?\n[ \t]/g, '');
        parsed = await ical.async.parseICS(unfolded);
      }

      // Extract METHOD from VCALENDAR
      const method = this.extractMethod(icsContent);

      // Find VEVENT component
      const events = Object.values(parsed).filter(
        (component): component is ical.VEvent =>
          component != null && component.type === 'VEVENT',
      );

      if (events.length === 0) {
        this.logger.warn('No VEVENT found in ICS content');
        return null;
      }

      // Use first event (most ICS invitations have single event)
      const event = events[0];

      // Extract organizer
      const organizer = this.extractOrganizer(event);

      // Extract attendees
      const attendees = this.extractAttendees(event);

      // Parse dates - endTime defaults to startTime if missing (not "now")
      const parsedStartTime = this.parseDate(event.start) || new Date();
      const parsedEndTime = this.parseDate(event.end) || parsedStartTime;

      // Build parsed invite
      const invite: ParsedCalendarInvite = {
        uid: event.uid || this.generateUid(),
        method,
        sequence: typeof event.sequence === 'string' ? parseInt(event.sequence, 10) : (event.sequence ?? 0),
        summary: this.parameterValueToString(event.summary) || 'No Title',
        description: this.parameterValueToString(event.description),
        location: this.parameterValueToString(event.location),
        url: this.extractUrl(event),
        startTime: parsedStartTime,
        endTime: parsedEndTime,
        isAllDay: this.isAllDayEvent(event),
        timezone: this.extractTimezone(event),
        recurrence: this.extractRecurrence(event),
        recurringEventId: event.recurrenceid?.toString(),
        organizer,
        attendees,
        status: this.mapEventStatus(event.status),
        created: event.created ? new Date(event.created) : undefined,
        lastModified: event.lastmodified ? new Date(event.lastmodified) : undefined,
        rawIcs: icsContent,
      };

      this.logger.debug(`Parsed ICS: ${invite.summary} (${invite.uid})`);
      return invite;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to parse ICS: ${err.message}`, err.stack);
      return null;
    }
  }

  /**
   * Check if content is a valid ICS file
   */
  isValidIcs(content: string): boolean {
    if (!content || typeof content !== 'string') return false;

    const trimmed = content.trim();
    // Basic structure check — VCALENDAR wrapper required
    if (!trimmed.includes('BEGIN:VCALENDAR') || !trimmed.includes('END:VCALENDAR')) {
      return false;
    }
    // Must have at least one of: VEVENT, VTODO, VFREEBUSY
    return (
      trimmed.includes('BEGIN:VEVENT') ||
      trimmed.includes('BEGIN:VTODO') ||
      trimmed.includes('BEGIN:VFREEBUSY')
    );
  }

  /**
   * Detect if email attachment is a calendar invitation
   */
  isCalendarAttachment(mimeType: string, filename?: string): boolean {
    const calendarMimeTypes = [
      'text/calendar',
      'application/ics',
      'application/ical',
      'text/x-vcalendar',
      'application/x-vnd.microsoft.icalendar',
    ];

    const calendarExtensions = ['.ics', '.ical', '.ifb', '.vcs'];

    const mimeMatch = calendarMimeTypes.includes(mimeType?.toLowerCase());
    const extMatch = calendarExtensions.some((ext) =>
      filename?.toLowerCase().endsWith(ext),
    );

    return mimeMatch || extMatch;
  }

  /**
   * Extract METHOD from ICS content
   */
  private extractMethod(icsContent: string): ParsedCalendarInvite['method'] {
    const methodMatch = icsContent.match(/METHOD[;:]([A-Z]+)/i);
    if (methodMatch) {
      const method = methodMatch[1].toUpperCase();
      if (['REQUEST', 'REPLY', 'CANCEL', 'PUBLISH', 'ADD', 'REFRESH', 'COUNTER', 'DECLINECOUNTER'].includes(method)) {
        return method as ParsedCalendarInvite['method'];
      }
    }
    return 'REQUEST'; // Default to REQUEST for invitations
  }

  /**
   * Extract organizer from event
   */
  private extractOrganizer(event: ical.VEvent): ParsedCalendarInvite['organizer'] {
    const organizer = event.organizer;

    if (!organizer) {
      return { email: 'unknown@unknown.com' };
    }

    // Handle different organizer formats
    if (typeof organizer === 'string') {
      const email = this.extractEmailFromString(organizer);
      return { email: email || organizer };
    }

    // Object format with val and params
    const email = this.extractEmailFromString(organizer.val || '');
    const name = organizer.params?.CN;

    return {
      email: email || 'unknown@unknown.com',
      name: typeof name === 'string' ? name : undefined,
    };
  }

  /**
   * Extract attendees from event
   */
  private extractAttendees(event: ical.VEvent): ParsedCalendarInvite['attendees'] {
    const attendees: ParsedCalendarInvite['attendees'] = [];

    if (!event.attendee) {
      return attendees;
    }

    // Handle single attendee or array
    const attendeeList = Array.isArray(event.attendee)
      ? event.attendee
      : [event.attendee];

    for (const attendee of attendeeList) {
      if (!attendee) continue;

      let email: string;
      let name: string | undefined;
      let status: ParsedCalendarInvite['attendees'][0]['status'] = 'NEEDS-ACTION';
      let role: ParsedCalendarInvite['attendees'][0]['role'] = 'REQ-PARTICIPANT';
      let rsvp = true;

      if (typeof attendee === 'string') {
        email = this.extractEmailFromString(attendee) || attendee;
      } else {
        email = this.extractEmailFromString(attendee.val || '') || 'unknown@unknown.com';
        name = typeof attendee.params?.CN === 'string' ? attendee.params.CN : undefined;

        // Parse PARTSTAT (participation status)
        const partstat = attendee.params?.PARTSTAT?.toString().toUpperCase();
        if (partstat === 'ACCEPTED' || partstat === 'DECLINED' || partstat === 'TENTATIVE' || partstat === 'NEEDS-ACTION') {
          status = partstat;
        }

        // Parse ROLE
        const roleParam = attendee.params?.ROLE?.toString().toUpperCase();
        if (roleParam === 'REQ-PARTICIPANT' || roleParam === 'OPT-PARTICIPANT' || roleParam === 'CHAIR' || roleParam === 'NON-PARTICIPANT') {
          role = roleParam;
        }

        // Parse RSVP
        rsvp = attendee.params?.RSVP?.toString().toUpperCase() !== 'FALSE';
      }

      attendees.push({ email, name, status, role, rsvp });
    }

    return attendees;
  }

  /**
   * Extract string value from a ParameterValue (which can be string or { val, params })
   */
  private parameterValueToString(value: string | { val: string; params: Record<string, string> } | undefined): string | undefined {
    if (value == null) return undefined;
    if (typeof value === 'string') return value;
    return value.val;
  }

  /**
   * Extract email from mailto: string or plain email
   */
  private extractEmailFromString(value: string): string | null {
    if (!value) return null;

    // Handle mailto: format
    if (value.toLowerCase().startsWith('mailto:')) {
      return value.substring(7).toLowerCase().trim();
    }

    // Check if it looks like an email
    const emailMatch = value.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return emailMatch ? emailMatch[1].toLowerCase() : null;
  }

  /**
   * Parse date from various formats.
   * Handles node-ical DateWithTimeZone, ISO strings, iCalendar date strings (YYYYMMDDTHHMMSSZ).
   * Returns null if date is undefined or unparseable.
   */
  private parseDate(date: ical.DateWithTimeZone | string | undefined): Date | null {
    if (!date) return null;

    if (date instanceof Date) {
      return isNaN(date.getTime()) ? null : date;
    }

    if (typeof date === 'string') {
      // Handle iCalendar compact format: 20260315T100000Z or 20260315T100000
      const compactMatch = date.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
      if (compactMatch) {
        const [, y, m, d, h, min, s, z] = compactMatch;
        const iso = `${y}-${m}-${d}T${h}:${min}:${s}${z || ''}`;
        const parsed = new Date(iso);
        return isNaN(parsed.getTime()) ? null : parsed;
      }
      const parsed = new Date(date);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    // node-ical DateWithTimeZone - cast to any for toString access
    try {
      const parsed = new Date((date as unknown as { toString(): string }).toString());
      return isNaN(parsed.getTime()) ? null : parsed;
    } catch {
      return null;
    }
  }

  /**
   * Check if event is all-day
   */
  private isAllDayEvent(event: ical.VEvent): boolean {
    // All-day events typically have date-only start (no time component)
    const start = event.start;
    if (!start) return false;

    // node-ical marks date-only values with isDate flag
    if (typeof start === 'object' && 'isDate' in start) {
      return (start as any).isDate === true;
    }

    // Check if it's a date-only value (VALUE=DATE)
    if (typeof start === 'object' && 'dateOnly' in start) {
      return (start as any).dateOnly === true;
    }

    // Check datetype property
    if (typeof start === 'object' && 'tz' in start) {
      // If timezone is undefined and time is midnight, likely all-day
      const dateObj = this.parseDate(start);
      if (!dateObj) return false;
      return dateObj.getHours() === 0 && dateObj.getMinutes() === 0;
    }

    return false;
  }

  /**
   * Extract and normalize timezone from event.
   * Handles:
   * - IANA timezones (America/New_York)
   * - Windows timezone names (Eastern Standard Time) via resolveCalendarTimeZone
   * - Apple X-LIC-LOCATION embedded in VTIMEZONE
   * - Missing VTIMEZONE → defaults to UTC
   */
  private extractTimezone(event: ical.VEvent): string | undefined {
    const start = event.start;
    let rawTz: string | undefined;

    if (typeof start === 'object' && 'tz' in start) {
      rawTz = (start as any).tz;
    }

    // Fallback: Apple Calendar embeds IANA timezone in X-LIC-LOCATION
    if (!rawTz && typeof (event as any)['x-lic-location'] === 'string') {
      rawTz = (event as any)['x-lic-location'];
    }

    if (!rawTz) {
      return undefined; // No timezone info → UTC implied by caller
    }

    return resolveCalendarTimeZone(rawTz);
  }

  /**
   * Extract URL from event
   */
  private extractUrl(event: ical.VEvent): string | undefined {
    const url = event.url;
    if (!url) return undefined;
    if (typeof url === 'string') return url;
    // Handle object format with val property
    if (typeof url === 'object' && 'val' in url) {
      return (url as any).val;
    }
    return undefined;
  }

  /**
   * Extract recurrence rules
   */
  private extractRecurrence(event: ical.VEvent): string[] | undefined {
    const rrule = event.rrule as any;
    if (!rrule) return undefined;

    // node-ical returns rrule as RRule object or string
    if (typeof rrule === 'string') {
      const lines = rrule
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .filter(Boolean);
      const recurrenceLines = lines.filter((line: string) =>
        line.toUpperCase().startsWith('RRULE'),
      );
      if (recurrenceLines.length) {
        return recurrenceLines.map((line: string) => line.replace(/^RRULE:/i, '').trim());
      }
      return lines;
    }

    if (rrule && typeof rrule.toString === 'function') {
      const str = rrule.toString();
      const lines = str
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .filter(Boolean);
      const recurrenceLines = lines.filter((line: string) =>
        line.toUpperCase().startsWith('RRULE'),
      );
      if (recurrenceLines.length) {
        return recurrenceLines.map((line: string) => line.replace(/^RRULE:/i, '').trim());
      }
      return lines;
    }

    return undefined;
  }

  /**
   * Map event status to standard values
   */
  private mapEventStatus(status?: unknown): ParsedCalendarInvite['status'] {
    if (!status || typeof status !== 'string') return undefined;

    const upper = status.toUpperCase();
    if (upper === 'TENTATIVE' || upper === 'CONFIRMED' || upper === 'CANCELLED') {
      return upper;
    }

    return undefined;
  }

  /**
   * Generate a unique UID
   */
  private generateUid(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}@pmsync`;
  }
}
