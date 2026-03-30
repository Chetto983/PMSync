import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Churn feature signals — decay-based metrics comparing recent vs historical
 * engagement windows to detect disengagement trends.
 */
export interface ChurnFeatures {
  // Email engagement decay
  responseTimeRecent: number | null; // avg response time (hours) last 30d
  responseTimeHistorical: number | null; // avg response time (hours) 31-90d
  responseDecayRatio: number | null; // recent/historical (>1 = slower = bad)
  repliedRatioRecent: number; // reply rate last 30d
  repliedRatioHistorical: number; // reply rate 31-90d

  // Meeting frequency
  meetingCountCurrentQ: number; // meetings this quarter
  meetingCountPreviousQ: number; // meetings previous quarter
  meetingDropRatio: number | null; // current/previous (<1 = drop = bad)

  // Deal stagnation
  maxStageDaysVsAvg: number | null; // days in current stage / avg stage duration
  staleDealCount: number; // deals with no activity >30d

  // Inactivity
  daysSinceLastInteraction: number | null;
  inactivityStreakDays: number; // consecutive days with zero interaction
  emailBounceCount: number; // bounced emails last 90d

  // Volume trends
  activityCount30d: number;
  activityCount90d: number;
  activityDecayRatio: number | null; // (30d * 3) / 90d — normalized, <1 = declining
}

@Injectable()
export class ChurnFeatureService {
  private readonly logger = new Logger(ChurnFeatureService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Extract churn features for a contact.
   */
  async extractForContact(
    tenantId: string,
    contactId: string,
  ): Promise<ChurnFeatures> {
    const contact = await this.prisma.contact.findUnique({
      where: { id_tenantId: { id: contactId, tenantId } },
      select: {
        emails: true,
        lastInteractedAt: true,
        totalInteractions: true,
      },
    });

    if (!contact) return this.emptyFeatures();

    const contactEmails = this.extractEmailAddresses(contact.emails);
    const now = new Date();

    const [emailMetrics, meetingMetrics, dealMetrics, activityMetrics] =
      await Promise.all([
        this.computeEmailDecay(tenantId, contactEmails, now),
        this.computeMeetingDrop(tenantId, contactEmails, now),
        this.computeDealStagnation(tenantId, contactId, now),
        this.computeActivityDecay(tenantId, contactId, now),
      ]);

    const daysSinceLastInteraction = contact.lastInteractedAt
      ? (now.getTime() - contact.lastInteractedAt.getTime()) /
        (1000 * 60 * 60 * 24)
      : null;

    const inactivityStreakDays = daysSinceLastInteraction
      ? Math.floor(daysSinceLastInteraction)
      : contact.totalInteractions === 0
        ? 999
        : 0;

    return {
      ...emailMetrics,
      ...meetingMetrics,
      ...dealMetrics,
      ...activityMetrics,
      daysSinceLastInteraction,
      inactivityStreakDays,
    };
  }

  /**
   * Extract churn features for an account (aggregated across linked contacts).
   */
  async extractForAccount(
    tenantId: string,
    accountId: string,
  ): Promise<ChurnFeatures> {
    const accountContacts = await this.prisma.accountContact.findMany({
      where: { accountId, tenantId },
      select: { contactId: true },
      take: 50,
    });

    if (accountContacts.length === 0) return this.emptyFeatures();

    // Aggregate features from all contacts, take worst signals
    const contactFeatures = await Promise.all(
      accountContacts.map((ac) =>
        this.extractForContact(tenantId, ac.contactId),
      ),
    );

    return this.aggregateWorstCase(contactFeatures);
  }

  // ─── Email Decay ────────────────────────────────────────────────

  private async computeEmailDecay(
    tenantId: string,
    contactEmails: string[],
    now: Date,
  ): Promise<
    Pick<
      ChurnFeatures,
      | 'responseTimeRecent'
      | 'responseTimeHistorical'
      | 'responseDecayRatio'
      | 'repliedRatioRecent'
      | 'repliedRatioHistorical'
      | 'emailBounceCount'
    >
  > {
    if (contactEmails.length === 0) {
      return {
        responseTimeRecent: null,
        responseTimeHistorical: null,
        responseDecayRatio: null,
        repliedRatioRecent: 0,
        repliedRatioHistorical: 0,
        emailBounceCount: 0,
      };
    }

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Recent window (0-30d)
    const recentMetrics = await this.computeReplyWindow(
      tenantId,
      contactEmails,
      thirtyDaysAgo,
      now,
    );

    // Historical window (31-90d)
    const historicalMetrics = await this.computeReplyWindow(
      tenantId,
      contactEmails,
      ninetyDaysAgo,
      thirtyDaysAgo,
    );

    // Bounce count (last 90d) — emails to contact that bounced
    const emailBounceCount = await this.prisma.email.count({
      where: {
        tenantId,
        to: { hasSome: contactEmails },
        receivedAt: { gte: ninetyDaysAgo },
        labels: { hasSome: ['BOUNCED'] },
        isDeleted: false,
      },
    });

    const responseDecayRatio =
      recentMetrics.avgResponseTimeHours !== null &&
      historicalMetrics.avgResponseTimeHours !== null &&
      historicalMetrics.avgResponseTimeHours > 0
        ? recentMetrics.avgResponseTimeHours /
          historicalMetrics.avgResponseTimeHours
        : null;

    return {
      responseTimeRecent: recentMetrics.avgResponseTimeHours,
      responseTimeHistorical: historicalMetrics.avgResponseTimeHours,
      responseDecayRatio,
      repliedRatioRecent: recentMetrics.repliedRatio,
      repliedRatioHistorical: historicalMetrics.repliedRatio,
      emailBounceCount,
    };
  }

  private async computeReplyWindow(
    tenantId: string,
    contactEmails: string[],
    from: Date,
    to: Date,
  ): Promise<{ repliedRatio: number; avgResponseTimeHours: number | null }> {
    const receivedEmails = await this.prisma.email.findMany({
      where: {
        tenantId,
        from: { in: contactEmails },
        receivedAt: { gte: from, lt: to },
        isDeleted: false,
      },
      select: { id: true, messageId: true, receivedAt: true },
      take: 200,
    });

    if (receivedEmails.length === 0) {
      return { repliedRatio: 0, avgResponseTimeHours: null };
    }

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
        from: { notIn: contactEmails },
        isDeleted: false,
      },
      select: { inReplyTo: true, sentAt: true },
      take: 200,
    });

    const repliedRatio = replies.length / receivedEmails.length;

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

  // ─── Meeting Drop ───────────────────────────────────────────────

  private async computeMeetingDrop(
    tenantId: string,
    contactEmails: string[],
    now: Date,
  ): Promise<
    Pick<
      ChurnFeatures,
      'meetingCountCurrentQ' | 'meetingCountPreviousQ' | 'meetingDropRatio'
    >
  > {
    if (contactEmails.length === 0) {
      return {
        meetingCountCurrentQ: 0,
        meetingCountPreviousQ: 0,
        meetingDropRatio: null,
      };
    }

    const currentQStart = this.quarterStart(now);
    const prevQStart = new Date(currentQStart);
    prevQStart.setMonth(prevQStart.getMonth() - 3);

    const [meetingCountCurrentQ, meetingCountPreviousQ] = await Promise.all([
      this.countMeetingsInRange(tenantId, contactEmails, currentQStart, now),
      this.countMeetingsInRange(
        tenantId,
        contactEmails,
        prevQStart,
        currentQStart,
      ),
    ]);

    const meetingDropRatio =
      meetingCountPreviousQ > 0
        ? meetingCountCurrentQ / meetingCountPreviousQ
        : null;

    return { meetingCountCurrentQ, meetingCountPreviousQ, meetingDropRatio };
  }

  private async countMeetingsInRange(
    tenantId: string,
    contactEmails: string[],
    from: Date,
    to: Date,
  ): Promise<number> {
    const result = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count
      FROM "calendar_events"
      WHERE "tenantId" = ${tenantId}
        AND "isDeleted" = false
        AND "startTime" >= ${from}
        AND "startTime" < ${to}
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements("attendees") AS att
          WHERE att->>'email' = ANY(${contactEmails}::text[])
        )
    `;
    return Number(result[0]?.count ?? 0);
  }

  private quarterStart(date: Date): Date {
    const q = Math.floor(date.getMonth() / 3) * 3;
    return new Date(date.getFullYear(), q, 1);
  }

  // ─── Deal Stagnation ───────────────────────────────────────────

  private async computeDealStagnation(
    tenantId: string,
    contactId: string,
    now: Date,
  ): Promise<
    Pick<ChurnFeatures, 'maxStageDaysVsAvg' | 'staleDealCount'>
  > {
    const dealLinks = await this.prisma.dealContact.findMany({
      where: { contactId, tenantId },
      select: {
        deal: {
          select: {
            id: true,
            stageId: true,
            updatedAt: true,
            deletedAt: true,
            stage: { select: { isWon: true, isLost: true } },
          },
        },
      },
    });

    const openDeals = dealLinks
      .map((dl) => dl.deal)
      .filter(
        (d) => d.deletedAt === null && !d.stage.isWon && !d.stage.isLost,
      );

    if (openDeals.length === 0) {
      return { maxStageDaysVsAvg: null, staleDealCount: 0 };
    }

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Count stale deals (no update in 30d)
    const staleDealCount = openDeals.filter(
      (d) => d.updatedAt < thirtyDaysAgo,
    ).length;

    // Compute max days-in-stage vs average stage duration
    // Use the longest-stuck open deal
    const maxDaysInStage = Math.max(
      ...openDeals.map(
        (d) =>
          (now.getTime() - d.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );

    // Average stage duration across all closed deals in tenant (rough benchmark)
    const avgStageDuration = await this.computeAvgStageDuration(tenantId);

    const maxStageDaysVsAvg =
      avgStageDuration > 0 ? maxDaysInStage / avgStageDuration : null;

    return { maxStageDaysVsAvg, staleDealCount };
  }

  private async computeAvgStageDuration(tenantId: string): Promise<number> {
    // Avg days between stage changes for closed deals
    const result = await this.prisma.$queryRaw<
      [{ avg_days: number | null }]
    >`
      SELECT AVG(
        EXTRACT(EPOCH FROM ("closedAt" - "createdAt")) / 86400.0
      )::float AS avg_days
      FROM "crm_deals"
      WHERE "tenantId" = ${tenantId}
        AND "closedAt" IS NOT NULL
        AND "deletedAt" IS NULL
    `;
    return result[0]?.avg_days ?? 14; // default 14d if no data
  }

  // ─── Activity Decay ────────────────────────────────────────────

  private async computeActivityDecay(
    tenantId: string,
    contactId: string,
    now: Date,
  ): Promise<
    Pick<
      ChurnFeatures,
      'activityCount30d' | 'activityCount90d' | 'activityDecayRatio'
    >
  > {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Get deal IDs for this contact
    const dealLinks = await this.prisma.dealContact.findMany({
      where: { contactId, tenantId },
      select: { dealId: true },
    });
    const dealIds = dealLinks.map((dl) => dl.dealId);

    if (dealIds.length === 0) {
      return { activityCount30d: 0, activityCount90d: 0, activityDecayRatio: null };
    }

    const [activityCount30d, activityCount90d] = await Promise.all([
      this.prisma.crmActivity.count({
        where: {
          tenantId,
          dealId: { in: dealIds },
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.crmActivity.count({
        where: {
          tenantId,
          dealId: { in: dealIds },
          createdAt: { gte: ninetyDaysAgo },
        },
      }),
    ]);

    // Normalize: if engagement were flat, 30d should be 1/3 of 90d
    const activityDecayRatio =
      activityCount90d > 0
        ? (activityCount30d * 3) / activityCount90d
        : null;

    return { activityCount30d, activityCount90d, activityDecayRatio };
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private aggregateWorstCase(features: ChurnFeatures[]): ChurnFeatures {
    if (features.length === 0) return this.emptyFeatures();
    if (features.length === 1) return features[0];

    // Take worst-case signals across all contacts
    const worst = { ...this.emptyFeatures() };

    for (const f of features) {
      // Higher response decay = worse
      if (
        f.responseDecayRatio !== null &&
        (worst.responseDecayRatio === null ||
          f.responseDecayRatio > worst.responseDecayRatio)
      ) {
        worst.responseTimeRecent = f.responseTimeRecent;
        worst.responseTimeHistorical = f.responseTimeHistorical;
        worst.responseDecayRatio = f.responseDecayRatio;
      }

      worst.repliedRatioRecent = Math.min(
        worst.repliedRatioRecent || 1,
        f.repliedRatioRecent,
      );
      worst.repliedRatioHistorical = Math.min(
        worst.repliedRatioHistorical || 1,
        f.repliedRatioHistorical,
      );

      // Lower meeting ratio = worse
      if (
        f.meetingDropRatio !== null &&
        (worst.meetingDropRatio === null ||
          f.meetingDropRatio < worst.meetingDropRatio)
      ) {
        worst.meetingCountCurrentQ = f.meetingCountCurrentQ;
        worst.meetingCountPreviousQ = f.meetingCountPreviousQ;
        worst.meetingDropRatio = f.meetingDropRatio;
      }

      // Higher stagnation = worse
      if (
        f.maxStageDaysVsAvg !== null &&
        (worst.maxStageDaysVsAvg === null ||
          f.maxStageDaysVsAvg > worst.maxStageDaysVsAvg)
      ) {
        worst.maxStageDaysVsAvg = f.maxStageDaysVsAvg;
      }

      worst.staleDealCount = Math.max(worst.staleDealCount, f.staleDealCount);
      worst.emailBounceCount = Math.max(
        worst.emailBounceCount,
        f.emailBounceCount,
      );
      worst.activityCount30d += f.activityCount30d;
      worst.activityCount90d += f.activityCount90d;

      if (
        f.daysSinceLastInteraction !== null &&
        (worst.daysSinceLastInteraction === null ||
          f.daysSinceLastInteraction > worst.daysSinceLastInteraction)
      ) {
        worst.daysSinceLastInteraction = f.daysSinceLastInteraction;
      }

      worst.inactivityStreakDays = Math.max(
        worst.inactivityStreakDays,
        f.inactivityStreakDays,
      );
    }

    // Recompute activity decay from aggregated counts
    worst.activityDecayRatio =
      worst.activityCount90d > 0
        ? (worst.activityCount30d * 3) / worst.activityCount90d
        : null;

    return worst;
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

  private emptyFeatures(): ChurnFeatures {
    return {
      responseTimeRecent: null,
      responseTimeHistorical: null,
      responseDecayRatio: null,
      repliedRatioRecent: 0,
      repliedRatioHistorical: 0,
      meetingCountCurrentQ: 0,
      meetingCountPreviousQ: 0,
      meetingDropRatio: null,
      maxStageDaysVsAvg: null,
      staleDealCount: 0,
      daysSinceLastInteraction: null,
      inactivityStreakDays: 0,
      emailBounceCount: 0,
      activityCount30d: 0,
      activityCount90d: 0,
      activityDecayRatio: null,
    };
  }
}
