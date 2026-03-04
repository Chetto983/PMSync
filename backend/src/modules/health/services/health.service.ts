import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { createClient } from 'redis';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { QueueService, QueueMetricsSummary } from '../../email-sync/services/queue.service';
import { SyncSchedulerService } from '../../email-sync/services/sync-scheduler.service';
import { getConfiguration } from '../../../config/configuration';
import { Prisma } from '@prisma/client';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping';

@Injectable()
export class HealthService {
  private logger = new Logger(HealthService.name);
  private redisClient = createClient({
    url: getConfiguration().redis.url,
  });

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(QueueService) private queueService?: QueueService,
    @Optional() @Inject(SyncSchedulerService) private syncScheduler?: SyncSchedulerService,
  ) {
    this.redisClient.connect().catch(() => {
      this.logger.warn('Redis health check client failed to connect');
    });
  }

  /**
   * Check overall system health
   */
  async getSystemHealth() {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {} as any,
    };

    // Check Database
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - start;
      health.services.database = { status: 'up', responseTime };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      health.services.database = { status: 'down', error: errorMessage };
      health.status = 'degraded';
    }

    // Check Redis
    try {
      const start = Date.now();
      await this.redisClient.ping();
      const responseTime = Date.now() - start;
      health.services.redis = { status: 'up', responseTime };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      health.services.redis = { status: 'down', error: errorMessage };
      health.status = 'degraded';
    }

    // Check Mistral API
    const mistralStatus = await this.checkMistral();
    health.services.mistral = mistralStatus.data;
    if (mistralStatus.status !== 'up' && mistralStatus.status !== 'disabled') {
      health.status = 'degraded';
    }

    // Collect queue metrics if available
    if (this.queueService) {
      const metrics = this.queueService.getQueueMetricsSummary();
      health.services.emailSyncQueue = this.buildQueueServiceHealth(metrics);
    }

    return health;
  }

  private async checkMistral(): Promise<{
    status: 'up' | 'down' | 'disabled';
    data: Record<string, unknown>;
  }> {
    const apiKey =
      this.configService.get<string>('MISTRAL_API_KEY') || process.env.MISTRAL_API_KEY;

    if (!apiKey) {
      return {
        status: 'disabled',
        data: {
          status: 'disabled',
          message: 'Mistral API key not configured',
        },
      };
    }

    const baseUrl =
      this.configService.get<string>('MISTRAL_API_BASE_URL') ||
      process.env.MISTRAL_API_BASE_URL ||
      'https://api.mistral.ai';
    const timeoutMs =
      Number(this.configService.get<number>('MISTRAL_HEALTH_TIMEOUT_MS')) ||
      Number(process.env.MISTRAL_HEALTH_TIMEOUT_MS) ||
      3000;

    const url = `${baseUrl.replace(/\/$/, '')}/v1/models`;
    const start = Date.now();

    try {
      const response = await axios.get(url, {
        timeout: timeoutMs,
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      const responseTime = Date.now() - start;
      const modelsCount = Array.isArray(response.data?.data)
        ? response.data.data.length
        : undefined;

      return {
        status: 'up',
        data: {
          status: 'up',
          responseTime,
          modelsCount,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Unknown error';

      const responseStatus = (error as any)?.response?.status;
      const responseData = (error as any)?.response?.data;

      return {
        status: 'down',
        data: {
          status: 'down',
          error: message,
          httpStatus: responseStatus,
          details: responseData,
        },
      };
    }
  }

  private buildQueueServiceHealth(metrics: QueueMetricsSummary[]) {
    const totalCompleted = metrics.reduce((acc, item) => acc + item.completed, 0);
    const totalFailed = metrics.reduce((acc, item) => acc + item.failed, 0);
    const status =
      totalFailed > 0 && totalCompleted === 0
        ? 'down'
        : totalFailed > 0
          ? 'degraded'
          : 'up';

    return {
      status,
      queues: metrics,
      totals: {
        completed: totalCompleted,
        failed: totalFailed,
      },
    };
  }

  getQueueMetrics(): QueueMetricsSummary[] {
    if (!this.queueService) {
      return [];
    }
    return this.queueService.getQueueMetricsSummary();
  }

  async getPrometheusMetrics(): Promise<string> {
    return withoutTenantScopingAsync(async () => {
    const metrics = this.getQueueMetrics();
    const lines: string[] = [];

    if (metrics.length === 0) {
      lines.push('# HELP email_sync_queue_info Email sync queue metrics (queue service disabled)');
      lines.push('# TYPE email_sync_queue_info gauge');
      lines.push('email_sync_queue_info 0');
    } else {
      lines.push('# HELP email_sync_queue_completed Total completed sync jobs per queue');
      lines.push('# TYPE email_sync_queue_completed counter');
      metrics.forEach((metric) => {
        lines.push(`email_sync_queue_completed{queue="${metric.queue}"} ${metric.completed}`);
      });

      lines.push('# HELP email_sync_queue_failed Total failed sync jobs per queue');
      lines.push('# TYPE email_sync_queue_failed counter');
      metrics.forEach((metric) => {
        lines.push(`email_sync_queue_failed{queue="${metric.queue}"} ${metric.failed}`);
      });

      lines.push('# HELP email_sync_queue_last_duration_ms Duration in ms of the last processed job per queue');
      lines.push('# TYPE email_sync_queue_last_duration_ms gauge');
      metrics.forEach((metric) => {
        const value = metric.lastDurationMs ?? 0;
        lines.push(`email_sync_queue_last_duration_ms{queue="${metric.queue}"} ${value}`);
      });

      lines.push('# HELP email_sync_queue_avg_duration_ms Average job duration in ms per queue');
      lines.push('# TYPE email_sync_queue_avg_duration_ms gauge');
      metrics.forEach((metric) => {
        const value = metric.averageDurationMs ?? 0;
        lines.push(`email_sync_queue_avg_duration_ms{queue="${metric.queue}"} ${value}`);
      });
    }

    // Queue depth (waiting/active/delayed) from BullMQ status
    if (this.queueService) {
      const status = await this.queueService.getQueueStatus();
      const totalWaiting = status.reduce((acc, s) => acc + s.waiting, 0);
      const totalDelayed = status.reduce((acc, s) => acc + s.delayed, 0);
      lines.push('# HELP email_sync_queue_waiting Jobs waiting per queue');
      lines.push('# TYPE email_sync_queue_waiting gauge');
      status.forEach((s) => lines.push(`email_sync_queue_waiting{queue="${s.queueName}"} ${s.waiting}`));
      lines.push('# HELP email_sync_queue_active Jobs active per queue');
      lines.push('# TYPE email_sync_queue_active gauge');
      status.forEach((s) => lines.push(`email_sync_queue_active{queue="${s.queueName}"} ${s.active}`));
      lines.push('# HELP email_sync_queue_delayed Jobs delayed per queue');
      lines.push('# TYPE email_sync_queue_delayed gauge');
      status.forEach((s) => lines.push(`email_sync_queue_delayed{queue="${s.queueName}"} ${s.delayed}`));

      lines.push('# HELP email_sync_queue_backlog_total Total waiting + delayed jobs across queues');
      lines.push('# TYPE email_sync_queue_backlog_total gauge');
      lines.push(`email_sync_queue_backlog_total ${totalWaiting + totalDelayed}`);

      const perProviderBacklog = await this.queueService.getBacklogByProvider();
      lines.push('# HELP email_sync_provider_backlog Waiting+delayed jobs per provider');
      lines.push('# TYPE email_sync_provider_backlog gauge');
      Object.entries(perProviderBacklog).forEach(([providerId, count]) => {
        lines.push(`email_sync_provider_backlog{providerId="${providerId}"} ${count}`);
      });
    }

    // Scheduler and provider summary metrics
    if (this.syncScheduler) {
      const stats = await this.syncScheduler.getSyncStats();
      lines.push('# HELP email_sync_providers_total Active providers participating in sync');
      lines.push('# TYPE email_sync_providers_total gauge');
      lines.push(`email_sync_providers_total ${stats.providers.total}`);

      lines.push('# HELP email_sync_providers_never_synced Providers that never synced');
      lines.push('# TYPE email_sync_providers_never_synced gauge');
      lines.push(`email_sync_providers_never_synced ${stats.providers.neverSynced}`);

      lines.push('# HELP email_sync_providers_synced_today Providers synced in last 24h');
      lines.push('# TYPE email_sync_providers_synced_today gauge');
      lines.push(`email_sync_providers_synced_today ${stats.providers.syncedToday}`);

      lines.push('# HELP email_sync_providers_error_streak Providers with error streak > 0');
      lines.push('# TYPE email_sync_providers_error_streak gauge');
      lines.push(`email_sync_providers_error_streak ${stats.smartSync.providersWithErrors}`);

      lines.push('# HELP email_sync_providers_auth_errors Providers with auth errors');
      lines.push('# TYPE email_sync_providers_auth_errors gauge');
      lines.push(`email_sync_providers_auth_errors ${stats.smartSync.providersWithAuthErrors}`);

      lines.push('# HELP email_sync_providers_backfill_needed Providers requiring backfill');
      lines.push('# TYPE email_sync_providers_backfill_needed gauge');
      lines.push(`email_sync_providers_backfill_needed ${stats.smartSync.providersNeedingBackfill}`);

      lines.push('# HELP email_sync_providers_delta_fallback Providers in delta fallback mode');
      lines.push('# TYPE email_sync_providers_delta_fallback gauge');
      lines.push(`email_sync_providers_delta_fallback ${stats.smartSync.providersWithDeltaFallback}`);

      lines.push('# HELP email_sync_scheduler_running Scheduler running flag (1/0)');
      lines.push('# TYPE email_sync_scheduler_running gauge');
      lines.push(`email_sync_scheduler_running ${stats.scheduler.isRunning ? 1 : 0}`);

      lines.push('# HELP email_sync_scheduler_batch_size Scheduler batch size');
      lines.push('# TYPE email_sync_scheduler_batch_size gauge');
      lines.push(`email_sync_scheduler_batch_size ${stats.scheduler.batchSize}`);

      lines.push('# HELP email_sync_scheduler_interval_minutes Scheduler interval minutes');
      lines.push('# TYPE email_sync_scheduler_interval_minutes gauge');
      lines.push(`email_sync_scheduler_interval_minutes ${stats.scheduler.intervalMinutes}`);

      // Last sync age
      const now = Date.now();
      const lastSyncAggregate = await this.prisma.providerConfig.aggregate({
        where: { isActive: true, lastSyncedAt: { not: null } },
        _min: { lastSyncedAt: true },
      });
      const oldest = lastSyncAggregate._min.lastSyncedAt
        ? (now - new Date(lastSyncAggregate._min.lastSyncedAt).getTime()) / 1000
        : 0;
      lines.push('# HELP email_sync_providers_max_last_sync_age_seconds Oldest lastSyncedAt among active providers');
      lines.push('# TYPE email_sync_providers_max_last_sync_age_seconds gauge');
      lines.push(`email_sync_providers_max_last_sync_age_seconds ${oldest}`);

      const neverSyncedCount = await this.prisma.providerConfig.count({
        where: { isActive: true, OR: [{ lastSyncedAt: null }, { lastSyncedAt: { equals: null as any } }] },
      });
      lines.push('# HELP email_sync_providers_missing_last_sync Providers with no lastSyncedAt');
      lines.push('# TYPE email_sync_providers_missing_last_sync gauge');
      lines.push(`email_sync_providers_missing_last_sync ${neverSyncedCount}`);

      const providers = await this.prisma.providerConfig.findMany({
        where: { isActive: true },
        select: { id: true, email: true, providerType: true, lastSyncedAt: true },
      });
      lines.push('# HELP email_sync_provider_last_sync_age_seconds Last sync age per provider');
      lines.push('# TYPE email_sync_provider_last_sync_age_seconds gauge');
      providers.forEach((p) => {
        const ageSec = p.lastSyncedAt
          ? Math.max(0, Math.round((now - new Date(p.lastSyncedAt).getTime()) / 1000))
          : 0;
        lines.push(
          `email_sync_provider_last_sync_age_seconds{providerId="${p.id}",email="${p.email}",providerType="${p.providerType}"} ${ageSec}`,
        );
      });

      // Webhook freshness (expires within 24h)
      try {
        const expiring = await this.prisma.webhookSubscription.count({
          where: {
            isActive: true,
            expiresAt: {
              lt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          },
        } as Prisma.WebhookSubscriptionCountArgs);
        lines.push('# HELP email_sync_webhooks_expiring_24h Webhooks expiring within 24h');
        lines.push('# TYPE email_sync_webhooks_expiring_24h gauge');
        lines.push(`email_sync_webhooks_expiring_24h ${expiring}`);

        const webhooks = await this.prisma.webhookSubscription.findMany({
          where: { isActive: true },
          select: { providerId: true, expiresAt: true, providerType: true },
        });
        lines.push('# HELP email_sync_webhook_expires_in_seconds Webhook expiry horizon per provider');
        lines.push('# TYPE email_sync_webhook_expires_in_seconds gauge');
        webhooks.forEach((w) => {
          const ttlSec = w.expiresAt
            ? Math.max(0, Math.round((new Date(w.expiresAt).getTime() - now) / 1000))
            : 0;
          lines.push(
            `email_sync_webhook_expires_in_seconds{providerId="${w.providerId}",providerType="${w.providerType}"} ${ttlSec}`,
          );
        });
      } catch (err) {
        this.logger.verbose(`Webhook subscription metrics skipped: ${(err as Error)?.message || err}`);
      }

      // Provider-type aggregates for new/deleted emails (last 24h and total deleted)
      const providerTypes: Array<'google' | 'microsoft' | 'imap'> = ['google', 'microsoft', 'imap'];
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      lines.push('# HELP email_sync_new_24h Emails created in last 24h per provider type');
      lines.push('# TYPE email_sync_new_24h gauge');
      lines.push('# HELP email_sync_deleted_total Emails currently marked deleted per provider type');
      lines.push('# TYPE email_sync_deleted_total gauge');

      for (const pt of providerTypes) {
        const created = await this.prisma.email.count({
          where: {
            createdAt: { gte: since },
            provider: { providerType: pt },
          },
        });
        const deleted = await this.prisma.email.count({
          where: {
            isDeleted: true,
            provider: { providerType: pt },
          },
        });
        lines.push(`email_sync_new_24h{providerType="${pt}"} ${created}`);
        lines.push(`email_sync_deleted_total{providerType="${pt}"} ${deleted}`);
      }

      // Rate-limit / throttle indicators from provider metadata
      const rateLimited = await this.prisma.providerConfig.count({
        where: {
          metadata: {
            path: ['lastRateLimitAt'],
            not: Prisma.JsonNull,
          },
        },
      });
      const throttled = await this.prisma.providerConfig.count({
        where: {
          metadata: {
            path: ['lastThrottleAt'],
            not: Prisma.JsonNull,
          },
        },
      });
      lines.push('# HELP email_sync_rate_limit_events Providers with recorded rate limit events');
      lines.push('# TYPE email_sync_rate_limit_events gauge');
      lines.push(`email_sync_rate_limit_events ${rateLimited}`);
      lines.push('# HELP email_sync_throttle_events Providers with recorded throttle events');
      lines.push('# TYPE email_sync_throttle_events gauge');
      lines.push(`email_sync_throttle_events ${throttled}`);
    }

    return `${lines.join('\n')}\n`;
    });
  }
}
