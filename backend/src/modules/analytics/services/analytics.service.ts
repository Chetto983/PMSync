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
}
