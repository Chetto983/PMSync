/**
 * ReminderSchedulerService -- BullMQ-based scheduler for follow-up reminders.
 *
 * Runs every 15 minutes and checks for upcoming/overdue follow-ups.
 * Emits Socket.IO events at key thresholds:
 * - 24h before: "reminder:upcoming"
 * - 1h before: "reminder:imminent"
 * - Overdue: "reminder:overdue"
 * - >48h overdue: marks EXPIRED
 *
 * Zero LLM calls. Pure scheduling + notification.
 *
 * Phase CONSOLIDATION: Triage + Follow-Up + Reminder unification.
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { FollowUpStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { getRedisConnectionOptions, QUEUE_NAMES } from '../../../common/config';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';

interface ReminderJobData {
  type: 'scheduled' | 'manual';
}

interface ReminderJobResult {
  upcoming: number;
  imminent: number;
  overdue: number;
  expired: number;
}

const MS_1H = 60 * 60 * 1000;
const MS_24H = 24 * MS_1H;
const MS_48H = 48 * MS_1H;
const MAX_REMIND_COUNT = 3;

@Injectable()
export class ReminderSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderSchedulerService.name);
  private queue!: Queue<ReminderJobData>;
  private worker!: Worker<ReminderJobData, ReminderJobResult>;
  private readonly ENABLED: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() private readonly realtimeEvents?: RealtimeEventsService,
  ) {
    this.ENABLED =
      (this.configService.get<string>('REMINDER_SCHEDULER_ENABLED') || 'true').toLowerCase() !== 'false';
  }

  async onModuleInit() {
    if (!this.ENABLED) {
      this.logger.warn('ReminderScheduler disabled via REMINDER_SCHEDULER_ENABLED=false');
      return;
    }

    const connection = getRedisConnectionOptions();

    this.queue = new Queue<ReminderJobData>(QUEUE_NAMES.REMINDER_CHECK, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: 50,
        removeOnFail: 20,
      },
    });

    this.worker = new Worker<ReminderJobData, ReminderJobResult>(
      QUEUE_NAMES.REMINDER_CHECK,
      async (job: Job<ReminderJobData>) => this.processReminderCheck(job),
      {
        connection,
        concurrency: 1,
        lockDuration: 120000, // 2 min lock
      },
    );

    this.worker.on('completed', (_job, result) => {
      if (result.upcoming + result.imminent + result.overdue + result.expired > 0) {
        this.logger.log(
          `Reminder check: ${result.upcoming} upcoming, ${result.imminent} imminent, ${result.overdue} overdue, ${result.expired} expired`,
        );
      }
    });

    this.worker.on('failed', (_job, error) => {
      this.logger.error(`Reminder check failed: ${error?.message ?? error}`);
    });

    // Setup repeatable job (every 15 minutes)
    const repeatableJobs = await this.queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.name === 'reminder-check') {
        await this.queue.removeRepeatableByKey(job.key);
      }
    }

    await this.queue.add(
      'reminder-check',
      { type: 'scheduled' },
      {
        repeat: { every: 15 * 60 * 1000 }, // 15 minutes
        jobId: 'reminder-check-scheduled',
      },
    );

    this.logger.log('ReminderScheduler enabled: check every 15 minutes');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  private async processReminderCheck(_job: Job<ReminderJobData>): Promise<ReminderJobResult> {
    const now = Date.now();
    const result: ReminderJobResult = { upcoming: 0, imminent: 0, overdue: 0, expired: 0 };

    // 1. Find follow-ups due within 25 hours (covers 24h + 1h thresholds)
    const upcoming = await this.prisma.emailFollowUp.findMany({
      where: {
        status: { in: [FollowUpStatus.PENDING, FollowUpStatus.REMINDED] },
        dueDate: {
          gte: new Date(now),
          lte: new Date(now + MS_24H + MS_1H),
        },
      },
      include: {
        email: { select: { subject: true, from: true } },
      },
      take: 100,
    });

    for (const followUp of upcoming) {
      const timeUntilDue = followUp.dueDate.getTime() - now;

      if (timeUntilDue <= MS_1H && followUp.remindCount < MAX_REMIND_COUNT) {
        // Imminent: due within 1 hour
        await this.prisma.emailFollowUp.update({
          where: { id: followUp.id },
          data: {
            remindCount: followUp.remindCount + 1,
            lastRemindedAt: new Date(),
            status: FollowUpStatus.REMINDED,
          },
        });
        result.imminent++;
        this.realtimeEvents?.emitFollowUpReminderImminent(followUp.tenantId, {
          followUpId: followUp.id,
          emailId: followUp.emailId,
          subject: followUp.email?.subject ?? null,
          dueDate: followUp.dueDate.toISOString(),
          reason: followUp.reason ?? null,
          tenantId: followUp.tenantId,
          userId: followUp.userId,
          timestamp: new Date().toISOString(),
        });
        this.logger.debug(
          `Imminent reminder: ${followUp.emailId} (${followUp.email?.subject}), due in ${Math.round(timeUntilDue / 60000)}min`,
        );
      } else if (timeUntilDue <= MS_24H && followUp.remindCount === 0) {
        // Upcoming: due within 24 hours, first reminder
        await this.prisma.emailFollowUp.update({
          where: { id: followUp.id },
          data: {
            remindCount: 1,
            lastRemindedAt: new Date(),
          },
        });
        result.upcoming++;
        this.realtimeEvents?.emitFollowUpReminderUpcoming(followUp.tenantId, {
          followUpId: followUp.id,
          emailId: followUp.emailId,
          subject: followUp.email?.subject ?? null,
          dueDate: followUp.dueDate.toISOString(),
          reason: followUp.reason ?? null,
          tenantId: followUp.tenantId,
          userId: followUp.userId,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 2. Find overdue follow-ups
    const overdue = await this.prisma.emailFollowUp.findMany({
      where: {
        status: { in: [FollowUpStatus.PENDING, FollowUpStatus.REMINDED] },
        dueDate: { lt: new Date(now) },
      },
      include: {
        email: { select: { subject: true } },
      },
      take: 100,
    });

    for (const followUp of overdue) {
      const overdueMs = now - followUp.dueDate.getTime();

      if (overdueMs > MS_48H) {
        // Expired: overdue by more than 48 hours
        await this.prisma.emailFollowUp.update({
          where: { id: followUp.id },
          data: { status: FollowUpStatus.EXPIRED },
        });
        result.expired++;
      } else {
        result.overdue++;
        this.realtimeEvents?.emitFollowUpReminderOverdue(followUp.tenantId, {
          followUpId: followUp.id,
          emailId: followUp.emailId,
          subject: followUp.email?.subject ?? null,
          dueDate: followUp.dueDate.toISOString(),
          reason: followUp.reason ?? null,
          tenantId: followUp.tenantId,
          userId: followUp.userId,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return result;
  }
}
