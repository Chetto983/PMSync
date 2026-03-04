import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { ContactsSyncQueueService, ContactsSyncJobData } from './contacts-sync-queue.service';
import { ContactsError, ContactsErrorCode } from '../errors/contacts-error';
import { ProviderConfig } from '@prisma/client';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping';

@Injectable()
export class ContactsSyncSchedulerService {
  private readonly logger = new Logger(ContactsSyncSchedulerService.name);
  private isRunning = false;

  // Configuration - sync less frequently than emails
  private readonly BATCH_SIZE = 100; // Process 100 providers per cycle

  private readonly schedulerEnabled: boolean;

  constructor(
    private prisma: PrismaService,
    private contactsSyncQueue: ContactsSyncQueueService,
    private readonly configService: ConfigService,
  ) {
    const enabled =
      (this.configService.get<string>('CONTACTS_SYNC_SCHEDULER_ENABLED') || 'false').toLowerCase() !==
      'false';
    this.schedulerEnabled = enabled;
    if (!enabled) {
      this.logger.warn('ContactsSyncSchedulerService disabled (contacts sync is manual-only by default)');
    }
  }

  /**
   * Manually trigger bulk contacts sync for all active providers
   * This is intended for admin/manual triggering, not automatic scheduling
   */
  async syncAllProviders() {
    return withoutTenantScopingAsync(async () => {
      if (this.isRunning) {
        this.logger.warn('Previous contacts sync still running, skipping...');
        return {
          success: false,
          message: 'Sync already in progress',
        };
      }

      this.isRunning = true;

      try {
        this.logger.log('Starting manual bulk contacts sync...');

        // Get providers that support contacts
        const providers = await this.getProvidersToSync();

      if (providers.length === 0) {
        this.logger.log('No providers available for contacts sync');
        return {
          success: true,
          message: 'No providers to sync',
          count: 0,
        };
      }

      // Convert to sync jobs
      const syncJobs = this.createSyncJobs(providers);

      // Add to queues
      await this.contactsSyncQueue.addBulkSyncJobs(syncJobs);

      this.logger.log(`Scheduled ${syncJobs.length} contacts sync jobs`);

      return {
        success: true,
        message: `Scheduled ${syncJobs.length} contacts sync jobs`,
        count: syncJobs.length,
      };
    } catch (error) {
      this.logger.error('Error in contacts sync scheduler:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        count: 0,
      };
    } finally {
      this.isRunning = false;
    }
    });
  }

  /**
   * Get providers that support contacts
   * Criteria:
   * - Active providers
   * - Supports contacts (Google or Microsoft)
   * - Limit to batch size
   */
  private async getProvidersToSync() {
    const providers = await this.prisma.providerConfig.findMany({
      where: {
        isActive: true,
        supportsContacts: true,
        providerType: {
          in: ['google', 'microsoft'],
        },
      },
      include: {
        tenant: {
          select: {
            id: true,
          },
        },
      },
      orderBy: [
        { lastSyncedAt: 'asc' }, // Oldest synced first (or never synced)
      ],
      take: this.BATCH_SIZE,
    });

    return providers;
  }

  /**
   * Convert database providers to sync jobs with priority
   */
  private createSyncJobs(providers: ProviderConfig[]): ContactsSyncJobData[] {
    const jobs: ContactsSyncJobData[] = [];

    for (const provider of providers) {
      const priority = this.determinePriority(provider);

      jobs.push({
        tenantId: provider.tenantId,
        providerId: provider.id,
        providerType: provider.providerType as 'google' | 'microsoft',
        email: provider.email,
        priority,
        lastSyncedAt: provider.lastSyncedAt ?? undefined,
      });
    }

    return jobs;
  }

  /**
   * Determine job priority
   * Contacts sync is generally lower priority than email sync
   */
  private determinePriority(provider: ProviderConfig): 'high' | 'normal' | 'low' {
    // If never synced, use normal priority
    if (!provider.lastSyncedAt) {
      return 'normal';
    }

    const hoursSinceLastSync =
      (Date.now() - provider.lastSyncedAt.getTime()) / (1000 * 60 * 60);

    // If synced recently (< 24h), use low priority
    if (hoursSinceLastSync < 24) {
      return 'low';
    }

    // If not synced for a while (> 7 days), use high priority
    if (hoursSinceLastSync > 7 * 24) {
      return 'high';
    }

    // Default to normal priority
    return 'normal';
  }

  /**
   * Manual trigger for syncing a specific provider's contacts
   */
  async syncProviderNow(
    providerId: string,
    priority: 'high' | 'normal' | 'low' = 'high',
  ): Promise<void> {
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new ContactsError(`Provider ${providerId} not found`, ContactsErrorCode.PROVIDER_NOT_FOUND, { context: { providerId }, retryable: false });
    }

    if (!provider.isActive) {
      throw new ContactsError(`Provider ${providerId} is not active`, ContactsErrorCode.PROVIDER_NOT_SUPPORTED, { context: { providerId }, retryable: false });
    }

    if (!provider.supportsContacts) {
      throw new ContactsError(`Provider ${providerId} does not support contacts`, ContactsErrorCode.PROVIDER_NOT_SUPPORTED, { context: { providerId }, retryable: false });
    }

    const syncJob: ContactsSyncJobData = {
      tenantId: provider.tenantId,
      providerId: provider.id,
      providerType: provider.providerType as 'google' | 'microsoft',
      email: provider.email,
      priority,
      lastSyncedAt: provider.lastSyncedAt ?? undefined,
    };

    await this.contactsSyncQueue.addSyncJob(syncJob);

    this.logger.log(`Manually triggered contacts sync for provider ${provider.email}`);
  }

  /**
   * Get sync statistics
   */
  async getSyncStats() {
    const queueStatus = await this.contactsSyncQueue.getQueueStatus();

    const activeProviders = await this.prisma.providerConfig.count({
      where: {
        isActive: true,
        supportsContacts: true,
      },
    });

    const neverSynced = await this.prisma.providerConfig.count({
      where: {
        isActive: true,
        supportsContacts: true,
        lastSyncedAt: null,
      },
    });

    const syncedToday = await this.prisma.providerConfig.count({
      where: {
        isActive: true,
        supportsContacts: true,
        lastSyncedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    const totalContacts = await this.prisma.contact.count();

    return {
      queues: queueStatus,
      providers: {
        total: activeProviders,
        neverSynced,
        syncedToday,
      },
      contacts: {
        total: totalContacts,
      },
      scheduler: {
        isRunning: this.isRunning,
        batchSize: this.BATCH_SIZE,
      },
    };
  }
}
