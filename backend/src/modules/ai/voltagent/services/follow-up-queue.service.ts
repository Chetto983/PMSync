/**
 * Follow-up Queue Service
 *
 * BullMQ-based scheduler for follow-up reminders.
 * Extracted from follow-up.service.ts for SRP compliance.
 *
 * Uses shared Redis connection and queue presets from common/config/queue.config.ts
 *
 * Responsibilities:
 * - BullMQ queue initialization
 * - Reminder job scheduling
 * - Reminder job processing
 * - Periodic due follow-up checks
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Queue, Worker, Job } from 'bullmq';
import {
  getSharedRedisConnection,
  releaseSharedRedisConnection,
  getDefaultJobOptions,
  getWorkerOptions,
} from '../../../../common/config/queue.config';

/**
 * Queue name for follow-up reminders
 */
const FOLLOW_UP_QUEUE_NAME = 'ai-follow-up-reminders';

/**
 * BullMQ job data for follow-up reminders
 */
export interface FollowUpReminderJobData {
  followUpId: string;
  tenantId: string;
  userId: string;
}

/**
 * Callback for processing reminders (injected from FollowUpService)
 */
export type ReminderProcessorCallback = (
  followUpId: string,
  tenantId: string,
  userId: string,
) => Promise<void>;

@Injectable()
export class FollowUpQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FollowUpQueueService.name);
  private readonly enabled: boolean;
  private queue: Queue<FollowUpReminderJobData> | null = null;
  private worker: Worker<FollowUpReminderJobData> | null = null;
  private reminderProcessor: ReminderProcessorCallback | null = null;

  // Configuration
  private readonly maxReminders: number;
  private readonly reminderIntervalDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.enabled = this.configService.get<string>('AI_FOLLOW_UP_ENABLED', 'true') === 'true';
    this.maxReminders = this.configService.get<number>('AI_FOLLOW_UP_MAX_REMINDERS', 3);
    this.reminderIntervalDays = this.configService.get<number>('AI_FOLLOW_UP_REMINDER_INTERVAL', 2);
  }

  /**
   * Set the callback for processing reminders
   * Called by FollowUpService during initialization
   */
  setReminderProcessor(processor: ReminderProcessorCallback): void {
    this.reminderProcessor = processor;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('Follow-up queue disabled by configuration');
      return;
    }

    try {
      // Use shared Redis connection from queue.config.ts
      const connection = getSharedRedisConnection();

      // Initialize BullMQ queue with SCHEDULED preset (for reminder jobs)
      this.queue = new Queue<FollowUpReminderJobData>(FOLLOW_UP_QUEUE_NAME, {
        connection,
        defaultJobOptions: {
          ...getDefaultJobOptions('SCHEDULED'),
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 500 },
        },
      });

      // Initialize worker with DEFAULT preset
      const workerOptions = getWorkerOptions('DEFAULT');
      this.worker = new Worker<FollowUpReminderJobData>(
        FOLLOW_UP_QUEUE_NAME,
        async (job: Job<FollowUpReminderJobData>) => this.processReminderJob(job),
        { connection, ...workerOptions },
      );

      this.worker.on('completed', (job) => {
        this.logger.debug(`Follow-up reminder job ${job.id} completed`);
      });

      this.worker.on('failed', (job, err) => {
        this.logger.error(`Follow-up reminder job ${job?.id} failed: ${err.message}`);
      });

      // Schedule recurring check for due follow-ups (every 6 hours)
      await this.queue.upsertJobScheduler(
        'check-due-follow-ups',
        { pattern: '0 */6 * * *' }, // Every 6 hours
        {
          name: 'check-due-follow-ups',
          data: { followUpId: '', tenantId: '', userId: '' }, // Placeholder
        },
      );

      this.logger.log('Follow-up queue service initialized');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize follow-up queue: ${msg}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    // Release shared Redis connection reference
    releaseSharedRedisConnection();
  }

  /**
   * Schedule a reminder job for a follow-up
   */
  async scheduleReminder(
    followUpId: string,
    dueDate: Date,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    if (!this.queue) {
      this.logger.warn('Queue not initialized, skipping reminder scheduling');
      return;
    }

    try {
      // Calculate delay (due date - 1 day as first reminder)
      const reminderDate = new Date(dueDate);
      reminderDate.setDate(reminderDate.getDate() - 1);

      const delay = Math.max(0, reminderDate.getTime() - Date.now());

      await this.queue.add(
        `reminder-${followUpId}`,
        { followUpId, tenantId, userId },
        {
          delay,
          jobId: `follow-up-reminder-${followUpId}`,
        },
      );

      this.logger.debug(`Scheduled reminder for follow-up ${followUpId} at ${reminderDate.toISOString()}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to schedule reminder for ${followUpId}: ${msg}`);
    }
  }

  /**
   * Cancel a scheduled reminder
   */
  async cancelReminder(followUpId: string): Promise<void> {
    if (!this.queue) return;

    try {
      const job = await this.queue.getJob(`follow-up-reminder-${followUpId}`);
      if (job) {
        await job.remove();
        this.logger.debug(`Cancelled reminder for follow-up ${followUpId}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to cancel reminder for ${followUpId}: ${msg}`);
    }
  }

  /**
   * Process a reminder job
   */
  private async processReminderJob(job: Job<FollowUpReminderJobData>): Promise<void> {
    // Check if it's the scheduled check job
    if (job.name === 'check-due-follow-ups') {
      await this.checkDueFollowUps();
      return;
    }

    const { followUpId, tenantId, userId } = job.data;

    // Use injected processor if available
    if (this.reminderProcessor) {
      await this.reminderProcessor(followUpId, tenantId, userId);
      return;
    }

    // Fallback: direct DB update
    const followUp = await this.prisma.emailFollowUp.findFirst({
      where: { id: followUpId, tenantId, userId, status: 'PENDING' },
    });

    if (!followUp) {
      this.logger.debug(`Follow-up ${followUpId} not found or already resolved`);
      return;
    }

    // Update to REMINDED status and increment count
    await this.prisma.emailFollowUp.update({
      where: { id: followUpId },
      data: {
        status: 'REMINDED',
        remindCount: { increment: 1 },
        lastRemindedAt: new Date(),
      },
    });

    // Schedule next reminder if under max
    if ((followUp.remindCount ?? 0) + 1 < this.maxReminders) {
      const nextReminder = new Date();
      nextReminder.setDate(nextReminder.getDate() + this.reminderIntervalDays);
      await this.scheduleReminder(followUpId, nextReminder, tenantId, userId);
    } else {
      // Max reminders reached, mark as expired
      await this.prisma.emailFollowUp.update({
        where: { id: followUpId },
        data: { status: 'EXPIRED' },
      });
      this.logger.debug(`Follow-up ${followUpId} expired after max reminders`);
    }
  }

  /**
   * Check all due follow-ups (called by scheduled job)
   */
  private async checkDueFollowUps(): Promise<void> {
    this.logger.debug('Checking due follow-ups...');

    const now = new Date();

    // Find all pending follow-ups that are due
    const dueFollowUps = await this.prisma.emailFollowUp.findMany({
      where: {
        status: 'PENDING',
        dueDate: { lte: now },
      },
      select: {
        id: true,
        tenantId: true,
        userId: true,
      },
      take: 100, // Process in batches
    });

    this.logger.debug(`Found ${dueFollowUps.length} due follow-ups`);

    for (const followUp of dueFollowUps) {
      try {
        await this.processReminderJob({
          data: {
            followUpId: followUp.id,
            tenantId: followUp.tenantId,
            userId: followUp.userId,
          },
        } as Job<FollowUpReminderJobData>);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to process follow-up ${followUp.id}: ${msg}`);
      }
    }
  }

  /**
   * Check if queue is enabled and ready
   */
  isReady(): boolean {
    return this.enabled && this.queue !== null;
  }
}
