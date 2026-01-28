/**
 * AgentMetricsService - Metrics Collection for VoltAgent Operations
 *
 * Extracted from VoltAgentService (2026-01-22) to separate concerns.
 * Handles buffering, Redis storage, and retrieval of agent metrics.
 *
 * Design:
 * - In-memory buffer for batch writes (reduces Redis operations)
 * - Periodic flush to Redis (every 5 seconds)
 * - Per-agent keys for efficient querying
 * - Supports >1000 tenants with configurable buffer limits
 */
import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { AgentMetrics } from '../observability';

/**
 * Aggregated metrics statistics
 */
export interface MetricsStats {
  totalOperations: number;
  avgDuration: number;
  successRate: number;
  totalTokens: number;
}

@Injectable()
export class AgentMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentMetricsService.name);

  /** In-memory buffer for batch Redis writes */
  private metricsBuffer: AgentMetrics[] = [];

  /** Batch size before Redis flush */
  private readonly maxMemoryBuffer = 50;

  /** Max metrics per agent in Redis (for >1000 tenants scalability) */
  private readonly maxRedisBuffer = 10000;

  /** Periodic flush interval handle */
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(CacheService) private readonly cacheService?: CacheService,
  ) {}

  onModuleInit(): void {
    // Start periodic flush interval (every 5 seconds)
    this.flushInterval = setInterval(() => {
      this.flushMetricsToRedis().catch((err) =>
        this.logger.error('Failed to flush metrics to Redis', err),
      );
    }, 5000);

    this.logger.log('AgentMetricsService initialized with 5s flush interval');
  }

  async onModuleDestroy(): Promise<void> {
    // Stop flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Flush remaining metrics to Redis before shutdown
    await this.flushMetricsToRedis();

    this.logger.log('AgentMetricsService shutdown complete');
  }

  /**
   * Collect metrics from agent operations.
   * Buffers in memory and bulk-writes to Redis for >1000 tenant scalability.
   *
   * @param metrics - Agent operation metrics to collect
   */
  collectMetrics(metrics: AgentMetrics): void {
    this.metricsBuffer.push(metrics);

    // Flush to Redis when buffer reaches threshold
    if (this.metricsBuffer.length >= this.maxMemoryBuffer) {
      this.flushMetricsToRedis().catch((err) =>
        this.logger.error('Failed to flush metrics to Redis', err),
      );
    }
  }

  /**
   * Flush metrics buffer to Redis using bulk operations.
   * Uses per-agent keys for efficient querying.
   */
  async flushMetricsToRedis(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    const metricsToFlush = [...this.metricsBuffer];
    this.metricsBuffer = [];

    if (!this.cacheService) {
      // Fallback: just log if no Redis
      this.logger.debug(`Metrics collected (no Redis): ${metricsToFlush.length} entries`);
      return;
    }

    // Group metrics by agent for efficient storage
    const metricsByAgent = new Map<string, AgentMetrics[]>();
    for (const metric of metricsToFlush) {
      const key = metric.agentName;
      if (!metricsByAgent.has(key)) {
        metricsByAgent.set(key, []);
      }
      metricsByAgent.get(key)!.push(metric);
    }

    // Bulk write to Redis per agent (pipeline)
    for (const [agentName, agentMetrics] of metricsByAgent) {
      const redisKey = `agent:${agentName}`;
      await this.cacheService.lpushAndTrim(
        redisKey,
        agentMetrics,
        this.maxRedisBuffer,
        { namespace: CacheNamespace.VOLTAGENT_METRICS },
      );
    }

    this.logger.debug(`Flushed ${metricsToFlush.length} metrics to Redis`);
  }

  /**
   * Get recent agent metrics for monitoring.
   * Retrieves from Redis for multi-instance support.
   *
   * @param agentName - Optional filter by agent name
   * @param limit - Maximum number of metrics to return (default: 100)
   * @returns Array of agent metrics
   */
  async getRecentMetrics(agentName?: string, limit = 100): Promise<AgentMetrics[]> {
    if (!this.cacheService) {
      // Fallback to in-memory buffer
      return [...this.metricsBuffer].slice(0, limit);
    }

    if (agentName) {
      // Get metrics for specific agent
      const redisKey = `agent:${agentName}`;
      return this.cacheService.lrange<AgentMetrics>(
        redisKey,
        0,
        limit - 1,
        { namespace: CacheNamespace.VOLTAGENT_METRICS },
      );
    }

    // Get metrics for all agents (SupervisorAgent is primary)
    const supervisorMetrics = await this.cacheService.lrange<AgentMetrics>(
      'agent:SupervisorAgent',
      0,
      limit - 1,
      { namespace: CacheNamespace.VOLTAGENT_METRICS },
    );

    return supervisorMetrics;
  }

  /**
   * Get aggregated metrics stats for an agent.
   *
   * @param agentName - Agent name to get stats for (default: 'SupervisorAgent')
   * @returns Aggregated statistics
   */
  async getMetricsStats(agentName = 'SupervisorAgent'): Promise<MetricsStats> {
    const metrics = await this.getRecentMetrics(agentName, 1000);

    if (metrics.length === 0) {
      return { totalOperations: 0, avgDuration: 0, successRate: 0, totalTokens: 0 };
    }

    const totalOperations = metrics.length;
    const avgDuration = metrics.reduce((sum, m) => sum + m.duration, 0) / totalOperations;
    const successRate = (metrics.filter((m) => m.success).length / totalOperations) * 100;
    const totalTokens = metrics.reduce((sum, m) => sum + (m.totalTokens || 0), 0);

    return { totalOperations, avgDuration, successRate, totalTokens };
  }

  /**
   * Get current buffer size (for monitoring/debugging).
   */
  getBufferSize(): number {
    return this.metricsBuffer.length;
  }

  /**
   * Force immediate flush (useful for testing or graceful shutdown).
   */
  async forceFlush(): Promise<void> {
    await this.flushMetricsToRedis();
  }
}
