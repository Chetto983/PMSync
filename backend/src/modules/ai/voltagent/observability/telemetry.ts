/**
 * VoltAgent LLM Telemetry - OpenTelemetry Aligned
 *
 * 2025 Best Practices:
 * - OpenTelemetry semantic conventions for GenAI
 * - Structured JSON logs with trace correlation
 * - Token usage and cost tracking
 * - Error classification for debugging
 *
 * Multi-tenancy & Performance (>1000 users):
 * - Batch writes to reduce DB pressure
 * - In-memory buffer with periodic flush
 * - Tenant isolation via indexed queries
 * - TTL-based cleanup for stale data
 *
 * References:
 * - https://opentelemetry.io/blog/2025/ai-agent-observability/
 * - https://opentelemetry.io/blog/2024/llm-observability/
 */
import { PrismaService } from '../../../../prisma/prisma.service';

/**
 * Batch write configuration for high throughput
 */
const BATCH_CONFIG = {
  /** Maximum items in buffer before forced flush */
  maxBufferSize: 100,
  /** Flush interval in milliseconds */
  flushIntervalMs: 5000,
  /** Maximum retries for failed writes */
  maxRetries: 3,
};

/**
 * LLM call context following OpenTelemetry GenAI semantic conventions
 */
export interface LlmCallContext {
  /** Tenant identifier for isolation */
  tenantId: string;
  /** User identifier */
  userId?: string;
  /** Operation name (e.g., "chat", "completion", "embedding") */
  operation: string;
  /** Prompt template ID if using registry */
  promptId?: string;
  /** Prompt template name */
  promptName?: string;
  /** Model identifier */
  model: string;
  /** Agent name if within VoltAgent */
  agentName?: string;
  /** Session/conversation ID */
  sessionId?: string;
  /** Parent span/trace ID for correlation */
  traceId?: string;
}

/**
 * LLM call result metrics
 */
export interface LlmCallResult {
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs: number;
  errorType?: string;
  errorMessage?: string;
}

/**
 * Telemetry statistics for a tenant
 */
export interface TelemetryStats {
  totalCalls: number;
  successRate: number;
  avgLatencyMs: number;
  totalTokens: number;
  estimatedCost: number;
  byOperation: Record<string, { count: number; avgLatency: number; tokens: number }>;
  byAgent: Record<string, { count: number; avgLatency: number; tokens: number }>;
}

/**
 * Model cost configuration (per 1M tokens)
 *
 * Note: Mistral API doesn't expose a programmatic pricing endpoint.
 * Pricing is only available via console.mistral.ai dashboard.
 * These values are based on https://mistral.ai/pricing (Dec 2024).
 *
 * Update this configuration when Mistral updates their pricing.
 * Costs can be overridden via environment variables:
 * - MISTRAL_COST_SMALL_INPUT / MISTRAL_COST_SMALL_OUTPUT
 * - MISTRAL_COST_MEDIUM_INPUT / MISTRAL_COST_MEDIUM_OUTPUT
 * - MISTRAL_COST_LARGE_INPUT / MISTRAL_COST_LARGE_OUTPUT
 */
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // Mistral models (prices per 1M tokens in USD)
  'mistral-small-latest': {
    input: parseFloat(process.env.MISTRAL_COST_SMALL_INPUT || '0.2'),
    output: parseFloat(process.env.MISTRAL_COST_SMALL_OUTPUT || '0.6'),
  },
  'mistral-medium-latest': {
    input: parseFloat(process.env.MISTRAL_COST_MEDIUM_INPUT || '2.5'),
    output: parseFloat(process.env.MISTRAL_COST_MEDIUM_OUTPUT || '7.5'),
  },
  'mistral-large-latest': {
    input: parseFloat(process.env.MISTRAL_COST_LARGE_INPUT || '8'),
    output: parseFloat(process.env.MISTRAL_COST_LARGE_OUTPUT || '24'),
  },
  'mistral-embed': {
    input: parseFloat(process.env.MISTRAL_COST_EMBED_INPUT || '0.1'),
    output: 0, // Embeddings have no output cost
  },
  // Codestral models
  'codestral-latest': {
    input: parseFloat(process.env.MISTRAL_COST_CODESTRAL_INPUT || '0.3'),
    output: parseFloat(process.env.MISTRAL_COST_CODESTRAL_OUTPUT || '0.9'),
  },
};

/**
 * Error classification for debugging and alerting
 */
export function classifyError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes('rate limit') || message.includes('429')) {
    return 'rate_limit';
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'timeout';
  }
  if (message.includes('invalid') || message.includes('parse')) {
    return 'invalid_response';
  }
  if (message.includes('auth') || message.includes('401') || message.includes('403')) {
    return 'auth_error';
  }
  if (message.includes('network') || message.includes('connection')) {
    return 'network_error';
  }
  if (message.includes('context') || message.includes('token')) {
    return 'context_length';
  }

  return 'unknown';
}

/**
 * Calculate estimated cost for an LLM call
 */
export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] || MODEL_COSTS['mistral-small-latest'];
  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;
  return inputCost + outputCost;
}

/**
 * Extract token usage from various response formats
 */
export function extractTokenUsage(
  result: unknown,
): { inputTokens: number; outputTokens: number; totalTokens: number } | null {
  if (!result || typeof result !== 'object') return null;

  const r = result as Record<string, unknown>;

  // Mistral format
  if (r.usage && typeof r.usage === 'object') {
    const usage = r.usage as Record<string, unknown>;
    return {
      inputTokens: (usage.prompt_tokens as number) || (usage.inputTokens as number) || 0,
      outputTokens: (usage.completion_tokens as number) || (usage.outputTokens as number) || 0,
      totalTokens: (usage.total_tokens as number) || (usage.totalTokens as number) || 0,
    };
  }

  // LangChain format
  if (r.llmOutput && typeof r.llmOutput === 'object') {
    const llmOutput = r.llmOutput as Record<string, unknown>;
    if (llmOutput.tokenUsage && typeof llmOutput.tokenUsage === 'object') {
      const tokenUsage = llmOutput.tokenUsage as Record<string, unknown>;
      return {
        inputTokens: (tokenUsage.promptTokens as number) || 0,
        outputTokens: (tokenUsage.completionTokens as number) || 0,
        totalTokens: (tokenUsage.totalTokens as number) || 0,
      };
    }
  }

  return null;
}

/**
 * Log entry for batch writes
 */
interface LogEntry {
  tenantId: string;
  userId?: string;
  operation: string;
  promptId?: string;
  promptName?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCost: number;
  success: boolean;
  errorType?: string;
  errorMessage?: string;
  agentName?: string;
  sessionId?: string;
}

/**
 * LLM Telemetry Service
 *
 * Tracks LLM calls, token usage, and costs following OpenTelemetry conventions.
 * Integrates with VoltAgent observability hooks.
 *
 * Multi-tenancy optimizations:
 * - Batch writes to reduce DB pressure (100 items or 5s interval)
 * - Non-blocking async logging
 * - Tenant-isolated queries via indexed tenantId
 */
export class LlmTelemetry {
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;

  constructor(private readonly prisma: PrismaService) {
    // Start periodic flush timer
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {});
    }, BATCH_CONFIG.flushIntervalMs);

    // Prevent timer from keeping process alive
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  /**
   * Flush buffered logs to database.
   * Uses batch insert for performance.
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) return;

    this.isFlushing = true;
    const toFlush = [...this.buffer];
    this.buffer = [];

    try {
      // Batch insert using createMany for performance
      await this.prisma.llmUsageLog.createMany({
        data: toFlush,
        skipDuplicates: true,
      });
    } catch {
      // On failure, re-queue items (with limit to prevent memory issues)
      if (this.buffer.length < BATCH_CONFIG.maxBufferSize * 2) {
        this.buffer.push(...toFlush);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Stop the telemetry service and flush remaining logs.
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  /**
   * Track an LLM call with timing and metrics.
   * Use this wrapper for all LLM API calls.
   */
  async trackCall<T>(
    context: LlmCallContext,
    fn: () => Promise<T>,
  ): Promise<{ result: T; metrics: LlmCallResult }> {
    const startTime = Date.now();
    let errorType: string | undefined;
    let errorMessage: string | undefined;
    let result: T | undefined;

    try {
      result = await fn();
    } catch (error) {
      errorType = classifyError(error);
      errorMessage = error instanceof Error ? error.message : String(error);

      const latencyMs = Date.now() - startTime;
      const metrics: LlmCallResult = {
        success: false,
        latencyMs,
        errorType,
        errorMessage,
      };

      // Log failure to buffer (non-blocking)
      this.logUsage(context, metrics);

      throw error;
    }

    const latencyMs = Date.now() - startTime;
    const tokenUsage = extractTokenUsage(result);

    const metrics: LlmCallResult = {
      success: true,
      inputTokens: tokenUsage?.inputTokens,
      outputTokens: tokenUsage?.outputTokens,
      totalTokens: tokenUsage?.totalTokens,
      latencyMs,
    };

    // Log success to buffer (non-blocking)
    this.logUsage(context, metrics);

    return { result, metrics };
  }

  /**
   * Log LLM usage to buffer for batch write.
   * Non-blocking for maximum throughput.
   */
  logUsage(context: LlmCallContext, result: LlmCallResult): void {
    const estimatedCost = calculateCost(
      context.model,
      result.inputTokens || 0,
      result.outputTokens || 0,
    );

    const entry: LogEntry = {
      tenantId: context.tenantId,
      userId: context.userId,
      operation: context.operation,
      promptId: context.promptId,
      promptName: context.promptName,
      model: context.model,
      inputTokens: result.inputTokens || 0,
      outputTokens: result.outputTokens || 0,
      totalTokens: result.totalTokens || 0,
      latencyMs: result.latencyMs,
      estimatedCost,
      success: result.success,
      errorType: result.errorType,
      errorMessage: result.errorMessage?.substring(0, 500),
      agentName: context.agentName,
      sessionId: context.sessionId,
    };

    this.buffer.push(entry);

    // Flush if buffer is full
    if (this.buffer.length >= BATCH_CONFIG.maxBufferSize) {
      this.flush().catch(() => {});
    }
  }

  /**
   * Legacy method for direct database write (slower, use logUsage for batch).
   */
  async logUsageDirect(context: LlmCallContext, result: LlmCallResult): Promise<void> {
    const estimatedCost = calculateCost(
      context.model,
      result.inputTokens || 0,
      result.outputTokens || 0,
    );

    await this.prisma.llmUsageLog.create({
      data: {
        tenantId: context.tenantId,
        userId: context.userId,
        operation: context.operation,
        promptId: context.promptId,
        promptName: context.promptName,
        model: context.model,
        inputTokens: result.inputTokens || 0,
        outputTokens: result.outputTokens || 0,
        totalTokens: result.totalTokens || 0,
        latencyMs: result.latencyMs,
        estimatedCost,
        success: result.success,
        errorType: result.errorType,
        errorMessage: result.errorMessage?.substring(0, 500),
        agentName: context.agentName,
        sessionId: context.sessionId,
      },
    });
  }

  /**
   * Get telemetry statistics for a tenant.
   */
  async getStats(
    tenantId: string,
    params?: {
      startDate?: Date;
      endDate?: Date;
      operation?: string;
      agentName?: string;
    },
  ): Promise<TelemetryStats> {
    const where: Record<string, unknown> = { tenantId };

    if (params?.startDate || params?.endDate) {
      where.createdAt = {};
      if (params.startDate) (where.createdAt as Record<string, Date>).gte = params.startDate;
      if (params.endDate) (where.createdAt as Record<string, Date>).lte = params.endDate;
    }
    if (params?.operation) where.operation = params.operation;
    if (params?.agentName) where.agentName = params.agentName;

    const logs = await this.prisma.llmUsageLog.findMany({
      where,
      select: {
        operation: true,
        agentName: true,
        latencyMs: true,
        totalTokens: true,
        estimatedCost: true,
        success: true,
      },
    });

    if (logs.length === 0) {
      return {
        totalCalls: 0,
        successRate: 0,
        avgLatencyMs: 0,
        totalTokens: 0,
        estimatedCost: 0,
        byOperation: {},
        byAgent: {},
      };
    }

    const successCount = logs.filter((l) => l.success).length;
    const totalLatency = logs.reduce((sum, l) => sum + l.latencyMs, 0);
    const totalTokens = logs.reduce((sum, l) => sum + l.totalTokens, 0);
    const totalCost = logs.reduce((sum, l) => sum + (l.estimatedCost || 0), 0);

    const byOperation: Record<string, { count: number; avgLatency: number; tokens: number }> = {};
    const byAgent: Record<string, { count: number; avgLatency: number; tokens: number }> = {};

    for (const log of logs) {
      // Group by operation
      if (!byOperation[log.operation]) {
        byOperation[log.operation] = { count: 0, avgLatency: 0, tokens: 0 };
      }
      byOperation[log.operation].count++;
      byOperation[log.operation].tokens += log.totalTokens;

      // Group by agent
      const agent = log.agentName || 'unknown';
      if (!byAgent[agent]) {
        byAgent[agent] = { count: 0, avgLatency: 0, tokens: 0 };
      }
      byAgent[agent].count++;
      byAgent[agent].tokens += log.totalTokens;
    }

    // Calculate averages
    for (const op of Object.keys(byOperation)) {
      const opLogs = logs.filter((l) => l.operation === op);
      byOperation[op].avgLatency = Math.round(
        opLogs.reduce((sum, l) => sum + l.latencyMs, 0) / opLogs.length,
      );
    }

    for (const agent of Object.keys(byAgent)) {
      const agentLogs = logs.filter((l) => (l.agentName || 'unknown') === agent);
      byAgent[agent].avgLatency = Math.round(
        agentLogs.reduce((sum, l) => sum + l.latencyMs, 0) / agentLogs.length,
      );
    }

    return {
      totalCalls: logs.length,
      successRate: successCount / logs.length,
      avgLatencyMs: Math.round(totalLatency / logs.length),
      totalTokens,
      estimatedCost: Math.round(totalCost * 10000) / 10000,
      byOperation,
      byAgent,
    };
  }

  /**
   * Get daily usage for charts.
   */
  async getDailyUsage(
    tenantId: string,
    days = 30,
  ): Promise<Array<{ date: string; calls: number; tokens: number; cost: number; avgLatency: number }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await this.prisma.llmUsageLog.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        totalTokens: true,
        estimatedCost: true,
        latencyMs: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const byDate = new Map<string, { calls: number; tokens: number; cost: number; latency: number }>();

    for (const log of logs) {
      const dateKey = log.createdAt.toISOString().split('T')[0];
      const existing = byDate.get(dateKey) || { calls: 0, tokens: 0, cost: 0, latency: 0 };
      existing.calls++;
      existing.tokens += log.totalTokens;
      existing.cost += log.estimatedCost || 0;
      existing.latency += log.latencyMs;
      byDate.set(dateKey, existing);
    }

    return Array.from(byDate.entries()).map(([date, data]) => ({
      date,
      calls: data.calls,
      tokens: data.tokens,
      cost: Math.round(data.cost * 10000) / 10000,
      avgLatency: Math.round(data.latency / data.calls),
    }));
  }

  /**
   * Cleanup old logs (retention policy).
   */
  async cleanupOldLogs(retentionDays = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.prisma.llmUsageLog.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    });

    return result.count;
  }
}

/**
 * Create a metrics callback for VoltAgent hooks that logs to database.
 * Use this to connect VoltAgent observability with LLM telemetry.
 */
export function createTelemetryCallback(
  prisma: PrismaService,
): (metrics: {
  agentName: string;
  operationId: string;
  tenantId: string;
  userId?: string;
  duration: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  toolCalls: number;
  success: boolean;
  error?: string;
  timestamp: number;
}) => void {
  return (metrics) => {
    const estimatedCost = calculateCost(
      'mistral-small-latest',
      metrics.promptTokens || 0,
      metrics.completionTokens || 0,
    );

    // Log asynchronously to avoid blocking
    prisma.llmUsageLog
      .create({
        data: {
          tenantId: metrics.tenantId,
          userId: metrics.userId,
          operation: 'agent_execution',
          model: 'mistral-small-latest',
          inputTokens: metrics.promptTokens || 0,
          outputTokens: metrics.completionTokens || 0,
          totalTokens: metrics.totalTokens || 0,
          latencyMs: metrics.duration,
          estimatedCost,
          success: metrics.success,
          errorMessage: metrics.error?.substring(0, 500),
          agentName: metrics.agentName,
          sessionId: metrics.operationId,
        },
      })
      .catch(() => {
        // Silently ignore logging failures
      });
  };
}
