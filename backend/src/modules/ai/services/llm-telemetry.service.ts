import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface LlmCallContext {
  tenantId: string;
  userId?: string;
  operation: string;
  promptId?: string;
  promptName?: string;
  model: string;
  agentName?: string;
  sessionId?: string;
}

export interface LlmCallResult {
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  latencyMs: number;
  errorType?: string;
  errorMessage?: string;
}

export interface TelemetryStats {
  totalCalls: number;
  successRate: number;
  avgLatencyMs: number;
  totalTokens: number;
  estimatedCost: number;
  byOperation: Record<string, { count: number; avgLatency: number; tokens: number }>;
  byAgent: Record<string, { count: number; avgLatency: number; tokens: number }>;
}

// Cost per 1M tokens (approximate, varies by model)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'mistral-small-latest': { input: 0.2, output: 0.6 },
  'mistral-medium-latest': { input: 2.5, output: 7.5 },
  'mistral-large-latest': { input: 8, output: 24 },
  'mistral-embed': { input: 0.1, output: 0 },
};

@Injectable()
export class LlmTelemetryService {
  private readonly logger = new Logger(LlmTelemetryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Track an LLM call with timing and metrics.
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
      errorType = this.classifyError(error);
      errorMessage = error instanceof Error ? error.message : String(error);

      // Log error before rethrowing
      const latencyMs = Date.now() - startTime;
      const metrics: LlmCallResult = {
        success: false,
        latencyMs,
        errorType,
        errorMessage,
      };

      this.logUsage(context, metrics).catch((err) =>
        this.logger.warn(`Failed to log LLM usage: ${err.message}`),
      );

      this.logger.debug(
        `LLM call FAILED: ${context.operation} model=${context.model} ` +
          `latency=${latencyMs}ms error=${errorType}`,
      );

      throw error;
    }

    // Success path
    const latencyMs = Date.now() - startTime;
    const tokenUsage = this.extractTokenUsage(result);

    const metrics: LlmCallResult = {
      success: true,
      inputTokens: tokenUsage?.inputTokens,
      outputTokens: tokenUsage?.outputTokens,
      totalTokens: tokenUsage?.totalTokens,
      latencyMs,
    };

    // Log to database asynchronously (don't block the response)
    this.logUsage(context, metrics).catch((err) =>
      this.logger.warn(`Failed to log LLM usage: ${err.message}`),
    );

    // Log to console for debugging
    this.logger.debug(
      `LLM call: ${context.operation} model=${context.model} ` +
        `tokens=${metrics.totalTokens || 'N/A'} latency=${latencyMs}ms`,
    );

    return { result, metrics };
  }

  /**
   * Log LLM usage to database.
   */
  async logUsage(context: LlmCallContext, result: LlmCallResult): Promise<void> {
    const estimatedCost = this.calculateCost(
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
        errorMessage: result.errorMessage?.substring(0, 500), // Truncate
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
    const where: any = {
      tenantId,
    };

    if (params?.startDate || params?.endDate) {
      where.createdAt = {};
      if (params.startDate) {
        where.createdAt.gte = params.startDate;
      }
      if (params.endDate) {
        where.createdAt.lte = params.endDate;
      }
    }

    if (params?.operation) {
      where.operation = params.operation;
    }

    if (params?.agentName) {
      where.agentName = params.agentName;
    }

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

    // Group by operation
    const byOperation: Record<string, { count: number; avgLatency: number; tokens: number }> = {};
    const byAgent: Record<string, { count: number; avgLatency: number; tokens: number }> = {};

    for (const log of logs) {
      // By operation
      if (!byOperation[log.operation]) {
        byOperation[log.operation] = { count: 0, avgLatency: 0, tokens: 0 };
      }
      byOperation[log.operation].count++;
      byOperation[log.operation].tokens += log.totalTokens;
      byOperation[log.operation].avgLatency +=
        log.latencyMs / logs.filter((l) => l.operation === log.operation).length;

      // By agent
      const agent = log.agentName || 'unknown';
      if (!byAgent[agent]) {
        byAgent[agent] = { count: 0, avgLatency: 0, tokens: 0 };
      }
      byAgent[agent].count++;
      byAgent[agent].tokens += log.totalTokens;
    }

    // Calculate average latencies
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
      estimatedCost: Math.round(totalCost * 10000) / 10000, // 4 decimal places
      byOperation,
      byAgent,
    };
  }

  /**
   * Get daily usage for charts.
   */
  async getDailyUsage(
    tenantId: string,
    days: number = 30,
  ): Promise<
    Array<{
      date: string;
      calls: number;
      tokens: number;
      cost: number;
      avgLatency: number;
    }>
  > {
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

    // Group by date
    const byDate = new Map<
      string,
      { calls: number; tokens: number; cost: number; latency: number }
    >();

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
  async cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.prisma.llmUsageLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    this.logger.log(`Cleaned up ${result.count} LLM usage logs older than ${retentionDays} days`);
    return result.count;
  }

  private extractTokenUsage(
    result: any,
  ): { inputTokens: number; outputTokens: number; totalTokens: number } | null {
    if (!result) return null;

    // Mistral format
    if (result.usage) {
      return {
        inputTokens: result.usage.prompt_tokens || result.usage.inputTokens || 0,
        outputTokens: result.usage.completion_tokens || result.usage.outputTokens || 0,
        totalTokens: result.usage.total_tokens || result.usage.totalTokens || 0,
      };
    }

    // LangChain format
    if (result.llmOutput?.tokenUsage) {
      return {
        inputTokens: result.llmOutput.tokenUsage.promptTokens || 0,
        outputTokens: result.llmOutput.tokenUsage.completionTokens || 0,
        totalTokens: result.llmOutput.tokenUsage.totalTokens || 0,
      };
    }

    return null;
  }

  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const costs = MODEL_COSTS[model] || MODEL_COSTS['mistral-small-latest'];
    const inputCost = (inputTokens / 1_000_000) * costs.input;
    const outputCost = (outputTokens / 1_000_000) * costs.output;
    return inputCost + outputCost;
  }

  private classifyError(error: any): string {
    const message = error?.message?.toLowerCase() || '';

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

    return 'unknown';
  }
}
