import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

interface AttendeeEntry {
  email?: string;
  displayName?: string;
  responseStatus?: string;
}

/**
 * CalendarActivityLoggerService — logs calendar events with CRM contacts
 * as CrmActivity entries.
 *
 * Runs once on deploy (scans recent events) and can be triggered
 * after calendar sync completes.
 *
 * Idempotent: skips if activity with same eventId+contactId exists.
 */
@Injectable()
export class CalendarActivityLoggerService implements OnModuleInit {
  private readonly logger = new Logger(CalendarActivityLoggerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    this.scanRecentEvents().catch((err) =>
      this.logger.warn(
        `Initial calendar-activity scan failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  /**
   * Scan recent calendar events and create CRM activities for those
   * whose attendees match CRM contacts.
   */
  async scanRecentEvents(): Promise<{ processed: number; created: number }> {
    const since = new Date();
    since.setDate(since.getDate() - 30); // Last 30 days

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        isDeleted: false,
        isCancelled: false,
        startTime: { gte: since },
        attendees: { not: { equals: null } },
      },
      select: {
        id: true,
        tenantId: true,
        title: true,
        startTime: true,
        attendees: true,
      },
      take: 200,
      orderBy: { startTime: 'desc' },
    });

    let created = 0;

    for (const event of events) {
      const attendees = event.attendees as AttendeeEntry[] | null;
      if (!attendees?.length) continue;

      const emails = attendees
        .map((a) => a.email?.toLowerCase())
        .filter(Boolean) as string[];

      if (!emails.length) continue;

      // Find matching CRM contacts
      const contacts = await this.prisma.$queryRaw<
        Array<{ id: string; tenantId: string }>
      >`
        SELECT c.id, c."tenantId"
        FROM "unified_contacts" c
        WHERE c."tenantId" = ${event.tenantId}
          AND c."isDeleted" = false
          AND c.emails IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(c.emails) AS e
            WHERE LOWER(e->>'value') = ANY(${emails}::text[])
          )
      `;

      for (const contact of contacts) {
        // Idempotent: check if activity already exists for this event+contact
        const existing = await this.prisma.crmActivity.findFirst({
          where: {
            tenantId: event.tenantId,
            type: 'MEETING',
            metadata: {
              path: ['calendarEventId'],
              equals: event.id,
            },
          },
        });
        if (existing) continue;

        // Find account link for this contact
        const link = await this.prisma.accountContact.findFirst({
          where: { contactId: contact.id, tenantId: event.tenantId },
          select: { accountId: true },
        });

        await this.prisma.crmActivity.create({
          data: {
            tenantId: event.tenantId,
            accountId: link?.accountId ?? null,
            type: 'MEETING',
            content: `Meeting: ${event.title}`,
            metadata: {
              calendarEventId: event.id,
              contactId: contact.id,
              startTime: event.startTime.toISOString(),
              attendeeCount: emails.length,
            },
            createdAt: event.startTime,
          },
        });

        created++;
      }
    }

    this.logger.log(
      `Calendar-activity scan: ${events.length} events processed, ${created} activities created`,
    );
    return { processed: events.length, created };
  }
}
