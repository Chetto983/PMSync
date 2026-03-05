import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';
import {
  ProviderConnectedEvent,
  ProviderDisconnectedEvent,
} from '../../../common/events/provider.events';
import { SyncSchedulerService } from './sync-scheduler.service';
import { WebhookLifecycleService } from './webhook-lifecycle.service';
import { QueueService } from './queue.service';
import { FolderSyncService } from './folder-sync.service';
import type { SyncJobData } from '../interfaces/sync-job.interface';

/**
 * Handles provider lifecycle events for the EmailSync domain.
 *
 * Phase 32: Replaces direct service calls from ProviderConfigService.
 * - ProviderConnectedEvent: triggers folder sync, email sync, webhook setup
 * - ProviderDisconnectedEvent: removes queued jobs and webhooks
 *
 * All @OnEvent handlers wrap body in try/catch with logger.error (Pitfall 3).
 */
@Injectable()
export class ProviderEventHandlerService {
  private readonly logger = new Logger(ProviderEventHandlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncScheduler: SyncSchedulerService,
    private readonly webhookLifecycle: WebhookLifecycleService,
    private readonly queueService: QueueService,
    private readonly folderSync: FolderSyncService,
  ) {}

  /**
   * Handle provider connected: trigger initial email sync pipeline.
   * Order: Folders -> Email sync -> Webhooks
   */
  @OnEvent(ProviderConnectedEvent.eventName)
  async handleProviderConnected(event: ProviderConnectedEvent): Promise<void> {
    try {
      const { tenantId, providerId, providerType } = event;
      this.logger.log(`[ProviderConnected] Starting email sync pipeline for provider ${providerId}`);

      // Load provider to get email for logging
      // @OnEvent runs outside HTTP request context — no AsyncLocalStorage tenant
      const provider = await withoutTenantScopingAsync(() =>
        this.prisma.providerConfig.findUnique({
          where: { id: providerId },
        }),
      );
      if (!provider) {
        this.logger.warn(`[ProviderConnected] Provider ${providerId} not found, skipping`);
        return;
      }

      // STEP 1: Sync folders/labels first
      this.logger.log(`[Initial Sync] Step 1: Syncing folders for provider ${provider.email}`);
      try {
        await this.folderSync.syncProviderFolders(tenantId, providerId);
        this.logger.log(`[Initial Sync] Folders synced successfully for ${provider.email}`);
      } catch (error) {
        this.logger.error(
          `[Initial Sync] Failed to sync folders for provider ${providerId}: ${
            error instanceof Error ? error.message : error
          }`,
        );
        // Continue even if folder sync fails
      }

      // STEP 2: Sync emails
      this.logger.log(`[Initial Sync] Step 2: Syncing emails for provider ${provider.email}`);
      let queuedViaScheduler = false;
      try {
        await this.syncScheduler.syncProviderNow(providerId, 'high');
        queuedViaScheduler = true;
        this.logger.log(`[Initial Sync] Email sync queued successfully for ${provider.email}`);
      } catch (error) {
        this.logger.error(
          `Failed to queue initial sync via scheduler for provider ${providerId}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }

      if (!queuedViaScheduler) {
        await this.enqueueFallbackSyncJob(provider);
      }

      // STEP 3: Embeddings will be queued automatically as emails are processed
      this.logger.log(`[Initial Sync] Step 3: Embeddings will be queued as emails are processed`);

      // Setup webhooks for real-time updates (Google/Microsoft only)
      if (['google', 'microsoft'].includes(providerType)) {
        try {
          await this.webhookLifecycle.autoCreateWebhook(providerId);
        } catch (error) {
          this.logger.warn(
            `Failed to auto-create webhook for provider ${providerId}: ${
              error instanceof Error ? error.message : error
            }`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `[ProviderConnected] Unhandled error for provider ${event.providerId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /**
   * Handle provider disconnected: cleanup queued sync jobs and webhooks.
   */
  @OnEvent(ProviderDisconnectedEvent.eventName)
  async handleProviderDisconnected(event: ProviderDisconnectedEvent): Promise<void> {
    try {
      const { providerId } = event;
      this.logger.log(`[ProviderDisconnected] Cleaning up email sync for provider ${providerId}`);

      await this.queueService.removeJobsForProvider(providerId).catch((error) => {
        this.logger.warn(
          `Failed to remove queued jobs for provider ${providerId}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      });

      await this.webhookLifecycle.removeWebhookForProvider(providerId).catch((error) => {
        this.logger.warn(
          `Failed to remove email webhook for provider ${providerId}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      });
    } catch (error) {
      this.logger.error(
        `[ProviderDisconnected] Unhandled error for provider ${event.providerId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  private async enqueueFallbackSyncJob(
    provider: {
      id: string;
      tenantId: string;
      providerType: string;
      email: string;
      lastSyncedAt?: Date | null;
    },
  ): Promise<void> {
    const job: SyncJobData = {
      tenantId: provider.tenantId,
      providerId: provider.id,
      providerType: provider.providerType as SyncJobData['providerType'],
      email: provider.email,
      priority: 'high',
      syncType: 'full',
      lastSyncedAt: provider.lastSyncedAt ?? undefined,
    };

    try {
      await this.queueService.addSyncJob(job);
      this.logger.log(`Queued fallback sync job for provider ${provider.email}`);
    } catch (error) {
      this.logger.error(
        `Failed to enqueue fallback sync for provider ${provider.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}
