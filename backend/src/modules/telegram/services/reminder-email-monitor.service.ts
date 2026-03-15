/**
 * ReminderEmailMonitorService — Checks emails for reminder conditions.
 *
 * Runs every 5 min via BullMQ. For each reminder with monitoraEmail=true,
 * searches the Email model for matches and applies conditional logic:
 *
 * | condizioneTipo        | Email found | Action                                |
 * |-----------------------|-------------|---------------------------------------|
 * | se_risponde_mail      | Yes         | emailRilevata=true, immediate Telegram|
 * | se_risponde_mail      | No at ddl   | Keep active                           |
 * | se_non_risponde_mail  | Yes         | Auto-complete (no notification)       |
 * | se_non_risponde_mail  | No at ddl   | Urgent Telegram notification          |
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ReminderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
} from '../../../common/services/scheduled-jobs.queue';
import { TelegramBotService } from './telegram-bot.service';

@Injectable()
export class ReminderEmailMonitorService implements OnModuleInit {
  private readonly logger = new Logger(ReminderEmailMonitorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduledJobsQueue: ScheduledJobsQueueService,
    private readonly telegramBot: TelegramBotService,
  ) {}

  onModuleInit() {
    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.REMINDER_EMAIL_MONITOR,
      async () => this.checkEmails(),
    );
    this.logger.log('Reminder email monitor handler registered (every 5 min)');
  }

  private async checkEmails(): Promise<void> {
    // Find all reminders with email monitoring enabled
    const reminders = await this.prisma.reminder.findMany({
      where: {
        monitoraEmail: true,
        status: ReminderStatus.attivo,
        emailRilevata: false,
        condizioneTipo: { in: ['se_risponde_mail', 'se_non_risponde_mail'] },
      },
      take: 100, // Process in batches to avoid memory issues
    });

    if (!reminders.length) {
      this.logger.debug('No reminders to monitor for email conditions');
      return;
    }

    this.logger.log(`Checking email conditions for ${reminders.length} reminders`);

    for (const reminder of reminders) {
      try {
        await this.checkSingleReminder(reminder);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error checking reminder ${reminder.id}: ${msg}`);
      }
    }
  }

  private async checkSingleReminder(reminder: {
    id: string;
    tenantId: string;
    userId: string;
    emailKeywords: string[];
    emailMittente: string | null;
    condizioneTipo: string;
    scadenzaDatetime: Date | null;
    createdAt: Date;
    titolo: string;
  }): Promise<void> {
    const emailMatch = await this.findMatchingEmail(reminder);

    if (emailMatch) {
      // Email found — handle based on condition type
      if (reminder.condizioneTipo === 'se_risponde_mail') {
        // Email arrived — notify immediately
        await this.prisma.reminder.update({
          where: { id: reminder.id },
          data: { emailRilevata: true, emailRilevataAt: new Date() },
        });

        await this.sendImmediateNotification(
          reminder.tenantId,
          reminder.userId,
          reminder.titolo,
          emailMatch.subject,
        );

        this.logger.log(`Email detected for reminder ${reminder.id} (se_risponde_mail) — notified`);
      } else if (reminder.condizioneTipo === 'se_non_risponde_mail') {
        // Email arrived — auto-complete, no notification needed
        await this.prisma.reminder.update({
          where: { id: reminder.id },
          data: {
            emailRilevata: true,
            emailRilevataAt: new Date(),
            status: ReminderStatus.completato,
            completatoAt: new Date(),
          },
        });

        this.logger.log(`Email detected for reminder ${reminder.id} (se_non_risponde_mail) — auto-completed`);
      }
    } else {
      // No email match — check deadline
      await this.checkDeadlineExpiry(reminder);
    }
  }

  private async findMatchingEmail(reminder: {
    tenantId: string;
    emailKeywords: string[];
    emailMittente: string | null;
    createdAt: Date;
  }): Promise<{ subject: string | null } | null> {
    // Build search conditions
    const where: Record<string, unknown> = {
      tenantId: reminder.tenantId,
      isDeleted: false,
      receivedAt: { gte: reminder.createdAt },
    };

    // Filter by sender if specified
    if (reminder.emailMittente) {
      where.from = { contains: reminder.emailMittente, mode: 'insensitive' };
    }

    // Search for emails matching keywords in subject or snippet
    if (reminder.emailKeywords.length > 0) {
      where.OR = reminder.emailKeywords.map((keyword) => ({
        OR: [
          { subject: { contains: keyword, mode: 'insensitive' } },
          { snippet: { contains: keyword, mode: 'insensitive' } },
        ],
      }));
    }

    const email = await this.prisma.email.findFirst({
      where,
      select: { subject: true },
      orderBy: { receivedAt: 'desc' },
    });

    return email;
  }

  private async checkDeadlineExpiry(reminder: {
    id: string;
    tenantId: string;
    userId: string;
    condizioneTipo: string;
    scadenzaDatetime: Date | null;
    titolo: string;
  }): Promise<void> {
    if (!reminder.scadenzaDatetime) return;
    if (reminder.scadenzaDatetime > new Date()) return;

    // Deadline has passed
    if (reminder.condizioneTipo === 'se_non_risponde_mail') {
      // No response received by deadline — send urgent notification
      await this.sendImmediateNotification(
        reminder.tenantId,
        reminder.userId,
        `URGENTE: ${reminder.titolo} — Nessuna risposta ricevuta`,
        null,
      );

      this.logger.log(`Deadline expired for reminder ${reminder.id} (se_non_risponde_mail) — urgent notification sent`);
    }
  }

  private async sendImmediateNotification(
    tenantId: string,
    userId: string,
    title: string,
    emailSubject: string | null,
  ): Promise<void> {
    if (!this.telegramBot.isEnabled) return;

    const settings = await this.prisma.telegramSettings.findUnique({
      where: { userId },
      select: { telegramChatId: true, isActive: true },
    });

    if (!settings?.isActive || !settings.telegramChatId) return;

    const sent = await this.telegramBot.sendImmediateAlert(
      settings.telegramChatId,
      title,
      emailSubject ?? undefined,
    );

    // Log
    await this.prisma.telegramLog.create({
      data: {
        tenantId,
        userId,
        reminderIds: [],
        slot: 'urgente',
        messaggioCompleto: `Immediate: ${title}`,
        isError: !sent,
        errorMessage: sent ? null : 'Send failed',
      },
    });
  }
}
