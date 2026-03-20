import { Test, TestingModule } from '@nestjs/testing';
import { ReminderStatus } from '@prisma/client';
import { ReminderEmailMonitorService } from '../reminder-email-monitor.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
} from '../../../../common/services/scheduled-jobs.queue';
import { TelegramBotService } from '../telegram-bot.service';

describe('ReminderEmailMonitorService', () => {
  let service: ReminderEmailMonitorService;

  const mockPrisma = {
    reminder: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    email: {
      findFirst: jest.fn(),
    },
    telegramSettings: {
      findUnique: jest.fn(),
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
    sendImmediateAlert: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockBotService.isEnabled = true;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderEmailMonitorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ScheduledJobsQueueService, useValue: mockScheduledJobs },
        { provide: TelegramBotService, useValue: mockBotService },
      ],
    }).compile();

    service = module.get(ReminderEmailMonitorService);
  });

  describe('onModuleInit', () => {
    it('should register handler for REMINDER_EMAIL_MONITOR', () => {
      service.onModuleInit();

      expect(mockScheduledJobs.registerHandler).toHaveBeenCalledTimes(1);
      expect(mockScheduledJobs.registerHandler).toHaveBeenCalledWith(
        ScheduledJobType.REMINDER_EMAIL_MONITOR,
        expect.any(Function),
      );
    });
  });

  describe('checkEmails (via private access)', () => {
    it('should query reminders with correct filters', async () => {
      mockPrisma.reminder.findMany.mockResolvedValue([]);

      await (service as any).checkEmails();

      expect(mockPrisma.reminder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            monitoraEmail: true,
            status: ReminderStatus.attivo,
            emailRilevata: false,
            condizioneTipo: { in: ['se_risponde_mail', 'se_non_risponde_mail'] },
          }),
        }),
      );
    });

    it('should process each matching reminder', async () => {
      const reminders = [
        {
          id: 'r1', tenantId: 't1', userId: 'u1', titolo: 'Wait for reply',
          condizioneTipo: 'se_risponde_mail', emailKeywords: ['invoice'],
          emailMittente: 'client@example.com', createdAt: new Date(),
          scadenzaDatetime: new Date('2099-12-31'),
        },
      ];
      mockPrisma.reminder.findMany.mockResolvedValue(reminders);
      mockPrisma.email.findFirst.mockResolvedValue(null);

      await (service as any).checkEmails();

      expect(mockPrisma.email.findFirst).toHaveBeenCalled();
    });

    it('should do nothing when no reminders match', async () => {
      mockPrisma.reminder.findMany.mockResolvedValue([]);

      await (service as any).checkEmails();

      expect(mockPrisma.email.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('se_risponde_mail', () => {
    const reminder = {
      id: 'r1', tenantId: 't1', userId: 'u1', titolo: 'Waiting for client reply',
      condizioneTipo: 'se_risponde_mail', emailKeywords: ['proposal'],
      emailMittente: 'client@corp.com', createdAt: new Date('2026-01-01'),
      scadenzaDatetime: new Date('2099-12-31'),
    };

    it('should mark emailRilevata and send notification when email found', async () => {
      mockPrisma.reminder.findMany.mockResolvedValue([reminder]);
      mockPrisma.email.findFirst.mockResolvedValue({ subject: 'Re: proposal' });
      mockPrisma.reminder.update.mockResolvedValue({});
      // sendImmediateNotification path
      mockPrisma.telegramSettings.findUnique.mockResolvedValue({
        telegramChatId: '999', isActive: true,
      });
      mockBotService.sendImmediateAlert.mockResolvedValue(true);
      mockPrisma.telegramLog.create.mockResolvedValue({});

      await (service as any).checkEmails();

      expect(mockPrisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { emailRilevata: true, emailRilevataAt: expect.any(Date) },
      });
      expect(mockBotService.sendImmediateAlert).toHaveBeenCalledWith(
        '999',
        'Waiting for client reply',
        'Re: proposal',
      );
    });

    it('should not act when no email found and deadline not passed', async () => {
      mockPrisma.reminder.findMany.mockResolvedValue([reminder]);
      mockPrisma.email.findFirst.mockResolvedValue(null);

      await (service as any).checkEmails();

      expect(mockPrisma.reminder.update).not.toHaveBeenCalled();
    });
  });

  describe('se_non_risponde_mail', () => {
    const reminder = {
      id: 'r2', tenantId: 't1', userId: 'u1', titolo: 'Follow up if no reply',
      condizioneTipo: 'se_non_risponde_mail', emailKeywords: ['contract'],
      emailMittente: 'vendor@example.com', createdAt: new Date('2026-01-01'),
      scadenzaDatetime: new Date('2099-12-31'),
    };

    it('should auto-complete when matching email is found', async () => {
      mockPrisma.reminder.findMany.mockResolvedValue([reminder]);
      mockPrisma.email.findFirst.mockResolvedValue({ subject: 'Re: contract signed' });
      mockPrisma.reminder.update.mockResolvedValue({});

      await (service as any).checkEmails();

      expect(mockPrisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'r2' },
        data: expect.objectContaining({
          emailRilevata: true,
          status: ReminderStatus.completato,
          completatoAt: expect.any(Date),
        }),
      });
      // Should NOT send notification
      expect(mockBotService.sendImmediateAlert).not.toHaveBeenCalled();
    });

    it('should send urgent notification when deadline passed and no email', async () => {
      const expiredReminder = {
        ...reminder,
        scadenzaDatetime: new Date('2020-01-01'),
      };
      mockPrisma.reminder.findMany.mockResolvedValue([expiredReminder]);
      mockPrisma.email.findFirst.mockResolvedValue(null);
      mockPrisma.telegramSettings.findUnique.mockResolvedValue({
        telegramChatId: '888', isActive: true,
      });
      mockBotService.sendImmediateAlert.mockResolvedValue(true);
      mockPrisma.telegramLog.create.mockResolvedValue({});

      await (service as any).checkEmails();

      expect(mockBotService.sendImmediateAlert).toHaveBeenCalledWith(
        '888',
        expect.stringContaining('URGENTE'),
        undefined,
      );
    });

    it('should not act when no email found and deadline not yet passed', async () => {
      mockPrisma.reminder.findMany.mockResolvedValue([reminder]);
      mockPrisma.email.findFirst.mockResolvedValue(null);

      await (service as any).checkEmails();

      expect(mockPrisma.reminder.update).not.toHaveBeenCalled();
      expect(mockBotService.sendImmediateAlert).not.toHaveBeenCalled();
    });
  });

  describe('sendImmediateNotification (via private access)', () => {
    it('should look up settings by userId and send alert', async () => {
      mockPrisma.telegramSettings.findUnique.mockResolvedValue({
        telegramChatId: '777', isActive: true,
      });
      mockBotService.sendImmediateAlert.mockResolvedValue(true);
      mockPrisma.telegramLog.create.mockResolvedValue({});

      await (service as any).sendImmediateNotification(
        't1', 'u1', 'Reminder title', 'Re: important',
      );

      expect(mockPrisma.telegramSettings.findUnique).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        select: { telegramChatId: true, isActive: true },
      });
      expect(mockBotService.sendImmediateAlert).toHaveBeenCalledWith(
        '777', 'Reminder title', 'Re: important',
      );
      expect(mockPrisma.telegramLog.create).toHaveBeenCalled();
    });

    it('should skip when no active telegram settings', async () => {
      mockPrisma.telegramSettings.findUnique.mockResolvedValue(null);

      await (service as any).sendImmediateNotification('t1', 'u1', 'Title', null);

      expect(mockBotService.sendImmediateAlert).not.toHaveBeenCalled();
    });

    it('should skip when bot is disabled', async () => {
      mockBotService.isEnabled = false;

      await (service as any).sendImmediateNotification('t1', 'u1', 'Title', null);

      expect(mockPrisma.telegramSettings.findUnique).not.toHaveBeenCalled();
    });
  });
});
