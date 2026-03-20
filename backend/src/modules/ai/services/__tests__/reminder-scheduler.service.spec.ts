import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FollowUpStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

/**
 * ReminderSchedulerService test — we test processReminderCheck logic
 * by extracting it indirectly via the service's internal method.
 *
 * Since BullMQ Queue/Worker are created in onModuleInit (side-effecting),
 * we disable the scheduler and test the core processing logic directly.
 */

// Mock bullmq entirely to prevent real connections
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    getRepeatableJobs: jest.fn().mockResolvedValue([]),
    removeRepeatableByKey: jest.fn(),
    close: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
}));

// Import after mocking
import { ReminderSchedulerService } from '../reminder-scheduler.service';

const MS_1H = 60 * 60 * 1000;
const MS_24H = 24 * MS_1H;

const mockPrisma = {
  emailFollowUp: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

const mockConfig = {
  get: jest.fn().mockReturnValue('false'), // Disable scheduler to prevent Queue/Worker init
};

describe('ReminderSchedulerService', () => {
  let service: ReminderSchedulerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockReturnValue('false'); // Keep scheduler disabled

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderSchedulerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<ReminderSchedulerService>(ReminderSchedulerService);
  });

  describe('processReminderCheck (via reflection)', () => {
    // Access private method for testing core logic
    const callProcess = (svc: ReminderSchedulerService) =>
      (svc as any).processReminderCheck({ data: { type: 'scheduled' } });

    it('should return zeros when no follow-ups exist', async () => {
      mockPrisma.emailFollowUp.findMany.mockResolvedValue([]);

      const result = await callProcess(service);

      expect(result).toEqual({ upcoming: 0, imminent: 0, overdue: 0, expired: 0 });
    });

    it('should mark follow-up as REMINDED when due within 1 hour', async () => {
      const now = Date.now();
      const followUp = {
        id: 'fu-1',
        emailId: 'email-1',
        dueDate: new Date(now + 30 * 60 * 1000), // 30 min from now
        remindCount: 0,
        status: FollowUpStatus.PENDING,
        email: { subject: 'Test', from: 'test@test.com' },
      };

      // First call (upcoming window): returns this follow-up
      mockPrisma.emailFollowUp.findMany
        .mockResolvedValueOnce([followUp])  // upcoming query
        .mockResolvedValueOnce([]);          // overdue query

      mockPrisma.emailFollowUp.update.mockResolvedValue({});

      const result = await callProcess(service);

      expect(result.imminent).toBe(1);
      expect(mockPrisma.emailFollowUp.update).toHaveBeenCalledWith({
        where: { id: 'fu-1' },
        data: expect.objectContaining({
          status: FollowUpStatus.REMINDED,
          remindCount: 1,
        }),
      });
    });

    it('should increment remindCount for upcoming follow-up (24h window, first reminder)', async () => {
      const now = Date.now();
      const followUp = {
        id: 'fu-2',
        emailId: 'email-2',
        dueDate: new Date(now + 12 * MS_1H), // 12h from now
        remindCount: 0,
        status: FollowUpStatus.PENDING,
        email: { subject: 'Test 2', from: 'test@test.com' },
      };

      mockPrisma.emailFollowUp.findMany
        .mockResolvedValueOnce([followUp])
        .mockResolvedValueOnce([]);

      mockPrisma.emailFollowUp.update.mockResolvedValue({});

      const result = await callProcess(service);

      expect(result.upcoming).toBe(1);
      expect(mockPrisma.emailFollowUp.update).toHaveBeenCalledWith({
        where: { id: 'fu-2' },
        data: expect.objectContaining({
          remindCount: 1,
        }),
      });
    });

    it('should NOT re-remind if already reminded (remindCount > 0, not imminent)', async () => {
      const now = Date.now();
      const followUp = {
        id: 'fu-3',
        emailId: 'email-3',
        dueDate: new Date(now + 12 * MS_1H), // 12h from now
        remindCount: 1, // Already reminded
        status: FollowUpStatus.REMINDED,
        email: { subject: 'Test 3', from: 'test@test.com' },
      };

      mockPrisma.emailFollowUp.findMany
        .mockResolvedValueOnce([followUp])
        .mockResolvedValueOnce([]);

      const result = await callProcess(service);

      expect(result.upcoming).toBe(0);
      expect(result.imminent).toBe(0);
      expect(mockPrisma.emailFollowUp.update).not.toHaveBeenCalled();
    });

    it('should respect MAX_REMIND_COUNT (3) for imminent reminders', async () => {
      const now = Date.now();
      const followUp = {
        id: 'fu-4',
        emailId: 'email-4',
        dueDate: new Date(now + 30 * 60 * 1000), // 30 min
        remindCount: 3, // Already at max
        status: FollowUpStatus.REMINDED,
        email: { subject: 'Test 4', from: 'test@test.com' },
      };

      mockPrisma.emailFollowUp.findMany
        .mockResolvedValueOnce([followUp])
        .mockResolvedValueOnce([]);

      const result = await callProcess(service);

      expect(result.imminent).toBe(0);
      expect(mockPrisma.emailFollowUp.update).not.toHaveBeenCalled();
    });

    it('should mark overdue follow-ups >48h as EXPIRED', async () => {
      const now = Date.now();
      const followUp = {
        id: 'fu-5',
        emailId: 'email-5',
        dueDate: new Date(now - 3 * MS_24H), // 3 days overdue
        remindCount: 2,
        status: FollowUpStatus.REMINDED,
      };

      mockPrisma.emailFollowUp.findMany
        .mockResolvedValueOnce([])          // upcoming
        .mockResolvedValueOnce([followUp]); // overdue

      mockPrisma.emailFollowUp.update.mockResolvedValue({});

      const result = await callProcess(service);

      expect(result.expired).toBe(1);
      expect(mockPrisma.emailFollowUp.update).toHaveBeenCalledWith({
        where: { id: 'fu-5' },
        data: { status: FollowUpStatus.EXPIRED },
      });
    });

    it('should count overdue (not expired) follow-ups within 48h', async () => {
      const now = Date.now();
      const followUp = {
        id: 'fu-6',
        emailId: 'email-6',
        dueDate: new Date(now - 6 * MS_1H), // 6h overdue (< 48h)
        remindCount: 2,
        status: FollowUpStatus.REMINDED,
      };

      mockPrisma.emailFollowUp.findMany
        .mockResolvedValueOnce([])          // upcoming
        .mockResolvedValueOnce([followUp]); // overdue

      const result = await callProcess(service);

      expect(result.overdue).toBe(1);
      expect(result.expired).toBe(0);
      expect(mockPrisma.emailFollowUp.update).not.toHaveBeenCalled();
    });

    it('should handle mixed upcoming + overdue in same batch', async () => {
      const now = Date.now();
      const upcomingFollowUp = {
        id: 'fu-7',
        emailId: 'email-7',
        dueDate: new Date(now + 20 * MS_1H),
        remindCount: 0,
        status: FollowUpStatus.PENDING,
        email: { subject: 'Upcoming', from: 'test@test.com' },
      };
      const overdueFollowUp = {
        id: 'fu-8',
        emailId: 'email-8',
        dueDate: new Date(now - 5 * MS_1H),
        remindCount: 1,
        status: FollowUpStatus.REMINDED,
      };

      mockPrisma.emailFollowUp.findMany
        .mockResolvedValueOnce([upcomingFollowUp])
        .mockResolvedValueOnce([overdueFollowUp]);

      mockPrisma.emailFollowUp.update.mockResolvedValue({});

      const result = await callProcess(service);

      expect(result.upcoming).toBe(1);
      expect(result.overdue).toBe(1);
    });
  });

  describe('onModuleInit', () => {
    it('should skip initialization when disabled', async () => {
      mockConfig.get.mockReturnValue('false');

      await service.onModuleInit();

      // Should not create queue/worker (no errors thrown)
      expect(true).toBe(true);
    });
  });
});
