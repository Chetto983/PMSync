import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TasksAggregationService } from '../../../tasks/services/tasks-aggregation.service';
import { BriefingService } from '../../../ai/services/briefing.service';
import { DealService } from '../../../crm/deal/services/deal.service';
import { TodayScorerService } from '../today-scorer.service';
import { DashboardTodayService } from '../dashboard-today.service';

/**
 * Phase 145 — DashboardTodayService spec.
 *
 * Covers Wave 0 verification map per .planning/phases/145-smart-today-dashboard/145-VALIDATION.md:
 *   - groups items by tier (NAV-05 contract)
 *   - tolerates source failures (resilience)
 *   - tenant scoping on every Prisma where (T-145-01)
 *   - follow-up dedup (Pitfall 1)
 *   - getBriefing only — never generateBriefing (T-145-02)
 *   - includeGreeting opt-out skips briefing
 *   - tier counts match items
 *   - stuck deal heuristic
 */

const tenantA = 'tenantA';
const userA = 'userA';

function emptyTasksRes() {
  return {
    data: [],
    meta: { total: 0, page: 1, limit: 100, counts: { follow_up: 0, reminder: 0, deal_action: 0, ticket: 0, manual: 0 } },
  };
}

function emptyDealsRes() {
  return { data: [], total: 0 };
}

describe('DashboardTodayService', () => {
  let service: DashboardTodayService;
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
  });

  it('groups items by tier with matching counts', async () => {
    const now = Date.now();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const inOneHour = new Date(now + 60 * 60 * 1000).toISOString();

    // 1 overdue task (urgent)
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
      meta: { total: 1, page: 1, limit: 100, counts: { follow_up: 0, reminder: 0, deal_action: 0, ticket: 0, manual: 1 } },
    });
    // 1 calendar event due in 1h (today)
    mockPrisma.calendarEvent.findMany.mockResolvedValue([
      { id: 'evt1', title: 'Standup', startTime: new Date(inOneHour) },
    ]);
    // 1 stuck deal (fyi)
    mockPrisma.crmDeal.findMany.mockResolvedValue([
      { id: 'deal-stuck', name: 'Stale Co', expectedCloseDate: null, stage: { isWon: false, isLost: false } },
    ]);

    const res = await service.getTodayFeed(tenantA, userA);
    expect(res.items).toHaveLength(3);
    expect(res.counts.urgent).toBe(1);
    expect(res.counts.today).toBe(1);
    expect(res.counts.fyi).toBe(1);
    expect(res.counts.total).toBe(3);

    expect(res.items.find((i) => i.title === 'Overdue manual task')?.tier).toBe('urgent');
    expect(res.items.find((i) => i.title === 'Standup')?.tier).toBe('today');
    expect(res.items.find((i) => i.title === 'Stale Co')?.tier).toBe('fyi');
  });

  it('tier counts match items.filter(tier).length', async () => {
    const now = Date.now();
    mockTasks.listTasks.mockResolvedValue({
      data: [
        // 2 overdue
        { sourceType: 'manual', sourceId: 'a', title: 'a', description: null, dueDate: new Date(now - 3600_000).toISOString(), priority: null, emailId: null, dealId: null, ticketId: null, createdAt: '' },
        { sourceType: 'manual', sourceId: 'b', title: 'b', description: null, dueDate: new Date(now - 7200_000).toISOString(), priority: null, emailId: null, dealId: null, ticketId: null, createdAt: '' },
      ],
      meta: { total: 2, page: 1, limit: 100, counts: { follow_up: 0, reminder: 0, deal_action: 0, ticket: 0, manual: 2 } },
    });

    const res = await service.getTodayFeed(tenantA, userA);
    expect(res.items.filter((i) => i.tier === 'urgent').length).toBe(res.counts.urgent);
    expect(res.items.filter((i) => i.tier === 'today').length).toBe(res.counts.today);
    expect(res.items.filter((i) => i.tier === 'fyi').length).toBe(res.counts.fyi);
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
    expect(mockPrisma.emailFollowUp.findMany.mock.calls[0][0].where.tenantId).toBe(tenantA);

    expect(mockPrisma.calendarEvent.findMany).toHaveBeenCalled();
    expect(mockPrisma.calendarEvent.findMany.mock.calls[0][0].where.tenantId).toBe(tenantA);

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
      meta: { total: 1, page: 1, limit: 100, counts: { follow_up: 1, reminder: 0, deal_action: 0, ticket: 0, manual: 0 } },
    });

    // Raw EmailFollowUp source returns the SAME email
    mockPrisma.emailFollowUp.findMany.mockResolvedValue([
      {
        id: 'fu-record-1',
        emailId: 'email-1',
        dueDate: new Date(inOneHour),
        email: { id: 'email-1', subject: 'Reply to Bob', from: 'bob@x.com', threadId: 'thread-1' },
      },
    ]);

    const res = await service.getTodayFeed(tenantA, userA);
    const emailItems = res.items.filter((i) => i.emailId === 'email-1');
    expect(emailItems).toHaveLength(1);
    // The surviving item should be the task-derived one (taskSourceType='follow_up' but coming from tasks query)
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
    expect(stuckItem?.tier).toBe('fyi');
    // Verify the prisma query had the correct filter shape
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
    expect(mockBriefing.getBriefing).toHaveBeenCalledWith(tenantA, userA, 'Europe/Rome', 'it');
  });

  it('returns ISO generatedAt timestamp', async () => {
    const res = await service.getTodayFeed(tenantA, userA);
    expect(res.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
