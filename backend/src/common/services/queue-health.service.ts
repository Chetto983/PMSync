import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { Redis } from 'ioredis';
import {
  getSharedRedisConnection,
  releaseSharedRedisConnection,
  QUEUE_NAMES,
} from '../config';
import { OpsAlertService } from './ops-alert.service';

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
 * Implementation (D-05/D-06/D-07, Phase 146 Plan 05):
 * - Does NOT instantiate BullMQ `Queue` objects for monitoring. Instead
 *   reads BullMQ's internal Redis keys directly via a single pipeline
 *   per queue (LLEN/ZCARD/HGET on `bull:{queueName}:{wait,active,
 *   completed,failed,delayed,meta}`). This eliminates ~30 Queue objects
 *   and their internal housekeeping (event listeners, Lua script loading).
 * - Uses the shared BullMQ Redis connection via `getSharedRedisConnection()`;
 *   no separate connection for monitoring.
 * - Public API surface (QueueStatus, QueueHealthStatus, QueueMetrics
 *   interfaces + all public methods) is preserved unchanged.
 *
 * Usage:
 * ```typescript
 * // Get health status
 * const health = await queueHealthService.getHealthStatus();
 * ```
 */
@Injectable()
export class QueueHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueHealthService.name);
  private redisConnection: Redis;
  // D-05: Track queue names only — no Queue object instantiation
  private queueNames: string[] = [];

  constructor(
    @Optional() @Inject(OpsAlertService) private readonly opsAlert?: OpsAlertService,
  ) {}

  // Thresholds for health determination
  private readonly THRESHOLDS = {
    maxWaitingPerQueue: 1000,
    maxFailedPerQueue: 100,
    maxRedisLatencyMs: 100,
    maxRedisMemoryMB: 500,
  };

  async onModuleInit() {
    // D-06: Use shared BullMQ Redis connection for monitoring
    this.redisConnection = getSharedRedisConnection();
    // D-05: Store queue names only — no Queue objects needed
    this.queueNames = Object.values(QUEUE_NAMES);
    this.logger.log(
      `Queue health monitoring initialized for ${this.queueNames.length} queues (direct Redis)`,
    );
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

      // T-1703: Queue depth alert — log warning at 80% capacity
      const depthPct = queue.waiting / this.THRESHOLDS.maxWaitingPerQueue;
      if (depthPct >= 0.8) {
        const msg = `Queue "${queue.name}" at ${(depthPct * 100).toFixed(0)}% capacity (${queue.waiting}/${this.THRESHOLDS.maxWaitingPerQueue})`;
        this.logger.warn(`[T-1703-ALERT] ${msg}`);
        // T-1801: Fire ops alert to external channel
        void this.opsAlert?.fire({
          level: depthPct >= 0.95 ? 'critical' : 'warning',
          source: 'queue-backpressure',
          message: msg,
          metadata: { queue: queue.name, waiting: queue.waiting, pct: `${(depthPct * 100).toFixed(0)}%` },
        });
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
   * Get individual queue status via direct Redis commands.
   *
   * BullMQ internal key patterns (verified from getCounts-1.lua + hexdocs):
   *   bull:{queueName}:wait       -> LIST       -> LLEN
   *   bull:{queueName}:active     -> LIST       -> LLEN
   *   bull:{queueName}:completed  -> SORTED SET -> ZCARD
   *   bull:{queueName}:failed     -> SORTED SET -> ZCARD
   *   bull:{queueName}:delayed    -> SORTED SET -> ZCARD
   *   bull:{queueName}:meta       -> HASH       -> HGET 'paused' (1/'1' = paused)
   *
   * Pipelined in a single round-trip per queue.
   */
  async getQueueStatus(queueName: string): Promise<QueueStatus | null> {
    if (!this.queueNames.includes(queueName)) {
      return null;
    }

    const prefix = `bull:${queueName}`;
    try {
      const pipeline = this.redisConnection.pipeline();
      pipeline.llen(`${prefix}:wait`);       // [0] waiting
      pipeline.llen(`${prefix}:active`);     // [1] active
      pipeline.zcard(`${prefix}:completed`); // [2] completed
      pipeline.zcard(`${prefix}:failed`);    // [3] failed
      pipeline.zcard(`${prefix}:delayed`);   // [4] delayed
      pipeline.hget(`${prefix}:meta`, 'paused'); // [5] paused state

      const results = await pipeline.exec();
      if (!results) return null;

      // Pause detection: BullMQ stores paused state in meta hash.
      // Redis HGET returns a string, but ioredis pipeline results can
      // vary in type — defensive guard handles both integer and string.
      const pausedValue = results[5]?.[1];
      const paused = pausedValue === 1 || pausedValue === '1';

      return {
        name: queueName,
        waiting: (results[0]?.[1] as number) || 0,
        active: (results[1]?.[1] as number) || 0,
        completed: (results[2]?.[1] as number) || 0,
        failed: (results[3]?.[1] as number) || 0,
        delayed: (results[4]?.[1] as number) || 0,
        paused,
      };
    } catch (error) {
      this.logger.error(`Failed to get status for queue ${queueName}: ${error}`);
      return null;
    }
  }

  /**
   * Get all queue statuses in parallel.
   *
   * Each queue status is a single pipelined Redis round-trip, so
   * running them concurrently via Promise.all means total wall time
   * is dominated by the slowest queue rather than the sum of all.
   */
  async getQueueStatuses(): Promise<QueueStatus[]> {
    const statuses: QueueStatus[] = [];

    const results = await Promise.all(
      this.queueNames.map((name) => this.getQueueStatus(name)),
    );

    for (const status of results) {
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
    this.logger.log('Closing queue health monitoring...');

    // D-05: No Queue objects to close — just release the shared connection ref.
    // Connection only closes when all references across the app are released.
    this.queueNames = [];
    releaseSharedRedisConnection();

    this.logger.log('Queue health monitoring closed');
  }
}
