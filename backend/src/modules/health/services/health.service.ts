import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { createClient } from 'redis';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { QueueService, QueueMetricsSummary } from '../../email-sync/services/queue.service';
import { CalendarSyncQueueService } from '../../calendar/services/calendar-sync-queue.service';
import { SyncSchedulerService } from '../../email-sync/services/sync-scheduler.service';
import { getConfiguration, getRedisNodeConnectionOptions } from '../../../config/configuration';
import { Prisma } from '@prisma/client';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping';
import { OpsAlertService } from '../../../common/services/ops-alert.service';

@Injectable()
export class HealthService {
  private logger = new Logger(HealthService.name);
  private redisClient = createClient(getRedisNodeConnectionOptions(getConfiguration().redis));

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(QueueService) private queueService?: QueueService,
    @Optional() @Inject(SyncSchedulerService) private syncScheduler?: SyncSchedulerService,
    @Optional() @Inject(OpsAlertService) private opsAlert?: OpsAlertService,
    @Optional() @Inject(CalendarSyncQueueService) private calendarSyncQueue?: CalendarSyncQueueService,
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

    // T-0204: Calendar sync queue DLQ monitoring
    if (this.calendarSyncQueue) {
      try {
        const calMetrics = this.calendarSyncQueue.getAllMetrics();
        const totalFailed = calMetrics.reduce((sum, m) => sum + m.failed, 0);
        const totalCompleted = calMetrics.reduce((sum, m) => sum + m.completed, 0);
        const dlqThreshold = Number(this.configService.get<number>('CALENDAR_SYNC_DLQ_THRESHOLD', 10));

        health.services.calendarSyncQueue = {
          status: totalFailed >= dlqThreshold ? 'degraded' : 'up',
          metrics: calMetrics,
          dlq: { failed: totalFailed, threshold: dlqThreshold },
          totals: { completed: totalCompleted, failed: totalFailed },
        };

        if (totalFailed >= dlqThreshold) {
          const msg = `Calendar sync DLQ depth ${totalFailed} exceeds threshold ${dlqThreshold}`;
          this.logger.error(`[T-0204-ALERT] ${msg}`);
          void this.opsAlert?.fire({
            level: totalFailed >= dlqThreshold * 2 ? 'critical' : 'warning',
            source: 'calendar-sync-dlq',
            message: msg,
            metadata: { totalFailed, threshold: dlqThreshold },
          });
          health.status = 'degraded';
        }
      } catch (err) {
        this.logger.warn(`Calendar sync queue health check failed: ${(err as Error)?.message}`);
        health.services.calendarSyncQueue = { status: 'unavailable' };
      }
    }

    // T-1703: Driver-specific health summary (active accounts + last sync per provider type)
    try {
      const driverHealth = await this.getDriverHealth();
      health.services.drivers = driverHealth;
    } catch (err) {
      this.logger.warn(`Driver health check failed: ${(err as Error)?.message}`);
      health.services.drivers = { status: 'unavailable' };
    }

    // T-1703: Worker health summary with alerts
    try {
      const { BaseWorker: BW } = await import('../../../common/workers/base.worker');
      const workers = BW.getAll();
      const statuses = workers.map((w) => w.getStatus());
      const anyAutoPaused = statuses.some((s) => s.autoPaused);
      const totalErrors5m = statuses.reduce((sum, s) => sum + s.errorCount5m, 0);
      const totalStalled5m = statuses.reduce((sum, s) => sum + s.stalledCount5m, 0);

      health.services.workers = {
        status: anyAutoPaused ? 'degraded' : 'healthy',
        totalWorkers: statuses.length,
        totalErrors5m,
        totalStalled5m,
        autoPausedCount: statuses.filter((s) => s.autoPaused).length,
      };

      // T-1703: Worker failure rate alert — log error if > 5% failure rate
      if (this.queueService) {
        const queueMetrics = this.queueService.getQueueMetricsSummary();
        for (const m of queueMetrics) {
          const total = m.completed + m.failed;
          if (total > 0) {
            const failureRate = m.failed / total;
            if (failureRate > 0.05) {
              const msg = `Queue "${m.queue}" failure rate ${(failureRate * 100).toFixed(1)}% (${m.failed}/${total}) exceeds 5% threshold`;
              this.logger.error(`[T-1703-ALERT] ${msg}`);
              // T-1801: Fire ops alert
              void this.opsAlert?.fire({
                level: failureRate > 0.2 ? 'critical' : 'warning',
                source: 'worker-failure-rate',
                message: msg,
                metadata: { queue: m.queue, failureRate: `${(failureRate * 100).toFixed(1)}%`, failed: m.failed, total },
              });
              health.status = 'degraded';
            }
          }
        }
      }

      if (anyAutoPaused) {
        health.status = 'degraded';
      }
    } catch (err) {
      this.logger.warn(`Worker health check failed: ${(err as Error)?.message}`);
    }

    return health;
  }

  /**
   * T-1703: Driver-specific health — active accounts + last sync per provider type.
   */
  private async getDriverHealth() {
    const providerTypes = ['google', 'microsoft', 'imap'] as const;
    const drivers: Record<string, { status: string; activeAccounts: number; lastSync: string | null }> = {};

    for (const pt of providerTypes) {
      const activeCount = await this.prisma.providerConfig.count({
        where: { providerType: pt, isActive: true },
      });

      const latest = await this.prisma.providerConfig.findFirst({
        where: { providerType: pt, isActive: true, lastSyncedAt: { not: null } },
        orderBy: { lastSyncedAt: 'desc' },
        select: { lastSyncedAt: true },
      });

      drivers[pt] = {
        status: activeCount > 0 ? 'ok' : 'no_accounts',
        activeAccounts: activeCount,
        lastSync: latest?.lastSyncedAt?.toISOString() ?? null,
      };
    }

    return drivers;
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

  /**
   * Check label-folder consistency for Google provider emails.
   * Re-derives folder from Email.labels[] and compares against Email.folder.
   * Optionally scoped to a single tenant.
   */
  async checkLabelConsistency(tenantId?: string) {
    return withoutTenantScopingAsync(async () => {
      const where: Prisma.EmailWhereInput = {
        provider: { providerType: 'google' },
        isDeleted: false,
        ...(tenantId ? { tenantId } : {}),
      };

      const totalEmails = await this.prisma.email.count({ where });

      // Batch-check in chunks to avoid memory pressure
      const batchSize = 1000;
      let offset = 0;
      let consistent = 0;
      let inconsistent = 0;
      const samples: Array<{
        emailId: string;
        subject: string;
        currentFolder: string;
        derivedFolder: string;
        labels: string[];
      }> = [];

      while (offset < totalEmails) {
        const emails = await this.prisma.email.findMany({
          where,
          select: {
            id: true,
            subject: true,
            folder: true,
            labels: true,
          },
          skip: offset,
          take: batchSize,
          orderBy: { receivedAt: 'desc' },
        });

        for (const email of emails) {
          const labels = (email.labels) || [];
          const derived = this.deriveFolderFromLabels(labels);
          if (email.folder === derived) {
            consistent++;
          } else {
            inconsistent++;
            if (samples.length < 20) {
              samples.push({
                emailId: email.id,
                subject: (email.subject || '').slice(0, 80),
                currentFolder: email.folder,
                derivedFolder: derived,
                labels,
              });
            }
          }
        }

        offset += batchSize;
      }

      return {
        totalEmails,
        consistent,
        inconsistent,
        consistencyRate: totalEmails > 0
          ? `${((consistent / totalEmails) * 100).toFixed(2)}%`
          : 'N/A',
        samples,
        checkedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Mirror of gmail-message.service.ts::determineFolderFromLabels()
   * Must be kept in sync with that method.
   */
  private deriveFolderFromLabels(labelIds: string[]): string {
    if (labelIds.includes('TRASH')) return 'TRASH';
    if (labelIds.includes('SPAM')) return 'SPAM';
    if (labelIds.includes('SENT')) return 'SENT';
    if (labelIds.includes('DRAFT')) return 'DRAFTS';

    const categoryLabel = labelIds.find((l) => l.startsWith('CATEGORY_'));
    if (categoryLabel) {
      const categoryMap: Record<string, string> = {
        CATEGORY_PERSONAL: 'INBOX',
        CATEGORY_SOCIAL: 'SOCIAL',
        CATEGORY_PROMOTIONS: 'PROMOTIONS',
        CATEGORY_UPDATES: 'UPDATES',
        CATEGORY_FORUMS: 'FORUMS',
      };
      if (categoryMap[categoryLabel]) return categoryMap[categoryLabel];
    }

    if (labelIds.includes('INBOX')) return 'INBOX';

    // C2 fix: absence of INBOX = archived
    return 'ARCHIVE';
  }

}
