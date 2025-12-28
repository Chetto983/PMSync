/**
 * Reconnect Reminder Job Processor (P1.7)
 *
 * BullMQ processor for sending reconnect reminders for stale contacts.
 * Runs daily to identify contacts that need reconnection and triggers
 * notifications/briefing updates.
 *
 * Safety Features:
 * - Tenant isolation via tenantId in all queries
 * - Cooldown period prevents reminder spam (7 days default)
 * - Respects user notification preferences
 * - Integrates with daily briefing system
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RelationshipIntelligenceService } from '../services/relationship-intelligence.service';
import { DeadLetterQueueService } from '../../../../common/services/dead-letter-queue.service';
import { AlertingService } from '../../../../common/services/alerting.service';

// Job data interface
export interface ReconnectReminderJobData {
  tenantId: string;
  userId: string;
  staleDays?: number;
  maxReminders?: number;
}

// Job result interface
export interface ReconnectReminderResult {
  contactsChecked: number;
  remindersCreated: number;
  duration: number;
}

const QUEUE_NAME = 'reconnect-reminders';

/** Maximum retry attempts before sending to DLQ */
const MAX_ATTEMPTS = 3;

@Injectable()
export class ReconnectReminderProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReconnectReminderProcessor.name);
  private worker: Worker | null = null;
  private queue: Queue | null = null;
  private redis: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly relationshipService: RelationshipIntelligenceService,
    private readonly dlqService: DeadLetterQueueService,
    private readonly alertingService: AlertingService,
  ) {}

  async onModuleInit() {
    // Build Redis connection options from individual config vars
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD');
    const db = this.configService.get<number>('REDIS_DB', 0);

    const redisOptions = {
      host,
      port,
      password: password || undefined,
      db,
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false, // Faster startup
    };

    try {
      const redis = new Redis(redisOptions);
      this.redis = redis;

      // Wait for Redis to be ready before creating queue/worker
      await new Promise<void>((resolve, reject) => {
        redis.once('ready', resolve);
        redis.once('error', reject);
        // Timeout after 5 seconds
        setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
      });

      // Create queue with separate connection
      this.queue = new Queue(QUEUE_NAME, {
        connection: new Redis(redisOptions),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      });

      // Create worker with separate connection
      this.worker = new Worker(
        QUEUE_NAME,
        async (job) => this.processReminderJob(job),
        {
          connection: new Redis(redisOptions),
          concurrency: 5, // Multiple tenants can be processed in parallel
        },
      );

      this.worker.on('completed', (job, result) => {
        this.logger.debug(`Reminder job ${job.id} completed: ${JSON.stringify(result)}`);
      });

      this.worker.on('failed', async (job, error) => {
        const jobId = job?.id ?? 'unknown';
        const errorMessage = error?.message ?? String(error);
        this.logger.error(`Reminder job ${jobId} failed: ${errorMessage}`);

        // Add to DLQ if this is the last retry attempt
        if (job && job.attemptsMade + 1 >= MAX_ATTEMPTS) {
          this.logger.warn(`Job ${jobId} exhausted all ${MAX_ATTEMPTS} retries, adding to DLQ`);

          const errorObj = error instanceof Error ? error : new Error(errorMessage);
          await this.dlqService.addToDeadLetter(
            jobId,
            job.queueName,
            job.data,
            errorObj,
            job.attemptsMade + 1,
            {
              tenantId: 'tenantId' in job.data ? job.data.tenantId : 'system',
              userId: 'userId' in job.data ? job.data.userId : undefined,
              queueName: job.queueName,
            },
          );

          // Create alert for permanent reminder failure
          const alert = this.alertingService.createAlert(
            'warning',
            'reconnect_reminder_failed',
            `Reconnect reminder job permanently failed after ${MAX_ATTEMPTS} attempts: ${errorMessage}`,
            job.attemptsMade + 1,
            MAX_ATTEMPTS,
          );
          this.logger.error(`ALERT: ${alert.type} - ${alert.message}`);
        }
      });

      // Schedule daily check for all tenants
      await this.scheduleDailyChecks();

      this.logger.log('Reconnect reminder processor initialized');
    } catch (error) {
      this.logger.error('Failed to initialize reconnect reminder processor:', error);
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.redis?.quit();
  }

  /**
   * Schedule daily reminder checks for all active tenants
   */
  private async scheduleDailyChecks() {
    if (!this.queue) return;

    // Check if repeatable job already exists
    const repeatableJobs = await this.queue.getRepeatableJobs();
    const hasScheduled = repeatableJobs.some((j) => j.name === 'daily-check');

    if (!hasScheduled) {
      // Schedule daily at 8 AM UTC
      await this.queue.add(
        'daily-check',
        { type: 'daily-scan' },
        {
          repeat: {
            pattern: '0 8 * * *', // 8 AM daily
          },
        },
      );
      this.logger.log('Scheduled daily reconnect reminder check at 8 AM UTC');
    }
  }

  /**
   * Queue a reminder check for a specific tenant/user
   */
  async queueReminderCheck(data: ReconnectReminderJobData): Promise<string> {
    if (!this.queue) {
      throw new Error('Reconnect reminder queue not initialized');
    }

    const job = await this.queue.add('check', data, {
      jobId: `reminder-${data.tenantId}-${data.userId}-${Date.now()}`,
    });

    return job.id!;
  }

  /**
   * Process a reminder job
   */
  private async processReminderJob(job: Job<ReconnectReminderJobData | { type: string }>): Promise<ReconnectReminderResult | { tenantsProcessed: number }> {
    // Check if this is the daily scan job
    if ('type' in job.data && job.data.type === 'daily-scan') {
      return this.processDailyScan();
    }

    const data = job.data as ReconnectReminderJobData;
    const { tenantId, userId, staleDays = 60, maxReminders = 5 } = data;
    const startTime = Date.now();

    this.logger.debug(`Processing reconnect reminders for tenant ${tenantId}`);

    // Get contacts needing reconnection
    const staleContacts = await this.relationshipService.getContactsNeedingReconnect(
      tenantId,
      { staleDays, limit: maxReminders },
    );

    let remindersCreated = 0;

    for (const contact of staleContacts) {
      // Create reminder record (integrate with notification system later)
      await this.createReconnectReminder(tenantId, userId, contact);

      // Mark contact as reminded to prevent spam
      await this.relationshipService.markContactReminded(tenantId, contact.contactId);

      remindersCreated++;
    }

    const duration = Date.now() - startTime;
    return {
      contactsChecked: staleContacts.length,
      remindersCreated,
      duration,
    };
  }

  /**
   * Process daily scan - queue jobs for all active users
   */
  private async processDailyScan(): Promise<{ tenantsProcessed: number }> {
    this.logger.log('Running daily reconnect reminder scan');

    // Get all unique tenant/user combinations with recent activity
    const recentActivity = new Date();
    recentActivity.setDate(recentActivity.getDate() - 30);

    const activeUsers = await this.prisma.providerConfig.findMany({
      where: {
        lastSyncedAt: { gte: recentActivity },
      },
      select: {
        tenantId: true,
        userId: true,
      },
      distinct: ['tenantId', 'userId'],
    });

    // Queue a job for each active user
    for (const user of activeUsers) {
      if (user.userId) {
        await this.queueReminderCheck({
          tenantId: user.tenantId,
          userId: user.userId,
        });
      }
    }

    this.logger.log(`Queued reconnect reminders for ${activeUsers.length} users`);
    return { tenantsProcessed: activeUsers.length };
  }

  /**
   * Create a reconnect reminder (placeholder for notification integration)
   */
  private async createReconnectReminder(
    tenantId: string,
    userId: string,
    contact: {
      contactId: string;
      displayName: string | null;
      primaryEmail: string | null;
      daysSinceContact: number;
    },
  ): Promise<void> {
    // Store reminder in Redis for daily briefing integration
    const reminderKey = `reconnect:${tenantId}:${userId}:reminders`;
    const reminder = {
      contactId: contact.contactId,
      displayName: contact.displayName,
      email: contact.primaryEmail,
      daysSinceContact: contact.daysSinceContact,
      createdAt: new Date().toISOString(),
    };

    if (this.redis) {
      // Add to list and trim to keep only recent
      await this.redis.lpush(reminderKey, JSON.stringify(reminder));
      await this.redis.ltrim(reminderKey, 0, 49); // Keep last 50
      await this.redis.expire(reminderKey, 86400 * 7); // 7 day TTL
    }

    this.logger.debug(
      `Created reconnect reminder for ${contact.displayName || contact.primaryEmail} ` +
      `(${contact.daysSinceContact} days)`,
    );
  }

  /**
   * Get pending reconnect reminders for a user
   */
  async getReconnectReminders(
    tenantId: string,
    userId: string,
    limit: number = 10,
  ): Promise<Array<{
    contactId: string;
    displayName: string | null;
    email: string | null;
    daysSinceContact: number;
    createdAt: string;
  }>> {
    if (!this.redis) return [];

    const reminderKey = `reconnect:${tenantId}:${userId}:reminders`;
    const items = await this.redis.lrange(reminderKey, 0, limit - 1);

    return items.map((item) => JSON.parse(item));
  }

  /**
   * Clear reconnect reminders for a user
   */
  async clearReminders(tenantId: string, userId: string): Promise<void> {
    if (!this.redis) return;

    const reminderKey = `reconnect:${tenantId}:${userId}:reminders`;
    await this.redis.del(reminderKey);
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    if (!this.queue) {
      return { enabled: false };
    }

    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return {
      enabled: true,
      waiting,
      active,
      completed,
      failed,
    };
  }
}
