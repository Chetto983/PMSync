/**
 * ReminderAlertSchedulerService — Periodic check for Reminder table alerts.
 *
 * Runs every 5 minutes via ScheduledJobsQueueService and checks for:
 * - upcoming (24h before scadenzaDatetime) — remindCount: 0 → 1
 * - imminent (1h before) — remindCount: < MAX_REMIND_COUNT
 * - overdue (past scadenzaDatetime) — emits overdue event
 * - expired (>48h overdue) — auto-sets status to 'annullato'
 *
 * Uses lastRemindedAt + remindCount to prevent duplicate notifications.
 * Emits Socket.IO events + persists InAppNotification for offline users.
 *
 * Separate from ReminderSchedulerService which handles EmailFollowUp only.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { ReminderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
  ScheduledJobData,
} from '../../../common/services/scheduled-jobs.queue';

const MS_1H = 60 * 60 * 1000;
const MS_24H = 24 * MS_1H;
const MS_48H = 48 * MS_1H;
const MAX_REMIND_COUNT = 3;

interface AlertCheckResult {
  upcoming: number;
  imminent: number;
  overdue: number;
  expired: number;
}

@Injectable()
export class ReminderAlertSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ReminderAlertSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly scheduledJobs: ScheduledJobsQueueService,
  ) {}

  onModuleInit() {
    this.scheduledJobs.registerHandler(
      ScheduledJobType.REMINDER_ALERT_CHECK,
      (job) => this.handleJob(job),
    );
    this.logger.log('Registered REMINDER_ALERT_CHECK handler');
  }

  private async handleJob(_job: Job<ScheduledJobData>): Promise<void> {
    const result = await withoutTenantScopingAsync(() => this.checkAlerts());
    const total = result.upcoming + result.imminent + result.overdue + result.expired;
    if (total > 0) {
      this.logger.log(
        `Alert check: ${result.upcoming} upcoming, ${result.imminent} imminent, ` +
        `${result.overdue} overdue, ${result.expired} expired`,
      );
    }
  }

  private async checkAlerts(): Promise<AlertCheckResult> {
    const now = Date.now();
    const result: AlertCheckResult = { upcoming: 0, imminent: 0, overdue: 0, expired: 0 };

    // 1. Upcoming + imminent: reminders with scadenzaDatetime within next 25h
    const upcomingReminders = await this.prisma.reminder.findMany({
      where: {
        status: ReminderStatus.attivo,
        scadenzaDatetime: {
          gte: new Date(now),
          lte: new Date(now + MS_24H + MS_1H),
        },
      },
      take: 200,
    });

    for (const reminder of upcomingReminders) {
      if (!reminder.scadenzaDatetime) continue;
      const timeUntilDue = reminder.scadenzaDatetime.getTime() - now;

      if (timeUntilDue <= MS_1H && reminder.remindCount < MAX_REMIND_COUNT) {
        // Imminent: due within 1 hour
        await this.prisma.reminder.update({
          where: { id: reminder.id },
          data: {
            remindCount: reminder.remindCount + 1,
            lastRemindedAt: new Date(),
          },
        });
        result.imminent++;

        const payload = this.buildPayload(reminder);
        this.realtimeEvents.emitReminderImminent(reminder.tenantId, payload);
        this.persistNotification(
          reminder.tenantId,
          reminder.userId,
          'reminder:imminent',
          `Due in ${Math.round(timeUntilDue / 60000)}min: ${reminder.titolo}`,
          payload,
        );
      } else if (timeUntilDue <= MS_24H && reminder.remindCount === 0) {
        // Upcoming: due within 24 hours, first reminder
        await this.prisma.reminder.update({
          where: { id: reminder.id },
          data: {
            remindCount: 1,
            lastRemindedAt: new Date(),
          },
        });
        result.upcoming++;

        const payload = this.buildPayload(reminder);
        this.realtimeEvents.emitReminderUpcoming(reminder.tenantId, payload);
        this.persistNotification(
          reminder.tenantId,
          reminder.userId,
          'reminder:upcoming',
          `Due in ${Math.round(timeUntilDue / MS_1H)}h: ${reminder.titolo}`,
          payload,
        );
      }
    }

    // 2. Overdue + expired: reminders past scadenzaDatetime
    const overdueReminders = await this.prisma.reminder.findMany({
      where: {
        status: ReminderStatus.attivo,
        scadenzaDatetime: { lt: new Date(now) },
      },
      take: 200,
    });

    for (const reminder of overdueReminders) {
      if (!reminder.scadenzaDatetime) continue;
      const overdueMs = now - reminder.scadenzaDatetime.getTime();

      if (overdueMs > MS_48H) {
        // Expired: overdue by more than 48 hours — auto-cancel
        await this.prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: ReminderStatus.annullato },
        });
        result.expired++;
      } else {
        result.overdue++;
        const payload = this.buildPayload(reminder);
        this.realtimeEvents.emitReminderOverdue(reminder.tenantId, payload);
        this.persistNotification(
          reminder.tenantId,
          reminder.userId,
          'reminder:overdue',
          `Overdue: ${reminder.titolo}`,
          payload,
        );
      }
    }

    return result;
  }

  private buildPayload(reminder: {
    id: string;
    titolo: string;
    contatto: string | null;
    scadenzaDatetime: Date | null;
    tenantId: string;
    userId: string;
  }) {
    return {
      reminderId: reminder.id,
      titolo: reminder.titolo,
      contatto: reminder.contatto,
      scadenzaDatetime: reminder.scadenzaDatetime?.toISOString() ?? '',
      tenantId: reminder.tenantId,
      userId: reminder.userId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Persist notification to DB so offline users receive it on reconnect.
   */
  private persistNotification(
    tenantId: string,
    userId: string,
    type: string,
    title: string,
    data: Record<string, unknown>,
  ): void {
    this.prisma.inAppNotification
      .create({ data: { tenantId, userId, type, title, data: data as any } })
      .catch((err) => {
        this.logger.warn(
          `Failed to persist notification: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }
}
