import { Test, TestingModule } from '@nestjs/testing';
import { ReminderAlertSchedulerService } from '../reminder-alert-scheduler.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { ScheduledJobsQueueService, ScheduledJobType } from '../../../../common/services/scheduled-jobs.queue';

// Bypass tenant scoping in tests
jest.mock('../../../../prisma/tenant-scoping/tenant-context', () => ({
  withoutTenantScopingAsync: <T>(fn: () => Promise<T>) => fn(),
}));

const MS_1H = 60 * 60 * 1000;
const MS_24H = 24 * MS_1H;

function makeReminder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    tenantId: 't1',
    userId: 'u1',
    titolo: 'Call client',
    contatto: 'John',
    scadenzaDatetime: new Date(Date.now() + 2 * MS_1H),
    status: 'attivo',
    remindCount: 0,
    lastRemindedAt: null,
    ...overrides,
  };
}

describe('ReminderAlertSchedulerService', () => {
  let service: ReminderAlertSchedulerService;

  const mockPrisma = {
    reminder: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    inAppNotification: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  const mockRealtimeEvents = {
    emitReminderUpcoming: jest.fn(),
    emitReminderImminent: jest.fn(),
    emitReminderOverdue: jest.fn(),
  };

  const mockScheduledJobs = {
    registerHandler: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.reminder.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderAlertSchedulerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RealtimeEventsService, useValue: mockRealtimeEvents },
        { provide: ScheduledJobsQueueService, useValue: mockScheduledJobs },
      ],
    }).compile();

    service = module.get(ReminderAlertSchedulerService);
  });

  it('should register handler on module init', () => {
    service.onModuleInit();
    expect(mockScheduledJobs.registerHandler).toHaveBeenCalledWith(
      ScheduledJobType.REMINDER_ALERT_CHECK,
      expect.any(Function),
    );
  });

  describe('alert check', () => {
    let handler: (job: any) => Promise<void>;

    beforeEach(() => {
      service.onModuleInit();
      handler = mockScheduledJobs.registerHandler.mock.calls[0][1];
    });

    it('should emit imminent event for reminder due within 1 hour', async () => {
      const reminder = makeReminder({
        scadenzaDatetime: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
      });
      // First call: upcoming query, second call: overdue query
      mockPrisma.reminder.findMany
        .mockResolvedValueOnce([reminder])
        .mockResolvedValueOnce([]);

      await handler({ data: {} });

      expect(mockPrisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { remindCount: 1, lastRemindedAt: expect.any(Date) },
      });
      expect(mockRealtimeEvents.emitReminderImminent).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ reminderId: 'r1', titolo: 'Call client' }),
      );
    });

    it('should emit upcoming event for reminder due within 24 hours (remindCount=0)', async () => {
      const reminder = makeReminder({
        scadenzaDatetime: new Date(Date.now() + 12 * MS_1H), // 12h from now
      });
      mockPrisma.reminder.findMany
        .mockResolvedValueOnce([reminder])
        .mockResolvedValueOnce([]);

      await handler({ data: {} });

      expect(mockRealtimeEvents.emitReminderUpcoming).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ reminderId: 'r1' }),
      );
    });

    it('should NOT re-alert upcoming if remindCount > 0', async () => {
      const reminder = makeReminder({
        scadenzaDatetime: new Date(Date.now() + 12 * MS_1H),
        remindCount: 1, // already reminded
      });
      mockPrisma.reminder.findMany
        .mockResolvedValueOnce([reminder])
        .mockResolvedValueOnce([]);

      await handler({ data: {} });

      expect(mockRealtimeEvents.emitReminderUpcoming).not.toHaveBeenCalled();
    });

    it('should emit overdue for past-deadline reminders within 48h', async () => {
      const reminder = makeReminder({
        scadenzaDatetime: new Date(Date.now() - 2 * MS_1H), // 2h ago
      });
      mockPrisma.reminder.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([reminder]);

      await handler({ data: {} });

      expect(mockRealtimeEvents.emitReminderOverdue).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ reminderId: 'r1' }),
      );
    });

    it('should auto-cancel reminders overdue by >48h', async () => {
      const reminder = makeReminder({
        scadenzaDatetime: new Date(Date.now() - 50 * MS_1H), // 50h ago
      });
      mockPrisma.reminder.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([reminder]);

      await handler({ data: {} });

      expect(mockPrisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: 'annullato' },
      });
    });

    it('should handle empty reminder lists gracefully', async () => {
      mockPrisma.reminder.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await handler({ data: {} });

      expect(mockPrisma.reminder.update).not.toHaveBeenCalled();
      expect(mockRealtimeEvents.emitReminderUpcoming).not.toHaveBeenCalled();
    });
  });
});
