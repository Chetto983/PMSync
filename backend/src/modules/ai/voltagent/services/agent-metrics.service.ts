/**
 * AgentMetricsService - Metrics Collection for VoltAgent Operations
 *
 * Extracted from VoltAgentService (2026-01-22) to separate concerns.
 * Handles buffering, Redis storage, Prometheus export, and retrieval of agent metrics.
 *
 * Design:
 * - In-memory buffer for batch writes (reduces Redis operations)
 * - Periodic flush to Redis (every 5 seconds)
 * - Per-agent keys for efficient querying
 * - Supports >1000 tenants with configurable buffer limits
 * - VOLT-04: Prometheus histograms/counters for /metrics endpoint (2026-02-06)
 *
 * Prometheus metrics exposed:
 * - ai_chat_response_duration_seconds: Chat response latency histogram
 * - ai_rag_query_duration_seconds: RAG retrieval latency histogram
 * - ai_tool_execution_duration_seconds: Tool execution latency histogram
 * - ai_requests_total: Total AI requests counter
 * - ai_errors_total: Total AI errors counter
 * - ai_tokens_total: Total tokens processed counter
 */
import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Histogram, Counter, Gauge } from 'prom-client';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { AgentMetrics, AI_METRIC_NAMES } from '../observability';

/**
 * Aggregated metrics statistics
 */
export interface MetricsStats {
  totalOperations: number;
  avgDuration: number;
  successRate: number;
  totalTokens: number;
}

/**
 * Timer handle for measuring operation duration.
 * Use end() when operation completes to record the metric.
 */
export interface MetricTimer {
  /** End the timer and record the duration */
  end: (status: 'success' | 'error') => void;
}

/**
 * Error type classification for error metrics.
 */
export type ErrorType = 'rate_limit' | 'timeout' | 'api_error' | 'internal' | 'validation';

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

    // VOLT-04: Prometheus metrics injection (2026-02-06)
    @Optional() @InjectMetric(AI_METRIC_NAMES.CHAT_DURATION)
    private readonly chatDuration?: Histogram<string>,

    @Optional() @InjectMetric(AI_METRIC_NAMES.FIRST_TOKEN_LATENCY)
    private readonly firstTokenLatency?: Histogram<string>,

    @Optional() @InjectMetric(AI_METRIC_NAMES.RAG_DURATION)
    private readonly ragDuration?: Histogram<string>,

    @Optional() @InjectMetric(AI_METRIC_NAMES.TOOL_DURATION)
    private readonly toolDuration?: Histogram<string>,

    @Optional() @InjectMetric(AI_METRIC_NAMES.REQUESTS_TOTAL)
    private readonly requestsTotal?: Counter<string>,

    @Optional() @InjectMetric(AI_METRIC_NAMES.ERRORS_TOTAL)
    private readonly errorsTotal?: Counter<string>,

    @Optional() @InjectMetric(AI_METRIC_NAMES.TOKENS_TOTAL)
    private readonly tokensTotal?: Counter<string>,

    @Optional() @InjectMetric(AI_METRIC_NAMES.ACTIVE_CONVERSATIONS)
    private readonly activeConversations?: Gauge<string>,

    @Optional() @InjectMetric(AI_METRIC_NAMES.RATE_LIMIT_HITS)
    private readonly rateLimitHits?: Counter<string>,
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

  // ============================================================================
  // VOLT-04: Prometheus Metrics Recording Methods (2026-02-06)
  // ============================================================================

  /**
   * Record chat response duration to Prometheus histogram.
   *
   * @param agent - Agent type (Supervisor, Actions, Intelligence)
   * @param model - LLM model used
   * @param status - success | error
   * @param intent - Detected intent category
   * @param durationSeconds - Duration in seconds
   */
  recordChatDuration(
    agent: string,
    model: string,
    status: 'success' | 'error',
    intent: string,
    durationSeconds: number,
  ): void {
    this.chatDuration?.labels(agent, model, status, intent).observe(durationSeconds);
    this.requestsTotal?.labels('chat', status).inc();
  }

  /**
   * Start a timer for chat response duration.
   * Returns a handle that can be ended to record the metric.
   *
   * @param agent - Agent type
   * @param model - LLM model
   * @param intent - Detected intent
   * @returns Timer handle with end() method
   */
  startChatTimer(agent: string, model: string, intent: string): MetricTimer {
    const startTime = process.hrtime.bigint();
    return {
      end: (status: 'success' | 'error') => {
        const durationNs = Number(process.hrtime.bigint() - startTime);
        const durationSeconds = durationNs / 1e9;
        this.recordChatDuration(agent, model, status, intent, durationSeconds);
      },
    };
  }

  /**
   * Record first token latency for streaming responses.
   *
   * @param agent - Agent type
   * @param model - LLM model
   * @param durationSeconds - Time to first token in seconds
   */
  recordFirstTokenLatency(agent: string, model: string, durationSeconds: number): void {
    this.firstTokenLatency?.labels(agent, model).observe(durationSeconds);
  }

  /**
   * Start a timer for first token latency.
   *
   * @param agent - Agent type
   * @param model - LLM model
   * @returns Timer handle
   */
  startFirstTokenTimer(agent: string, model: string): { end: () => void } {
    const startTime = process.hrtime.bigint();
    return {
      end: () => {
        const durationNs = Number(process.hrtime.bigint() - startTime);
        const durationSeconds = durationNs / 1e9;
        this.recordFirstTokenLatency(agent, model, durationSeconds);
      },
    };
  }

  /**
   * Record RAG query duration to Prometheus histogram.
   *
   * @param source - RAG source (emails, contacts, deadlines, etc.)
   * @param status - success | error
   * @param durationSeconds - Duration in seconds
   */
  recordRagDuration(
    source: string,
    status: 'success' | 'error',
    durationSeconds: number,
  ): void {
    this.ragDuration?.labels(source, status).observe(durationSeconds);
    this.requestsTotal?.labels('rag', status).inc();
  }

  /**
   * Start a timer for RAG query duration.
   *
   * @param source - RAG source
   * @returns Timer handle
   */
  startRagTimer(source: string): MetricTimer {
    const startTime = process.hrtime.bigint();
    return {
      end: (status: 'success' | 'error') => {
        const durationNs = Number(process.hrtime.bigint() - startTime);
        const durationSeconds = durationNs / 1e9;
        this.recordRagDuration(source, status, durationSeconds);
      },
    };
  }

  /**
   * Record tool execution duration to Prometheus histogram.
   *
   * @param tool - Tool name
   * @param status - success | error
   * @param durationSeconds - Duration in seconds
   */
  recordToolDuration(
    tool: string,
    status: 'success' | 'error',
    durationSeconds: number,
  ): void {
    this.toolDuration?.labels(tool, status).observe(durationSeconds);
    this.requestsTotal?.labels('tool', status).inc();
  }

  /**
   * Start a timer for tool execution.
   *
   * @param tool - Tool name
   * @returns Timer handle
   */
  startToolTimer(tool: string): MetricTimer {
    const startTime = process.hrtime.bigint();
    return {
      end: (status: 'success' | 'error') => {
        const durationNs = Number(process.hrtime.bigint() - startTime);
        const durationSeconds = durationNs / 1e9;
        this.recordToolDuration(tool, status, durationSeconds);
      },
    };
  }

  /**
   * Record an AI error to Prometheus counter.
   *
   * @param operation - Operation that failed (chat, rag, tool)
   * @param errorType - Error classification
   */
  recordError(operation: string, errorType: ErrorType): void {
    this.errorsTotal?.labels(operation, errorType).inc();
  }

  /**
   * Record token usage to Prometheus counter.
   *
   * @param tenantId - Tenant identifier
   * @param model - LLM model
   * @param promptTokens - Number of prompt tokens
   * @param completionTokens - Number of completion tokens
   */
  recordTokens(
    tenantId: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
  ): void {
    if (promptTokens > 0) {
      this.tokensTotal?.labels(tenantId, model, 'prompt').inc(promptTokens);
    }
    if (completionTokens > 0) {
      this.tokensTotal?.labels(tenantId, model, 'completion').inc(completionTokens);
    }
  }

  /**
   * Update active conversations gauge.
   *
   * @param tenantId - Tenant identifier
   * @param delta - Change in active conversations (+1 or -1)
   */
  updateActiveConversations(tenantId: string, delta: number): void {
    if (delta > 0) {
      this.activeConversations?.labels(tenantId).inc(delta);
    } else if (delta < 0) {
      this.activeConversations?.labels(tenantId).dec(Math.abs(delta));
    }
  }

  /**
   * Record a rate limit hit.
   *
   * @param tenantId - Tenant identifier
   * @param model - LLM model that hit rate limit
   */
  recordRateLimitHit(tenantId: string, model: string): void {
    this.rateLimitHits?.labels(tenantId, model).inc();
    this.recordError('chat', 'rate_limit');
  }
}
