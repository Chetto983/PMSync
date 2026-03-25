/**
 * @deprecated Use EntityGraphService instead. Kept for migration period.
 * Will be removed once all consumers use the entity graph pipeline.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

// ─── Result types ───────────────────────────────────────────

export interface ThreadSibling {
  emailId: string;
  subject: string | null;
  from: string | null;
  snippet: string | null;
  receivedAt: Date | null;
  threadId: string;
}

export interface ContactMatch {
  contactId: string;
  displayName: string | null;
  company: string | null;
  jobTitle: string | null;
  relationshipScore: number | null;
  recentEmails: Array<{
    emailId: string;
    subject: string | null;
    receivedAt: Date | null;
  }>;
}

export interface CalendarMatch {
  eventId: string;
  title: string | null;
  startTime: Date | null;
  endTime: Date | null;
  location: string | null;
}

export interface GraphExpansionResult {
  threadSiblings: ThreadSibling[];
  contactMatches: ContactMatch[];
  calendarMatches: CalendarMatch[];
}

// ─── Raw SQL row types ──────────────────────────────────────

interface RawThreadRow {
  id: string;
  subject: string | null;
  from: string | null;
  snippet: string | null;
  receivedAt: Date | null;
  threadId: string;
}

interface RawContactRow {
  id: string;
  displayName: string | null;
  company: string | null;
  jobTitle: string | null;
  relationshipScore: number | null;
}

interface RawContactEmailRow {
  id: string;
  subject: string | null;
  receivedAt: Date | null;
  contactId: string;
}

interface RawCalendarRow {
  id: string;
  title: string | null;
  startTime: Date | null;
  endTime: Date | null;
  location: string | null;
}

// ─── Service ────────────────────────────────────────────────

/**
 * GraphExpansionService — Expands hybrid search seed results via
 * graph-like relationships: thread siblings, sender→contact,
 * sender→calendar attendee.
 *
 * 3 parallel SQL queries, no embedding calls.
 * Total budget: ~5 thread siblings + 2 contacts + 3 calendar events.
 *
 * Graph RAG Step 3
 */
@Injectable()
export class GraphExpansionService {
  private readonly logger = new Logger(GraphExpansionService.name);

  /** Max thread siblings per distinct threadId */
  private static readonly MAX_THREAD_SIBLINGS = 5;
  /** Max contacts to match from seed senders */
  private static readonly MAX_CONTACTS = 3;
  /** Max recent emails per matched contact (non-seed) */
  private static readonly MAX_CONTACT_EMAILS = 3;
  /** Max calendar events matching seed senders */
  private static readonly MAX_CALENDAR_EVENTS = 5;
  /** Calendar lookback window in days */
  private static readonly CALENDAR_LOOKBACK_DAYS = 30;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Expand seed email results via graph relationships.
   *
   * @param tenantId - Tenant isolation
   * @param seedEmailIds - Email IDs from hybrid search
   * @param seedThreadIds - Thread IDs from seed emails (may contain nulls)
   * @param seedSenders - Sender addresses from seed emails
   */
  async expand(
    tenantId: string,
    seedEmailIds: string[],
    seedThreadIds: (string | null)[],
    seedSenders: (string | null)[],
  ): Promise<GraphExpansionResult> {
    const uniqueThreadIds = [...new Set(seedThreadIds.filter(Boolean))] as string[];
    const uniqueSenders = [...new Set(
      seedSenders.filter(Boolean).map((s) => (s as string).toLowerCase()),
    )];

    const t0 = Date.now();

    // Run all 3 expansions in parallel
    const [threadSiblings, contactMatches, calendarMatches] = await Promise.all([
      uniqueThreadIds.length > 0
        ? this.expandThreads(tenantId, uniqueThreadIds, seedEmailIds)
        : Promise.resolve([]),
      uniqueSenders.length > 0
        ? this.expandContacts(tenantId, uniqueSenders, seedEmailIds)
        : Promise.resolve([]),
      uniqueSenders.length > 0
        ? this.expandCalendar(tenantId, uniqueSenders)
        : Promise.resolve([]),
    ]);

    const elapsed = Date.now() - t0;
    if (elapsed > 300) {
      this.logger.warn(
        `Slow graph expansion: ${elapsed}ms (threads=${uniqueThreadIds.length}, senders=${uniqueSenders.length})`,
      );
    }
    this.logger.debug(
      `Graph expansion: ${threadSiblings.length} siblings, ${contactMatches.length} contacts, ${calendarMatches.length} events (${elapsed}ms)`,
    );

    return { threadSiblings, contactMatches, calendarMatches };
  }

  /**
   * Thread expansion: fetch up to MAX_THREAD_SIBLINGS emails
   * from the same threads as seed results, excluding seed IDs.
   */
  private async expandThreads(
    tenantId: string,
    threadIds: string[],
    excludeIds: string[],
  ): Promise<ThreadSibling[]> {
    try {
      const rows = await this.prisma.$queryRaw<RawThreadRow[]>(
        Prisma.sql`
          SELECT DISTINCT ON (e."threadId", e.id)
            e.id, e.subject, e."from", e.snippet,
            e."receivedAt", e."threadId"
          FROM emails e
          WHERE e."tenantId" = ${tenantId}
            AND e."threadId" = ANY(${threadIds}::text[])
            AND e.id != ALL(${excludeIds}::text[])
          ORDER BY e."threadId", e.id, e."receivedAt" DESC
          LIMIT ${GraphExpansionService.MAX_THREAD_SIBLINGS}
        `,
      );

      return rows.map((r) => ({
        emailId: r.id,
        subject: r.subject,
        from: r.from,
        snippet: r.snippet,
        receivedAt: r.receivedAt,
        threadId: r.threadId,
      }));
    } catch (error) {
      this.logger.warn(
        `Thread expansion failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Sender→contact expansion: match sender emails against
   * unified_contacts.emails JSONB, then fetch recent non-seed emails.
   */
  private async expandContacts(
    tenantId: string,
    senderEmails: string[],
    excludeEmailIds: string[],
  ): Promise<ContactMatch[]> {
    try {
      // Step 1: Find contacts matching any seed sender
      const contacts = await this.prisma.$queryRaw<RawContactRow[]>(
        Prisma.sql`
          SELECT c.id, c."displayName", c.company, c."jobTitle", c."relationshipScore"
          FROM unified_contacts c
          WHERE c."tenantId" = ${tenantId}
            AND c."isDeleted" = false
            AND c.emails IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(c.emails) AS eo
              WHERE LOWER(eo->>'value') = ANY(${senderEmails}::text[])
            )
          ORDER BY c."relationshipScore" DESC NULLS LAST
          LIMIT ${GraphExpansionService.MAX_CONTACTS}
        `,
      );

      if (contacts.length === 0) return [];

      // Step 2: For each contact, find recent non-seed emails from that sender
      const contactIds = contacts.map((c) => c.id);
      const recentEmails = await this.prisma.$queryRaw<RawContactEmailRow[]>(
        Prisma.sql`
          SELECT e.id, e.subject, e."receivedAt", c.id AS "contactId"
          FROM emails e
          JOIN unified_contacts c
            ON c."tenantId" = ${tenantId}
            AND c."isDeleted" = false
            AND c.id = ANY(${contactIds}::text[])
            AND c.emails IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(c.emails) AS eo
              WHERE LOWER(eo->>'value') = LOWER(e."from")
            )
          WHERE e."tenantId" = ${tenantId}
            AND e.id != ALL(${excludeEmailIds}::text[])
          ORDER BY e."receivedAt" DESC
          LIMIT ${GraphExpansionService.MAX_CONTACTS * GraphExpansionService.MAX_CONTACT_EMAILS}
        `,
      );

      // Group emails by contactId
      const emailsByContact = new Map<string, RawContactEmailRow[]>();
      for (const row of recentEmails) {
        const arr = emailsByContact.get(row.contactId) ?? [];
        arr.push(row);
        emailsByContact.set(row.contactId, arr);
      }

      return contacts.map((c) => ({
        contactId: c.id,
        displayName: c.displayName,
        company: c.company,
        jobTitle: c.jobTitle,
        relationshipScore: c.relationshipScore ? Number(c.relationshipScore) : null,
        recentEmails: (emailsByContact.get(c.id) ?? [])
          .slice(0, GraphExpansionService.MAX_CONTACT_EMAILS)
          .map((e) => ({
            emailId: e.id,
            subject: e.subject,
            receivedAt: e.receivedAt,
          })),
      }));
    } catch (error) {
      this.logger.warn(
        `Contact expansion failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Calendar attendee expansion: find recent events where seed senders
   * appear in the attendees JSONB field.
   */
  private async expandCalendar(
    tenantId: string,
    senderEmails: string[],
  ): Promise<CalendarMatch[]> {
    try {
      const lookbackDate = new Date();
      lookbackDate.setDate(lookbackDate.getDate() - GraphExpansionService.CALENDAR_LOOKBACK_DAYS);

      const rows = await this.prisma.$queryRaw<RawCalendarRow[]>(
        Prisma.sql`
          SELECT ce.id, ce.title, ce."startTime", ce."endTime", ce.location
          FROM calendar_events ce
          WHERE ce."tenantId" = ${tenantId}
            AND ce."startTime" >= ${lookbackDate}
            AND ce.attendees IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(ce.attendees) AS att
              WHERE LOWER(att->>'email') = ANY(${senderEmails}::text[])
            )
          ORDER BY ce."startTime" DESC
          LIMIT ${GraphExpansionService.MAX_CALENDAR_EVENTS}
        `,
      );

      return rows.map((r) => ({
        eventId: r.id,
        title: r.title,
        startTime: r.startTime,
        endTime: r.endTime,
        location: r.location,
      }));
    } catch (error) {
      this.logger.warn(
        `Calendar expansion failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }
}
