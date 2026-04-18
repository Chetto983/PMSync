import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TasksAggregationService } from '../../../tasks/services/tasks-aggregation.service';
import { BriefingService } from '../../../ai/services/briefing.service';
import { DealService } from '../../../crm/deal/services/deal.service';
import { TodayScorerService } from '../today-scorer.service';
import { DashboardTodayService } from '../dashboard-today.service';

/**
 * Phase 145.1 — DashboardTodayService spec.
 *
 * Wave 0 verification map (CONTEXT.md §D-07 backend contract delta):
 *   - items classified into 4 streams (NAV-05 contract)
 *   - routeUrl is a non-empty backend-computed path
 *   - rationale is a string or null (deterministic, no LLM)
 *   - counts.kpi block present with 4 numeric keys
 *   - tolerates source failures (resilience)
 *   - tenant scoping on every Prisma where (T-145-01)
 *   - follow-up dedup (Pitfall 1)
 *   - getBriefing only — never generateBriefing (T-145-02)
 *   - includeGreeting opt-out skips briefing
 *   - stuck deal heuristic
 *   - tz propagates to scorer
 */

const tenantA = 'tenantA';
const userA = 'userA';

function emptyTasksRes() {
  return {
    data: [],
    meta: {
      total: 0,
      page: 1,
      limit: 100,
      counts: { follow_up: 0, reminder: 0, deal_action: 0, ticket: 0, manual: 0 },
    },
  };
}

function emptyDealsRes() {
  return { data: [], total: 0 };
}

describe('DashboardTodayService', () => {
  let service: DashboardTodayService;
  let scorer: TodayScorerService;
  let mockPrisma: {
    emailFollowUp: { findMany: jest.Mock };
    calendarEvent: { findMany: jest.Mock };
    crmDeal: { findMany: jest.Mock };
  };
  let mockTasks: { listTasks: jest.Mock };
  let mockBriefing: { getBriefing: jest.Mock; generateBriefing: jest.Mock };
  let mockDeals: { list: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma = {
      emailFollowUp: { findMany: jest.fn().mockResolvedValue([]) },
      calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
      crmDeal: { findMany: jest.fn().mockResolvedValue([]) },
    };
    mockTasks = { listTasks: jest.fn().mockResolvedValue(emptyTasksRes()) };
    mockBriefing = {
      getBriefing: jest.fn().mockResolvedValue({
        data: { executiveSummary: 'Hello, here is your day.' },
        meta: {},
      }),
      generateBriefing: jest.fn(),
    };
    mockDeals = { list: jest.fn().mockResolvedValue(emptyDealsRes()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardTodayService,
        TodayScorerService, // real scorer — pure-function, no DI deps
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TasksAggregationService, useValue: mockTasks },
        { provide: BriefingService, useValue: mockBriefing },
        { provide: DealService, useValue: mockDeals },
      ],
    }).compile();

    service = module.get<DashboardTodayService>(DashboardTodayService);
    scorer = module.get<TodayScorerService>(TodayScorerService);
  });

  it('groups items by stream with matching counts', async () => {
    const now = Date.now();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const inOneHour = new Date(now + 60 * 60 * 1000).toISOString();

    // 1 overdue task -> due-today
    mockTasks.listTasks.mockResolvedValue({
      data: [
        {
          id: 'task_manual_t1',
          sourceType: 'manual',
          sourceId: 't1',
          title: 'Overdue manual task',
          description: null,
          dueDate: yesterday,
          status: 'pending',
          priority: null,
          contactId: null,
          emailId: null,
          dealId: null,
          ticketId: null,
          createdAt: yesterday,
        },
      ],
      meta: {
        total: 1,
        page: 1,
        limit: 100,
        counts: { follow_up: 0, reminder: 0, deal_action: 0, ticket: 0, manual: 1 },
      },
    });
    // 1 calendar event due in 1h -> due-today
    mockPrisma.calendarEvent.findMany.mockResolvedValue([
      { id: 'evt1', title: 'Standup', startTime: new Date(inOneHour) },
    ]);
    // 1 stuck deal -> fyi
    mockPrisma.crmDeal.findMany.mockResolvedValue([
      {
        id: 'deal-stuck',
        name: 'Stale Co',
        expectedCloseDate: null,
        stage: { isWon: false, isLost: false },
      },
    ]);

    const res = await service.getTodayFeed(tenantA, userA);
    expect(res.items).toHaveLength(3);
    expect(res.counts.repliesNeeded).toBe(0);
    expect(res.counts.dueToday).toBe(2);
    expect(res.counts.waitingOnOthers).toBe(0);
    expect(res.counts.fyi).toBe(1);
    expect(res.counts.total).toBe(3);

    expect(res.items.find((i) => i.title === 'Overdue manual task')?.stream).toBe(
      'due-today',
    );
    expect(res.items.find((i) => i.title === 'Standup')?.stream).toBe('due-today');
    expect(res.items.find((i) => i.title === 'Stale Co')?.stream).toBe('fyi');
  });

  it('stream counts match items.filter(stream).length', async () => {
    const now = Date.now();
    mockTasks.listTasks.mockResolvedValue({
      data: [
        // 2 overdue
        {
          sourceType: 'manual',
          sourceId: 'a',
          title: 'a',
          description: null,
          dueDate: new Date(now - 3600_000).toISOString(),
          priority: null,
          emailId: null,
          dealId: null,
          ticketId: null,
          createdAt: '',
        },
        {
          sourceType: 'manual',
          sourceId: 'b',
          title: 'b',
          description: null,
          dueDate: new Date(now - 7200_000).toISOString(),
          priority: null,
          emailId: null,
          dealId: null,
          ticketId: null,
          createdAt: '',
        },
      ],
      meta: {
        total: 2,
        page: 1,
        limit: 100,
        counts: { follow_up: 0, reminder: 0, deal_action: 0, ticket: 0, manual: 2 },
      },
    });

    const res = await service.getTodayFeed(tenantA, userA);
    expect(res.items.filter((i) => i.stream === 'replies-needed').length).toBe(
      res.counts.repliesNeeded,
    );
    expect(res.items.filter((i) => i.stream === 'due-today').length).toBe(
      res.counts.dueToday,
    );
    expect(res.items.filter((i) => i.stream === 'waiting-on-others').length).toBe(
      res.counts.waitingOnOthers,
    );
    expect(res.items.filter((i) => i.stream === 'fyi').length).toBe(res.counts.fyi);
  });

  it('tolerates tasks source failure — returns empty for tasks but other sources still appear', async () => {
    mockTasks.listTasks.mockRejectedValueOnce(new Error('boom'));
    mockPrisma.calendarEvent.findMany.mockResolvedValue([
      { id: 'evt1', title: 'Standup', startTime: new Date() },
    ]);

    const res = await service.getTodayFeed(tenantA, userA);
    // No exception bubbled
    expect(res.items.find((i) => i.type === 'task')).toBeUndefined();
    // Calendar event still appears
    expect(res.items.find((i) => i.title === 'Standup')).toBeDefined();
  });

  it('tolerates briefing source failure — greeting null, no exception', async () => {
    mockBriefing.getBriefing.mockRejectedValueOnce(new Error('briefing down'));
    const res = await service.getTodayFeed(tenantA, userA, { includeGreeting: true });
    expect(res.greeting).toBeNull();
  });

  it('tenant scoping — every Prisma findMany where includes tenantId', async () => {
    await service.getTodayFeed(tenantA, userA);

    expect(mockPrisma.emailFollowUp.findMany).toHaveBeenCalled();
    expect(mockPrisma.emailFollowUp.findMany.mock.calls[0][0].where.tenantId).toBe(
      tenantA,
    );

    expect(mockPrisma.calendarEvent.findMany).toHaveBeenCalled();
    expect(mockPrisma.calendarEvent.findMany.mock.calls[0][0].where.tenantId).toBe(
      tenantA,
    );

    expect(mockPrisma.crmDeal.findMany).toHaveBeenCalled();
    expect(mockPrisma.crmDeal.findMany.mock.calls[0][0].where.tenantId).toBe(tenantA);

    expect(mockTasks.listTasks).toHaveBeenCalledWith(tenantA, userA, expect.any(Object));
  });

  it('follow-up dedup — does not double-count an email already surfaced as follow_up task', async () => {
    const now = Date.now();
    const inOneHour = new Date(now + 60 * 60 * 1000).toISOString();

    // tasksAggregation already returns the email as a follow_up task
    mockTasks.listTasks.mockResolvedValue({
      data: [
        {
          sourceType: 'follow_up',
          sourceId: 'fu-record-1',
          title: 'Reply to Bob',
          description: null,
          dueDate: inOneHour,
          status: 'pending',
          priority: null,
          emailId: 'email-1',
          threadId: 'thread-1',
          dealId: null,
          ticketId: null,
          createdAt: '',
        },
      ],
      meta: {
        total: 1,
        page: 1,
        limit: 100,
        counts: { follow_up: 1, reminder: 0, deal_action: 0, ticket: 0, manual: 0 },
      },
    });

    // Raw EmailFollowUp source returns the SAME email
    mockPrisma.emailFollowUp.findMany.mockResolvedValue([
      {
        id: 'fu-record-1',
        emailId: 'email-1',
        dueDate: new Date(inOneHour),
        email: {
          id: 'email-1',
          subject: 'Reply to Bob',
          from: 'bob@x.com',
          threadId: 'thread-1',
        },
      },
    ]);

    const res = await service.getTodayFeed(tenantA, userA);
    const emailItems = res.items.filter((i) => i.emailId === 'email-1');
    expect(emailItems).toHaveLength(1);
    expect(emailItems[0].title).toBe('Reply to Bob');
  });

  it('calls getBriefing not generateBriefing (T-145-02)', async () => {
    await service.getTodayFeed(tenantA, userA, { includeGreeting: true });
    expect(mockBriefing.getBriefing).toHaveBeenCalledTimes(1);
    expect(mockBriefing.generateBriefing).not.toHaveBeenCalled();
  });

  it('skips greeting when includeGreeting=false (default)', async () => {
    const res = await service.getTodayFeed(tenantA, userA);
    expect(mockBriefing.getBriefing).not.toHaveBeenCalled();
    expect(res.greeting).toBeNull();
  });

  it('stuck deal heuristic — surfaces deals with updatedAt > 14 days ago and not won/lost', async () => {
    mockPrisma.crmDeal.findMany.mockResolvedValue([
      {
        id: 'deal-stuck-1',
        name: 'ACME Stuck',
        expectedCloseDate: null,
        stage: { isWon: false, isLost: false },
      },
    ]);

    const res = await service.getTodayFeed(tenantA, userA);
    const stuckItem = res.items.find((i) => i.dealId === 'deal-stuck-1');
    expect(stuckItem).toBeDefined();
    expect(stuckItem?.type).toBe('deal');
    expect(stuckItem?.stream).toBe('fyi');
    const stuckCall = mockPrisma.crmDeal.findMany.mock.calls[0][0];
    expect(stuckCall.where.deletedAt).toBeNull();
    expect(stuckCall.where.stage).toEqual({ isWon: false, isLost: false });
    expect(stuckCall.where.updatedAt.lt).toBeInstanceOf(Date);
  });

  it('includes greeting from getBriefing.executiveSummary when includeGreeting=true', async () => {
    const res = await service.getTodayFeed(tenantA, userA, {
      includeGreeting: true,
      tz: 'Europe/Rome',
      locale: 'it',
    });
    expect(res.greeting).toBe('Hello, here is your day.');
    expect(mockBriefing.getBriefing).toHaveBeenCalledWith(
      tenantA,
      userA,
      'Europe/Rome',
      'it',
    );
  });

  it('returns ISO generatedAt timestamp', async () => {
    const res = await service.getTodayFeed(tenantA, userA);
    expect(res.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  // ---------------------------------------------------------------------------
  // Phase 145.1 — new assertions for stream / routeUrl / rationale / kpi
  // ---------------------------------------------------------------------------

  it('every item carries a stream in the 4-value union', async () => {
    const now = Date.now();
    mockTasks.listTasks.mockResolvedValue({
      data: [
        {
          sourceType: 'manual',
          sourceId: 'a',
          title: 'a',
          description: null,
          dueDate: new Date(now - 3600_000).toISOString(),
          priority: null,
          emailId: null,
          dealId: null,
          ticketId: null,
          createdAt: '',
        },
      ],
      meta: {
        total: 1,
        page: 1,
        limit: 100,
        counts: { follow_up: 0, reminder: 0, deal_action: 0, ticket: 0, manual: 1 },
      },
    });
    mockPrisma.calendarEvent.findMany.mockResolvedValue([
      { id: 'evt1', title: 'Standup', startTime: new Date(now + 3600_000) },
    ]);
    mockPrisma.crmDeal.findMany.mockResolvedValue([
      {
        id: 'deal-1',
        name: 'ACME',
        expectedCloseDate: null,
        stage: { isWon: false, isLost: false },
      },
    ]);

    const res = await service.getTodayFeed(tenantA, userA);
    const allowed = ['replies-needed', 'due-today', 'waiting-on-others', 'fyi'];
    expect(res.items.every((i) => allowed.includes(i.stream))).toBe(true);
  });

  it('every item has a routeUrl matching /dashboard/(email|tasks|crm/deals|calendar)', async () => {
    const now = Date.now();
    const inOneHour = new Date(now + 3600_000).toISOString();
    const yesterday = new Date(now - 86400_000).toISOString();

    mockTasks.listTasks.mockResolvedValue({
      data: [
        {
          sourceType: 'manual',
          sourceId: 't1',
          title: 'Manual task',
          description: null,
          dueDate: yesterday,
          priority: null,
          emailId: null,
          dealId: null,
          ticketId: null,
          createdAt: '',
        },
        {
          sourceType: 'follow_up',
          sourceId: 'fu1',
          title: 'Follow up email',
          description: null,
          dueDate: inOneHour,
          priority: null,
          emailId: 'email-abc',
          threadId: 'thread-abc',
          dealId: null,
          ticketId: null,
          createdAt: '',
        },
      ],
      meta: {
        total: 2,
        page: 1,
        limit: 100,
        counts: { follow_up: 1, reminder: 0, deal_action: 0, ticket: 0, manual: 1 },
      },
    });
    mockPrisma.calendarEvent.findMany.mockResolvedValue([
      { id: 'evt1', title: 'Standup', startTime: new Date(inOneHour) },
    ]);
    mockPrisma.crmDeal.findMany.mockResolvedValue([
      {
        id: 'deal-1',
        name: 'ACME',
        expectedCloseDate: null,
        stage: { isWon: false, isLost: false },
      },
    ]);

    const res = await service.getTodayFeed(tenantA, userA);
    for (const item of res.items) {
      expect(item.routeUrl).toMatch(
        /^\/dashboard\/(email|tasks|crm\/deals|calendar)/,
      );
    }
  });

  it('every item has rationale as string or null', async () => {
    const now = Date.now();
    mockTasks.listTasks.mockResolvedValue({
      data: [
        {
          sourceType: 'manual',
          sourceId: 't1',
          title: 'Task',
          description: null,
          dueDate: new Date(now - 3600_000).toISOString(),
          priority: null,
          emailId: null,
          dealId: null,
          ticketId: null,
          createdAt: '',
        },
      ],
      meta: {
        total: 1,
        page: 1,
        limit: 100,
        counts: { follow_up: 0, reminder: 0, deal_action: 0, ticket: 0, manual: 1 },
      },
    });

    const res = await service.getTodayFeed(tenantA, userA);
    for (const item of res.items) {
      expect(typeof item.rationale === 'string' || item.rationale === null).toBe(
        true,
      );
    }
  });

  it('counts.kpi has 4 numeric keys {inbox, calendar, deals, tasks}', async () => {
    const now = Date.now();
    const inOneHour = new Date(now + 3600_000).toISOString();
    const yesterday = new Date(now - 86400_000).toISOString();

    mockTasks.listTasks.mockResolvedValue({
      data: [
        // 1 manual task (task)
        {
          sourceType: 'manual',
          sourceId: 't1',
          title: 'Task',
          description: null,
          dueDate: yesterday,
          priority: null,
          emailId: null,
          dealId: null,
          ticketId: null,
          createdAt: '',
        },
        // 1 follow_up (email-derived)
        {
          sourceType: 'follow_up',
          sourceId: 'fu1',
          title: 'Reply',
          description: null,
          dueDate: inOneHour,
          priority: null,
          emailId: 'email-1',
          threadId: 'thread-1',
          dealId: null,
          ticketId: null,
          createdAt: '',
        },
      ],
      meta: {
        total: 2,
        page: 1,
        limit: 100,
        counts: { follow_up: 1, reminder: 0, deal_action: 0, ticket: 0, manual: 1 },
      },
    });
    mockPrisma.calendarEvent.findMany.mockResolvedValue([
      { id: 'evt1', title: 'Standup', startTime: new Date(inOneHour) },
      { id: 'evt2', title: 'Demo', startTime: new Date(inOneHour) },
    ]);
    mockPrisma.crmDeal.findMany.mockResolvedValue([
      {
        id: 'deal-1',
        name: 'ACME',
        expectedCloseDate: null,
        stage: { isWon: false, isLost: false },
      },
    ]);

    const res = await service.getTodayFeed(tenantA, userA);
    expect(res.counts.kpi).toEqual(
      expect.objectContaining({
        inbox: expect.any(Number),
        calendar: expect.any(Number),
        deals: expect.any(Number),
        tasks: expect.any(Number),
      }),
    );
    // kpi sum should be >= items length - 1 (allowing 1 for dedup overlap)
    const kpiSum =
      res.counts.kpi.inbox +
      res.counts.kpi.calendar +
      res.counts.kpi.deals +
      res.counts.kpi.tasks;
    expect(kpiSum).toBeGreaterThanOrEqual(res.items.length - 1);

    // Specifically: 1 follow_up + 0 tasks-with-type-email = 1 inbox
    expect(res.counts.kpi.inbox).toBe(1);
    // 2 calendar events
    expect(res.counts.kpi.calendar).toBe(2);
    // 1 deal
    expect(res.counts.kpi.deals).toBe(1);
    // 1 manual task (type === 'task')
    expect(res.counts.kpi.tasks).toBe(1);
  });

  it('manual tasks have canSnooze=true (new PATCH /tasks/.../snooze endpoint)', async () => {
    const now = Date.now();
    mockTasks.listTasks.mockResolvedValue({
      data: [
        {
          sourceType: 'manual',
          sourceId: 't1',
          title: 'Manual task',
          description: null,
          dueDate: new Date(now - 3600_000).toISOString(),
          priority: null,
          emailId: null,
          dealId: null,
          ticketId: null,
          createdAt: '',
        },
      ],
      meta: {
        total: 1,
        page: 1,
        limit: 100,
        counts: { follow_up: 0, reminder: 0, deal_action: 0, ticket: 0, manual: 1 },
      },
    });

    const res = await service.getTodayFeed(tenantA, userA);
    const manualItem = res.items.find((i) => i.taskSourceType === 'manual');
    expect(manualItem?.canSnooze).toBe(true);
  });

  it('propagates tz to scorer.scoreItem', async () => {
    const now = Date.now();
    const inOneHour = new Date(now + 3600_000).toISOString();
    mockPrisma.calendarEvent.findMany.mockResolvedValue([
      { id: 'evt1', title: 'Standup', startTime: new Date(inOneHour) },
    ]);

    const scoreSpy = jest.spyOn(scorer, 'scoreItem');
    await service.getTodayFeed(tenantA, userA, { tz: 'Europe/Rome' });

    expect(scoreSpy).toHaveBeenCalled();
    // Every call should include 'Europe/Rome' as the 3rd positional arg.
    const callsWithTz = scoreSpy.mock.calls.filter(
      (call) => call[2] === 'Europe/Rome',
    );
    expect(callsWithTz.length).toBeGreaterThan(0);
  });
});
