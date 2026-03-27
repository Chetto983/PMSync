import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface BehavioralFeatures {
  dealCount: number; // total deals linked to this contact
  openDealCount: number; // deals not won/lost
  wonDealCount: number;
  lostDealCount: number;
  avgDealVelocityDays: number | null; // avg days from creation to close
  highestDealStageProgress: number; // max stage probability across open deals (0-100)
  lastContactRecencyDays: number | null; // days since last CRM activity involving this contact
  activityCount30d: number; // CRM activities in last 30 days
  activityCount90d: number; // CRM activities in last 90 days
  hasRecentDealActivity: boolean; // any deal activity in last 7 days
}

@Injectable()
export class BehavioralFeatureService {
  private readonly logger = new Logger(BehavioralFeatureService.name);

  constructor(private readonly prisma: PrismaService) {}

  async extract(
    tenantId: string,
    contactId: string,
  ): Promise<BehavioralFeatures> {
    // Get all deals linked to this contact
    const dealLinks = await this.prisma.dealContact.findMany({
      where: { contactId, tenantId },
      select: {
        deal: {
          select: {
            id: true,
            createdAt: true,
            closedAt: true,
            deletedAt: true,
            stage: {
              select: {
                probability: true,
                isWon: true,
                isLost: true,
              },
            },
          },
        },
      },
    });

    const deals = dealLinks
      .map((dl) => dl.deal)
      .filter((d) => d.deletedAt === null);

    const openDeals = deals.filter(
      (d) => !d.stage.isWon && !d.stage.isLost,
    );
    const wonDeals = deals.filter((d) => d.stage.isWon);
    const lostDeals = deals.filter((d) => d.stage.isLost);

    // Avg deal velocity (days from creation to close) for closed deals
    const closedDeals = deals.filter((d) => d.closedAt !== null);
    let avgDealVelocityDays: number | null = null;
    if (closedDeals.length > 0) {
      const totalDays = closedDeals.reduce((sum, d) => {
        const days =
          (d.closedAt!.getTime() - d.createdAt.getTime()) /
          (1000 * 60 * 60 * 24);
        return sum + Math.max(0, days);
      }, 0);
      avgDealVelocityDays = totalDays / closedDeals.length;
    }

    // Highest stage progress across open deals
    const highestDealStageProgress =
      openDeals.length > 0
        ? Math.max(...openDeals.map((d) => d.stage.probability))
        : 0;

    // CRM activity counts
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const dealIds = deals.map((d) => d.id);

    // Query activities linked to this contact's deals
    const [activityCount30d, activityCount90d, recentDealActivity] =
      await Promise.all([
        dealIds.length > 0
          ? this.prisma.crmActivity.count({
              where: {
                tenantId,
                dealId: { in: dealIds },
                createdAt: { gte: thirtyDaysAgo },
              },
            })
          : 0,
        dealIds.length > 0
          ? this.prisma.crmActivity.count({
              where: {
                tenantId,
                dealId: { in: dealIds },
                createdAt: { gte: ninetyDaysAgo },
              },
            })
          : 0,
        dealIds.length > 0
          ? this.prisma.crmActivity.count({
              where: {
                tenantId,
                dealId: { in: dealIds },
                createdAt: { gte: sevenDaysAgo },
              },
            })
          : 0,
      ]);

    // Last CRM activity date for recency
    let lastContactRecencyDays: number | null = null;
    if (dealIds.length > 0) {
      const lastActivity = await this.prisma.crmActivity.findFirst({
        where: { tenantId, dealId: { in: dealIds } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (lastActivity) {
        lastContactRecencyDays =
          (now.getTime() - lastActivity.createdAt.getTime()) /
          (1000 * 60 * 60 * 24);
      }
    }

    return {
      dealCount: deals.length,
      openDealCount: openDeals.length,
      wonDealCount: wonDeals.length,
      lostDealCount: lostDeals.length,
      avgDealVelocityDays,
      highestDealStageProgress,
      lastContactRecencyDays,
      activityCount30d,
      activityCount90d,
      hasRecentDealActivity: recentDealActivity > 0,
    };
  }
}
