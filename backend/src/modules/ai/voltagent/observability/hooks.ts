/**
 * VoltAgent Observability Hooks
 *
 * Lifecycle hooks for agent execution monitoring.
 * Uses VoltAgent's native createHooks() for type-safe hook creation.
 *
 * Production telemetry is auto-enabled via environment variables:
 * - VOLTAGENT_PUBLIC_KEY (pk_...)
 * - VOLTAGENT_SECRET_KEY (sk_...)
 *
 * @see https://voltagent.dev/docs/agents/hooks/
 */
import { createHooks, type AgentHooks } from '@voltagent/core';

export interface ObservabilityOptions {
  /** Logger instance for observability events */
  logger?: {
    info: (message: string, context?: Record<string, unknown>) => void;
    warn: (message: string, context?: Record<string, unknown>) => void;
    error: (message: string, context?: Record<string, unknown>) => void;
    debug: (message: string, context?: Record<string, unknown>) => void;
  };
  /** Enable detailed tool execution logging */
  logToolCalls?: boolean;
  /** Enable token usage tracking */
  trackUsage?: boolean;
  /** Custom metrics callback for external integrations */
  onMetrics?: (metrics: AgentMetrics) => void;
}

export interface AgentMetrics {
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
}

/**
 * Creates observability hooks for VoltAgent agents.
 *
 * These hooks integrate with:
 * - Local logging for debugging
 * - Token usage tracking
 * - External metrics systems
 */
/**
 * Extract tenantId from tenant-isolated userId format (tenantId:userId).
 */
function extractTenantId(userId?: string): string {
  if (!userId) return 'unknown';
  const parts = userId.split(':');
  return parts.length >= 2 ? parts[0] : 'unknown';
}

/**
 * Extract original userId from tenant-isolated format (tenantId:userId).
 */
function extractUserId(userId?: string): string | undefined {
  if (!userId) return undefined;
  const parts = userId.split(':');
  return parts.length >= 2 ? parts.slice(1).join(':') : userId;
}

/**
 * Operation tracking data for >1000 tenant scalability.
 * Uses operationId as key to prevent memory leaks.
 */
interface OperationTracking {
  startTime: number;
  toolCalls: number;
  tenantId: string;
  userId?: string;
}

export function createObservabilityHooks(options: ObservabilityOptions = {}): AgentHooks {
  const { logger, logToolCalls = true, trackUsage = true, onMetrics } = options;

  // Track operations with TTL cleanup for >1000 tenants
  const operations = new Map<string, OperationTracking>();

  // Cleanup stale operations every 60 seconds (operations older than 5 min)
  const OPERATION_TTL = 5 * 60 * 1000;
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [opId, data] of operations) {
      if (now - data.startTime > OPERATION_TTL) {
        operations.delete(opId);
      }
    }
  }, 60000);

  // Prevent interval from keeping process alive
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return createHooks({
    /**
     * Called before agent begins processing a request.
     * Use for initialization and request logging.
     */
    onStart: async ({ agent, context }) => {
      const operationId = context.operationId;
      const tenantId = extractTenantId(context.userId);
      const userId = extractUserId(context.userId);

      operations.set(operationId, {
        startTime: Date.now(),
        toolCalls: 0,
        tenantId,
        userId,
      });

      logger?.debug('Agent operation started', {
        agentName: agent.name,
        operationId,
        tenantId,
        userId,
        conversationId: context.conversationId,
      });
    },

    /**
     * Called after agent completes (success or failure).
     * Use for cleanup, logging, and metrics collection.
     */
    onEnd: async ({ agent, output, error, context }) => {
      const operationId = context.operationId;
      const opData = operations.get(operationId);
      const duration = opData ? Date.now() - opData.startTime : 0;
      const toolCalls = opData?.toolCalls || 0;
      const tenantId = opData?.tenantId || extractTenantId(context.userId);
      const userId = opData?.userId || extractUserId(context.userId);
      const timestamp = Date.now();

      // Clean up operation tracking
      operations.delete(operationId);

      if (error) {
        logger?.error('Agent operation failed', {
          agentName: agent.name,
          operationId,
          tenantId,
          duration,
          error: error.message,
          toolCalls,
        });
      } else {
        const usage = output?.usage;

        if (trackUsage && usage) {
          logger?.info('Agent operation completed', {
            agentName: agent.name,
            operationId,
            tenantId,
            duration,
            totalTokens: usage.totalTokens,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            toolCalls,
          });
        } else {
          logger?.debug('Agent operation completed', {
            agentName: agent.name,
            operationId,
            tenantId,
            duration,
            toolCalls,
          });
        }

        // Emit metrics if callback provided
        if (onMetrics) {
          onMetrics({
            agentName: agent.name,
            operationId,
            tenantId,
            userId,
            duration,
            totalTokens: usage?.totalTokens,
            promptTokens: usage?.promptTokens,
            completionTokens: usage?.completionTokens,
            toolCalls,
            success: true,
            timestamp,
          });
        }
      }

      // Emit error metrics if callback provided
      if (error && onMetrics) {
        onMetrics({
          agentName: agent.name,
          operationId,
          tenantId,
          userId,
          duration,
          toolCalls,
          success: false,
          error: error.message,
          timestamp,
        });
      }
    },

    /**
     * Called before tool execution.
     * Use for input validation and logging.
     */
    onToolStart: async ({ agent, tool, args, context }) => {
      if (!logToolCalls) return;

      const operationId = context.operationId;
      const opData = operations.get(operationId);
      if (opData) {
        opData.toolCalls++;
      }

      logger?.debug('Tool execution started', {
        agentName: agent.name,
        toolName: tool.name,
        operationId,
        // Sanitize args to avoid logging sensitive data
        argsKeys: args ? Object.keys(args as Record<string, unknown>) : [],
      });
    },

    /**
     * Called after tool execution or error.
     * Use for result logging and error handling.
     */
    onToolEnd: async ({ agent, tool, output, error, context }) => {
      if (!logToolCalls) return;

      if (error) {
        logger?.warn('Tool execution failed', {
          agentName: agent.name,
          toolName: tool.name,
          operationId: context.operationId,
          error: error.message,
        });
      } else {
        logger?.debug('Tool execution completed', {
          agentName: agent.name,
          toolName: tool.name,
          operationId: context.operationId,
          // Only log success indicator, not full output
          hasOutput: output !== undefined,
        });
      }
    },
  });
}

/**
 * Creates minimal hooks for production with low overhead.
 * Only tracks essential metrics without verbose logging.
 * Supports >1000 tenants with TTL-based cleanup.
 */
export function createProductionHooks(
  onMetrics?: (metrics: AgentMetrics) => void,
): AgentHooks {
  // Use same scalable tracking as createObservabilityHooks
  const operations = new Map<string, OperationTracking>();

  // Cleanup stale operations every 60 seconds
  const OPERATION_TTL = 5 * 60 * 1000;
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [opId, data] of operations) {
      if (now - data.startTime > OPERATION_TTL) {
        operations.delete(opId);
      }
    }
  }, 60000);

  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return createHooks({
    onStart: async ({ context }) => {
      const tenantId = extractTenantId(context.userId);
      const userId = extractUserId(context.userId);
      operations.set(context.operationId, {
        startTime: Date.now(),
        toolCalls: 0,
        tenantId,
        userId,
      });
    },

    onEnd: async ({ agent, output, error, context }) => {
      const operationId = context.operationId;
      const opData = operations.get(operationId);
      const duration = opData ? Date.now() - opData.startTime : 0;
      const toolCalls = opData?.toolCalls || 0;
      const tenantId = opData?.tenantId || extractTenantId(context.userId);
      const userId = opData?.userId || extractUserId(context.userId);
      const timestamp = Date.now();

      operations.delete(operationId);

      if (onMetrics) {
        onMetrics({
          agentName: agent.name,
          operationId,
          tenantId,
          userId,
          duration,
          totalTokens: output?.usage?.totalTokens,
          promptTokens: output?.usage?.promptTokens,
          completionTokens: output?.usage?.completionTokens,
          toolCalls,
          success: !error,
          error: error?.message,
          timestamp,
        });
      }
    },

    onToolStart: async ({ context }) => {
      const opData = operations.get(context.operationId);
      if (opData) {
        opData.toolCalls++;
      }
    },
  });
}
