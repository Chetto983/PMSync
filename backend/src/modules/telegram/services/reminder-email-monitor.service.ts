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
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping';
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
    // BullMQ scheduled job — no HTTP request context, bypass tenant scoping
    return withoutTenantScopingAsync(() => this.checkEmailsInternal());
  }

  private static readonly MAX_PER_TENANT = 50;

  private async checkEmailsInternal(): Promise<void> {
    // Get distinct tenants with active email-monitoring reminders
    const tenantIds = await this.prisma.reminder.findMany({
      where: {
        monitoraEmail: true,
        status: ReminderStatus.attivo,
        emailRilevata: false,
        condizioneTipo: { in: ['se_risponde_mail', 'se_non_risponde_mail'] },
      },
      select: { tenantId: true },
      distinct: ['tenantId'],
    });

    if (!tenantIds.length) {
      this.logger.debug('No reminders to monitor for email conditions');
      return;
    }

    // Fair round-robin: max MAX_PER_TENANT reminders per tenant
    let totalProcessed = 0;
    for (const { tenantId } of tenantIds) {
      const reminders = await this.prisma.reminder.findMany({
        where: {
          tenantId,
          monitoraEmail: true,
          status: ReminderStatus.attivo,
          emailRilevata: false,
          condizioneTipo: { in: ['se_risponde_mail', 'se_non_risponde_mail'] },
        },
        take: ReminderEmailMonitorService.MAX_PER_TENANT,
        orderBy: { createdAt: 'asc' },
      });

      for (const reminder of reminders) {
        try {
          await this.checkSingleReminder(reminder);
          totalProcessed++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.error(`Error checking reminder ${reminder.id}: ${msg}`);
        }
      }
    }

    if (totalProcessed > 0) {
      this.logger.log(
        `Checked email conditions for ${totalProcessed} reminders across ${tenantIds.length} tenant(s)`,
      );
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
    if (!reminder.emailKeywords.length && !reminder.emailMittente) return null;

    // Use raw SQL with ILIKE ANY to avoid O(N*K) OR expansion per keyword.
    // Single query regardless of keyword count.
    const patterns = reminder.emailKeywords.map((kw) => `%${kw}%`);
    const params: unknown[] = [reminder.tenantId, reminder.createdAt];
    const conditions: string[] = [
      `"tenantId" = $1`,
      `"isDeleted" = false`,
      `"receivedAt" >= $2`,
    ];

    let paramIdx = 3;

    if (reminder.emailMittente) {
      conditions.push(`"from" ILIKE $${paramIdx}`);
      params.push(`%${reminder.emailMittente}%`);
      paramIdx++;
    }

    if (patterns.length > 0) {
      conditions.push(
        `("subject" ILIKE ANY($${paramIdx}::text[]) OR "snippet" ILIKE ANY($${paramIdx}::text[]))`,
      );
      params.push(patterns);
      paramIdx++;
    }

    const sql = `SELECT "subject" FROM "Email" WHERE ${conditions.join(' AND ')} ORDER BY "receivedAt" DESC LIMIT 1`;
    const rows = await this.prisma.$queryRawUnsafe<Array<{ subject: string | null }>>(sql, ...params);

    return rows.length > 0 ? rows[0] : null;
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
