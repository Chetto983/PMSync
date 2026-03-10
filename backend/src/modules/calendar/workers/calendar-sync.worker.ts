import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CalendarSyncJobData,
  CalendarSyncJobResult,
} from '../services/calendar-sync-queue.service';
import { GoogleCalendarSyncService } from '../services/google-calendar-sync.service';
import { MicrosoftCalendarSyncService } from '../services/microsoft-calendar-sync.service';
import { BaseWorker, BaseWorkerConfig } from '../../../common/workers/base.worker';
import { QUEUE_NAMES, WORKER_PRESETS, QUEUE_PRESETS } from '../../../common/config';
import { getErrorMessage } from '../../../common/utils';
import { DeadLetterQueueService } from '../../../common/services/dead-letter-queue.service';
import { AlertingService } from '../../../common/services/alerting.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';

/** Maximum retry attempts before sending to DLQ (matches QUEUE_PRESETS.CALENDAR_SYNC.attempts) */
const MAX_ATTEMPTS = QUEUE_PRESETS.CALENDAR_SYNC.attempts;

/**
 * CalendarSyncWorker
 *
 * Processes calendar sync jobs from the BullMQ queues.
 * Extends BaseWorker for standardized worker lifecycle management.
 *
 * Features:
 * - Priority-based processing (high, normal, low)
 * - Automatic retry with exponential backoff
 * - Provider-specific sync delegation
 * - Last synced timestamp tracking
 * - Graceful shutdown with job draining (via BaseWorker)
 * - Stalled job detection (via BaseWorker)
 *
 * Phase 3 Refactor: Migrated from custom implementation to BaseWorker
 * Reduces ~60% boilerplate code for Redis/worker lifecycle management
 */
@Injectable()
export class CalendarSyncWorker extends BaseWorker<CalendarSyncJobData, CalendarSyncJobResult> {
  protected readonly logger = new Logger(CalendarSyncWorker.name);
  protected readonly workerName = 'calendar-sync';
  protected readonly envToggle = 'CALENDAR_SYNC_WORKERS_ENABLED';

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly googleCalendarSync: GoogleCalendarSyncService,
    private readonly microsoftCalendarSync: MicrosoftCalendarSyncService,
    private readonly dlqService: DeadLetterQueueService,
    private readonly alertingService: AlertingService,
  ) {
    super(configService);
  }

  /**
   * Get worker configuration for all 3 priority queues
   * Uses CALENDAR_SYNC preset from centralized config
   */
  protected getWorkerConfig(): BaseWorkerConfig[] {
    const preset = WORKER_PRESETS.CALENDAR_SYNC;

    return [
      {
        queueName: QUEUE_NAMES.CALENDAR_SYNC_HIGH,
        concurrency: preset.concurrency,
        lockDuration: preset.lockDuration,
        stalledInterval: preset.stalledInterval,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
      {
        queueName: QUEUE_NAMES.CALENDAR_SYNC_NORMAL,
        concurrency: preset.concurrency,
        lockDuration: preset.lockDuration,
        stalledInterval: preset.stalledInterval,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
      {
        queueName: QUEUE_NAMES.CALENDAR_SYNC_LOW,
        concurrency: Math.max(1, preset.concurrency - 1), // Lower concurrency for low priority
        lockDuration: preset.lockDuration,
        stalledInterval: preset.stalledInterval,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    ];
  }

  /**
   * Process a single calendar sync job
   */
  protected async processJob(job: Job<CalendarSyncJobData>): Promise<CalendarSyncJobResult> {
    return withoutTenantScopingAsync(() => this.executeCalendarSync(job));
  }

  private async executeCalendarSync(job: Job<CalendarSyncJobData>): Promise<CalendarSyncJobResult> {
    const { providerId, email } = job.data;

    this.logger.log(`Processing calendar sync for ${email} (attempt ${job.attemptsMade + 1}/${MAX_ATTEMPTS})`);

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
      const errorMessage = getErrorMessage(error);
      const errorObj = error instanceof Error ? error : new Error(errorMessage);
      this.logger.error(`Calendar sync failed for ${email}: ${errorMessage}`);

      // PHASE 5: Add to DLQ if this is the last retry attempt
      const isLastAttempt = job.attemptsMade + 1 >= MAX_ATTEMPTS;
      if (isLastAttempt) {
        this.logger.warn(`Job ${job.id} exhausted all ${MAX_ATTEMPTS} retries, adding to DLQ`);

        // Add to Dead Letter Queue for manual investigation
        await this.dlqService.addToDeadLetter(
          job.id || `calendar-sync-${providerId}-${Date.now()}`,
          job.queueName,
          job.data,
          errorObj,
          job.attemptsMade + 1,
          {
            providerId,
            email,
            providerType: job.data.providerType,
            queueName: job.queueName,
          },
        );

        // PHASE 6: Create alert for permanent sync failure
        const alert = this.alertingService.createAlert(
          'critical',
          'calendar_sync_failed',
          `Calendar sync permanently failed for ${email} after ${MAX_ATTEMPTS} attempts: ${errorMessage}`,
          job.attemptsMade + 1,
          MAX_ATTEMPTS,
        );
        this.logger.error(`ALERT: ${alert.type} - ${alert.message}`);
      }

      throw error; // Re-throw to let BullMQ handle retry logic
    }
  }

  /**
   * Format log message for completed job
   */
  protected formatCompletedLog(job: Job<CalendarSyncJobData>, result: CalendarSyncJobResult): string {
    return `${job.data.email}: ${result.eventsProcessed} events (${result.newEvents} new, ${result.updatedEvents} updated, ${result.deletedEvents} deleted)`;
  }

  /**
   * Format log message for failed job
   */
  protected formatFailedLog(job: Job<CalendarSyncJobData> | undefined, error: Error): string {
    return `${job?.data?.email || 'unknown'} failed: ${error.message}`;
  }

  /**
   * Run provider-specific sync
   * Uses providerType from DB to prevent routing to wrong sync service
   */
  private async runProviderSync(
    jobData: CalendarSyncJobData,
  ): Promise<{ eventsProcessed: number; newEvents: number; updatedEvents: number; deletedEvents: number }> {
    const { providerId } = jobData;

    // Get provider from database - CRITICAL: Use DB as source of truth
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    // Use providerType from DB instead of jobData to prevent routing to wrong sync service
    const providerType = provider.providerType;

    // Validate provider type matches job data (security check)
    if (jobData.providerType && jobData.providerType !== providerType) {
      this.logger.warn(
        `Job providerType mismatch for ${providerId}: job=${jobData.providerType}, db=${providerType}. Using DB value.`,
      );
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
}
