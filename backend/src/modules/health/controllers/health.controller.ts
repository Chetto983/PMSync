import { Controller, Get, Header, Param, Optional } from '@nestjs/common';
import { HealthService } from '../services/health.service';
import { QueueHealthService } from '../../../common/services/queue-health.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    @Optional() private readonly queueHealthService?: QueueHealthService,
  ) {}

  /**
   * Get system health status
   * GET /health
   */
  @Get()
  async getHealth() {
    return this.healthService.getSystemHealth();
  }

  /**
   * Ready probe
   */
  @Get('ready')
  async getReadiness() {
    return { status: 'ready' };
  }

  /**
   * Liveness probe
   */
  @Get('live')
  async getLiveness() {
    return { status: 'alive' };
  }

  /**
   * Queue metrics summary (JSON) - email sync queues
   */
  @Get('queues')
  async getQueueMetrics() {
    return this.healthService.getQueueMetrics();
  }

  /**
   * All queues health status (comprehensive)
   * GET /health/queues/all
   */
  @Get('queues/all')
  async getAllQueuesHealth() {
    if (!this.queueHealthService) {
      return { status: 'unavailable', message: 'QueueHealthService not available' };
    }
    return this.queueHealthService.getHealthStatus();
  }

  /**
   * Single queue status
   * GET /health/queues/:name
   */
  @Get('queues/:name')
  async getQueueStatus(@Param('name') name: string) {
    if (!this.queueHealthService) {
      return { status: 'unavailable', message: 'QueueHealthService not available' };
    }
    const status = await this.queueHealthService.getQueueStatus(name);
    if (!status) {
      return { status: 'not_found', message: `Queue '${name}' not found` };
    }
    return status;
  }

  /**
   * Prometheus-compatible metrics
   */
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getPrometheusMetrics() {
    // Combine email-sync metrics with all-queues metrics
    const emailSyncMetrics = await this.healthService.getPrometheusMetrics();

    if (this.queueHealthService) {
      const allQueuesMetrics = await this.queueHealthService.exportPrometheusText();
      return `${emailSyncMetrics}\n# All Queues Metrics\n${allQueuesMetrics}`;
    }

    return emailSyncMetrics;
  }
}
