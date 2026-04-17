import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TasksAggregationService } from '../../tasks/services/tasks-aggregation.service';
import { BriefingService } from '../../ai/services/briefing.service';
import { DealService } from '../../crm/deal/services/deal.service';
import { TodayScorerService } from './today-scorer.service';
import {
  TodayFeedItemDto,
  TodayFeedResponseDto,
  TodayFeedCountsDto,
  TodayTier,
  TodayItemType,
} from '../dto/today-feed.dto';

/**
 * Phase 145 — Smart Today Dashboard aggregator.
 *
 * Queries 6 data sources in parallel (unified tasks, follow-ups, upcoming deals,
 * stuck deals, today's calendar events, optional cached briefing greeting).
 * Each source is wrapped with `.catch()` so a single failure degrades the feed
 * gracefully instead of returning a 500.
 *
 * Multi-tenant rule (CLAUDE.md): every Prisma `where` MUST include `tenantId`.
 * Verified by `dashboard-today.service.spec.ts > tenant scoping`.
 *
 * Threat mitigations:
 * - T-145-01: tenantId on every query (assertion in spec).
 * - T-145-02: greeting via the cached slot API only; the uncached direct LLM entrypoint is never invoked.
 * - T-145-06: includeGreeting opt-in, getBriefing has 8h slot cache.
 */
const STUCK_DEAL_DAYS = 14;
const UPCOMING_DEAL_DAYS = 7;

interface GetTodayOpts {
  locale?: string;
  tz?: string;
  includeGreeting?: boolean;
}

@Injectable()
export class DashboardTodayService {
  private readonly logger = new Logger(DashboardTodayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksAggregation: TasksAggregationService,
    private readonly briefingService: BriefingService,
    private readonly dealService: DealService,
    private readonly scorer: TodayScorerService,
  ) {}

  async getTodayFeed(
    tenantId: string,
    userId: string,
    opts: GetTodayOpts = {},
  ): Promise<TodayFeedResponseDto> {
    const now = new Date();
    const tz = opts.tz || 'UTC';
    const locale = opts.locale || 'en';
    const { startOfDay, endOfDay, tomorrowEod, sevenDaysFromNow, fourteenDaysAgo } =
      this.computeWindows(now, tz);

    // Parallel fan-out — every source has its own .catch() so one failure
    // does not abort the whole feed (per RESEARCH.md validation map).
    const [tasksRes, followUpsRes, dealsRes, eventsRes, stuckDealsRes, briefingRes] =
      await Promise.all([
        this.tasksAggregation
          .listTasks(tenantId, userId, {
            sourceType: ['follow_up', 'reminder', 'deal_action', 'ticket', 'manual'],
            status: ['pending', 'in_progress'],
            dueBefore: tomorrowEod.toISOString(),
            sortBy: 'dueDate',
            sortOrder: 'asc',
            limit: 100,
          })
          .catch((err: unknown) => {
            this.logger.warn(
              { err: (err as Error)?.message, source: 'tasks' },
              'today-feed source failed',
            );
            return { data: [], meta: { total: 0, page: 1, limit: 100, counts: { follow_up: 0, reminder: 0, deal_action: 0, ticket: 0, manual: 0 } } };
          }),

        this.prisma.emailFollowUp
          .findMany({
            where: {
              tenantId,
              userId,
              status: { in: ['PENDING', 'REMINDED'] as never[] },
            },
            include: {
              email: { select: { id: true, subject: true, from: true, threadId: true } },
            },
            orderBy: { dueDate: 'asc' },
            take: 30,
          })
          .catch((err: unknown) => {
            this.logger.warn(
              { err: (err as Error)?.message, source: 'follow_ups' },
              'today-feed source failed',
            );
            return [] as never[];
          }),

        this.dealService
          .list(tenantId, {
            expectedCloseDateFrom: now.toISOString(),
            expectedCloseDateTo: sevenDaysFromNow.toISOString(),
            limit: 20,
          } as never)
          .catch((err: unknown) => {
            this.logger.warn(
              { err: (err as Error)?.message, source: 'deals' },
              'today-feed source failed',
            );
            return { data: [], total: 0 };
          }),

        this.prisma.calendarEvent
          .findMany({
            where: {
              tenantId,
              isDeleted: false,
              startTime: { gte: startOfDay, lte: endOfDay },
            },
            orderBy: { startTime: 'asc' },
            take: 50,
          })
          .catch((err: unknown) => {
            this.logger.warn(
              { err: (err as Error)?.message, source: 'events' },
              'today-feed source failed',
            );
            return [] as never[];
          }),

        this.prisma.crmDeal
          .findMany({
            where: {
              tenantId,
              deletedAt: null,
              updatedAt: { lt: fourteenDaysAgo },
              stage: { isWon: false, isLost: false },
            },
            include: { stage: { select: { isWon: true, isLost: true } } },
            orderBy: { updatedAt: 'asc' },
            take: 20,
          })
          .catch((err: unknown) => {
            this.logger.warn(
              { err: (err as Error)?.message, source: 'stuck_deals' },
              'today-feed source failed',
            );
            return [] as never[];
          }),

        opts.includeGreeting
          ? this.briefingService
              .getBriefing(tenantId, userId, tz, locale)
              .catch((err: unknown) => {
                this.logger.warn(
                  { err: (err as Error)?.message, source: 'briefing' },
                  'today-feed source failed',
                );
                return null;
              })
          : Promise.resolve(null),
      ]);

    // Normalize each source -> TodayFeedItemDto[]
    const taskItems = this.normalizeTasks(tasksRes.data, now);

    // Q5 dedup: if a follow-up is already surfaced as a `follow_up` task,
    // skip the raw EmailFollowUp record to avoid double-counting (Pitfall 1).
    const followUpEmailIds = new Set(
      taskItems
        .filter((i) => i.taskSourceType === 'follow_up' && i.emailId)
        .map((i) => i.emailId as string),
    );
    const followUpItems = this.normalizeFollowUps(followUpsRes, followUpEmailIds, now);
    const dealItems = this.normalizeDeals(dealsRes.data, now, false);
    const stuckDealItems = this.normalizeDeals(stuckDealsRes, now, true);
    const eventItems = this.normalizeEvents(eventsRes, now);

    // Dedup deals by id (upcoming + stuck may overlap)
    const dealById = new Map<string, TodayFeedItemDto>();
    for (const d of [...dealItems, ...stuckDealItems]) {
      if (d.dealId) dealById.set(d.dealId, d);
    }

    const merged: TodayFeedItemDto[] = [
      ...taskItems,
      ...followUpItems,
      ...Array.from(dealById.values()),
      ...eventItems,
    ];

    // Stable sort: tier > score desc > dueAt asc > type order > id asc.
    const tierOrder: Record<TodayTier, number> = { urgent: 0, today: 1, fyi: 2 };
    const typeOrder: Record<TodayItemType, number> = { email: 0, task: 1, event: 2, deal: 3 };
    merged.sort((a, b) => {
      if (tierOrder[a.tier] !== tierOrder[b.tier]) return tierOrder[a.tier] - tierOrder[b.tier];
      if (a.score !== b.score) return b.score - a.score;
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (aDue !== bDue) return aDue - bDue;
      if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type];
      return a.id.localeCompare(b.id);
    });

    const counts: TodayFeedCountsDto = {
      urgent: merged.filter((i) => i.tier === 'urgent').length,
      today: merged.filter((i) => i.tier === 'today').length,
      fyi: merged.filter((i) => i.tier === 'fyi').length,
      total: merged.length,
    };

    // BriefingService.getBriefing returns AiServiceResult<BriefingOutput> where
    // BriefingOutput.executiveSummary is the 2-3 sentence greeting we want.
    const greeting = briefingRes?.data?.executiveSummary ?? null;

    return {
      items: merged,
      counts,
      greeting,
      generatedAt: now.toISOString(),
    };
  }

  // ---- private helpers ----

  /**
   * Compute today/tomorrow boundaries in the user's timezone.
   * Pattern copied verbatim from BriefingService:376-388 to avoid drift.
   */
  private computeWindows(now: Date, tz: string) {
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
    const parts = todayStr.split('-').map(Number);
    const naive = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    const probe = new Date(naive.toLocaleString('en-US', { timeZone: tz }));
    const offsetMs = probe.getTime() - naive.getTime();
    const startOfDay = new Date(naive.getTime() - offsetMs);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
    const tomorrowEod = new Date(endOfDay.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + UPCOMING_DEAL_DAYS * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - STUCK_DEAL_DAYS * 24 * 60 * 60 * 1000);
    return { startOfDay, endOfDay, tomorrowEod, sevenDaysFromNow, fourteenDaysAgo };
  }

  private normalizeTasks(
    tasks: ReadonlyArray<unknown>,
    now: Date,
  ): TodayFeedItemDto[] {
    return tasks.map((raw) => {
      const t = raw as {
        sourceType: string;
        sourceId: string;
        title: string;
        description: string | null;
        dueDate: string | null;
        priority: 'low' | 'medium' | 'high' | 'urgent' | null;
        emailId: string | null;
        threadId?: string | null;
        dealId: string | null;
      };
      const dueAt = t.dueDate ? new Date(t.dueDate) : null;
      const isOverdue = !!(dueAt && dueAt.getTime() < now.getTime());
      const isFollowUp = t.sourceType === 'follow_up';
      const type: TodayItemType = isFollowUp ? 'email' : 'task';
      const { tier, score } = this.scorer.scoreItem(
        {
          type,
          dueAt,
          isOverdue,
          sourcePriority: t.priority || undefined,
        },
        now,
      );
      return {
        id: `${type}_${t.sourceType}_${t.sourceId}`,
        type,
        tier,
        score,
        title: t.title,
        subtitle: t.description ?? null,
        dueAt: dueAt?.toISOString() ?? null,
        isOverdue,
        emailId: t.emailId ?? null,
        threadId: t.threadId ?? null,
        taskSourceType: t.sourceType,
        taskSourceId: t.sourceId,
        dealId: t.dealId ?? null,
        eventId: null,
        canComplete: !isFollowUp, // tasks completable; follow-ups handled via reply
        canDismiss: ['deal_action', 'reminder'].includes(t.sourceType),
        canSnooze: isFollowUp, // only follow-ups have a server-side snooze endpoint
      };
    });
  }

  private normalizeFollowUps(
    rows: ReadonlyArray<unknown>,
    skipEmailIds: Set<string>,
    now: Date,
  ): TodayFeedItemDto[] {
    return rows
      .filter((raw) => {
        const r = raw as { emailId: string };
        return !skipEmailIds.has(r.emailId);
      })
      .map((raw) => {
        const r = raw as {
          id: string;
          emailId: string;
          dueDate: Date | string | null;
          email?: { id?: string; subject?: string | null; from?: string; threadId?: string | null } | null;
        };
        const dueAt = r.dueDate ? new Date(r.dueDate) : null;
        const isOverdue = !!(dueAt && dueAt.getTime() < now.getTime());
        const { tier, score } = this.scorer.scoreItem(
          { type: 'email', dueAt, isOverdue },
          now,
        );
        return {
          id: `email_follow_up_${r.id}`,
          type: 'email' as const,
          tier,
          score,
          title: r.email?.subject ?? '(no subject)',
          subtitle: r.email?.from ?? null,
          dueAt: dueAt?.toISOString() ?? null,
          isOverdue,
          emailId: r.emailId,
          threadId: r.email?.threadId ?? null,
          taskSourceType: 'follow_up',
          taskSourceId: r.id,
          dealId: null,
          eventId: null,
          canComplete: false,
          canDismiss: false,
          canSnooze: true,
        };
      });
  }

  private normalizeDeals(
    deals: ReadonlyArray<unknown>,
    now: Date,
    isStuck: boolean,
  ): TodayFeedItemDto[] {
    return deals.map((raw) => {
      const d = raw as {
        id: string;
        name: string;
        expectedCloseDate: Date | string | null;
      };
      const dueAt = d.expectedCloseDate ? new Date(d.expectedCloseDate) : null;
      const isOverdue = !!(dueAt && dueAt.getTime() < now.getTime());
      const { tier, score } = this.scorer.scoreItem(
        { type: 'deal', dueAt, isOverdue, isStuck },
        now,
      );
      return {
        id: `deal_${d.id}`,
        type: 'deal' as const,
        tier,
        score,
        title: d.name,
        subtitle: isStuck
          ? `No activity in ${STUCK_DEAL_DAYS}+ days`
          : dueAt
            ? `Closes ${dueAt.toLocaleDateString()}`
            : null,
        dueAt: dueAt?.toISOString() ?? null,
        isOverdue,
        emailId: null,
        threadId: null,
        taskSourceType: null,
        taskSourceId: null,
        dealId: d.id,
        eventId: null,
        canComplete: false,
        canDismiss: false,
        canSnooze: false,
      };
    });
  }

  private normalizeEvents(
    events: ReadonlyArray<unknown>,
    now: Date,
  ): TodayFeedItemDto[] {
    return events.map((raw) => {
      const e = raw as { id: string; title: string; startTime: Date | string };
      const dueAt = new Date(e.startTime);
      const isOverdue = false; // Events are anchored at startTime; "overdue" doesn't apply.
      const { tier, score } = this.scorer.scoreItem(
        { type: 'event', dueAt, isOverdue, isHardDeadline: true },
        now,
      );
      return {
        id: `event_${e.id}`,
        type: 'event' as const,
        tier,
        score,
        title: e.title,
        subtitle: dueAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        dueAt: dueAt.toISOString(),
        isOverdue,
        emailId: null,
        threadId: null,
        taskSourceType: null,
        taskSourceId: null,
        dealId: null,
        eventId: e.id,
        canComplete: false,
        canDismiss: false,
        canSnooze: false,
      };
    });
  }
}
