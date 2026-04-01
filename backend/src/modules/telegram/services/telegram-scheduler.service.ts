/**
 * TelegramSchedulerService — Bootstraps pending reminder notifications on startup.
 *
 * Individual reminder notifications are now handled by ReminderNotifyQueueService
 * (delayed BullMQ jobs at exact scadenzaDatetime). This service only runs on startup
 * to re-enqueue any reminders that were created but not yet scheduled (e.g., after
 * a deploy/restart where the Redis queue was flushed).
 */
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ReminderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';
import { ReminderNotifyQueueService } from './reminder-notify.queue';

@Injectable()
export class TelegramSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reminderNotifyQueue: ReminderNotifyQueueService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.rehydratePendingNotifications();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to rehydrate pending notifications: ${msg}`);
    }
  }

  /**
   * On startup, find all active reminders with a future scadenzaDatetime
   * that haven't been sent yet, and ensure they have delayed jobs queued.
   */
  private async rehydratePendingNotifications(): Promise<void> {
    return withoutTenantScopingAsync(async () => {
      const now = new Date();
      const reminders = await this.prisma.reminder.findMany({
        where: {
          status: ReminderStatus.attivo,
          telegramInviato: false,
          scadenzaDatetime: { not: null },
        },
        select: { id: true, scadenzaDatetime: true },
        take: 5000, // Safety cap
      });

      if (!reminders.length) {
        this.logger.log('No pending reminders to rehydrate');
        return;
      }

      let scheduled = 0;
      let pastDue = 0;

      for (const r of reminders) {
        if (!r.scadenzaDatetime) continue;

        await this.reminderNotifyQueue.scheduleNotification(
          r.id,
          r.scadenzaDatetime,
        );

        if (r.scadenzaDatetime <= now) {
          pastDue++;
        } else {
          scheduled++;
        }
      }

      this.logger.log(
        `Rehydrated ${scheduled} future + ${pastDue} past-due reminder notifications`,
      );
    });
  }
}
