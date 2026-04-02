/**
 * ContactTimelineService - Unified timeline aggregation across
 * emails, CRM activities, tasks, meetings, and tickets for a contact.
 *
 * Phase 141: Contact 360 & Hover Cards (Plan 01).
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContactCrudService } from './contact-crud.service';
import type {
  TimelineEntryDto,
  TimelineEntryType,
  TimelineResponseDto,
} from '../dto/contact-timeline.dto';

const SENT_FOLDERS = ['SENT', '[Gmail]/Sent Mail', 'Sent Items', 'Sent'];

@Injectable()
export class ContactTimelineService {
  private readonly logger = new Logger(ContactTimelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crudService: ContactCrudService,
  ) {}

  async getTimeline(
    tenantId: string,
    contactId: string,
    cursor?: string,
    limit = 20,
  ): Promise<TimelineResponseDto> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const fetchLimit = safeLimit + 1; // fetch one extra to detect next page

    const contact = await this.crudService.getContact(tenantId, contactId);

    // Extract email addresses from contact's JSON emails field
    const contactEmails: string[] = [];
    if (contact.emails && Array.isArray(contact.emails)) {
      for (const e of contact.emails as Array<{ value?: string }>) {
        if (e.value) contactEmails.push(e.value.toLowerCase());
      }
    }

    const cursorDate = cursor ? new Date(cursor) : undefined;

    const [
      sentEmails,
      receivedEmails,
      crmActivities,
      tasks,
      tickets,
      meetings,
    ] = await Promise.all([
      this.fetchSentEmails(tenantId, contactEmails, cursorDate, fetchLimit),
      this.fetchReceivedEmails(tenantId, contactEmails, cursorDate, fetchLimit),
      this.fetchCrmActivities(tenantId, contactId, cursorDate, fetchLimit),
      this.fetchTasks(tenantId, contactId, cursorDate, fetchLimit),
      this.fetchTickets(tenantId, contactId, cursorDate, fetchLimit),
      this.fetchMeetings(tenantId, contactEmails, cursorDate, fetchLimit),
    ]);

    // Merge all entries and sort descending by date
    const allEntries: TimelineEntryDto[] = [
      ...sentEmails,
      ...receivedEmails,
      ...crmActivities,
      ...tasks,
      ...tickets,
      ...meetings,
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Paginate: take limit+1 to detect next page
    const hasMore = allEntries.length > safeLimit;
    const entries = allEntries.slice(0, safeLimit);
    const nextCursor = hasMore && entries.length > 0
      ? entries[entries.length - 1].date
      : null;

    return { entries, nextCursor, total: -1 };
  }

  private async fetchSentEmails(
    tenantId: string,
    contactEmails: string[],
    cursor: Date | undefined,
    limit: number,
  ): Promise<TimelineEntryDto[]> {
    if (!contactEmails.length) return [];

    const emails = await this.prisma.email.findMany({
      where: {
        tenantId,
        isDeleted: false,
        folder: { in: SENT_FOLDERS },
        to: { hasSome: contactEmails },
        ...(cursor ? { sentAt: { lt: cursor } } : {}),
      },
      select: { id: true, subject: true, snippet: true, sentAt: true, receivedAt: true },
      orderBy: { sentAt: 'desc' },
      take: limit,
    });

    return emails.map((e) => ({
      id: `timeline-email-sent-${e.id}`,
      type: 'email_sent' as TimelineEntryType,
      title: e.subject || 'Email sent',
      summary: e.snippet || null,
      date: (e.sentAt || e.receivedAt).toISOString(),
      metadata: { emailId: e.id },
      entityId: e.id,
    }));
  }

  private async fetchReceivedEmails(
    tenantId: string,
    contactEmails: string[],
    cursor: Date | undefined,
    limit: number,
  ): Promise<TimelineEntryDto[]> {
    if (!contactEmails.length) return [];

    const fromConditions = contactEmails.map((email) => ({
      from: { contains: email, mode: 'insensitive' as const },
    }));

    const emails = await this.prisma.email.findMany({
      where: {
        tenantId,
        isDeleted: false,
        OR: fromConditions,
        ...(cursor ? { receivedAt: { lt: cursor } } : {}),
      },
      select: { id: true, subject: true, snippet: true, from: true, sentAt: true, receivedAt: true },
      orderBy: { receivedAt: 'desc' },
      take: limit,
    });

    return emails.map((e) => ({
      id: `timeline-email-recv-${e.id}`,
      type: 'email_received' as TimelineEntryType,
      title: e.subject || 'Email received',
      summary: e.snippet || null,
      date: (e.receivedAt || e.sentAt || new Date()).toISOString(),
      metadata: { emailId: e.id, from: e.from },
      entityId: e.id,
    }));
  }

  private async fetchCrmActivities(
    tenantId: string,
    contactId: string,
    cursor: Date | undefined,
    limit: number,
  ): Promise<TimelineEntryDto[]> {
    // Get deal IDs linked to this contact
    const dealContacts = await this.prisma.dealContact.findMany({
      where: { contactId, tenantId },
      select: { dealId: true },
    });

    const dealIds = dealContacts.map((dc) => dc.dealId);
    if (!dealIds.length) return [];

    // Exclude EMAIL type to avoid duplication with actual email records
    const activities = await this.prisma.crmActivity.findMany({
      where: {
        tenantId,
        dealId: { in: dealIds },
        type: { not: 'EMAIL' },
        ...(cursor ? { createdAt: { lt: cursor } } : {}),
      },
      select: { id: true, type: true, content: true, metadata: true, createdAt: true, dealId: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return activities.map((a) => {
      let entryType: TimelineEntryType = 'deal_activity';
      if (a.type === 'NOTE') entryType = 'note';
      else if (a.type === 'CALL' || a.type === 'MEETING') entryType = 'meeting';
      else if (a.type === 'TASK') entryType = 'task';

      return {
        id: `timeline-crm-${a.id}`,
        type: entryType,
        title: a.content || `Deal ${a.type.toLowerCase()}`,
        summary: null,
        date: a.createdAt.toISOString(),
        metadata: (a.metadata as Record<string, unknown>) ?? {},
        entityId: a.dealId || a.id,
      };
    });
  }

  private async fetchTasks(
    tenantId: string,
    contactId: string,
    cursor: Date | undefined,
    limit: number,
  ): Promise<TimelineEntryDto[]> {
    const tasks = await this.prisma.manualTask.findMany({
      where: {
        tenantId,
        contactId,
        ...(cursor ? { createdAt: { lt: cursor } } : {}),
      },
      select: { id: true, title: true, description: true, status: true, dueDate: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return tasks.map((t) => ({
      id: `timeline-task-${t.id}`,
      type: 'task' as TimelineEntryType,
      title: t.title,
      summary: t.description || null,
      date: (t.dueDate || t.createdAt).toISOString(),
      metadata: { status: t.status, dueDate: t.dueDate?.toISOString() ?? null },
      entityId: t.id,
    }));
  }

  private async fetchTickets(
    tenantId: string,
    contactId: string,
    cursor: Date | undefined,
    limit: number,
  ): Promise<TimelineEntryDto[]> {
    const tickets = await this.prisma.ticket.findMany({
      where: {
        tenantId,
        contactId,
        ...(cursor ? { createdAt: { lt: cursor } } : {}),
      },
      select: { id: true, subject: true, description: true, status: true, priority: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return tickets.map((t) => ({
      id: `timeline-ticket-${t.id}`,
      type: 'ticket' as TimelineEntryType,
      title: t.subject,
      summary: t.description || null,
      date: t.createdAt.toISOString(),
      metadata: { status: t.status, priority: t.priority },
      entityId: t.id,
    }));
  }

  private async fetchMeetings(
    tenantId: string,
    contactEmails: string[],
    cursor: Date | undefined,
    limit: number,
  ): Promise<TimelineEntryDto[]> {
    if (!contactEmails.length) return [];

    // Fetch calendar events from last year, filter by attendee emails in-app
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        startTime: { gte: oneYearAgo },
        ...(cursor ? { startTime: { gte: oneYearAgo, lt: cursor } } : {}),
      },
      select: { id: true, title: true, description: true, attendees: true, startTime: true, location: true },
      orderBy: { startTime: 'desc' },
      take: limit * 3, // over-fetch to compensate for in-app attendee filtering
    });

    const matched: TimelineEntryDto[] = [];
    for (const event of events) {
      if (matched.length >= limit) break;
      if (!event.attendees) continue;

      // attendees is a JSON array of objects with email field
      const attendees = event.attendees as Array<{ email?: string; displayName?: string }>;
      const hasContact = attendees.some(
        (a) => a.email && contactEmails.includes(a.email.toLowerCase()),
      );
      if (!hasContact) continue;

      matched.push({
        id: `timeline-meeting-${event.id}`,
        type: 'meeting' as TimelineEntryType,
        title: event.title || 'Meeting',
        summary: event.location || event.description || null,
        date: event.startTime.toISOString(),
        metadata: { location: event.location },
        entityId: event.id,
      });
    }

    return matched;
  }
}
