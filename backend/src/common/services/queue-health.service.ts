import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  getSharedRedisConnection,
  releaseSharedRedisConnection,
  QUEUE_NAMES,
} from '../config';

/**
 * Queue status for a single queue
 */
export interface QueueStatus {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

/**
 * Overall queue health status
 */
export interface QueueHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  redis: {
    connected: boolean;
    latencyMs: number;
    memoryUsedMB: number;
    memoryPeakMB: number;
  };
  queues: QueueStatus[];
  summary: {
    totalWaiting: number;
    totalActive: number;
    totalFailed: number;
    totalQueues: number;
    healthyQueues: number;
  };
  timestamp: string;
}

/**
 * Prometheus-compatible metrics
 */
export interface QueueMetrics {
  queue_jobs_waiting: Array<{ queue: string; value: number }>;
  queue_jobs_active: Array<{ queue: string; value: number }>;
  queue_jobs_completed: Array<{ queue: string; value: number }>;
  queue_jobs_failed: Array<{ queue: string; value: number }>;
  queue_jobs_delayed: Array<{ queue: string; value: number }>;
  redis_memory_used_bytes: number;
  redis_connected_clients: number;
  redis_latency_ms: number;
}

/**
 * QueueHealthService
 *
 * Provides health checks and metrics for all BullMQ queues.
 * Integrates with health check endpoints and Prometheus metrics.
 *
 * Features:
 * - Real-time queue status monitoring
 * - Redis connection health
 * - Memory usage tracking
 * - Prometheus-compatible metrics export
 * - Degradation detection
 *
 * Usage:
 * ```typescript
 * // Get health status
 * const health = await queueHealthService.getHealthStatus();
 *
 * // Get Prometheus metrics
 * const metrics = await queueHealthService.getPrometheusMetrics();
 * ```
 */
@Injectable()
export class QueueHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueHealthService.name);
  private redisConnection: Redis;
  private queues: Map<string, Queue> = new Map();

  // Thresholds for health determination
  private readonly THRESHOLDS = {
    maxWaitingPerQueue: 1000,
    maxFailedPerQueue: 100,
    maxRedisLatencyMs: 100,
    maxRedisMemoryMB: 500,
  };

  async onModuleInit() {
    // Use shared Redis connection to prevent connection sprawl (AUDIT-03)
    this.redisConnection = getSharedRedisConnection();

    // Initialize queues for monitoring using shared connection
    const queueNames = Object.values(QUEUE_NAMES);
    for (const name of queueNames) {
      try {
        const queue = new Queue(name, {
          connection: this.redisConnection,
        });
        this.queues.set(name, queue);
      } catch (error) {
        this.logger.warn(`Failed to initialize queue ${name} for monitoring: ${error}`);
      }
    }

    this.logger.log(`Queue health monitoring initialized for ${this.queues.size} queues`);
  }

  /**
   * Get comprehensive health status for all queues
   */
  async getHealthStatus(): Promise<QueueHealthStatus> {
    const redisHealth = await this.checkRedisHealth();
    const queueStatuses = await this.getQueueStatuses();

    // Calculate summary
    const summary = {
      totalWaiting: 0,
      totalActive: 0,
      totalFailed: 0,
      totalQueues: queueStatuses.length,
      healthyQueues: 0,
    };

    for (const queue of queueStatuses) {
      summary.totalWaiting += queue.waiting;
      summary.totalActive += queue.active;
      summary.totalFailed += queue.failed;

      // A queue is healthy if it's not paused and not overloaded
      if (
        !queue.paused &&
        queue.waiting < this.THRESHOLDS.maxWaitingPerQueue &&
        queue.failed < this.THRESHOLDS.maxFailedPerQueue
      ) {
        summary.healthyQueues++;
      }
    }

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (!redisHealth.connected) {
      status = 'unhealthy';
    } else if (
      redisHealth.latencyMs > this.THRESHOLDS.maxRedisLatencyMs ||
      redisHealth.memoryUsedMB > this.THRESHOLDS.maxRedisMemoryMB
    ) {
      status = 'degraded';
    } else if (summary.healthyQueues < summary.totalQueues * 0.8) {
      status = 'degraded';
    } else if (summary.healthyQueues < summary.totalQueues * 0.5) {
      status = 'unhealthy';
    }

    return {
      status,
      redis: redisHealth,
      queues: queueStatuses,
      summary,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get individual queue status
   */
  async getQueueStatus(queueName: string): Promise<QueueStatus | null> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return null;
    }

    try {
      const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
        queue.isPaused(),
      ]);

      return {
        name: queueName,
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused: isPaused,
      };
    } catch (error) {
      this.logger.error(`Failed to get status for queue ${queueName}: ${error}`);
      return null;
    }
  }

  /**
   * Get all queue statuses
   */
  async getQueueStatuses(): Promise<QueueStatus[]> {
    const statuses: QueueStatus[] = [];

    for (const [name] of this.queues) {
      const status = await this.getQueueStatus(name);
      if (status) {
        statuses.push(status);
      }
    }

    return statuses;
  }

  /**
   * Check Redis connection health
   */
  async checkRedisHealth(): Promise<{
    connected: boolean;
    latencyMs: number;
    memoryUsedMB: number;
    memoryPeakMB: number;
  }> {
    try {
      // Measure latency
      const start = Date.now();
      await this.redisConnection.ping();
      const latencyMs = Date.now() - start;

      // Get memory info
      const info = await this.redisConnection.info('memory');
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const peakMatch = info.match(/used_memory_peak:(\d+)/);

      const memoryUsedMB = memoryMatch ? parseInt(memoryMatch[1]) / (1024 * 1024) : 0;
      const memoryPeakMB = peakMatch ? parseInt(peakMatch[1]) / (1024 * 1024) : 0;

      return {
        connected: true,
        latencyMs,
        memoryUsedMB: Math.round(memoryUsedMB * 100) / 100,
        memoryPeakMB: Math.round(memoryPeakMB * 100) / 100,
      };
    } catch (error) {
      this.logger.error(`Redis health check failed: ${error}`);
      return {
        connected: false,
        latencyMs: -1,
        memoryUsedMB: 0,
        memoryPeakMB: 0,
      };
    }
  }

  /**
   * Get Prometheus-compatible metrics
   */
  async getPrometheusMetrics(): Promise<QueueMetrics> {
    const queueStatuses = await this.getQueueStatuses();
    const redisHealth = await this.checkRedisHealth();

    // Get Redis client count
    let connectedClients = 0;
    try {
      const info = await this.redisConnection.info('clients');
      const clientsMatch = info.match(/connected_clients:(\d+)/);
      connectedClients = clientsMatch ? parseInt(clientsMatch[1]) : 0;
    } catch {
      // Ignore errors
    }

    return {
      queue_jobs_waiting: queueStatuses.map((q) => ({ queue: q.name, value: q.waiting })),
      queue_jobs_active: queueStatuses.map((q) => ({ queue: q.name, value: q.active })),
      queue_jobs_completed: queueStatuses.map((q) => ({ queue: q.name, value: q.completed })),
      queue_jobs_failed: queueStatuses.map((q) => ({ queue: q.name, value: q.failed })),
      queue_jobs_delayed: queueStatuses.map((q) => ({ queue: q.name, value: q.delayed })),
      redis_memory_used_bytes: redisHealth.memoryUsedMB * 1024 * 1024,
      redis_connected_clients: connectedClients,
      redis_latency_ms: redisHealth.latencyMs,
    };
  }

  /**
   * Export metrics in Prometheus text format
   */
  /**
   * @deprecated Use /metrics endpoint (prom-client) instead. Phase 46.
   * This hand-rolled Prometheus text generation will be removed in Phase 47 cleanup.
   */
  async exportPrometheusText(): Promise<string> {
    const metrics = await this.getPrometheusMetrics();
    const lines: string[] = [];

    // Queue metrics
    lines.push('# HELP queue_jobs_waiting Number of jobs waiting in queue');
    lines.push('# TYPE queue_jobs_waiting gauge');
    for (const m of metrics.queue_jobs_waiting) {
      lines.push(`queue_jobs_waiting{queue="${m.queue}"} ${m.value}`);
    }

    lines.push('# HELP queue_jobs_active Number of jobs currently being processed');
    lines.push('# TYPE queue_jobs_active gauge');
    for (const m of metrics.queue_jobs_active) {
      lines.push(`queue_jobs_active{queue="${m.queue}"} ${m.value}`);
    }

    lines.push('# HELP queue_jobs_completed Total number of completed jobs');
    lines.push('# TYPE queue_jobs_completed counter');
    for (const m of metrics.queue_jobs_completed) {
      lines.push(`queue_jobs_completed{queue="${m.queue}"} ${m.value}`);
    }

    lines.push('# HELP queue_jobs_failed Total number of failed jobs');
    lines.push('# TYPE queue_jobs_failed counter');
    for (const m of metrics.queue_jobs_failed) {
      lines.push(`queue_jobs_failed{queue="${m.queue}"} ${m.value}`);
    }

    lines.push('# HELP queue_jobs_delayed Number of delayed jobs');
    lines.push('# TYPE queue_jobs_delayed gauge');
    for (const m of metrics.queue_jobs_delayed) {
      lines.push(`queue_jobs_delayed{queue="${m.queue}"} ${m.value}`);
    }

    // Redis metrics
    lines.push('# HELP redis_memory_used_bytes Redis memory usage in bytes');
    lines.push('# TYPE redis_memory_used_bytes gauge');
    lines.push(`redis_memory_used_bytes ${metrics.redis_memory_used_bytes}`);

    lines.push('# HELP redis_connected_clients Number of connected Redis clients');
    lines.push('# TYPE redis_connected_clients gauge');
    lines.push(`redis_connected_clients ${metrics.redis_connected_clients}`);

    lines.push('# HELP redis_latency_ms Redis ping latency in milliseconds');
    lines.push('# TYPE redis_latency_ms gauge');
    lines.push(`redis_latency_ms ${metrics.redis_latency_ms}`);

    return lines.join('\n');
  }

  /**
   * Simple health check for load balancer probes
   */
  async isHealthy(): Promise<boolean> {
    try {
      const health = await this.getHealthStatus();
      return health.status !== 'unhealthy';
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    this.logger.log('Closing queue health monitoring connections...');

    // Close all queue connections
    for (const [name, queue] of this.queues) {
      try {
        await queue.close();
      } catch (error) {
        this.logger.debug(`Failed to close queue ${name}: ${error}`);
      }
    }
    this.queues.clear();

    // Release shared Redis connection reference (AUDIT-03)
    // Connection only closes when all references are released
    releaseSharedRedisConnection();

    this.logger.log('Queue health monitoring closed');
  }
}
