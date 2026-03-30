import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { computeEmailDecay, computeMeetingDrop } from './churn-email-metrics';
import type { ChurnFeatures } from './churn-features.types';

export type { ChurnFeatures } from './churn-features.types';

@Injectable()
export class ChurnFeatureService {
  private readonly logger = new Logger(ChurnFeatureService.name);

  constructor(private readonly prisma: PrismaService) {}

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
        computeEmailDecay(this.prisma, tenantId, contactEmails, now),
        computeMeetingDrop(this.prisma, tenantId, contactEmails, now),
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

    const contactFeatures = await Promise.all(
      accountContacts.map((ac) =>
        this.extractForContact(tenantId, ac.contactId),
      ),
    );

    return this.aggregateWorstCase(contactFeatures);
  }

  // ─── Deal Stagnation ───────────────────────────────────────────

  private async computeDealStagnation(
    tenantId: string,
    contactId: string,
    now: Date,
  ): Promise<Pick<ChurnFeatures, 'maxStageDaysVsAvg' | 'staleDealCount'>> {
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
    const staleDealCount = openDeals.filter(
      (d) => d.updatedAt < thirtyDaysAgo,
    ).length;

    const maxDaysInStage = Math.max(
      ...openDeals.map(
        (d) =>
          (now.getTime() - d.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );

    const avgStageDuration = await this.computeAvgStageDuration(tenantId);
    const maxStageDaysVsAvg =
      avgStageDuration > 0 ? maxDaysInStage / avgStageDuration : null;

    return { maxStageDaysVsAvg, staleDealCount };
  }

  private async computeAvgStageDuration(tenantId: string): Promise<number> {
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
    return result[0]?.avg_days ?? 14;
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

    const dealLinks = await this.prisma.dealContact.findMany({
      where: { contactId, tenantId },
      select: { dealId: true },
    });
    const dealIds = dealLinks.map((dl) => dl.dealId);

    if (dealIds.length === 0) {
      return {
        activityCount30d: 0,
        activityCount90d: 0,
        activityDecayRatio: null,
      };
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

    const activityDecayRatio =
      activityCount90d > 0
        ? (activityCount30d * 3) / activityCount90d
        : null;

    return { activityCount30d, activityCount90d, activityDecayRatio };
  }

  // ─── Aggregation & Helpers ─────────────────────────────────────

  private aggregateWorstCase(features: ChurnFeatures[]): ChurnFeatures {
    if (features.length === 0) return this.emptyFeatures();
    if (features.length === 1) return features[0];

    const worst = { ...this.emptyFeatures() };

    for (const f of features) {
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

      if (
        f.meetingDropRatio !== null &&
        (worst.meetingDropRatio === null ||
          f.meetingDropRatio < worst.meetingDropRatio)
      ) {
        worst.meetingCountCurrentQ = f.meetingCountCurrentQ;
        worst.meetingCountPreviousQ = f.meetingCountPreviousQ;
        worst.meetingDropRatio = f.meetingDropRatio;
      }

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
