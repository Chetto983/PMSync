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

    // Initialize Redis connection for workers
    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD');

    this.redisConnection = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    // Start workers for each priority queue with env-based concurrency
    this.startWorker('high', this.getConcurrency('HIGH'));
    this.startWorker('normal', this.getConcurrency('NORMAL'));
    this.startWorker('low', this.getConcurrency('LOW'));

    this.logger.log('Contacts sync workers started successfully');
  }

  private startWorker(priority: 'high' | 'normal' | 'low', concurrency: number) {
    const queueName = `contacts-sync-${priority}`;

    const worker = new Worker<ContactsSyncJobData, ContactsSyncJobResult>(
      queueName,
      async (job: Job<ContactsSyncJobData>) => {
        return await this.processJob(job);
      },
      {
        connection: this.redisConnection,
        concurrency,
        limiter: {
          max: concurrency * 2, // Max jobs processed
          duration: 60000, // per minute
        },
        lockDuration: this.configService.get<number>('CONTACTS_SYNC_WORKER_LOCK_MS', 120000), // 2 minutes
        stalledInterval: this.configService.get<number>(
          'CONTACTS_SYNC_WORKER_STALLED_INTERVAL_MS',
          60000,
        ), // 1 minute
      },
    );

    worker.on('completed', (job, result) => {
      this.logger.log(
        `[${priority}] Job ${job.id} completed: ${result.contactsProcessed} contacts processed, ${result.newContacts} new, ${result.updatedContacts} updated`,
      );
    });

    worker.on('failed', (job, error) => {
      this.logger.error(
        `[${priority}] Job ${job?.id} failed for ${job?.data?.email}: ${error.message}`,
      );
    });

    worker.on('error', (error) => {
      this.logger.error(`[${priority}] Worker error: ${error.message}`);
    });

    this.workers.push(worker);
    this.logger.log(`Started ${priority} priority worker with concurrency ${concurrency}`);
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

    // Close all workers
    await Promise.all(this.workers.map((worker) => worker.close()));

    // Close Redis connection
    await this.redisConnection.quit();

    this.logger.log('Contacts sync workers stopped');
  }

  /**
   * Get worker concurrency from environment variables
   */
  private getConcurrency(level: 'HIGH' | 'NORMAL' | 'LOW'): number {
    switch (level) {
      case 'HIGH':
        return this.getNumber('CONTACTS_WORKER_HIGH_CONCURRENCY', 5);
      case 'NORMAL':
        return this.getNumber('CONTACTS_WORKER_NORMAL_CONCURRENCY', 3);
      case 'LOW':
        return this.getNumber('CONTACTS_WORKER_LOW_CONCURRENCY', 2);
      default:
        return 2;
    }
  }

  private getNumber(envKey: string, defaultValue: number): number {
    const raw = this.configService.get<string | number>(envKey);
    if (raw === undefined || raw === null || raw === '') {
      return defaultValue;
    }

    const parsed = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }
}
