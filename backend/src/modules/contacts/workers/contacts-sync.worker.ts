import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ContactsSyncJobData,
  ContactsSyncJobResult,
} from '../services/contacts-sync-queue.service';
import { GoogleContactsSyncService } from '../services/google-contacts-sync.service';
import { MicrosoftContactsSyncService } from '../services/microsoft-contacts-sync.service';
import {
  getRedisConnectionOptions,
  getWorkerOptions,
  QUEUE_NAMES,
} from '../../../common/config';

@Injectable()
export class ContactsSyncWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContactsSyncWorker.name);
  private redisConnection: Redis;
  private workers: Worker[] = [];

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private readonly googleContactsSync: GoogleContactsSyncService,
    private readonly microsoftContactsSync: MicrosoftContactsSyncService,
  ) {}

  async onModuleInit() {
    const workersEnabled =
      (this.configService.get<string>('CONTACTS_SYNC_WORKERS_ENABLED') || 'true').toLowerCase() !==
      'false';
    if (!workersEnabled) {
      this.logger.warn('Contacts sync workers are disabled via CONTACTS_SYNC_WORKERS_ENABLED=false');
      return;
    }

    // Initialize Redis connection for workers using centralized config
    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    this.logger.log(
      `Connecting to Redis for contacts sync workers at ${redisOptions.host}:${redisOptions.port}`,
    );

    // Start workers for each priority queue using centralized worker options
    this.startWorker(QUEUE_NAMES.CONTACTS_SYNC_HIGH);
    this.startWorker(QUEUE_NAMES.CONTACTS_SYNC_NORMAL);
    this.startWorker(QUEUE_NAMES.CONTACTS_SYNC_LOW);

    this.logger.log('Contacts sync workers started successfully');
  }

  private startWorker(queueName: string) {
    // Get centralized worker options
    const workerOptions = getWorkerOptions('CONTACTS_SYNC');

    const worker = new Worker<ContactsSyncJobData, ContactsSyncJobResult>(
      queueName,
      async (job: Job<ContactsSyncJobData>) => {
        return await this.processJob(job);
      },
      {
        connection: this.redisConnection,
        ...workerOptions,
      },
    );

    worker.on('completed', (job, result) => {
      this.logger.log(
        `[${queueName}] Job ${job.id} completed: ${result.contactsProcessed} contacts processed, ${result.newContacts} new, ${result.updatedContacts} updated`,
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

  private async processJob(job: Job<ContactsSyncJobData>): Promise<ContactsSyncJobResult> {
    const { providerId, providerType, email } = job.data;

    this.logger.log(`Processing contacts sync for ${email} (${providerType})`);

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
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Contacts sync failed for ${email}: ${errorMessage}`);

      throw error; // Re-throw to let BullMQ handle retry logic
    }
  }

  /**
   * Run provider-specific sync
   */
  private async runProviderSync(
    jobData: ContactsSyncJobData,
  ): Promise<{ contactsProcessed: number; newContacts: number; updatedContacts: number }> {
    const { providerId, providerType } = jobData;

    // Get provider from database
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    if (!provider.supportsContacts) {
      throw new Error(`Provider ${providerType} does not support contacts`);
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
        throw new Error(`Unsupported provider type: ${providerType}`);
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

  async onModuleDestroy() {
    this.logger.log('Stopping contacts sync workers...');
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
        `ContactsSyncWorker shutdown encountered an error (swallowed): ${
          outerError instanceof Error ? outerError.message : outerError
        }`,
      );
    } finally {
      this.logger.log('Contacts sync workers stopped');
    }
  }
}
