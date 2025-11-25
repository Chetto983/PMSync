import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { createClient } from 'redis';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { QueueService, QueueMetricsSummary } from '../../email-sync/services/queue.service';
import { getConfiguration } from '../../../config/configuration';

@Injectable()
export class HealthService {
  private logger = new Logger(HealthService.name);
  private redisClient = createClient({
    url: getConfiguration().redis.url,
  });

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    @Optional() private queueService?: QueueService,
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

  getQueueMetricsPrometheus(): string {
    const metrics = this.getQueueMetrics();
    const lines: string[] = [];

    if (metrics.length === 0) {
      lines.push('# HELP email_sync_queue_info Email sync queue metrics (queue service disabled)');
      lines.push('# TYPE email_sync_queue_info gauge');
      lines.push('email_sync_queue_info 0');
      return `${lines.join('\n')}\n`;
    }

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

    return `${lines.join('\n')}\n`;
  }
}
