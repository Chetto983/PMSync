import { PrismaService } from '../../../prisma/prisma.service';
import type { ChurnFeatures } from './churn-features.types';

type EmailDecayResult = Pick<
  ChurnFeatures,
  | 'responseTimeRecent'
  | 'responseTimeHistorical'
  | 'responseDecayRatio'
  | 'repliedRatioRecent'
  | 'repliedRatioHistorical'
  | 'emailBounceCount'
>;

type MeetingDropResult = Pick<
  ChurnFeatures,
  'meetingCountCurrentQ' | 'meetingCountPreviousQ' | 'meetingDropRatio'
>;

/**
 * Compute email response decay comparing 30d vs 31-90d windows.
 */
export async function computeEmailDecay(
  prisma: PrismaService,
  tenantId: string,
  contactEmails: string[],
  now: Date,
): Promise<EmailDecayResult> {
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

  const [recentMetrics, historicalMetrics] = await Promise.all([
    computeReplyWindow(prisma, tenantId, contactEmails, thirtyDaysAgo, now),
    computeReplyWindow(
      prisma,
      tenantId,
      contactEmails,
      ninetyDaysAgo,
      thirtyDaysAgo,
    ),
  ]);

  const emailBounceCount = await prisma.email.count({
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

async function computeReplyWindow(
  prisma: PrismaService,
  tenantId: string,
  contactEmails: string[],
  from: Date,
  to: Date,
): Promise<{ repliedRatio: number; avgResponseTimeHours: number | null }> {
  const receivedEmails = await prisma.email.findMany({
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

  const replies = await prisma.email.findMany({
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

/**
 * Compute meeting frequency drop comparing current vs previous quarter.
 */
export async function computeMeetingDrop(
  prisma: PrismaService,
  tenantId: string,
  contactEmails: string[],
  now: Date,
): Promise<MeetingDropResult> {
  if (contactEmails.length === 0) {
    return {
      meetingCountCurrentQ: 0,
      meetingCountPreviousQ: 0,
      meetingDropRatio: null,
    };
  }

  const currentQStart = quarterStart(now);
  const prevQStart = new Date(currentQStart);
  prevQStart.setMonth(prevQStart.getMonth() - 3);

  const [meetingCountCurrentQ, meetingCountPreviousQ] = await Promise.all([
    countMeetingsInRange(prisma, tenantId, contactEmails, currentQStart, now),
    countMeetingsInRange(
      prisma,
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

async function countMeetingsInRange(
  prisma: PrismaService,
  tenantId: string,
  contactEmails: string[],
  from: Date,
  to: Date,
): Promise<number> {
  const result = await prisma.$queryRaw<[{ count: bigint }]>`
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

function quarterStart(date: Date): Date {
  const q = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), q, 1);
}
