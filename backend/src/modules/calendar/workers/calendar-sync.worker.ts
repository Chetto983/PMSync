import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CalendarSyncJobData,
  CalendarSyncJobResult,
} from '../services/calendar-sync-queue.service';
import { GoogleCalendarSyncService } from '../services/google-calendar-sync.service';
import { MicrosoftCalendarSyncService } from '../services/microsoft-calendar-sync.service';
import {
  getRedisConnectionOptions,
  getWorkerOptions,
  QUEUE_NAMES,
} from '../../../common/config';

/**
 * CalendarSyncWorker
 *
 * Processes calendar sync jobs from the BullMQ queues.
 * Handles both Google and Microsoft calendar synchronization.
 *
 * Features:
 * - Priority-based processing (high, normal, low)
 * - Automatic retry with exponential backoff
 * - Provider-specific sync delegation
 * - Last synced timestamp tracking
 */
@Injectable()
export class CalendarSyncWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CalendarSyncWorker.name);
  private redisConnection: Redis;
  private workers: Worker[] = [];

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private readonly googleCalendarSync: GoogleCalendarSyncService,
    private readonly microsoftCalendarSync: MicrosoftCalendarSyncService,
  ) {}

  async onModuleInit() {
    const workersEnabled =
      (this.configService.get<string>('CALENDAR_SYNC_WORKERS_ENABLED') || 'true').toLowerCase() !==
      'false';
    if (!workersEnabled) {
      this.logger.warn('Calendar sync workers are disabled via CALENDAR_SYNC_WORKERS_ENABLED=false');
      return;
    }

    // Initialize Redis connection for workers using centralized config
    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    this.logger.log(
      `Connecting to Redis for calendar sync workers at ${redisOptions.host}:${redisOptions.port}`,
    );

    // Start workers for each priority queue using centralized worker options
    this.startWorker(QUEUE_NAMES.CALENDAR_SYNC_HIGH);
    this.startWorker(QUEUE_NAMES.CALENDAR_SYNC_NORMAL);
    this.startWorker(QUEUE_NAMES.CALENDAR_SYNC_LOW);

    this.logger.log('Calendar sync workers started successfully');
  }

  private startWorker(queueName: string) {
    // Get centralized worker options
    const workerOptions = getWorkerOptions('CALENDAR_SYNC');

    const worker = new Worker<CalendarSyncJobData, CalendarSyncJobResult>(
      queueName,
      async (job: Job<CalendarSyncJobData>) => {
        return await this.processJob(job);
      },
      {
        connection: this.redisConnection,
        ...workerOptions,
      },
    );

    worker.on('completed', (job, result) => {
      this.logger.log(
        `[${queueName}] Job ${job.id} completed: ${result.eventsProcessed} events processed, ${result.newEvents} new, ${result.updatedEvents} updated`,
      );
    });

    worker.on('failed', (job, error) => {
      this.logger.error(
        `[${queueName}] Job ${job?.id} failed for ${job?.data?.email}: ${error.message}`,
      );
    });

    worker.on('error', (error) => {
      this.logger.error(`[${queueName}] Worker error: ${error.message}`);
    });

    this.workers.push(worker);
    this.logger.log(`Started worker for queue ${queueName} with concurrency ${workerOptions.concurrency}`);
  }

  private async processJob(job: Job<CalendarSyncJobData>): Promise<CalendarSyncJobResult> {
    const { providerId, providerType, email } = job.data;

    this.logger.log(`Processing calendar sync for ${email} (${providerType})`);

    const startTime = Date.now();

    try {
      // Delegate to provider-specific sync services
      const result = await this.runProviderSync(job.data);

      // Update last synced timestamp in database
      await this.prisma.providerConfig.update({
        where: { id: providerId },
        data: {
          lastSyncedAt: new Date(),
        },
      });

      const syncDuration = Date.now() - startTime;

      return {
        success: true,
        providerId,
        eventsProcessed: result.eventsProcessed,
        newEvents: result.newEvents,
        updatedEvents: result.updatedEvents,
        deletedEvents: result.deletedEvents,
        syncDuration,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Calendar sync failed for ${email}: ${errorMessage}`);

      throw error; // Re-throw to let BullMQ handle retry logic
    }
  }

  /**
   * Run provider-specific sync
   */
  private async runProviderSync(
    jobData: CalendarSyncJobData,
  ): Promise<{ eventsProcessed: number; newEvents: number; updatedEvents: number; deletedEvents: number }> {
    const { providerId, providerType } = jobData;

    // Get provider from database
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    let eventsProcessed = 0;
    let newEvents = 0;
    let updatedEvents = 0;
    let deletedEvents = 0;

    // Get initial event count (for this specific provider)
    const eventsBefore = await this.prisma.calendarEvent.count({
      where: { providerId },
    });

    switch (providerType) {
      case 'google': {
        const result = await this.googleCalendarSync.syncCalendar(providerId);
        eventsProcessed = result.eventsProcessed;
        newEvents = result.newEvents;
        updatedEvents = result.updatedEvents;
        deletedEvents = result.deletedEvents;
        break;
      }

      case 'microsoft': {
        const result = await this.microsoftCalendarSync.syncCalendar(providerId);
        eventsProcessed = result.eventsProcessed;
        newEvents = result.newEvents;
        updatedEvents = result.updatedEvents;
        deletedEvents = result.deletedEvents;
        break;
      }

      default:
        throw new Error(`Unsupported provider type for calendar: ${providerType}`);
    }

    // Get final event count (for this specific provider)
    const eventsAfter = await this.prisma.calendarEvent.count({
      where: { providerId },
    });

    // Calculate new vs updated (rough estimate if not provided)
    if (newEvents === 0 && updatedEvents === 0) {
      const totalChange = eventsAfter - eventsBefore;
      newEvents = totalChange > 0 ? totalChange : 0;
      updatedEvents = eventsProcessed - newEvents - deletedEvents;
    }

    return {
      eventsProcessed,
      newEvents,
      updatedEvents,
      deletedEvents,
    };
  }

  async onModuleDestroy() {
    this.logger.log('Stopping calendar sync workers...');
    try {
      // Close all workers safely
      await Promise.all(
        this.workers.map(async (worker) => {
          try {
            await worker.close();
          } catch (error) {
            this.logger.debug(
              `Worker close skipped: ${error instanceof Error ? error.message : error}`,
            );
          }
        }),
      );

      // Close Redis connection safely
      if (
        this.redisConnection &&
        this.redisConnection.status !== 'end' &&
        this.redisConnection.status !== 'close'
      ) {
        try {
          await this.redisConnection.quit();
        } catch (error) {
          this.logger.debug(
            `Redis quit skipped: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    } catch (outerError) {
      this.logger.warn(
        `CalendarSyncWorker shutdown encountered an error (swallowed): ${
          outerError instanceof Error ? outerError.message : outerError
        }`,
      );
    } finally {
      this.logger.log('Calendar sync workers stopped');
    }
  }
}
