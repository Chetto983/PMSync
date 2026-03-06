import { Controller, Get, Header, Inject, Param, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from '../services/health.service';
import { QueueHealthService } from '../../../common/services/queue-health.service';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(QueueHealthService) private readonly queueHealthService?: QueueHealthService,
  ) {}

  /**
   * Get system health status
   * GET /health
   */
  @Get()
  @ApiOperation({ summary: 'System health', description: 'Returns overall system health status' })
  @ApiResponse({ status: 200, description: 'System is healthy' })
  async getHealth() {
    return this.healthService.getSystemHealth();
  }

  /**
   * Ready probe
   */
  @Get('ready')
  @ApiOperation({ summary: 'Ready probe', description: 'Kubernetes readiness probe' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  async getReadiness() {
    return { status: 'ready' };
  }

  /**
   * Liveness probe
   */
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe', description: 'Kubernetes liveness probe' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  async getLiveness() {
    return { status: 'alive' };
  }

  /**
   * Queue metrics summary (JSON) - email sync queues
   */
  @Get('queues')
  @ApiOperation({ summary: 'Queue metrics', description: 'Returns email sync queue metrics' })
  @ApiResponse({ status: 200, description: 'Queue metrics returned' })
  async getQueueMetrics() {
    return this.healthService.getQueueMetrics();
  }

  /**
   * All queues health status (comprehensive)
   * GET /health/queues/all
   */
  @Get('queues/all')
  @ApiOperation({ summary: 'All queues health', description: 'Returns comprehensive queue health status' })
  @ApiResponse({ status: 200, description: 'All queues health returned' })
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
  @ApiOperation({ summary: 'Single queue status', description: 'Returns status for a specific queue' })
  @ApiParam({ name: 'name', description: 'Queue name' })
  @ApiResponse({ status: 200, description: 'Queue status returned' })
  @ApiResponse({ status: 404, description: 'Queue not found' })
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
   * @deprecated Use /metrics endpoint (prom-client) instead. Phase 46.
   * This hand-rolled Prometheus text endpoint will be removed in Phase 47 cleanup.
   */
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus metrics', description: 'Returns Prometheus-compatible metrics' })
  @ApiResponse({ status: 200, description: 'Metrics returned in Prometheus format' })
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
