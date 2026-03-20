import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ReminderStatus } from '@prisma/client';
import { TelegramSchedulerService } from '../telegram-scheduler.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
} from '../../../../common/services/scheduled-jobs.queue';
import { TelegramBotService } from '../telegram-bot.service';

describe('TelegramSchedulerService', () => {
  let service: TelegramSchedulerService;

  const mockPrisma = {
    telegramSettings: {
      findMany: jest.fn(),
    },
    reminder: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    telegramLog: {
      create: jest.fn(),
    },
  };

  const mockScheduledJobs = {
    registerHandler: jest.fn(),
  };

  const mockBotService = {
    isEnabled: true,
    sendDigest: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockBotService.isEnabled = true;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramSchedulerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ScheduledJobsQueueService, useValue: mockScheduledJobs },
        { provide: TelegramBotService, useValue: mockBotService },
      ],
    }).compile();

    service = module.get(TelegramSchedulerService);
  });

  describe('onModuleInit', () => {
    it('should register 3 slot handlers when bot is enabled', () => {
      service.onModuleInit();

      expect(mockScheduledJobs.registerHandler).toHaveBeenCalledTimes(3);
      expect(mockScheduledJobs.registerHandler).toHaveBeenCalledWith(
        ScheduledJobType.TELEGRAM_SLOT_MATTINA,
        expect.any(Function),
      );
      expect(mockScheduledJobs.registerHandler).toHaveBeenCalledWith(
        ScheduledJobType.TELEGRAM_SLOT_POMERIGGIO,
        expect.any(Function),
      );
      expect(mockScheduledJobs.registerHandler).toHaveBeenCalledWith(
        ScheduledJobType.TELEGRAM_SLOT_SERA,
        expect.any(Function),
      );
    });

    it('should skip handler registration when bot is not enabled', () => {
      mockBotService.isEnabled = false;
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      service.onModuleInit();

      expect(mockScheduledJobs.registerHandler).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('processSlot (via private access)', () => {
    it('should query active telegram users', async () => {
      mockPrisma.telegramSettings.findMany.mockResolvedValue([]);

      await (service as any).processSlot('mattina');

      expect(mockPrisma.telegramSettings.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, telegramChatId: { not: null } },
        }),
      );
    });

    it('should do nothing when no active users', async () => {
      mockPrisma.telegramSettings.findMany.mockResolvedValue([]);

      await (service as any).processSlot('mattina');

      expect(mockPrisma.reminder.findMany).not.toHaveBeenCalled();
    });

    it('should process each active user', async () => {
      mockPrisma.telegramSettings.findMany.mockResolvedValue([
        { tenantId: 't1', userId: 'u1', telegramChatId: '111' },
        { tenantId: 't2', userId: 'u2', telegramChatId: '222' },
      ]);
      mockPrisma.reminder.findMany.mockResolvedValue([]);

      await (service as any).processSlot('pomeriggio');

      // Called once per user
      expect(mockPrisma.reminder.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendSlotDigestForUser (via private access)', () => {
    const tenantId = 'tenant-1';
    const userId = 'user-1';
    const chatId = '12345';
    const slot = 'mattina';

    const mockReminders = [
      {
        id: 'r1', tenantId, userId, titolo: 'Call client',
        contatto: 'Mario', azione: 'chiama',
        scadenzaDatetime: new Date(), condizioneTipo: 'immediato',
        condizioneDettaglio: null, monitoraEmail: false,
      },
      {
        id: 'r2', tenantId, userId, titolo: 'Check invoice',
        contatto: null, azione: 'verifica',
        scadenzaDatetime: null, condizioneTipo: 'immediato',
        condizioneDettaglio: 'Verify payment', monitoraEmail: true,
      },
    ];

    it('should send digest with correct slot and items', async () => {
      mockPrisma.reminder.findMany.mockResolvedValue(mockReminders);
      mockBotService.sendDigest.mockResolvedValue(true);
      mockPrisma.reminder.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.telegramLog.create.mockResolvedValue({});

      await (service as any).sendSlotDigestForUser(tenantId, userId, chatId, slot);

      // sendDigest takes (chatId, slot, items)
      expect(mockBotService.sendDigest).toHaveBeenCalledWith(
        chatId,
        slot,
        expect.arrayContaining([
          expect.objectContaining({ id: 'r1', titolo: 'Call client' }),
          expect.objectContaining({ id: 'r2', titolo: 'Check invoice' }),
        ]),
      );
    });

    it('should mark reminders as telegramInviato on success', async () => {
      mockPrisma.reminder.findMany.mockResolvedValue(mockReminders);
      mockBotService.sendDigest.mockResolvedValue(true);
      mockPrisma.reminder.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.telegramLog.create.mockResolvedValue({});

      await (service as any).sendSlotDigestForUser(tenantId, userId, chatId, slot);

      expect(mockPrisma.reminder.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['r1', 'r2'] } },
        data: { telegramInviato: true, telegramInviatoAt: expect.any(Date) },
      });
    });

    it('should create TelegramLog on success', async () => {
      mockPrisma.reminder.findMany.mockResolvedValue([mockReminders[0]]);
      mockBotService.sendDigest.mockResolvedValue(true);
      mockPrisma.reminder.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.telegramLog.create.mockResolvedValue({});

      await (service as any).sendSlotDigestForUser(tenantId, userId, chatId, slot);

      expect(mockPrisma.telegramLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          userId,
          reminderIds: ['r1'],
          slot,
          inviatoAt: expect.any(Date),
        }),
      });
    });

    it('should skip sending when no reminders match', async () => {
      mockPrisma.reminder.findMany.mockResolvedValue([]);

      await (service as any).sendSlotDigestForUser(tenantId, userId, chatId, slot);

      expect(mockBotService.sendDigest).not.toHaveBeenCalled();
    });

    it('should create error TelegramLog when send returns false', async () => {
      mockPrisma.reminder.findMany.mockResolvedValue([mockReminders[0]]);
      mockBotService.sendDigest.mockResolvedValue(false);
      mockPrisma.telegramLog.create.mockResolvedValue({});

      await (service as any).sendSlotDigestForUser(tenantId, userId, chatId, slot);

      expect(mockPrisma.telegramLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          userId,
          isError: true,
          errorMessage: 'Telegram API send failed',
        }),
      });
      // Should NOT mark reminders as sent
      expect(mockPrisma.reminder.updateMany).not.toHaveBeenCalled();
    });
  });
});
