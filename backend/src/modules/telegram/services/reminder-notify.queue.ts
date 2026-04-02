/**
 * ReminderNotifyQueueService — Delayed BullMQ jobs for exact-time Telegram notifications.
 *
 * Instead of batching reminders into 3 daily digest slots, each reminder gets
 * a delayed job that fires at its exact `scadenzaDatetime`. Scales to 10K+ tenants
 * because BullMQ uses Redis sorted sets — O(log N) insert/remove, no polling.
 *
 * Flow:
 * 1. Reminder created with scadenzaDatetime → scheduleNotification(reminderId, datetime)
 * 2. BullMQ delayed job fires at exact time → worker looks up reminder + user Telegram
 * 3. Sends single-reminder notification via TelegramBotService
 * 4. Marks telegramInviato=true, logs to telegramLog
 *
 * On update/delete/complete: cancelNotification(reminderId) removes pending job.
 */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ReminderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';
import {
  getRedisConnectionOptions,
  getDefaultJobOptions,
  QUEUE_NAMES,
} from '../../../common/config/queue.config';
import { TelegramBotService } from './telegram-bot.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import { TelegramLocale } from '../utils/telegram-messages';

interface ReminderNotifyJobData {
  reminderId: string;
  scheduledFor: string; // ISO date string
}

@Injectable()
export class ReminderNotifyQueueService
  implements OnModuleInit, OnModuleDestroy, OnApplicationBootstrap
{
  private readonly logger = new Logger(ReminderNotifyQueueService.name);
  private redisConnection: Redis;
  private queue: Queue<ReminderNotifyJobData>;
  private worker: Worker<ReminderNotifyJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramBot: TelegramBotService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async onModuleInit() {
    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    this.queue = new Queue<ReminderNotifyJobData>(QUEUE_NAMES.REMINDER_NOTIFY, {
      connection: this.redisConnection,
      defaultJobOptions: {
        ...getDefaultJobOptions('SCHEDULED'),
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    });

    this.logger.log('ReminderNotifyQueue initialized');
  }

  async onApplicationBootstrap() {
    const jobsEnabled =
      (process.env.JOBS_ENABLED || 'true').toLowerCase() !== 'false';
    if (!jobsEnabled) {
      this.logger.warn('Reminder notify worker disabled via JOBS_ENABLED=false');
      return;
    }

    const redisOptions = getRedisConnectionOptions();
    this.worker = new Worker<ReminderNotifyJobData>(
      QUEUE_NAMES.REMINDER_NOTIFY,
      async (job) => this.processNotification(job),
      {
        connection: new Redis(redisOptions),
        concurrency: 5, // Multiple notifications can fire simultaneously
        lockDuration: 30000, // 30s lock — notification is fast
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Reminder notify job ${job?.id} failed: ${err.message}`,
      );
    });

    this.worker.on('completed', (job) => {
      this.logger.log(`Reminder notify job ${job.id} completed`);
    });

    this.worker.on('ready', () => {
      this.logger.log('ReminderNotify worker READY and processing jobs');
    });

    this.logger.log('ReminderNotify worker started (concurrency: 5)');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.redisConnection?.quit();
  }

  /**
   * Schedule a Telegram notification for a reminder at its exact scadenzaDatetime.
   * If a job already exists for this reminderId, it is replaced.
   */
  async scheduleNotification(
    reminderId: string,
    notifyAt: Date,
  ): Promise<void> {
    const rawDelay = notifyAt.getTime() - Date.now();
    // Add ±30s jitter to prevent Telegram API spikes when many reminders fire at the same time
    const jitterMs = rawDelay > 60_000 ? Math.floor(Math.random() * 60_000) - 30_000 : 0;
    const delay = rawDelay + jitterMs;

    if (delay <= 0) {
      // Already past due — send immediately
      this.logger.warn(
        `Reminder ${reminderId} scadenzaDatetime is in the past — sending immediately`,
      );
      await this.queue.add(
        'reminder-notify',
        { reminderId, scheduledFor: notifyAt.toISOString() },
        { jobId: `remind-${reminderId}` },
      );
      return;
    }

    // Remove existing job if any (handles update scenario)
    await this.cancelNotification(reminderId);

    await this.queue.add(
      'reminder-notify',
      { reminderId, scheduledFor: notifyAt.toISOString() },
      { jobId: `remind-${reminderId}`, delay },
    );

    this.logger.log(
      `Scheduled notification for reminder ${reminderId} at ${notifyAt.toISOString()} (delay: ${Math.round(delay / 1000)}s)`,
    );
  }

  /**
   * Cancel a pending notification job for a reminder.
   * Safe to call even if no job exists.
   */
  async cancelNotification(reminderId: string): Promise<void> {
    try {
      const job = await this.queue.getJob(`remind-${reminderId}`);
      if (job) {
        const state = await job.getState();
        if (state === 'delayed' || state === 'waiting') {
          await job.remove();
          this.logger.debug(`Cancelled notification for reminder ${reminderId}`);
        }
      }
    } catch (error) {
      // Job may not exist or already completed — safe to ignore
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `cancelNotification for ${reminderId}: ${msg} (harmless)`,
      );
    }
  }

  /**
   * Process a notification job: look up reminder, find Telegram chatId, send message.
   */
  private async processNotification(
    job: Job<ReminderNotifyJobData>,
  ): Promise<void> {
    return withoutTenantScopingAsync(() => this.processNotificationInner(job));
  }

  private async processNotificationInner(
    job: Job<ReminderNotifyJobData>,
  ): Promise<void> {
    const { reminderId } = job.data;

    // Look up reminder — it may have been completed/deleted since scheduling
    const reminder = await this.prisma.reminder.findUnique({
      where: { id: reminderId },
    });

    if (!reminder) {
      this.logger.debug(
        `Reminder ${reminderId} no longer exists — skipping notification`,
      );
      return;
    }

    if (reminder.status !== ReminderStatus.attivo) {
      this.logger.debug(
        `Reminder ${reminderId} is ${reminder.status} — skipping notification`,
      );
      return;
    }

    if (reminder.telegramInviato) {
      this.logger.debug(
        `Reminder ${reminderId} already notified — skipping`,
      );
      return;
    }

    // Check if user has active Telegram
    const tgSettings = await this.prisma.telegramSettings.findUnique({
      where: { userId: reminder.userId },
      select: { telegramChatId: true, isActive: true },
    });

    if (!tgSettings?.isActive || !tgSettings.telegramChatId) {
      this.logger.debug(
        `User ${reminder.userId} has no active Telegram — skipping`,
      );
      return;
    }

    if (!this.telegramBot.isEnabled) {
      this.logger.warn('Telegram bot not configured — cannot send notification');
      return;
    }

    // Resolve user locale for localized messages
    const locale = await this.resolveUserLocale(reminder.userId);

    // Send single-reminder notification
    const sent = await this.telegramBot.sendReminderNotification(
      tgSettings.telegramChatId,
      {
        id: reminder.id,
        titolo: reminder.titolo,
        descrizione: reminder.descrizione,
        contatto: reminder.contatto,
        azione: reminder.azione,
        scadenzaDatetime: reminder.scadenzaDatetime,
        condizioneTipo: reminder.condizioneTipo,
        condizioneDettaglio: reminder.condizioneDettaglio,
        monitoraEmail: reminder.monitoraEmail,
        messaggioTelegram: reminder.messaggioTelegram,
      },
      locale,
    );

    if (sent) {
      await this.prisma.reminder.update({
        where: { id: reminderId },
        data: { telegramInviato: true, telegramInviatoAt: new Date() },
      });

      await this.prisma.telegramLog.create({
        data: {
          tenantId: reminder.tenantId,
          userId: reminder.userId,
          reminderIds: [reminderId],
          slot: 'exact',
          messaggioCompleto: `Notification: ${reminder.titolo}`,
          inviatoAt: new Date(),
        },
      });

      this.realtimeEvents.emitReminderTelegramSent(reminder.tenantId, {
        reminderId,
        titolo: reminder.titolo,
        contatto: reminder.contatto,
        scadenzaDatetime: reminder.scadenzaDatetime?.toISOString() ?? '',
        tenantId: reminder.tenantId,
        userId: reminder.userId,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`Sent notification for reminder ${reminderId}`);
    } else {
      await this.prisma.telegramLog.create({
        data: {
          tenantId: reminder.tenantId,
          userId: reminder.userId,
          reminderIds: [reminderId],
          slot: 'exact',
          messaggioCompleto: `Failed: ${reminder.titolo}`,
          isError: true,
          errorMessage: 'Telegram API send failed',
        },
      });

      this.realtimeEvents.emitReminderDeliveryFailed(reminder.tenantId, {
        reminderId,
        titolo: reminder.titolo,
        contatto: reminder.contatto,
        scadenzaDatetime: reminder.scadenzaDatetime?.toISOString() ?? '',
        tenantId: reminder.tenantId,
        userId: reminder.userId,
        timestamp: new Date().toISOString(),
      });

      this.logger.warn(`Delivery failed for reminder ${reminderId}`);
    }
  }

  private async resolveUserLocale(userId: string): Promise<TelegramLocale> {
    try {
      const prefs = await this.prisma.userPreferences.findUnique({
        where: { userId },
        select: { language: true },
      });
      return (prefs?.language === 'it' ? 'it' : 'en') as TelegramLocale;
    } catch {
      return 'it'; // Default to Italian for backward compatibility
    }
  }
}
