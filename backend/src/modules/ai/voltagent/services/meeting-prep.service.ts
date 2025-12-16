/**
 * Meeting Prep Assistant Service (P2 Smart Scheduling)
 *
 * Prepares meeting briefs with context from emails, contacts, and previous meetings.
 * Generates suggested agendas and reminds about pending action items.
 *
 * Key Features:
 * - Related email retrieval for meeting context
 * - Attendee information and relationship data
 * - Previous meeting summaries with same attendees
 * - AI-generated meeting agenda suggestions
 * - Pending action items reminder
 *
 * Reference: docs/AI_SECRETARY_IMPLEMENTATION_PLAN.md Phase 2
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService } from '../../../../common/services/cache.service';
import { LongTermMemoryService } from '../memory';
import { subDays } from 'date-fns';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface MeetingAttendee {
  email: string;
  name?: string;
  contactId?: string;
  relationshipScore?: number;
  lastInteraction?: Date;
  company?: string;
  role?: string;
}

export interface RelatedEmail {
  id: string;
  subject: string;
  from: string;
  date: Date;
  snippet: string;
  relevanceScore: number;
}

export interface PreviousMeeting {
  id: string;
  title: string;
  date: Date;
  attendees: string[];
  summary?: string;
}

export interface ActionItemReminder {
  id: string;
  title: string;
  dueDate?: Date;
  assignee?: string;
  status: string;
  relatedTo?: string;
}

export interface MeetingBrief {
  event: {
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
    location?: string;
    description?: string;
  };
  attendees: MeetingAttendee[];
  relatedEmails: RelatedEmail[];
  previousMeetings: PreviousMeeting[];
  suggestedAgenda: string[];
  pendingActionItems: ActionItemReminder[];
  context: {
    userMemories: string[];
    importantNotes: string[];
  };
  generatedAt: Date;
}

export interface PrepBriefOptions {
  includeEmails?: boolean;
  emailLookbackDays?: number;
  includePreviousMeetings?: boolean;
  includeActionItems?: boolean;
  includeMemories?: boolean;
  maxEmails?: number;
}

// ============================================================================
// Service Implementation
// ============================================================================

@Injectable()
export class MeetingPrepService {
  private readonly logger = new Logger(MeetingPrepService.name);
  private readonly CACHE_TTL = 1800; // 30 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly memoryService: LongTermMemoryService,
  ) {}

  /**
   * Generate a comprehensive meeting brief
   */
  async prepareBrief(
    tenantId: string,
    userId: string,
    eventId: string,
    options: PrepBriefOptions = {},
  ): Promise<MeetingBrief> {
    const {
      includeEmails = true,
      emailLookbackDays = 30,
      includePreviousMeetings = true,
      includeActionItems = true,
      includeMemories = true,
      maxEmails = 10,
    } = options;

    // Check cache first
    const cacheKey = `meeting:brief:${tenantId}:${eventId}`;
    const cached = await this.cacheService.get<MeetingBrief>(cacheKey);
    if (cached) {
      this.logger.debug(`Returning cached brief for event ${eventId}`);
      return cached;
    }

    // Get the calendar event
    const event = await this.prisma.calendarEvent.findFirst({
      where: {
        id: eventId,
        tenantId,
        isDeleted: false,
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        location: true,
        description: true,
        attendees: true,
        organizer: true,
      },
    });

    if (!event) {
      throw new Error(`Event ${eventId} not found`);
    }

    // Parse attendees from JSON field
    const attendeeEmails = this.parseAttendees(event.attendees);

    // Gather all context in parallel
    const [attendeeInfo, relatedEmails, previousMeetings, actionItems, memories] =
      await Promise.all([
        this.getAttendeeInfo(tenantId, attendeeEmails),
        includeEmails
          ? this.getRelatedEmails(tenantId, event.title, attendeeEmails, emailLookbackDays, maxEmails)
          : [],
        includePreviousMeetings
          ? this.getPreviousMeetings(tenantId, attendeeEmails)
          : [],
        includeActionItems
          ? this.getPendingActionItems(tenantId, userId, attendeeEmails)
          : [],
        includeMemories
          ? this.getRelevantMemories(tenantId, userId, event.title, attendeeEmails)
          : { userMemories: [], importantNotes: [] },
      ]);

    // Generate suggested agenda
    const suggestedAgenda = this.generateAgendaSuggestions(
      event,
      relatedEmails,
      actionItems,
    );

    const brief: MeetingBrief = {
      event: {
        id: event.id,
        title: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location ?? undefined,
        description: event.description ?? undefined,
      },
      attendees: attendeeInfo,
      relatedEmails,
      previousMeetings,
      suggestedAgenda,
      pendingActionItems: actionItems,
      context: memories,
      generatedAt: new Date(),
    };

    // Cache the brief
    await this.cacheService.set(cacheKey, brief, { ttl: this.CACHE_TTL });

    this.logger.log(`Generated meeting brief for event ${eventId}`);
    return brief;
  }

  /**
   * Get upcoming meetings that need preparation
   */
  async getUpcomingMeetingsNeedingPrep(
    tenantId: string,
    userId: string,
    hoursAhead: number = 24,
  ): Promise<
    {
      id: string;
      title: string;
      startTime: Date;
      attendeeCount: number;
      hasBrief: boolean;
    }[]
  > {
    const now = new Date();
    const cutoff = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        isDeleted: false,
        isCancelled: false,
        startTime: { gte: now, lte: cutoff },
        // Only meetings with attendees (non-null)
        attendees: { not: { equals: null } },
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        attendees: true,
      },
      orderBy: { startTime: 'asc' },
    });

    return events.map((event) => ({
      id: event.id,
      title: event.title,
      startTime: event.startTime,
      attendeeCount: this.parseAttendees(event.attendees).length,
      hasBrief: false, // Could check cache
    }));
  }

  /**
   * Parse attendees from JSON field
   */
  private parseAttendees(attendees: unknown): string[] {
    if (!attendees) return [];

    if (Array.isArray(attendees)) {
      return attendees
        .map((a: any) => a.email || a)
        .filter((e): e is string => typeof e === 'string');
    }

    if (typeof attendees === 'object') {
      const obj = attendees as Record<string, any>;
      if (obj.email) return [obj.email];
    }

    return [];
  }

  /**
   * Get detailed info about attendees
   */
  private async getAttendeeInfo(
    tenantId: string,
    emails: string[],
  ): Promise<MeetingAttendee[]> {
    if (emails.length === 0) return [];

    // Contact model uses 'emails' (Json array) not 'primaryEmail'
    // We need to find contacts by matching any of their emails
    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId,
        isDeleted: false,
      },
      select: {
        id: true,
        displayName: true,
        emails: true,
        company: true,
        jobTitle: true,
        relationshipScore: true,
        lastInteractedAt: true,
      },
    });

    // Filter contacts that have matching emails and build lookup map
    const contactMap = new Map<string, typeof contacts[0]>();
    for (const contact of contacts) {
      const contactEmails = this.parseContactEmails(contact.emails);
      for (const email of contactEmails) {
        if (emails.some((e) => e.toLowerCase() === email.toLowerCase())) {
          contactMap.set(email.toLowerCase(), contact);
        }
      }
    }

    return emails.map((email) => {
      const contact = contactMap.get(email.toLowerCase());
      return {
        email,
        name: contact?.displayName ?? undefined,
        contactId: contact?.id,
        relationshipScore: contact?.relationshipScore ?? undefined,
        lastInteraction: contact?.lastInteractedAt ?? undefined,
        company: contact?.company ?? undefined,
        role: contact?.jobTitle ?? undefined,
      };
    });
  }

  /**
   * Get emails related to the meeting topic or attendees
   */
  private async getRelatedEmails(
    tenantId: string,
    meetingTitle: string,
    attendeeEmails: string[],
    lookbackDays: number,
    maxEmails: number,
  ): Promise<RelatedEmail[]> {
    const cutoffDate = subDays(new Date(), lookbackDays);

    // Search for emails with attendees or matching subject
    // Note: Email model uses 'sentAt' not 'date'
    const emails = await this.prisma.email.findMany({
      where: {
        tenantId,
        isDeleted: false,
        sentAt: { gte: cutoffDate },
        OR: [
          // From/to attendees
          { from: { in: attendeeEmails } },
          // Subject contains meeting title keywords
          {
            subject: {
              contains: meetingTitle.split(' ')[0],
              mode: 'insensitive',
            },
          },
        ],
      },
      select: {
        id: true,
        subject: true,
        from: true,
        sentAt: true,
        snippet: true,
      },
      orderBy: { sentAt: 'desc' },
      take: maxEmails * 2, // Get more to filter
    });

    // Score relevance
    return emails
      .map((email) => ({
        id: email.id,
        subject: email.subject ?? '',
        from: email.from ?? '',
        date: email.sentAt,
        snippet: email.snippet ?? '',
        relevanceScore: this.calculateEmailRelevance(
          email,
          meetingTitle,
          attendeeEmails,
        ),
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxEmails);
  }

  /**
   * Get previous meetings with same attendees
   */
  private async getPreviousMeetings(
    tenantId: string,
    attendeeEmails: string[],
  ): Promise<PreviousMeeting[]> {
    if (attendeeEmails.length === 0) return [];

    const now = new Date();
    const threeMonthsAgo = subDays(now, 90);

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId,
        isDeleted: false,
        isCancelled: false,
        startTime: { gte: threeMonthsAgo, lt: now },
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        attendees: true,
        description: true,
      },
      orderBy: { startTime: 'desc' },
      take: 50, // Get recent meetings to filter
    });

    // Filter to meetings with overlapping attendees
    return events
      .filter((event) => {
        const eventAttendees = this.parseAttendees(event.attendees);
        return eventAttendees.some((a) =>
          attendeeEmails.includes(a.toLowerCase()),
        );
      })
      .slice(0, 5)
      .map((event) => ({
        id: event.id,
        title: event.title,
        date: event.startTime,
        attendees: this.parseAttendees(event.attendees),
        summary: event.description?.substring(0, 200) ?? undefined,
      }));
  }

  /**
   * Get pending action items related to meeting attendees
   * Note: ActionItem model doesn't exist yet - returns empty array
   * TODO: Implement when ActionItem model is added to schema
   */
  private async getPendingActionItems(
    _tenantId: string,
    _userId: string,
    _attendeeEmails: string[],
  ): Promise<ActionItemReminder[]> {
    // ActionItem model not yet in schema - return empty for now
    // This will be populated when action item tracking is implemented
    return [];
  }

  /**
   * Get relevant memories about meeting topic or attendees
   */
  private async getRelevantMemories(
    tenantId: string,
    userId: string,
    meetingTitle: string,
    attendeeEmails: string[],
  ): Promise<{ userMemories: string[]; importantNotes: string[] }> {
    try {
      // Search memories related to meeting using searchMemories method
      const memories = await this.memoryService.searchMemories(
        tenantId,
        userId,
        `${meetingTitle} ${attendeeEmails.join(' ')}`,
        { limit: 5 },
      );

      const userMemories = memories
        .filter((m) => m.category === 'CONTACT')
        .map((m) => m.memory);

      const importantNotes = memories
        .filter((m) => m.category !== 'CONTACT')
        .map((m) => m.memory);

      return { userMemories, importantNotes };
    } catch (error) {
      this.logger.warn('Failed to fetch memories for meeting prep', error);
      return { userMemories: [], importantNotes: [] };
    }
  }

  /**
   * Generate agenda suggestions based on context
   */
  private generateAgendaSuggestions(
    event: { title: string; description?: string | null },
    relatedEmails: RelatedEmail[],
    actionItems: ActionItemReminder[],
  ): string[] {
    const agenda: string[] = [];

    // Add standard opening
    agenda.push('Welcome and introductions');

    // Add meeting topic from title
    if (event.title) {
      const topic = event.title.replace(/^(Re:|Fwd:|Meeting:)/i, '').trim();
      agenda.push(`Discussion: ${topic}`);
    }

    // Add items from description
    if (event.description) {
      const lines = event.description.split('\n').filter((l) => l.trim());
      const bulletPoints = lines.filter(
        (l) => l.match(/^[-•*]\s/) || l.match(/^\d+\.\s/),
      );
      bulletPoints.slice(0, 3).forEach((bp) => {
        agenda.push(bp.replace(/^[-•*\d.]\s*/, ''));
      });
    }

    // Add action items review if any
    if (actionItems.length > 0) {
      agenda.push('Review pending action items');
    }

    // Add follow-up topics from emails
    const emailTopics = relatedEmails
      .slice(0, 2)
      .map((e) => e.subject)
      .filter((s) => s && s.length > 10);

    if (emailTopics.length > 0) {
      agenda.push('Follow up on recent discussions');
    }

    // Add standard closing
    agenda.push('Next steps and action items');
    agenda.push('Schedule follow-up (if needed)');

    return agenda;
  }

  /**
   * Calculate relevance score for an email (0-100)
   */
  private calculateEmailRelevance(
    email: { subject: string | null; from: string | null; snippet: string | null },
    meetingTitle: string,
    attendeeEmails: string[],
  ): number {
    let score = 0;

    // Check if from/to attendee
    if (email.from && attendeeEmails.some((a) => email.from?.includes(a))) {
      score += 40;
    }

    // Check subject match
    const titleWords = meetingTitle.toLowerCase().split(/\s+/);
    const subjectWords = (email.subject ?? '').toLowerCase().split(/\s+/);
    const matchingWords = titleWords.filter((w) =>
      subjectWords.some((sw) => sw.includes(w) && w.length > 3),
    );
    score += matchingWords.length * 15;

    // Check snippet for keywords
    const snippet = (email.snippet ?? '').toLowerCase();
    if (titleWords.some((w) => snippet.includes(w) && w.length > 3)) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Parse emails from Contact's emails JSON field
   */
  private parseContactEmails(emails: unknown): string[] {
    if (!emails) return [];

    if (Array.isArray(emails)) {
      return emails
        .map((e: unknown) => {
          if (typeof e === 'string') return e;
          if (typeof e === 'object' && e !== null && 'email' in e) {
            return (e as { email: string }).email;
          }
          if (typeof e === 'object' && e !== null && 'value' in e) {
            return (e as { value: string }).value;
          }
          return null;
        })
        .filter((e): e is string => typeof e === 'string' && e.length > 0);
    }

    return [];
  }
}
