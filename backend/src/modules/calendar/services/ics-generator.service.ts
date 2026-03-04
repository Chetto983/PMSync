import { Injectable, Logger } from '@nestjs/common';
import icalGenerator, { ICalAttendeeStatus, ICalEventStatus, ICalCalendarMethod } from 'ical-generator';
import { ParsedCalendarInvite } from './ics-parser.service';

/**
 * Response type for calendar invitations
 */
export type CalendarResponseType = 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';

/**
 * Event data for creating new calendar invitations
 */
export interface CreateEventData {
  uid?: string;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  startTime: Date;
  endTime: Date;
  isAllDay?: boolean;
  timezone?: string;
  organizer: {
    email: string;
    name?: string;
  };
  attendees: Array<{
    email: string;
    name?: string;
    rsvp?: boolean;
  }>;
  recurrence?: string;
}

/**
 * Service for generating ICS (iCalendar) files
 *
 * Supports:
 * - iTIP REPLY (respond to invitations)
 * - iTIP REQUEST (send invitations)
 * - iTIP CANCEL (cancel meetings)
 * - RFC 5545 compliant output
 */
@Injectable()
export class IcsGeneratorService {
  private readonly logger = new Logger(IcsGeneratorService.name);

  /**
   * Generate a REPLY ICS for responding to a calendar invitation
   *
   * @param invite - Original parsed invitation
   * @param response - Response type: ACCEPTED, DECLINED, TENTATIVE
   * @param attendeeEmail - Email of the person responding
   * @param attendeeName - Optional name of the person responding
   * @returns ICS content string
   */
  generateReply(
    invite: ParsedCalendarInvite,
    response: CalendarResponseType,
    attendeeEmail: string,
    attendeeName?: string,
  ): string {
    this.logger.log(`Generating REPLY ICS: ${response} for ${invite.uid}`);

    const calendar = icalGenerator({
      name: 'Calendar Response',
      method: ICalCalendarMethod.REPLY,
      prodId: '//PMSync//Calendar//EN',
    });

    // Map response to ical-generator status
    const statusMap: Record<CalendarResponseType, ICalAttendeeStatus> = {
      ACCEPTED: ICalAttendeeStatus.ACCEPTED,
      DECLINED: ICalAttendeeStatus.DECLINED,
      TENTATIVE: ICalAttendeeStatus.TENTATIVE,
    };

    const event = calendar.createEvent({
      id: invite.uid,
      sequence: invite.sequence,
      start: invite.startTime,
      end: invite.endTime,
      summary: invite.summary,
      description: invite.description,
      location: invite.location,
      url: invite.url,
      organizer: {
        email: invite.organizer.email,
        name: invite.organizer.name || invite.organizer.email,
      },
    });

    // Add the responding attendee with their status
    event.createAttendee({
      email: attendeeEmail,
      name: attendeeName,
      status: statusMap[response],
      rsvp: false, // Already responded
    });

    const icsContent = calendar.toString();
    this.logger.debug(`Generated REPLY ICS (${icsContent.length} bytes)`);

    return icsContent;
  }

  /**
   * Generate a REQUEST ICS for sending a new calendar invitation
   *
   * @param eventData - Event details
   * @returns ICS content string
   */
  generateRequest(eventData: CreateEventData): string {
    this.logger.log(`Generating REQUEST ICS: ${eventData.summary}`);

    const calendar = icalGenerator({
      name: 'Meeting Request',
      method: ICalCalendarMethod.REQUEST,
      prodId: '//PMSync//Calendar//EN',
    });

    const event = calendar.createEvent({
      id: eventData.uid || this.generateUid(),
      sequence: 0,
      start: eventData.startTime,
      end: eventData.endTime,
      allDay: eventData.isAllDay,
      summary: eventData.summary,
      description: eventData.description,
      location: eventData.location,
      url: eventData.url,
      organizer: {
        email: eventData.organizer.email,
        name: eventData.organizer.name || eventData.organizer.email,
      },
      status: ICalEventStatus.CONFIRMED,
    });

    // Set timezone if provided
    if (eventData.timezone) {
      event.timezone(eventData.timezone);
    }

    // Add attendees
    for (const attendee of eventData.attendees) {
      event.createAttendee({
        email: attendee.email,
        name: attendee.name,
        rsvp: attendee.rsvp ?? true,
        status: ICalAttendeeStatus.NEEDSACTION,
      });
    }

    // Add recurrence if provided
    if (eventData.recurrence) {
      event.repeating(eventData.recurrence);
    }

    const icsContent = calendar.toString();
    this.logger.debug(`Generated REQUEST ICS (${icsContent.length} bytes)`);

    return icsContent;
  }

  /**
   * Generate a CANCEL ICS for cancelling a calendar event
   *
   * @param invite - Original parsed invitation
   * @param reason - Optional cancellation reason
   * @returns ICS content string
   */
  generateCancel(invite: ParsedCalendarInvite, reason?: string): string {
    this.logger.log(`Generating CANCEL ICS: ${invite.uid}`);

    const calendar = icalGenerator({
      name: 'Meeting Cancellation',
      method: ICalCalendarMethod.CANCEL,
      prodId: '//PMSync//Calendar//EN',
    });

    const event = calendar.createEvent({
      id: invite.uid,
      sequence: invite.sequence + 1, // Increment sequence for update
      start: invite.startTime,
      end: invite.endTime,
      summary: invite.summary,
      description: reason || `Cancelled: ${invite.summary}`,
      location: invite.location,
      organizer: {
        email: invite.organizer.email,
        name: invite.organizer.name || invite.organizer.email,
      },
      status: ICalEventStatus.CANCELLED,
    });

    // Add all attendees so they receive cancellation
    for (const attendee of invite.attendees) {
      event.createAttendee({
        email: attendee.email,
        name: attendee.name,
        status: ICalAttendeeStatus.NEEDSACTION,
      });
    }

    const icsContent = calendar.toString();
    this.logger.debug(`Generated CANCEL ICS (${icsContent.length} bytes)`);

    return icsContent;
  }

  /**
   * Generate an UPDATE ICS for modifying an existing event
   *
   * @param invite - Original invitation with updated data
   * @returns ICS content string
   */
  generateUpdate(invite: ParsedCalendarInvite): string {
    this.logger.log(`Generating UPDATE ICS: ${invite.uid}`);

    const calendar = icalGenerator({
      name: 'Meeting Update',
      method: ICalCalendarMethod.REQUEST,
      prodId: '//PMSync//Calendar//EN',
    });

    const event = calendar.createEvent({
      id: invite.uid,
      sequence: invite.sequence + 1, // Increment sequence for update
      start: invite.startTime,
      end: invite.endTime,
      summary: invite.summary,
      description: invite.description,
      location: invite.location,
      url: invite.url,
      organizer: {
        email: invite.organizer.email,
        name: invite.organizer.name || invite.organizer.email,
      },
      status: ICalEventStatus.CONFIRMED,
    });

    // Add all attendees
    for (const attendee of invite.attendees) {
      event.createAttendee({
        email: attendee.email,
        name: attendee.name,
        rsvp: attendee.rsvp,
        status: this.mapAttendeeStatus(attendee.status),
      });
    }

    const icsContent = calendar.toString();
    this.logger.debug(`Generated UPDATE ICS (${icsContent.length} bytes)`);

    return icsContent;
  }

  /**
   * Generate a simple downloadable ICS for adding to calendar
   *
   * @param eventData - Event details
   * @returns ICS content string
   */
  generateDownloadable(eventData: CreateEventData): string {
    this.logger.log(`Generating downloadable ICS: ${eventData.summary}`);

    const calendar = icalGenerator({
      name: eventData.summary,
      prodId: '//PMSync//Calendar//EN',
    });

    const event = calendar.createEvent({
      id: eventData.uid || this.generateUid(),
      start: eventData.startTime,
      end: eventData.endTime,
      allDay: eventData.isAllDay,
      summary: eventData.summary,
      description: eventData.description,
      location: eventData.location,
      url: eventData.url,
    });

    // Set timezone if provided
    if (eventData.timezone) {
      event.timezone(eventData.timezone);
    }

    // Add recurrence if provided
    if (eventData.recurrence) {
      event.repeating(eventData.recurrence);
    }

    return calendar.toString();
  }

  /**
   * Map attendee status string to ical-generator enum
   */
  private mapAttendeeStatus(status: string): ICalAttendeeStatus {
    const statusMap: Record<string, ICalAttendeeStatus> = {
      'ACCEPTED': ICalAttendeeStatus.ACCEPTED,
      'DECLINED': ICalAttendeeStatus.DECLINED,
      'TENTATIVE': ICalAttendeeStatus.TENTATIVE,
      'NEEDS-ACTION': ICalAttendeeStatus.NEEDSACTION,
    };

    return statusMap[status] || ICalAttendeeStatus.NEEDSACTION;
  }

  /**
   * Generate a unique UID for new events
   */
  private generateUid(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `${timestamp}-${random}@pmsync.app`;
  }
}
