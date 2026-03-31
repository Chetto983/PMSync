import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';
import {
  ProviderConnectedEvent,
  ProviderDisconnectedEvent,
} from '../../../common/events/provider.events';
import { EmailSyncedEvent } from '../../../common/events/email.events';
import { ContactsService } from './contacts.service';
import { RelationshipScoreService } from './relationship-score.service';
import {
  QUEUE_NAMES,
  getRedisConnectionOptions,
  getDefaultJobOptions,
} from '../../../common/config';
import { ScheduledJobsQueueService, ScheduledJobType } from '../../../common/services/scheduled-jobs.queue';

/**
 * Handles provider lifecycle events for the Contacts domain.
 *
 * Phase 32: Replaces direct service calls from ProviderConfigService.
 * - ProviderConnectedEvent: triggers initial contacts sync (if supported)
 * - ProviderDisconnectedEvent: cleanup provider contacts
 *
 * S09 T-0903: Also handles EmailSyncedEvent to trigger relationship score
 * recalculation via BullMQ (debounced: max once per hour per tenant).
 *
 * All @OnEvent handlers wrap body in try/catch with logger.error (Pitfall 3).
 */
@Injectable()
export class ContactsProviderEventHandlerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContactsProviderEventHandlerService.name);
  private scoreQueue!: Queue;
  private scoreWorker!: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly contactsService: ContactsService,
    private readonly relationshipScoreService: RelationshipScoreService,
    private readonly scheduledJobs: ScheduledJobsQueueService,
  ) {}

  async onModuleInit(): Promise<void> {
    const connection = getRedisConnectionOptions();

    this.scoreQueue = new Queue(QUEUE_NAMES.RELATIONSHIP_SCORE, {
      connection,
      defaultJobOptions: {
        ...getDefaultJobOptions(),
        removeOnComplete: 10,
        removeOnFail: 50,
      },
    });

    this.scoreWorker = new Worker(
      QUEUE_NAMES.RELATIONSHIP_SCORE,
      async (job) => {
        const { tenantId } = job.data as { tenantId: string };
        this.logger.log(`[RelationshipScore] Recalculating scores for tenant ${tenantId}`);
        const updated = await this.relationshipScoreService.recalculateAndPersist(tenantId);
        return { tenantId, updated };
      },
      { connection, concurrency: 2 },
    );

    this.scoreWorker.on('failed', (job, err) => {
      this.logger.error(`[RelationshipScore] Job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log('Relationship score queue + worker initialized');

    // Register contact purge handler (auto-delete soft-deleted contacts >30 days)
    this.scheduledJobs.registerHandler(ScheduledJobType.CONTACT_PURGE, async () => {
      const tenants = await this.prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      let totalPurged = 0;
      for (const tenant of tenants) {
        const purged = await this.contactsService.purgeDeletedContacts(tenant.id);
        totalPurged += purged;
      }
      if (totalPurged > 0) {
        this.logger.log(`[ContactPurge] Purged ${totalPurged} soft-deleted contacts across ${tenants.length} tenants`);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.scoreWorker?.close();
    await this.scoreQueue?.close();
  }

  /**
   * Handle provider connected: trigger initial contacts sync if supported.
   */
  @OnEvent(ProviderConnectedEvent.eventName)
  async handleProviderConnected(event: ProviderConnectedEvent): Promise<void> {
    // @OnEvent runs outside HTTP request context — no AsyncLocalStorage tenant.
    try {
      await withoutTenantScopingAsync(async () => {
        const { providerId } = event;

        const provider = await this.prisma.providerConfig.findUnique({
          where: { id: providerId },
        });
        if (!provider?.supportsContacts) {
          return;
        }

        this.logger.log(`[ProviderConnected] Queuing contacts sync for provider ${provider.email}`);

        // Fire and forget - don't block the event handler
        this.contactsService
          .syncContacts(providerId)
          .then((contactsCount) => {
            this.logger.log(`[Initial Sync] ${contactsCount} contacts synced for ${provider.email}`);
          })
          .catch((error) => {
            this.logger.error(
              `[Initial Sync] Failed to sync contacts for provider ${providerId}: ${
                error instanceof Error ? error.message : error
              }`,
            );
          });
      });
    } catch (error) {
      this.logger.error(
        `[ProviderConnected] Contacts handler error for provider ${event.providerId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /**
   * Handle provider disconnected: cleanup provider contacts.
   */
  @OnEvent(ProviderDisconnectedEvent.eventName)
  async handleProviderDisconnected(event: ProviderDisconnectedEvent): Promise<void> {
    try {
      await withoutTenantScopingAsync(async () => {
        const { tenantId, providerId, supportsContacts } = event;
        if (!supportsContacts) {
          return;
        }

        this.logger.log(`[ProviderDisconnected] Cleaning up contacts for provider ${providerId}`);

        await this.contactsService.deleteProviderContacts(providerId, tenantId).catch((error) => {
          this.logger.warn(
            `Failed to cleanup contacts for provider ${providerId}: ${
              error instanceof Error ? error.message : error
            }`,
          );
        });
      });
    } catch (error) {
      this.logger.error(
        `[ProviderDisconnected] Contacts handler error for provider ${event.providerId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /**
   * Handle email synced: enqueue debounced relationship score recalculation.
   * Uses jobId = `score-{tenantId}-{hourSlot}` so BullMQ deduplicates:
   * at most one recalculation per tenant per hour.
   */
  @OnEvent(EmailSyncedEvent.eventName)
  async handleEmailSynced(event: EmailSyncedEvent): Promise<void> {
    try {
      const hourSlot = Math.floor(Date.now() / (60 * 60 * 1000));
      const jobId = `score-${event.tenantId}-${hourSlot}`;

      await this.scoreQueue.add(
        'recalculate',
        { tenantId: event.tenantId },
        {
          jobId,
          delay: 30_000, // 30s delay to batch multiple sync events
        },
      );
    } catch (error) {
      this.logger.error(
        `[EmailSynced] Failed to queue score recalculation for tenant ${event.tenantId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}
