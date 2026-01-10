import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get email analytics for the last N months with REAL data
   * Returns: { name: 'Jan', emails: total, sent: sentCount, received: receivedCount }[]
   */
  async getEmailAnalytics(tenantId: string, months = 7) {
    const now = new Date();
    const results: { name: string; emails: number; sent: number; received: number }[] = [];

    // Get data for each of the last N months
    for (let i = months - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

      // Query REAL data from database
      const [sent, received] = await Promise.all([
        this.prisma.email.count({
          where: {
            tenantId,
            folder: 'SENT',
            receivedAt: { gte: monthStart, lte: monthEnd },
          },
        }),
        this.prisma.email.count({
          where: {
            tenantId,
            folder: 'INBOX',
            receivedAt: { gte: monthStart, lte: monthEnd },
          },
        }),
      ]);

      results.push({
        name: MONTH_NAMES[monthStart.getMonth()],
        emails: sent + received,
        sent,
        received,
      });
    }

    return results;
  }

  /**
   * Get total email counts for a tenant
   */
  async getEmailTotals(tenantId: string) {
    const [totalSent, totalReceived, totalDrafts, totalTrash] = await Promise.all([
      this.prisma.email.count({ where: { tenantId, folder: 'SENT' } }),
      this.prisma.email.count({ where: { tenantId, folder: 'INBOX' } }),
      this.prisma.email.count({ where: { tenantId, folder: 'DRAFTS' } }),
      this.prisma.email.count({ where: { tenantId, folder: 'TRASH' } }),
    ]);

    return {
      totalSent,
      totalReceived,
      totalDrafts,
      totalTrash,
      total: totalSent + totalReceived + totalDrafts + totalTrash,
    };
  }

  /**
   * Get email stats for a specific period (day/week/month)
   */
  async getEmailStats(tenantId: string, period: 'day' | 'week' | 'month' = 'week') {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    const [sent, received, unread] = await Promise.all([
      this.prisma.email.count({
        where: { tenantId, folder: 'SENT', receivedAt: { gte: startDate } },
      }),
      this.prisma.email.count({
        where: { tenantId, folder: 'INBOX', receivedAt: { gte: startDate } },
      }),
      this.prisma.email.count({
        where: { tenantId, folder: 'INBOX', isRead: false },
      }),
    ]);

    return { period, sent, received, unread, total: sent + received };
  }

  /**
   * Get AI usage statistics for the tenant
   * Tracks: composes, summaries, smart replies, auto-triage
   */
  async getAiUsageStats(
    tenantId: string,
    period: 'day' | 'week' | 'month' = 'week',
  ): Promise<{
    period: string;
    composes: number;
    summaries: number;
    smartReplies: number;
    autoTriaged: number;
    totalAiActions: number;
    costSavingsEstimate: number;
  }> {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    // Count AI-generated content from ActionQueue using proper enum values
    const [composes, smartReplies, autoTriaged] = await Promise.all([
      // SEND_EMAIL covers both compose and reply actions
      this.prisma.actionQueue.count({
        where: {
          tenantId,
          actionType: 'SEND_EMAIL',
          createdAt: { gte: startDate },
        },
      }),
      // Schedule meetings as another AI action
      this.prisma.actionQueue.count({
        where: {
          tenantId,
          actionType: 'SCHEDULE_MEETING',
          createdAt: { gte: startDate },
        },
      }),
      this.prisma.email.count({
        where: {
          tenantId,
          isAutoTriaged: true,
          autoTriagedAt: { gte: startDate },
        },
      }),
    ]);

    // Summaries tracked via EmailAnalysis table (has summary field)
    const summaries = await this.prisma.emailAnalysis.count({
      where: {
        tenantId,
        processedAt: { gte: startDate },
      },
    });

    const totalAiActions = composes + summaries + smartReplies + autoTriaged;

    // Estimate cost savings: ~2 min saved per AI action, $0.50/hr developer time
    const minutesSaved = totalAiActions * 2;
    const costSavingsEstimate = (minutesSaved / 60) * 0.5;

    return {
      period,
      composes,
      summaries,
      smartReplies,
      autoTriaged,
      totalAiActions,
      costSavingsEstimate: Math.round(costSavingsEstimate * 100) / 100,
    };
  }

  /**
   * Get productivity metrics for the tenant
   */
  async getProductivityMetrics(
    tenantId: string,
    period: 'day' | 'week' | 'month' = 'week',
  ): Promise<{
    period: string;
    emailsProcessed: number;
    responseRate: number;
    avgResponseTimeHours: number;
    followUpsCompleted: number;
    followUpsPending: number;
    deadlinesMet: number;
    deadlinesMissed: number;
  }> {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    const [
      emailsReceived,
      emailsReplied,
      followUpsResolved,
      followUpsPending,
      followUpsExpired,
    ] = await Promise.all([
      this.prisma.email.count({
        where: { tenantId, folder: 'INBOX', receivedAt: { gte: startDate } },
      }),
      this.prisma.email.count({
        where: { tenantId, folder: 'SENT', receivedAt: { gte: startDate } },
      }),
      this.prisma.emailFollowUp.count({
        where: {
          tenantId,
          status: 'RESOLVED',
          updatedAt: { gte: startDate },
        },
      }),
      this.prisma.emailFollowUp.count({
        where: {
          tenantId,
          status: 'PENDING',
        },
      }),
      this.prisma.emailFollowUp.count({
        where: {
          tenantId,
          status: 'EXPIRED',
        },
      }),
    ]);

    // Calculate response rate (simplified)
    const responseRate = emailsReceived > 0
      ? Math.round((emailsReplied / emailsReceived) * 100)
      : 0;

    return {
      period,
      emailsProcessed: emailsReceived + emailsReplied,
      responseRate: Math.min(100, responseRate), // Cap at 100%
      avgResponseTimeHours: 4.2, // TODO: Calculate from actual data
      followUpsCompleted: followUpsResolved,
      followUpsPending,
      deadlinesMet: followUpsResolved, // Use resolved follow-ups as proxy
      deadlinesMissed: followUpsExpired, // Use expired follow-ups as proxy
    };
  }

  /**
   * Get auto-triage statistics
   */
  async getTriageStats(tenantId: string): Promise<{
    totalTriaged: number;
    byPriority: Record<number, number>;
    pendingCount: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 24);

    const [totalTriaged, priorityCounts, pendingCount] = await Promise.all([
      this.prisma.email.count({
        where: { tenantId, isAutoTriaged: true },
      }),
      this.prisma.email.groupBy({
        by: ['aiPriority'],
        where: { tenantId, isAutoTriaged: true, aiPriority: { not: null } },
        _count: { id: true },
      }),
      this.prisma.email.count({
        where: {
          tenantId,
          isAutoTriaged: false,
          receivedAt: { gte: cutoffDate },
          isDeleted: false,
          isDraft: false,
        },
      }),
    ]);

    const byPriority: Record<number, number> = {};
    for (const p of priorityCounts) {
      if (p.aiPriority !== null) {
        byPriority[p.aiPriority] = p._count.id;
      }
    }

    return { totalTriaged, byPriority, pendingCount };
  }
}
