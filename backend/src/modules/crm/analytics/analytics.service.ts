import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CsatFilters {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  assigneeId?: string;
}

export interface CsatAggregation {
  averageRating: number | null;
  totalResponses: number;
  distribution: Record<number, number>;
  monthlyTrend: Array<{ month: string; avg: number; count: number }>;
}

export interface ServiceMetrics {
  avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  slaComplianceRate: number | null;
  csatAverage: number | null;
  topTicketsByResolution: Array<{
    id: string;
    subject: string;
    resolutionMinutes: number;
    assigneeName: string | null;
  }>;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCsatAggregation(filters: CsatFilters): Promise<CsatAggregation> {
    const { tenantId, startDate, endDate, assigneeId } = filters;

    // Build Prisma where for aggregate/groupBy
    const where: Prisma.CSATSurveyWhereInput = {
      tenantId,
      respondedAt: { not: null },
    };
    if (startDate || endDate) {
      const df: Prisma.DateTimeFilter = {};
      if (startDate) df.gte = startDate;
      if (endDate) df.lte = endDate;
      where.createdAt = df;
    }
    if (assigneeId) {
      where.ticket = { assigneeId };
    }

    // Average + count
    const agg = await this.prisma.cSATSurvey.aggregate({
      where,
      _avg: { rating: true },
      _count: { rating: true },
    });

    // Distribution (group by rating)
    const groups = await this.prisma.cSATSurvey.groupBy({
      by: ['rating'],
      where,
      _count: { rating: true },
    });

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const g of groups) {
      if (g.rating !== null) distribution[g.rating] = g._count.rating;
    }

    // Monthly trend (last 6 months) via raw SQL
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const conditions: Prisma.Sql[] = [
      Prisma.sql`cs."tenantId" = ${tenantId}`,
      Prisma.sql`cs."respondedAt" IS NOT NULL`,
      Prisma.sql`cs."respondedAt" >= ${sixMonthsAgo}`,
    ];
    if (assigneeId) {
      conditions.push(Prisma.sql`t."assigneeId" = ${assigneeId}`);
    }

    const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

    const trendResults = await this.prisma.$queryRaw<
      Array<{ month: string; avg: number; count: bigint }>
    >(Prisma.sql`
      SELECT
        TO_CHAR(cs."respondedAt", 'YYYY-MM') as month,
        AVG(cs.rating)::float as avg,
        COUNT(*)::bigint as count
      FROM csat_surveys cs
      INNER JOIN tickets t ON t.id = cs."ticketId"
      ${whereClause}
      GROUP BY TO_CHAR(cs."respondedAt", 'YYYY-MM')
      ORDER BY month ASC
    `);

    return {
      averageRating: agg._avg.rating
        ? Math.round(agg._avg.rating * 100) / 100
        : null,
      totalResponses: agg._count.rating,
      distribution,
      monthlyTrend: trendResults.map((r) => ({
        month: r.month,
        avg: Math.round(r.avg * 100) / 100,
        count: Number(r.count),
      })),
    };
  }

  async getServiceMetrics(
    tenantId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<ServiceMetrics> {
    // Build date conditions for raw SQL
    const ticketConditions: Prisma.Sql[] = [
      Prisma.sql`t."tenantId" = ${tenantId}`,
    ];
    if (startDate) ticketConditions.push(Prisma.sql`t."createdAt" >= ${startDate}`);
    if (endDate) ticketConditions.push(Prisma.sql`t."createdAt" <= ${endDate}`);

    const ticketWhere = Prisma.sql`WHERE ${Prisma.join(ticketConditions, ' AND ')}`;

    // Avg first response time
    const firstResponse = await this.prisma.$queryRaw<
      Array<{ avg_minutes: number | null }>
    >(Prisma.sql`
      SELECT AVG(EXTRACT(EPOCH FROM (fc.first_comment_at - t."createdAt")) / 60)::float as avg_minutes
      FROM tickets t
      INNER JOIN (
        SELECT "ticketId", MIN("createdAt") as first_comment_at
        FROM ticket_comments
        GROUP BY "ticketId"
      ) fc ON fc."ticketId" = t.id
      ${ticketWhere}
    `);

    // Avg resolution time
    const resolvedConditions = [...ticketConditions, Prisma.sql`t."resolvedAt" IS NOT NULL`];
    const resolvedWhere = Prisma.sql`WHERE ${Prisma.join(resolvedConditions, ' AND ')}`;

    const resolution = await this.prisma.$queryRaw<
      Array<{ avg_minutes: number | null }>
    >(Prisma.sql`
      SELECT AVG(EXTRACT(EPOCH FROM (t."resolvedAt" - t."createdAt")) / 60)::float as avg_minutes
      FROM tickets t
      ${resolvedWhere}
    `);

    // SLA compliance rate
    const slaConditions = [
      ...ticketConditions,
      Prisma.sql`t."slaDeadline" IS NOT NULL`,
      Prisma.sql`t."resolvedAt" IS NOT NULL`,
    ];
    const slaWhere = Prisma.sql`WHERE ${Prisma.join(slaConditions, ' AND ')}`;

    const sla = await this.prisma.$queryRaw<
      Array<{ compliance_rate: number | null }>
    >(Prisma.sql`
      SELECT
        CASE WHEN COUNT(*) = 0 THEN NULL
        ELSE (COUNT(*) FILTER (WHERE t."resolvedAt" <= t."slaDeadline")::float / COUNT(*)::float * 100)
        END as compliance_rate
      FROM tickets t
      ${slaWhere}
    `);

    // CSAT average (Prisma API)
    const csatWhere: Prisma.CSATSurveyWhereInput = {
      tenantId,
      respondedAt: { not: null },
    };
    if (startDate || endDate) {
      const df: Prisma.DateTimeFilter = {};
      if (startDate) df.gte = startDate;
      if (endDate) df.lte = endDate;
      csatWhere.createdAt = df;
    }
    const csatAgg = await this.prisma.cSATSurvey.aggregate({
      where: csatWhere,
      _avg: { rating: true },
    });

    // Top 10 tickets by resolution time
    const topTickets = await this.prisma.$queryRaw<
      Array<{ id: string; subject: string; resolution_minutes: number; assignee_name: string | null }>
    >(Prisma.sql`
      SELECT t.id, t.subject,
        (EXTRACT(EPOCH FROM (t."resolvedAt" - t."createdAt")) / 60)::float as resolution_minutes,
        u.name as assignee_name
      FROM tickets t
      LEFT JOIN users u ON u.id = t."assigneeId"
      ${resolvedWhere}
      ORDER BY resolution_minutes DESC
      LIMIT 10
    `);

    return {
      avgFirstResponseMinutes: firstResponse[0]?.avg_minutes
        ? Math.round(firstResponse[0].avg_minutes)
        : null,
      avgResolutionMinutes: resolution[0]?.avg_minutes
        ? Math.round(resolution[0].avg_minutes)
        : null,
      slaComplianceRate: sla[0]?.compliance_rate
        ? Math.round(sla[0].compliance_rate * 10) / 10
        : null,
      csatAverage: csatAgg._avg.rating
        ? Math.round(csatAgg._avg.rating * 100) / 100
        : null,
      topTicketsByResolution: topTickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        resolutionMinutes: Math.round(t.resolution_minutes),
        assigneeName: t.assignee_name,
      })),
    };
  }
}
