import { Test, TestingModule } from '@nestjs/testing';
import { TelegramSchedulerService } from '../telegram-scheduler.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ReminderNotifyQueueService } from '../reminder-notify.queue';

describe('TelegramSchedulerService', () => {
  let service: TelegramSchedulerService;

  const mockPrisma = {
    reminder: {
      findMany: jest.fn(),
    },
  };

  const mockNotifyQueue = {
    scheduleNotification: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramSchedulerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ReminderNotifyQueueService, useValue: mockNotifyQueue },
      ],
    }).compile();

    service = module.get(TelegramSchedulerService);
  });

  describe('onApplicationBootstrap (rehydrate)', () => {
    it('should schedule notifications for all pending reminders', async () => {
      const futureDate = new Date(Date.now() + 3600_000);
      mockPrisma.reminder.findMany.mockResolvedValue([
        { id: 'r1', scadenzaDatetime: futureDate },
        { id: 'r2', scadenzaDatetime: futureDate },
      ]);

      await service.onApplicationBootstrap();

      expect(mockNotifyQueue.scheduleNotification).toHaveBeenCalledTimes(2);
      expect(mockNotifyQueue.scheduleNotification).toHaveBeenCalledWith('r1', futureDate);
      expect(mockNotifyQueue.scheduleNotification).toHaveBeenCalledWith('r2', futureDate);
    });

    it('should handle empty reminder list gracefully', async () => {
      mockPrisma.reminder.findMany.mockResolvedValue([]);

      await service.onApplicationBootstrap();

      expect(mockNotifyQueue.scheduleNotification).not.toHaveBeenCalled();
    });

    it('should skip reminders with null scadenzaDatetime', async () => {
      mockPrisma.reminder.findMany.mockResolvedValue([
        { id: 'r1', scadenzaDatetime: null },
      ]);

      await service.onApplicationBootstrap();

      expect(mockNotifyQueue.scheduleNotification).not.toHaveBeenCalled();
    });

    it('should not throw on errors (logs instead)', async () => {
      mockPrisma.reminder.findMany.mockRejectedValue(new Error('DB down'));

      await expect(service.onApplicationBootstrap()).resolves.not.toThrow();
    });
  });
});
