/**
 * Meeting Prep Service
 *
 * Pre-meeting briefing with attendee info and recent email context.
 * Pure data service -- NO LLM calls.
 * For LLM-enhanced summaries, the AI module's BriefingService can consume this.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────

export interface MeetingPrep {
  eventId: string;
  title: string;
  startTime: Date;
  attendees: MeetingAttendee[];
  suggestedAgenda: string[];
}

export interface MeetingAttendee {
  email: string;
  name: string | null;
  contactId: string | null;
  recentEmails: AttendeeEmail[];
  relationshipScore: number | null;
}

interface AttendeeEmail {
  id: string;
  subject: string;
  date: Date;
  snippet: string;
}

interface ParsedAttendee {
  email: string;
  displayName?: string;
  responseStatus?: string;
}

// ─── Service ────────────────────────────────────────────────────

@Injectable()
export class MeetingPrepService {
  private readonly logger = new Logger(MeetingPrepService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Assemble pre-meeting briefing for a calendar event.
   *
   * 1. Load the event
   * 2. Parse attendees from JSON field
   * 3. For each attendee: look up contact, load recent emails, get relationship score
   * 4. Build data-driven agenda suggestions from email subjects
   */
  async prepareMeeting(tenantId: string, eventId: string): Promise<MeetingPrep> {
    // 1. Load the calendar event
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, tenantId, isDeleted: false },
      select: {
        id: true,
        title: true,
        startTime: true,
        attendees: true,
        description: true,
      },
    });

    if (!event) {
      throw new NotFoundException(`Calendar event ${eventId} not found`);
    }

    // 2. Parse attendees from JSON
    const parsedAttendees = this.parseAttendees(event.attendees);

    if (parsedAttendees.length === 0) {
      return {
        eventId: event.id,
        title: event.title,
        startTime: event.startTime,
        attendees: [],
        suggestedAgenda: [],
      };
    }

    // 3. Enrich each attendee with contact info and recent emails
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const attendeeEmails = parsedAttendees.map(a => a.email.toLowerCase());

    // Batch query: find contacts for all attendee emails
    const contactMap = await this.findContactsByEmails(tenantId, attendeeEmails);

    // Batch query: find recent emails for all attendees
    const recentEmailMap = await this.findRecentEmails(
      tenantId,
      attendeeEmails,
      thirtyDaysAgo,
    );

    const enrichedAttendees: MeetingAttendee[] = parsedAttendees.map(attendee => {
      const emailLower = attendee.email.toLowerCase();
      const contact = contactMap.get(emailLower);
      const emails = recentEmailMap.get(emailLower) ?? [];

      return {
        email: attendee.email,
        name: attendee.displayName ?? contact?.displayName ?? null,
        contactId: contact?.id ?? null,
        recentEmails: emails,
        relationshipScore: contact?.relationshipScore ?? null,
      };
    });

    // 4. Build agenda suggestions from recent email subjects
    const suggestedAgenda = this.buildAgendaSuggestions(
      enrichedAttendees,
      event.title,
      event.description,
    );

    return {
      eventId: event.id,
      title: event.title,
      startTime: event.startTime,
      attendees: enrichedAttendees,
      suggestedAgenda,
    };
  }

  // ─── Private helpers ────────────────────────────────────────

  /**
   * Parse attendees from the CalendarEvent JSON field.
   * Handles various formats: Google (email/displayName), Microsoft (emailAddress).
   */
  private parseAttendees(attendeesJson: unknown): ParsedAttendee[] {
    if (!attendeesJson || !Array.isArray(attendeesJson)) return [];

    const result: ParsedAttendee[] = [];

    for (const entry of attendeesJson) {
      if (!entry || typeof entry !== 'object') continue;

      let email: string | undefined;
      let displayName: string | undefined;

      // Google format: { email, displayName, responseStatus }
      if (typeof entry.email === 'string') {
        email = entry.email;
        displayName = entry.displayName;
      }
      // Microsoft format: { emailAddress: { address, name } }
      else if (entry.emailAddress && typeof entry.emailAddress.address === 'string') {
        email = entry.emailAddress.address;
        displayName = entry.emailAddress.name;
      }

      if (email) {
        result.push({
          email,
          displayName: displayName || undefined,
          responseStatus: entry.responseStatus,
        });
      }
    }

    return result;
  }

  /**
   * Find contacts matching attendee emails via raw JSONB query.
   * Uses the same pattern as ContactsService.findContactsByEmails.
   */
  private async findContactsByEmails(
    tenantId: string,
    emails: string[],
  ): Promise<Map<string, { id: string; displayName: string | null; relationshipScore: number | null }>> {
    if (emails.length === 0) return new Map();

    const contacts = await this.prisma.$queryRaw<
      Array<{
        id: string;
        displayName: string | null;
        relationshipScore: number | null;
        emails: Array<{ value: string }>;
      }>
    >`
      SELECT id, "displayName", "relationshipScore", emails
      FROM "unified_contacts"
      WHERE "tenantId" = ${tenantId}
        AND "isDeleted" = false
        AND emails IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(emails) AS email_obj
          WHERE LOWER(email_obj->>'value') = ANY(${emails}::text[])
        )
    `;

    const map = new Map<string, { id: string; displayName: string | null; relationshipScore: number | null }>();
    for (const contact of contacts) {
      if (!contact.emails) continue;
      for (const emailObj of contact.emails) {
        const normalized = emailObj.value.toLowerCase();
        if (emails.includes(normalized)) {
          map.set(normalized, {
            id: contact.id,
            displayName: contact.displayName,
            relationshipScore: contact.relationshipScore,
          });
        }
      }
    }

    return map;
  }

  /**
   * Find recent emails (last 30 days) involving any of the attendee emails.
   */
  private async findRecentEmails(
    tenantId: string,
    emails: string[],
    since: Date,
  ): Promise<Map<string, AttendeeEmail[]>> {
    if (emails.length === 0) return new Map();

    const recentEmails = await this.prisma.email.findMany({
      where: {
        tenantId,
        receivedAt: { gte: since },
        isDeleted: false,
        OR: [
          { from: { in: emails } },
          { to: { hasSome: emails } },
        ],
      },
      select: { id: true, from: true, to: true, subject: true, receivedAt: true, snippet: true },
      orderBy: { receivedAt: 'desc' },
      take: 100, // Cap total for performance
    });

    // Group by attendee email (each email may appear in multiple attendees' lists)
    const map = new Map<string, AttendeeEmail[]>();

    for (const email of recentEmails) {
      const item: AttendeeEmail = {
        id: email.id,
        subject: email.subject ?? '(no subject)',
        date: email.receivedAt,
        snippet: email.snippet ?? '',
      };

      const fromLower = email.from.toLowerCase();
      if (emails.includes(fromLower)) {
        this.appendToMap(map, fromLower, item);
      }
      for (const toAddr of email.to) {
        const toLower = toAddr.toLowerCase();
        if (emails.includes(toLower)) {
          this.appendToMap(map, toLower, item);
        }
      }
    }

    // Limit per attendee to 5 most recent
    for (const [key, items] of map.entries()) {
      map.set(key, items.slice(0, 5));
    }

    return map;
  }

  private appendToMap(
    map: Map<string, AttendeeEmail[]>,
    key: string,
    item: AttendeeEmail,
  ): void {
    const list = map.get(key) ?? [];
    // Avoid duplicates by email id
    if (!list.some(e => e.id === item.id)) {
      list.push(item);
      map.set(key, list);
    }
  }

  /**
   * Build agenda suggestions from recent email subjects.
   * Data-driven: extract common topics/keywords from attendees' recent emails.
   */
  private buildAgendaSuggestions(
    attendees: MeetingAttendee[],
    eventTitle: string,
    eventDescription: string | null,
  ): string[] {
    const suggestions: string[] = [];

    // Collect all recent email subjects
    const allSubjects = attendees.flatMap(a =>
      a.recentEmails.map(e => e.subject),
    );

    if (allSubjects.length === 0) {
      return eventDescription
        ? ['Review meeting description and objectives']
        : [];
    }

    // Find unique topics from email subjects (deduplicate by normalizing)
    const topicCounts = new Map<string, number>();
    for (const subject of allSubjects) {
      const normalized = this.normalizeSubject(subject);
      if (normalized && normalized !== eventTitle.toLowerCase()) {
        topicCounts.set(normalized, (topicCounts.get(normalized) ?? 0) + 1);
      }
    }

    // Sort by frequency and take top 5
    const topTopics = [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [topic] of topTopics) {
      suggestions.push(`Discuss: ${topic}`);
    }

    // Add attendee-specific notes
    const highScoreAttendees = attendees.filter(
      a => a.relationshipScore != null && a.relationshipScore >= 50,
    );
    if (highScoreAttendees.length > 0) {
      suggestions.push(
        `Review recent communications with ${highScoreAttendees.map(a => a.name ?? a.email).join(', ')}`,
      );
    }

    return suggestions.slice(0, 5);
  }

  /**
   * Normalize email subject for topic extraction.
   * Strips Re:, Fwd:, and common prefixes.
   */
  private normalizeSubject(subject: string): string {
    return subject
      .replace(/^(re|fwd|fw):\s*/gi, '')
      .replace(/^(re|fwd|fw):\s*/gi, '') // Handle double Re: Re:
      .trim()
      .toLowerCase();
  }
}
