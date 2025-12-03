import { Controller, Get, Header } from '@nestjs/common';
import { HealthService } from '../services/health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

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
   * Queue metrics summary (JSON)
   */
  @Get('queues')
  async getQueueMetrics() {
    return this.healthService.getQueueMetrics();
  }

  /**
   * Prometheus-compatible metrics
   */
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getPrometheusMetrics() {
    return this.healthService.getPrometheusMetrics();
  }
}
