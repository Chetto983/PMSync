import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface EngagementFeatures {
  emailsSent: number;
  emailsReceived: number;
  totalInteractions: number;
  avgResponseTimeHours: number | null; // avg time between received and reply
  repliedRatio: number; // fraction of received emails that got a reply
  lastInteractionDaysAgo: number | null;
  meetingCount: number; // calendar events with this contact
  recentActivityScore: number; // 0-10 based on recency weighted interactions
}

@Injectable()
export class EngagementFeatureService {
  private readonly logger = new Logger(EngagementFeatureService.name);

  constructor(private readonly prisma: PrismaService) {}

  async extract(tenantId: string, contactId: string): Promise<EngagementFeatures> {
    const contact = await this.prisma.contact.findUnique({
      where: { id_tenantId: { id: contactId, tenantId } },
      select: {
        sentCount: true,
        receivedCount: true,
        totalInteractions: true,
        lastInteractedAt: true,
        emails: true, // Json — array of email addresses
      },
    });

    if (!contact) {
      return this.emptyFeatures();
    }

    const contactEmails = this.extractEmailAddresses(contact.emails);

    // Count calendar events involving this contact's email addresses
    // attendees is Json? (array of objects with .email), so use raw SQL for JSONB search
    let meetingCount = 0;
    if (contactEmails.length > 0) {
      const result = await this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count
        FROM "calendar_events"
        WHERE "tenantId" = ${tenantId}
          AND "isDeleted" = false
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements("attendees") AS att
            WHERE att->>'email' = ANY(${contactEmails}::text[])
          )
      `;
      meetingCount = Number(result[0]?.count ?? 0);
    }

    // Compute reply ratio and avg response time from CRM activities
    const { repliedRatio, avgResponseTimeHours } =
      await this.computeReplyMetrics(tenantId, contactId, contactEmails);

    // Recency-weighted activity score (0-10)
    const recentActivityScore = this.computeRecencyScore(
      contact.lastInteractedAt,
      contact.totalInteractions,
    );

    const lastInteractionDaysAgo = contact.lastInteractedAt
      ? Math.max(
          0,
          (Date.now() - contact.lastInteractedAt.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

    return {
      emailsSent: contact.sentCount,
      emailsReceived: contact.receivedCount,
      totalInteractions: contact.totalInteractions,
      avgResponseTimeHours,
      repliedRatio,
      lastInteractionDaysAgo,
      meetingCount,
      recentActivityScore,
    };
  }

  private async computeReplyMetrics(
    tenantId: string,
    contactId: string,
    contactEmails: string[],
  ): Promise<{ repliedRatio: number; avgResponseTimeHours: number | null }> {
    if (contactEmails.length === 0) {
      return { repliedRatio: 0, avgResponseTimeHours: null };
    }

    // Count emails received from this contact (last 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const receivedEmails = await this.prisma.email.findMany({
      where: {
        tenantId,
        from: { in: contactEmails },
        receivedAt: { gte: ninetyDaysAgo },
        isDeleted: false,
      },
      select: { id: true, messageId: true, receivedAt: true },
      take: 200,
    });

    if (receivedEmails.length === 0) {
      return { repliedRatio: 0, avgResponseTimeHours: null };
    }

    // Find replies (emails where inReplyTo matches received messageIds)
    const messageIds = receivedEmails
      .map((e) => e.messageId)
      .filter((id): id is string => !!id);

    if (messageIds.length === 0) {
      return { repliedRatio: 0, avgResponseTimeHours: null };
    }

    const replies = await this.prisma.email.findMany({
      where: {
        tenantId,
        inReplyTo: { in: messageIds },
        from: { notIn: contactEmails }, // our reply, not theirs
        isDeleted: false,
      },
      select: { inReplyTo: true, sentAt: true },
      take: 200,
    });

    const repliedRatio = replies.length / receivedEmails.length;

    // Compute avg response time
    let totalResponseMs = 0;
    let responseCount = 0;
    for (const reply of replies) {
      if (!reply.sentAt || !reply.inReplyTo) continue;
      const original = receivedEmails.find(
        (e) => e.messageId === reply.inReplyTo,
      );
      if (!original) continue;
      const diffMs = reply.sentAt.getTime() - original.receivedAt.getTime();
      if (diffMs > 0) {
        totalResponseMs += diffMs;
        responseCount++;
      }
    }

    const avgResponseTimeHours =
      responseCount > 0
        ? totalResponseMs / responseCount / (1000 * 60 * 60)
        : null;

    return { repliedRatio, avgResponseTimeHours };
  }

  private computeRecencyScore(
    lastInteractedAt: Date | null,
    totalInteractions: number,
  ): number {
    if (!lastInteractedAt || totalInteractions === 0) return 0;

    const daysAgo =
      (Date.now() - lastInteractedAt.getTime()) / (1000 * 60 * 60 * 24);

    // Recency component (0-5): exponential decay
    let recency = 0;
    if (daysAgo <= 1) recency = 5;
    else if (daysAgo <= 7) recency = 4;
    else if (daysAgo <= 14) recency = 3;
    else if (daysAgo <= 30) recency = 2;
    else if (daysAgo <= 60) recency = 1;

    // Volume component (0-5): log scale
    const volume = Math.min(5, Math.round(Math.log2(totalInteractions + 1)));

    return recency + volume;
  }

  private extractEmailAddresses(emails: unknown): string[] {
    if (!emails) return [];
    if (Array.isArray(emails)) {
      return emails
        .map((e) => {
          if (typeof e === 'string') return e;
          if (typeof e === 'object' && e !== null && 'value' in e)
            return String((e as { value: string }).value);
          return null;
        })
        .filter((e): e is string => !!e);
    }
    return [];
  }

  private emptyFeatures(): EngagementFeatures {
    return {
      emailsSent: 0,
      emailsReceived: 0,
      totalInteractions: 0,
      avgResponseTimeHours: null,
      repliedRatio: 0,
      lastInteractionDaysAgo: null,
      meetingCount: 0,
      recentActivityScore: 0,
    };
  }
}
