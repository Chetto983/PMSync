import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ContactsSyncJobData,
  ContactsSyncJobResult,
} from '../services/contacts-sync-queue.service';
import { GoogleContactsSyncService } from '../services/google-contacts-sync.service';
import { MicrosoftContactsSyncService } from '../services/microsoft-contacts-sync.service';
import { BaseWorker, BaseWorkerConfig } from '../../../common/workers/base.worker';
import { QUEUE_NAMES, WORKER_PRESETS, QUEUE_PRESETS } from '../../../common/config';
import { getErrorMessage } from '../../../common/utils';
import { DeadLetterQueueService } from '../../../common/services/dead-letter-queue.service';
import { AlertingService } from '../../../common/services/alerting.service';
import { ContactsError, ContactsErrorCode } from '../errors/contacts-error';

/** Maximum retry attempts before sending to DLQ (matches QUEUE_PRESETS.CONTACTS_SYNC.attempts) */
const MAX_ATTEMPTS = QUEUE_PRESETS.CONTACTS_SYNC.attempts;

/**
 * ContactsSyncWorker
 *
 * Processes contacts sync jobs from the BullMQ queues.
 * Extends BaseWorker for standardized worker lifecycle management.
 *
 * Features:
 * - Priority-based processing (high, normal, low)
 * - Automatic retry with exponential backoff
 * - Provider-specific sync delegation (Google, Microsoft)
 * - Last synced timestamp tracking
 * - Dead Letter Queue integration for failed jobs
 * - Alerting for critical sync failures
 * - Graceful shutdown with job draining (via BaseWorker)
 * - Stalled job detection (via BaseWorker)
 *
 * Phase 5 Refactor: Migrated from custom implementation to BaseWorker
 * Added DLQ and AlertingService integration for reliability
 */
@Injectable()
export class ContactsSyncWorker extends BaseWorker<ContactsSyncJobData, ContactsSyncJobResult> {
  protected readonly logger = new Logger(ContactsSyncWorker.name);
  protected readonly workerName = 'contacts-sync';
  protected readonly envToggle = 'CONTACTS_SYNC_WORKERS_ENABLED';

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly googleContactsSync: GoogleContactsSyncService,
    private readonly microsoftContactsSync: MicrosoftContactsSyncService,
    private readonly dlqService: DeadLetterQueueService,
    private readonly alertingService: AlertingService,
  ) {
    super(configService);
  }

  /**
   * Get worker configuration for all 3 priority queues
   * Uses CONTACTS_SYNC preset from centralized config
   */
  protected getWorkerConfig(): BaseWorkerConfig[] {
    const preset = WORKER_PRESETS.CONTACTS_SYNC;

    return [
      {
        queueName: QUEUE_NAMES.CONTACTS_SYNC_HIGH,
        concurrency: preset.concurrency,
        lockDuration: preset.lockDuration,
        stalledInterval: preset.stalledInterval,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
      {
        queueName: QUEUE_NAMES.CONTACTS_SYNC_NORMAL,
        concurrency: preset.concurrency,
        lockDuration: preset.lockDuration,
        stalledInterval: preset.stalledInterval,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
      {
        queueName: QUEUE_NAMES.CONTACTS_SYNC_LOW,
        concurrency: Math.max(1, preset.concurrency - 1), // Lower concurrency for low priority
        lockDuration: preset.lockDuration,
        stalledInterval: preset.stalledInterval,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    ];
  }

  /**
   * Process a single contacts sync job
   */
  protected async processJob(job: Job<ContactsSyncJobData>): Promise<ContactsSyncJobResult> {
    const { providerId, email } = job.data;

    this.logger.log(`Processing contacts sync for ${email} (attempt ${job.attemptsMade + 1}/${MAX_ATTEMPTS})`);

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
        contactsProcessed: result.contactsProcessed,
        newContacts: result.newContacts,
        updatedContacts: result.updatedContacts,
        syncDuration,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const errorObj = error instanceof Error ? error : new Error(errorMessage);
      this.logger.error(`Contacts sync failed for ${email}: ${errorMessage}`);

      // PHASE 5: Add to DLQ if this is the last retry attempt
      const isLastAttempt = job.attemptsMade + 1 >= MAX_ATTEMPTS;
      if (isLastAttempt) {
        this.logger.warn(`Job ${job.id} exhausted all ${MAX_ATTEMPTS} retries, adding to DLQ`);

        // Add to Dead Letter Queue for manual investigation
        await this.dlqService.addToDeadLetter(
          job.id || `contacts-sync-${providerId}-${Date.now()}`,
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
          'contacts_sync_failed',
          `Contacts sync permanently failed for ${email} after ${MAX_ATTEMPTS} attempts: ${errorMessage}`,
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
  protected formatCompletedLog(job: Job<ContactsSyncJobData>, result: ContactsSyncJobResult): string {
    return `${job.data.email}: ${result.contactsProcessed} contacts (${result.newContacts} new, ${result.updatedContacts} updated)`;
  }

  /**
   * Format log message for failed job
   */
  protected formatFailedLog(job: Job<ContactsSyncJobData> | undefined, error: Error): string {
    return `${job?.data?.email || 'unknown'} failed: ${error.message}`;
  }

  /**
   * Run provider-specific sync
   * Uses providerType from DB to prevent routing to wrong sync service
   */
  private async runProviderSync(
    jobData: ContactsSyncJobData,
  ): Promise<{ contactsProcessed: number; newContacts: number; updatedContacts: number }> {
    const { providerId } = jobData;

    // Get provider from database - CRITICAL: Use DB as source of truth
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new ContactsError(
        `Provider ${providerId} not found`,
        ContactsErrorCode.PROVIDER_NOT_FOUND,
        { context: { providerId }, retryable: false },
      );
    }

    // Use providerType from DB instead of jobData to prevent routing to wrong sync service
    const providerType = provider.providerType;

    // Validate provider type matches job data (security check)
    if (jobData.providerType && jobData.providerType !== providerType) {
      this.logger.warn(
        `Job providerType mismatch for ${providerId}: job=${jobData.providerType}, db=${providerType}. Using DB value.`,
      );
    }

    if (!provider.supportsContacts) {
      throw new ContactsError(
        `Provider ${providerType} does not support contacts`,
        ContactsErrorCode.PROVIDER_NOT_SUPPORTED,
        {
          provider: (providerType === 'google' || providerType === 'microsoft') ? providerType : undefined,
          retryable: false
        },
      );
    }

    let contactsProcessed = 0;
    let newContacts = 0;
    let updatedContacts = 0;

    // Get initial provider contact count (for this specific provider)
    const contactsBefore = await this.prisma.providerContact.count({
      where: { providerId },
    });

    switch (providerType) {
      case 'google':
        contactsProcessed = await this.googleContactsSync.syncContacts(providerId);
        break;

      case 'microsoft':
        contactsProcessed = await this.microsoftContactsSync.syncContacts(providerId);
        break;

      default:
        throw new ContactsError(
          `Unsupported provider type: ${providerType}`,
          ContactsErrorCode.PROVIDER_NOT_SUPPORTED,
          {
            // providerType is not google/microsoft at this point, so don't pass it
            context: { providerId, providerType },
            retryable: false
          },
        );
    }

    // Get final provider contact count (for this specific provider)
    const contactsAfter = await this.prisma.providerContact.count({
      where: { providerId },
    });

    // Calculate new vs updated (rough estimate)
    const totalChange = contactsAfter - contactsBefore;
    newContacts = totalChange > 0 ? totalChange : 0;
    updatedContacts = contactsProcessed - newContacts;

    return {
      contactsProcessed,
      newContacts,
      updatedContacts,
    };
  }
}
