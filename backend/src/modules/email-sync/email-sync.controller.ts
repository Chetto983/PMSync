import { Controller, Get, Post, Param, UseGuards, Request, Logger, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TenantGuard } from '../../common/auth/tenant.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RateTierDecorator } from '../../common/decorators/rate-tier.decorator';
import { QueueService } from './services/queue.service';
import { SyncSchedulerService } from './services/sync-scheduler.service';
import { WebhookLifecycleService } from './services/webhook-lifecycle.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../email/services/storage.service';
import { AlertingService } from '../../common/services/alerting.service';
import { AuthenticatedRequest } from '../../common/types/request.types';

@ApiTags('Email Sync')
@Controller('email-sync')
@UseGuards(TenantGuard)
@ApiBearerAuth()
export class EmailSyncController {
  private readonly logger = new Logger(EmailSyncController.name);

  constructor(
    private queueService: QueueService,
    private schedulerService: SyncSchedulerService,
    private webhookLifecycle: WebhookLifecycleService,
    private prisma: PrismaService,
    private storageService: StorageService,
    private alertingService: AlertingService,
  ) { }

  @Get('status')
  @ApiOperation({ summary: 'Get email sync system status' })
  @ApiResponse({ status: 200, description: 'Returns sync system status' })
  async getStatus() {
    return await this.schedulerService.getSyncStats();
  }

  @Get('health')
  @ApiOperation({ summary: 'Email sync health (queues, webhooks)' })
  @ApiResponse({ status: 200, description: 'Health summary for email sync subsystem' })
  async getHealth() {
    const [queues, webhooks] = await Promise.all([
      this.queueService.getHealthSummary(),
      this.webhookLifecycle.getHealthStatus(),
    ]);

    return {
      queues,
      webhooks,
    };
  }

  @Get('queues')
  @ApiOperation({ summary: 'Get queue status' })
  @ApiResponse({ status: 200, description: 'Returns status of all queues' })
  async getQueueStatus() {
    return await this.queueService.getQueueStatus();
  }

  /**
   * SEC-1 FIX: Manually trigger sync for a provider with tenant validation
   */
  @Post('sync/:providerId')
  @ApiOperation({ summary: 'Manually trigger sync for a provider' })
  @ApiResponse({ status: 200, description: 'Sync job queued successfully' })
  async syncProvider(
    @Param('providerId') providerId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    const tenantId = req.user.tenantId;

    // SEC-1 FIX: Validate provider belongs to tenant before queueing sync
    const provider = await this.prisma.providerConfig.findFirst({
      where: { id: providerId, tenantId },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    await this.schedulerService.syncProviderNow(providerId, 'high');

    return {
      success: true,
      message: `Sync job queued for provider ${providerId}`,
    };
  }

  @Post('sync-all')
  @RateTierDecorator('destructive-write')
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Purge all emails, attachments, embeddings and re-sync all providers (DANGEROUS)' })
  @ApiResponse({ status: 200, description: 'All data purged, webhooks renewed, and sync jobs queued' })
  async syncAll(@Request() req: AuthenticatedRequest) {
    const tenantId = req.user.tenantId;
    this.logger.log(`[SYNC-ALL] Starting full sync reset for tenant ${tenantId}`);

    // Get all active providers for this tenant
    const providers = await this.prisma.providerConfig.findMany({
      where: {
        tenantId,
        isActive: true,
      },
    });

    if (providers.length === 0) {
      return {
        success: false,
        message: 'No active providers found',
      };
    }

    // Step 1: Get all attachment storage paths BEFORE deleting emails (cascade will delete attachment records)
    this.logger.log('[SYNC-ALL] Step 1: Collecting attachment storage paths...');
    const attachments = await this.prisma.emailAttachment.findMany({
      where: {
        email: { tenantId },
        storagePath: { not: null },
      },
      select: { storagePath: true },
    });
    const storagePaths = attachments
      .map((a) => a.storagePath)
      .filter((p): p is string => p !== null);
    this.logger.log(`[SYNC-ALL] Found ${storagePaths.length} attachments to delete from storage`);

    // Step 2: Delete attachments from Minio/S3
    let storageDeleted = 0;
    let storageFailed = 0;
    if (storagePaths.length > 0) {
      this.logger.log('[SYNC-ALL] Step 2: Deleting attachments from storage...');
      const result = await this.storageService.deleteObjects(storagePaths);
      storageDeleted = result.deleted;
      storageFailed = result.failed;
      this.logger.log(`[SYNC-ALL] Storage cleanup: ${storageDeleted} deleted, ${storageFailed} failed`);
    }

    // Step 3: Delete all emails for this tenant (cascades to attachments, threads)
    this.logger.log('[SYNC-ALL] Step 3: Deleting all emails...');
    const deletedCount = await this.prisma.email.deleteMany({
      where: { tenantId },
    });
    this.logger.log(`[SYNC-ALL] Deleted ${deletedCount.count} emails`);

    // Step 4: Delete email embeddings for this tenant
    this.logger.log('[SYNC-ALL] Step 4: Deleting embeddings...');
    const embeddingsDeleted = await this.prisma.embedding.deleteMany({
      where: { tenantId },
    });
    this.logger.log(`[SYNC-ALL] Deleted ${embeddingsDeleted.count} embeddings`);

    // Step 5: Reset provider metadata completely (lastSyncedAt, historyId, lastSyncToken, etc.)
    this.logger.log('[SYNC-ALL] Step 5: Resetting provider metadata...');
    for (const provider of providers) {
      await this.prisma.providerConfig.update({
        where: { id: provider.id },
        data: {
          lastSyncedAt: null,
          metadata: {}, // Clear all metadata including historyId, lastSyncToken
        },
      });
    }
    this.logger.log(`[SYNC-ALL] Reset metadata for ${providers.length} providers`);

    // Step 6: Renew webhook subscriptions (Pub/Sub for Gmail, Graph for Microsoft)
    this.logger.log('[SYNC-ALL] Step 6: Renewing webhook subscriptions...');
    let webhooksRenewed = 0;
    let webhooksFailed = 0;
    try {
      // First deactivate existing subscriptions
      await this.prisma.webhookSubscription.updateMany({
        where: {
          tenantId,
          providerId: { in: providers.map((p) => p.id) },
        },
        data: { isActive: false },
      });

      // Create fresh webhook subscriptions
      const webhookResult = await this.webhookLifecycle.createAllWebhooks();
      webhooksRenewed = webhookResult.created;
      webhooksFailed = webhookResult.failed;
      this.logger.log(`[SYNC-ALL] Webhooks: ${webhooksRenewed} created, ${webhooksFailed} failed`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[SYNC-ALL] Webhook renewal failed: ${msg}`);
    }

    // Step 7: Queue full sync jobs for all providers
    this.logger.log('[SYNC-ALL] Step 7: Queueing full sync jobs...');
    const syncPromises = providers.map((provider) =>
      this.schedulerService.syncProviderNow(provider.id, 'high'),
    );
    await Promise.all(syncPromises);
    this.logger.log(`[SYNC-ALL] Queued sync for ${providers.length} providers`);

    this.logger.log('[SYNC-ALL] Full sync reset completed successfully');

    return {
      success: true,
      deletedEmails: deletedCount.count,
      deletedEmbeddings: embeddingsDeleted.count,
      storageCleanup: {
        deleted: storageDeleted,
        failed: storageFailed,
      },
      webhooks: {
        renewed: webhooksRenewed,
        failed: webhooksFailed,
      },
      providersQueued: providers.length,
      message: `Full reset: ${deletedCount.count} emails, ${embeddingsDeleted.count} embeddings, ${storageDeleted} attachments deleted. ${webhooksRenewed} webhooks renewed. Sync queued for ${providers.length} providers.`,
    };
  }

  /**
   * SEC-2 FIX: Queue operations require super-admin role
   */
  @Post('queues/:priority/pause')
  @UseGuards(RolesGuard)
  @Roles('super-admin')
  @ApiOperation({ summary: 'Pause a queue (super-admin only)' })
  @ApiResponse({ status: 200, description: 'Queue paused successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires super-admin role' })
  async pauseQueue(@Param('priority') priority: 'high' | 'normal' | 'low') {
    await this.queueService.pauseQueue(priority);

    return {
      success: true,
      message: `Queue ${priority} paused`,
    };
  }

  @Post('queues/:priority/resume')
  @UseGuards(RolesGuard)
  @Roles('super-admin')
  @ApiOperation({ summary: 'Resume a queue (super-admin only)' })
  @ApiResponse({ status: 200, description: 'Queue resumed successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires super-admin role' })
  async resumeQueue(@Param('priority') priority: 'high' | 'normal' | 'low') {
    await this.queueService.resumeQueue(priority);

    return {
      success: true,
      message: `Queue ${priority} resumed`,
    };
  }

  @Post('queues/:priority/clear')
  @RateTierDecorator('destructive-write')
  @UseGuards(RolesGuard)
  @Roles('super-admin')
  @ApiOperation({ summary: 'Clear all jobs from a queue - DANGEROUS (super-admin only)' })
  @ApiResponse({ status: 200, description: 'Queue cleared successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires super-admin role' })
  async clearQueue(@Param('priority') priority: 'high' | 'normal' | 'low') {
    await this.queueService.obliterateQueue(priority);

    return {
      success: true,
      message: `Queue ${priority} cleared - all jobs deleted`,
    };
  }

  @Post('webhooks/create-all')
  @Roles('admin')
  @ApiOperation({ summary: 'Create webhook subscriptions for all eligible providers' })
  @ApiResponse({ status: 200, description: 'Webhooks created successfully' })
  async createAllWebhooks() {
    const result = await this.webhookLifecycle.createAllWebhooks();

    return {
      success: true,
      created: result.created,
      failed: result.failed,
      message: `Created ${result.created} webhooks, ${result.failed} failed`,
    };
  }

  @Post('webhooks/renew')
  @Roles('admin')
  @ApiOperation({ summary: 'Manually trigger webhook renewal' })
  @ApiResponse({ status: 200, description: 'Webhook renewal triggered' })
  async renewWebhooks() {
    await this.webhookLifecycle.renewExpiringWebhooks();

    return {
      success: true,
      message: 'Webhook renewal completed',
    };
  }

  @Get('webhooks/health')
  @ApiOperation({ summary: 'Get webhook system health status' })
  @ApiResponse({ status: 200, description: 'Returns webhook health status' })
  async getWebhookHealth() {
    const [webhooks, queues, stats] = await Promise.all([
      this.webhookLifecycle.getHealthStatus(),
      this.queueService.getHealthSummary(),
      this.schedulerService.getSyncStats(),
    ]);

    return {
      webhooks,
      queues,
      syncSummary: {
        providersWithErrors: stats.smartSync.providersWithErrors,
        providersWithAuthErrors: stats.smartSync.providersWithAuthErrors,
        providersNeedingBackfill: stats.smartSync.providersNeedingBackfill,
        providersWithDeltaFallback: stats.smartSync.providersWithDeltaFallback,
        priorityDistribution: stats.smartSync.priorityDistribution,
      },
    };
  }

  /**
   * Phase 5.2: Alerting Thresholds Endpoint
   * Returns alerts based on configured thresholds
   */
  @Get('alerts')
  @ApiOperation({ summary: 'Get active alerts based on monitoring thresholds' })
  @ApiResponse({ status: 200, description: 'Returns list of active alerts' })
  async getAlerts() {
    const alerts: Array<{ level: 'warning' | 'critical'; type: string; message: string; value?: number; threshold?: number }> = [];

    // Thresholds (Phase 5.2)
    const QUEUE_UTILIZATION_WARNING = 80;
    const QUEUE_UTILIZATION_CRITICAL = 95;
    const PROVIDER_ERROR_THRESHOLD = 3;
    const AUTH_ERROR_THRESHOLD = 1;

    // Check queue utilization
    const queueHealth = await this.queueService.getHealthSummary();
    if (queueHealth.capacity) {
      for (const [priority, status] of Object.entries(queueHealth.capacity)) {
        const utilization = status.utilizationPercent.waiting;
        if (utilization >= QUEUE_UTILIZATION_CRITICAL) {
          alerts.push({
            level: 'critical',
            type: 'queue_utilization',
            message: `Queue ${priority} utilization critical`,
            value: utilization,
            threshold: QUEUE_UTILIZATION_CRITICAL,
          });
        } else if (utilization >= QUEUE_UTILIZATION_WARNING) {
          alerts.push({
            level: 'warning',
            type: 'queue_utilization',
            message: `Queue ${priority} utilization high`,
            value: utilization,
            threshold: QUEUE_UTILIZATION_WARNING,
          });
        }
      }
    }

    // Check provider errors
    const stats = await this.schedulerService.getSyncStats();
    if (stats.smartSync.providersWithErrors > PROVIDER_ERROR_THRESHOLD) {
      alerts.push({
        level: 'warning',
        type: 'provider_errors',
        message: `${stats.smartSync.providersWithErrors} providers with sync errors`,
        value: stats.smartSync.providersWithErrors,
        threshold: PROVIDER_ERROR_THRESHOLD,
      });
    }

    // Check auth errors (critical - needs immediate attention)
    if (stats.smartSync.providersWithAuthErrors >= AUTH_ERROR_THRESHOLD) {
      alerts.push({
        level: 'critical',
        type: 'auth_errors',
        message: `${stats.smartSync.providersWithAuthErrors} providers with auth errors`,
        value: stats.smartSync.providersWithAuthErrors,
        threshold: AUTH_ERROR_THRESHOLD,
      });
    }

    // Check webhook health
    const webhookHealth = await this.webhookLifecycle.getHealthStatus();
    const expiringSoon = webhookHealth.gmail.expiring + webhookHealth.microsoft.expiring;
    if (expiringSoon > 0) {
      alerts.push({
        level: 'warning',
        type: 'webhook_expiring',
        message: `${expiringSoon} webhooks expiring soon`,
        value: expiringSoon,
      });
    }

    // Check Redis connectivity
    if (!queueHealth.redisConnected) {
      alerts.push({
        level: 'critical',
        type: 'redis_disconnected',
        message: 'Redis connection lost',
      });
    }

    return {
      hasAlerts: alerts.length > 0,
      criticalCount: alerts.filter(a => a.level === 'critical').length,
      warningCount: alerts.filter(a => a.level === 'warning').length,
      alerts,
    };
  }
}
