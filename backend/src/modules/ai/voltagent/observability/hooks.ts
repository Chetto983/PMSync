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
import { sanitizeLlmResponse } from '../services/chat-context-builder.service';

/**
 * HITL pending action data captured from tool results
 */
export interface HitlPendingAction {
  agentName: string;
  toolName: string;
  tenantId: string;
  userId?: string;
  sessionId?: string;
  actionType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  payload: Record<string, unknown>;
  summary: string;
  confidence?: number;
}

/**
 * Tool metrics data for Prometheus instrumentation
 */
export interface ToolMetrics {
  toolName: string;
  durationSeconds: number;
  status: 'success' | 'error';
  agentName: string;
}

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
  /**
   * Callback for HITL pending actions from tool results.
   * Called when any tool returns { requiresApproval: true, ... }
   * This captures sub-agent tool results that would otherwise be lost during delegation.
   */
  onPendingAction?: (action: HitlPendingAction) => Promise<void>;
  /**
   * VOLT-04: Callback for tool execution metrics (Prometheus).
   * Called on every tool completion with duration and status.
   */
  onToolMetrics?: (metrics: ToolMetrics) => void;
  /**
   * AUDIT-02: Callback for audit logging of tool executions.
   * Called on every tool completion to persist to audit_logs.
   */
  onAuditToolExecution?: (data: {
    tenantId: string;
    userId?: string;
    toolName: string;
    agentName: string;
    inputSummary: string;
    outputSummary: string;
    durationMs: number;
    status: 'success' | 'error';
  }) => void;
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
 * Disposable hooks with cleanup method to prevent memory leaks.
 * CRITICAL: Call cleanup() in onModuleDestroy to prevent interval accumulation.
 */
export interface DisposableHooks {
  hooks: AgentHooks;
  cleanup: () => void;
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

export function createObservabilityHooks(options: ObservabilityOptions = {}): DisposableHooks {
  const { logger, logToolCalls = true, trackUsage = true, onMetrics, onPendingAction, onToolMetrics, onAuditToolExecution } = options;

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

  const hooks = createHooks({
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
     * Called before messages are sent to the LLM.
     * Strip internal markers to avoid accidental leakage in model prompts.
     */
    onPrepareMessages: ({ messages }) => {
      if (!messages || messages.length === 0) {
        return { messages };
      }

      const sanitized = messages.map((message) => {
        if (!message.parts) return message;
        const parts = message.parts.map((part) => {
          if (part.type === 'text' && typeof part.text === 'string') {
            return { ...part, text: sanitizeLlmResponse(part.text) };
          }
          return part;
        });
        return { ...message, parts };
      });

      return { messages: sanitized };
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

      // Store tool start time for duration calculation
      const toolStartKey = `${operationId}:${tool.name}:${Date.now()}`;
      (context as Record<string, unknown>).__toolStartTime = Date.now();
      (context as Record<string, unknown>).__toolStartKey = toolStartKey;
      // AUDIT-02: Store args for audit logging in onToolEnd
      (context as Record<string, unknown>).__toolArgs = args;

      // PERF: Log at info level to see tool names in production logs
      logger?.info(`[PERF] Tool START: ${tool.name} | agent=${agent.name}`, {
        agentName: agent.name,
        toolName: tool.name,
        operationId,
        argsKeys: args ? Object.keys(args as Record<string, unknown>) : [],
      });
    },

    /**
     * Called after tool execution or error.
     * Use for result logging, error handling, and HITL pending action capture.
     *
     * CRITICAL: This hook captures requiresApproval tool results from sub-agents
     * that would otherwise be lost during delegate_task execution.
     *
     * VOLT-04: Records tool metrics for Prometheus instrumentation.
     */
    onToolEnd: async ({ agent, tool, output, error, context }) => {
      // Calculate tool duration
      const toolStartTime = (context as Record<string, unknown>).__toolStartTime as number | undefined;
      const toolDuration = toolStartTime ? Date.now() - toolStartTime : 0;
      const toolDurationSeconds = toolDuration / 1000;

      // VOLT-04: Record tool metrics via callback (for Prometheus)
      if (onToolMetrics) {
        onToolMetrics({
          toolName: tool.name,
          durationSeconds: toolDurationSeconds,
          status: error ? 'error' : 'success',
          agentName: agent.name,
        });
      }

      // AUDIT-02: Record tool execution to audit log
      if (onAuditToolExecution) {
        const tenantId = extractTenantId(context.userId);
        const userId = extractUserId(context.userId);
        const args = (context as Record<string, unknown>).__toolArgs as Record<string, unknown> | undefined;
        const inputKeys = args ? Object.keys(args).join(', ') : '';
        const outputStr = output ? JSON.stringify(output).slice(0, 200) : '';
        onAuditToolExecution({
          tenantId,
          userId,
          toolName: tool.name,
          agentName: agent.name,
          inputSummary: `args: [${inputKeys}]`.slice(0, 200),
          outputSummary: outputStr,
          durationMs: toolDuration,
          status: error ? 'error' : 'success',
        });
      }

      // PERF: Log tool completion with duration
      logger?.info(`[PERF] Tool END: ${tool.name} | duration=${toolDuration}ms | agent=${agent.name} | error=${!!error}`, {
        agentName: agent.name,
        toolName: tool.name,
        duration: toolDuration,
        hasOutput: output !== undefined,
        hasError: !!error,
      });

      // DEBUG: Always log tool completion for HITL debugging
      logger?.debug('[HITL DEBUG] onToolEnd called', {
        agentName: agent.name,
        toolName: tool.name,
        hasOutput: output !== undefined,
        outputType: typeof output,
        outputKeys: output && typeof output === 'object' ? Object.keys(output) : [],
        hasError: !!error,
        contextUserId: context.userId,
        contextConversationId: context.conversationId,
      });

      if (error) {
        if (logToolCalls) {
          logger?.warn('Tool execution failed', {
            agentName: agent.name,
            toolName: tool.name,
            operationId: context.operationId,
            error: error.message,
            duration: toolDuration,
          });
        }
        return;
      }

      // Check if tool returned a pending action that needs HITL approval
      const result = output as Record<string, unknown> | undefined;
      // DEBUG: Log whether requiresApproval is present
      logger?.debug('[HITL DEBUG] Checking requiresApproval', {
        hasResult: !!result,
        requiresApproval: result?.requiresApproval,
        hasOnPendingAction: !!onPendingAction,
        toolName: tool.name,
      });
      if (result?.requiresApproval && onPendingAction) {
        const tenantId = extractTenantId(context.userId);
        const userId = extractUserId(context.userId);

        logger?.info('HITL pending action captured from tool', {
          agentName: agent.name,
          toolName: tool.name,
          operationId: context.operationId,
          actionType: result.actionType,
          severity: result.severity,
          tenantId,
        });

        // Call the pending action callback to persist to database
        try {
          await onPendingAction({
            agentName: agent.name,
            toolName: tool.name,
            tenantId,
            userId,
            sessionId: context.conversationId,
            actionType: result.actionType as string,
            severity: result.severity as 'LOW' | 'MEDIUM' | 'HIGH',
            payload: result.payload as Record<string, unknown>,
            summary: result.summary as string,
            confidence: result.confidence as number | undefined,
          });
        } catch (err) {
          logger?.error('Failed to create HITL pending action', {
            agentName: agent.name,
            toolName: tool.name,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (logToolCalls) {
        logger?.debug('Tool execution completed', {
          agentName: agent.name,
          toolName: tool.name,
          operationId: context.operationId,
          hasOutput: output !== undefined,
          requiresApproval: !!result?.requiresApproval,
        });
      }
    },
  });

  // Return disposable hooks with cleanup function to prevent memory leaks during hot reload
  return {
    hooks,
    cleanup: () => {
      clearInterval(cleanupInterval);
      operations.clear();
    },
  };
}

/**
 * HITL Metrics for approval workflow observability
 */
export interface HitlMetrics {
  actionId: string;
  tenantId: string;
  userId: string;
  actionType: string;
  event: 'auto_approved' | 'suspended' | 'approved' | 'rejected' | 'executed' | 'failed';
  confidence?: number;
  severity?: string;
  approvedBy?: string;
  rejectionReason?: string;
  executionTimeMs?: number;
  timestamp: number;
}

/**
 * HITL Observability options for approval workflows
 */
export interface HitlObservabilityOptions {
  logger?: {
    info: (message: string, context?: Record<string, unknown>) => void;
    warn: (message: string, context?: Record<string, unknown>) => void;
  };
  /** Callback for HITL metrics (for Redis/external storage) */
  onHitlMetrics?: (metrics: HitlMetrics) => void;
}

/**
 * Creates HITL observability callbacks for approval workflows.
 *
 * Use these callbacks with HitlService to track:
 * - Auto-approved actions (low risk, high confidence)
 * - Suspended actions awaiting human decision
 * - Human approved/rejected actions
 * - Execution results
 *
 * @example
 * ```typescript
 * const hitlObservability = createHitlObservability({
 *   logger: console,
 *   onHitlMetrics: (metrics) => cacheService.lpush('hitl:metrics', metrics),
 * });
 *
 * // In HitlService
 * hitlObservability.onAutoApproved(action);
 * hitlObservability.onSuspended(action);
 * hitlObservability.onApproved(action, approvedBy);
 * hitlObservability.onRejected(action, rejectedBy, reason);
 * hitlObservability.onExecuted(action, result);
 * ```
 */
export function createHitlObservability(options: HitlObservabilityOptions = {}) {
  const { logger, onHitlMetrics } = options;

  const emitMetrics = (metrics: HitlMetrics) => {
    if (onHitlMetrics) {
      onHitlMetrics(metrics);
    }
  };

  return {
    /**
     * Called when an action is auto-approved (low risk or high confidence)
     */
    onAutoApproved: (action: {
      id: string;
      tenantId: string;
      userId: string;
      actionType: string;
      confidence?: number;
      severity?: string;
    }) => {
      logger?.info('Action auto-approved', {
        actionId: action.id,
        tenantId: action.tenantId,
        actionType: action.actionType,
        confidence: action.confidence,
      });

      emitMetrics({
        actionId: action.id,
        tenantId: action.tenantId,
        userId: action.userId,
        actionType: action.actionType,
        event: 'auto_approved',
        confidence: action.confidence,
        severity: action.severity,
        timestamp: Date.now(),
      });
    },

    /**
     * Called when an action is suspended for human approval
     */
    onSuspended: (action: {
      id: string;
      tenantId: string;
      userId: string;
      actionType: string;
      confidence?: number;
      severity?: string;
    }) => {
      logger?.info('Action suspended for approval', {
        actionId: action.id,
        tenantId: action.tenantId,
        actionType: action.actionType,
        severity: action.severity,
      });

      emitMetrics({
        actionId: action.id,
        tenantId: action.tenantId,
        userId: action.userId,
        actionType: action.actionType,
        event: 'suspended',
        confidence: action.confidence,
        severity: action.severity,
        timestamp: Date.now(),
      });
    },

    /**
     * Called when a human approves an action
     */
    onApproved: (
      action: {
        id: string;
        tenantId: string;
        userId: string;
        actionType: string;
        confidence?: number;
        severity?: string;
      },
      approvedBy: string,
    ) => {
      logger?.info('Action approved by human', {
        actionId: action.id,
        tenantId: action.tenantId,
        actionType: action.actionType,
        approvedBy,
      });

      emitMetrics({
        actionId: action.id,
        tenantId: action.tenantId,
        userId: action.userId,
        actionType: action.actionType,
        event: 'approved',
        confidence: action.confidence,
        severity: action.severity,
        approvedBy,
        timestamp: Date.now(),
      });
    },

    /**
     * Called when a human rejects an action
     */
    onRejected: (
      action: {
        id: string;
        tenantId: string;
        userId: string;
        actionType: string;
        confidence?: number;
        severity?: string;
      },
      rejectedBy: string,
      reason?: string,
    ) => {
      logger?.warn('Action rejected by human', {
        actionId: action.id,
        tenantId: action.tenantId,
        actionType: action.actionType,
        rejectedBy,
        reason,
      });

      emitMetrics({
        actionId: action.id,
        tenantId: action.tenantId,
        userId: action.userId,
        actionType: action.actionType,
        event: 'rejected',
        confidence: action.confidence,
        severity: action.severity,
        rejectionReason: reason,
        timestamp: Date.now(),
      });
    },

    /**
     * Called when an approved action is executed
     */
    onExecuted: (
      action: {
        id: string;
        tenantId: string;
        userId: string;
        actionType: string;
      },
      result: { success: boolean; executionTimeMs: number; error?: string },
    ) => {
      const event = result.success ? 'executed' : 'failed';

      if (result.success) {
        logger?.info('Action executed successfully', {
          actionId: action.id,
          tenantId: action.tenantId,
          actionType: action.actionType,
          executionTimeMs: result.executionTimeMs,
        });
      } else {
        logger?.warn('Action execution failed', {
          actionId: action.id,
          tenantId: action.tenantId,
          actionType: action.actionType,
          error: result.error,
        });
      }

      emitMetrics({
        actionId: action.id,
        tenantId: action.tenantId,
        userId: action.userId,
        actionType: action.actionType,
        event,
        executionTimeMs: result.executionTimeMs,
        timestamp: Date.now(),
      });
    },
  };
}

/**
 * Creates minimal hooks for production with low overhead.
 * Only tracks essential metrics without verbose logging.
 * Supports >1000 tenants with TTL-based cleanup.
 */
export function createProductionHooks(
  onMetrics?: (metrics: AgentMetrics) => void,
): DisposableHooks {
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

  const hooks = createHooks({
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

  // Return disposable hooks with cleanup function to prevent memory leaks during hot reload
  return {
    hooks,
    cleanup: () => {
      clearInterval(cleanupInterval);
      operations.clear();
    },
  };
}
