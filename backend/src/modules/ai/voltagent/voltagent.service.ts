/**
 * VoltAgent Service
 *
 * NestJS service that provides VoltAgent functionality.
 * Creates and manages agents with proper dependency injection.
 * Implements tenant isolation via userId namespacing.
 * Uses VoltAgent's native workflow suspend/resume for HITL.
 */
import { Injectable, OnModuleInit, OnModuleDestroy, Optional, Logger } from '@nestjs/common';
import type { Agent, Memory } from '@voltagent/core';
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CalendarService } from '../../calendar/services/calendar.service';
import { EmailSendService } from '../../email/services/email-send.service';
import { MistralService } from '../services/mistral.service';
import { EmbeddingsService } from '../services/embeddings.service';
import { HitlService } from './services/hitl.service';
import { ActionSeverity } from './interfaces/agent-action.interface';
import { createSupervisorAgent } from './agents';
import { getLocale, type SupportedLocale } from './locales';
import { createMemory } from './memory';
import { createObservabilityHooks, type AgentMetrics } from './observability';
import { getMistralModel, type MistralModel } from './providers/mistral.provider';
import {
  createApprovalWorkflow,
  type ApprovalInput,
  type ApprovalResult,
  type ApprovalResumeData,
} from './workflows';

export interface ChatOptions {
  userId: string;
  conversationId?: string;
  tenantId: string;
  locale?: string;
  model?: MistralModel;
}

export interface ChatResult {
  text: string;
  requiresApproval?: boolean;
  pendingActions?: PendingAction[];
}

export interface PendingAction {
  id: string;
  actionType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  payload: Record<string, unknown>;
  summary: string;
}

/**
 * Workflow execution result type for approval workflow.
 */
type ApprovalWorkflowResult = Awaited<
  ReturnType<ReturnType<typeof createApprovalWorkflow>['run']>
>;

/**
 * Workflow execution state for suspended workflows.
 */
export interface SuspendedWorkflow {
  executionId: string;
  tenantId: string;
  userId: string;
  action: ApprovalInput['action'];
  suspendReason: string;
  suspendedAt: Date;
  /** The workflow result object (needed for resume) */
  workflowResult: ApprovalWorkflowResult;
}

@Injectable()
export class VoltAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VoltAgentService.name);
  private agents: Map<string, Agent> = new Map();
  private memory: Memory | null = null;
  private approvalWorkflow: ReturnType<typeof createApprovalWorkflow> | null = null;
  private suspendedWorkflows: Map<string, SuspendedWorkflow> = new Map();
  private observabilityHooks: ReturnType<typeof createObservabilityHooks> | null = null;

  /** In-memory buffer for batch Redis writes */
  private metricsBuffer: AgentMetrics[] = [];
  private readonly maxMemoryBuffer = 50; // Batch size before Redis flush
  private readonly maxRedisBuffer = 10000; // Max metrics per tenant in Redis (for >1000 tenants)
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailSendService: EmailSendService,
    private readonly calendarService: CalendarService,
    @Optional() private readonly cacheService?: CacheService,
    @Optional() private readonly hitlService?: HitlService,
    @Optional() private readonly mistralService?: MistralService,
    @Optional() private readonly embeddingsService?: EmbeddingsService,
  ) {}

  async onModuleInit() {
    // Initialize shared PostgreSQL memory for all agents
    this.memory = createMemory({
      tablePrefix: 'voltagent_memory',
      schema: 'public',
    });

    // Initialize observability hooks with NestJS logger adapter
    this.observabilityHooks = createObservabilityHooks({
      logger: {
        info: (msg, ctx) => this.logger.log(msg, ctx),
        warn: (msg, ctx) => this.logger.warn(msg, ctx),
        error: (msg, ctx) => this.logger.error(msg, ctx),
        debug: (msg, ctx) => this.logger.debug(msg, ctx),
      },
      logToolCalls: process.env.NODE_ENV !== 'production',
      trackUsage: true,
      onMetrics: (metrics) => this.collectMetrics(metrics),
    });

    // Initialize approval workflow
    this.approvalWorkflow = createApprovalWorkflow();

    // Start periodic flush interval for metrics (every 5 seconds)
    this.flushInterval = setInterval(() => {
      this.flushMetricsToRedis().catch((err) =>
        this.logger.error('Failed to flush metrics to Redis', err),
      );
    }, 5000);

    this.logger.log('VoltAgent service initialized with Redis metrics and approval workflow');
  }

  /**
   * Collect metrics from agent operations.
   * Buffers in memory and bulk-writes to Redis for >1000 tenant scalability.
   */
  private collectMetrics(metrics: AgentMetrics): void {
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
  private async flushMetricsToRedis(): Promise<void> {
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
   * Get aggregated metrics stats per tenant.
   */
  async getMetricsStats(agentName = 'SupervisorAgent'): Promise<{
    totalOperations: number;
    avgDuration: number;
    successRate: number;
    totalTokens: number;
  }> {
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

  async onModuleDestroy() {
    // Stop flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Flush remaining metrics to Redis
    await this.flushMetricsToRedis();

    // Cleanup agents on shutdown
    this.agents.clear();
  }

  /**
   * Generate tenant-isolated userId for VoltAgent memory.
   * Format: tenantId:userId to ensure data isolation between tenants.
   */
  private getTenantUserId(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
  }

  /**
   * Get or create an agent for the given context.
   * Agents are cached per locale+model (not tenant, since tools use tenantId).
   * Includes RAG services for HybridRetriever when available.
   */
  private getOrCreateAgent(tenantId: string, locale: SupportedLocale, modelType: MistralModel = 'small'): Agent {
    const cacheKey = `${locale}:${modelType}`;

    if (!this.agents.has(cacheKey)) {
      const model = getMistralModel(modelType);
      const agent = createSupervisorAgent({
        model,
        prisma: this.prisma,
        emailSendService: this.emailSendService,
        calendarService: this.calendarService,
        locale,
        tenantId,
        memory: this.memory ?? undefined,
        hooks: this.observabilityHooks ?? undefined,
        // RAG services for HybridRetriever (optional - gracefully degrades)
        mistralService: this.mistralService,
        embeddingsService: this.embeddingsService,
      });
      this.agents.set(cacheKey, agent);
    }

    return this.agents.get(cacheKey)!;
  }

  /**
   * Process a chat message using the supervisor agent.
   * Uses tenant-isolated userId for memory operations.
   * Persists pending actions to database via HitlService.
   */
  async chat(message: string, options: ChatOptions): Promise<ChatResult> {
    const locale = getLocale(options.locale);
    const agent = this.getOrCreateAgent(options.tenantId, locale, options.model);

    // Use tenant-isolated userId for memory
    const tenantUserId = this.getTenantUserId(options.tenantId, options.userId);

    const result = await agent.generateText(message, {
      userId: tenantUserId,
      conversationId: options.conversationId,
    });

    // Extract any pending actions from tool results
    const pendingActions: PendingAction[] = [];
    for (const step of result.steps) {
      // Access tool results from the step - type assertion needed for ai-sdk step type
      const toolResults = (step as unknown as { toolResults?: Array<{ result?: unknown }> }).toolResults;
      if (toolResults) {
        for (const toolResult of toolResults) {
          const resultValue = toolResult.result as Record<string, unknown> | undefined;
          if (resultValue?.requiresApproval) {
            const actionType = resultValue.actionType as string;
            const severity = resultValue.severity as 'LOW' | 'MEDIUM' | 'HIGH';
            const payload = resultValue.payload as Record<string, unknown>;
            const summary = resultValue.summary as string;

            // Persist pending action to database via HitlService
            let actionId: string;
            if (this.hitlService) {
              actionId = await this.hitlService.createPendingAction({
                tenantId: options.tenantId,
                userId: options.userId,
                sessionId: options.conversationId,
                agentName: 'SupervisorAgent',
                action: {
                  type: actionType as unknown as import('./interfaces/agent-action.interface').AgentActionType,
                  payload,
                  confidence: (resultValue.confidence as number) ?? 0.8,
                  severity: severity as ActionSeverity,
                  reasoningSteps: summary,
                },
              });
            } else {
              actionId = crypto.randomUUID();
            }

            pendingActions.push({
              id: actionId,
              actionType,
              severity,
              payload,
              summary,
            });
          }
        }
      }
    }

    return {
      text: result.text,
      requiresApproval: pendingActions.length > 0,
      pendingActions: pendingActions.length > 0 ? pendingActions : undefined,
    };
  }

  /**
   * Process a chat message with streaming response.
   * Uses tenant-isolated userId for memory operations.
   */
  async *streamChat(message: string, options: ChatOptions): AsyncGenerator<string> {
    const locale = getLocale(options.locale);
    const agent = this.getOrCreateAgent(options.tenantId, locale, options.model);

    // Use tenant-isolated userId for memory
    const tenantUserId = this.getTenantUserId(options.tenantId, options.userId);

    const result = await agent.streamText(message, {
      userId: tenantUserId,
      conversationId: options.conversationId,
    });

    for await (const chunk of result.textStream) {
      yield chunk;
    }
  }

  /**
   * Clear cached agents (useful for testing or config changes).
   */
  clearAgentCache(): void {
    this.agents.clear();
  }

  /**
   * Submit an action for approval using VoltAgent workflow.
   * The workflow will auto-approve or suspend based on severity/confidence.
   */
  async submitActionForApproval(
    action: ApprovalInput['action'],
    autoApproveThreshold = 0.9,
  ): Promise<ApprovalResult | SuspendedWorkflow> {
    if (!this.approvalWorkflow) {
      throw new Error('Approval workflow not initialized');
    }

    const result = await this.approvalWorkflow.run({
      action,
      autoApproveThreshold,
    });

    // Check if workflow was suspended
    if (result.status === 'suspended') {
      const executionId = result.executionId;
      const suspended: SuspendedWorkflow = {
        executionId,
        tenantId: action.tenantId,
        userId: action.userId,
        action,
        suspendReason: result.suspension?.reason || 'Approval required',
        suspendedAt: result.suspension?.suspendedAt || new Date(),
        workflowResult: result,
      };

      // Store suspended workflow for later resume
      this.suspendedWorkflows.set(executionId, suspended);

      // Also persist to HitlService if available
      if (this.hitlService) {
        await this.hitlService.createPendingAction({
          tenantId: action.tenantId,
          userId: action.userId,
          sessionId: executionId,
          agentName: action.agentName,
          action: {
            type: action.actionType as unknown as import('./interfaces/agent-action.interface').AgentActionType,
            payload: action.payload,
            confidence: action.confidence ?? 0.8,
            severity: action.severity as ActionSeverity,
            reasoningSteps: action.summary,
          },
        });
      }

      this.logger.log(`Action suspended for approval: ${executionId}`);
      return suspended;
    }

    // Workflow completed (auto-approved or error)
    this.logger.log(`Action auto-approved: ${action.actionType}`);
    return result.result as ApprovalResult;
  }

  /**
   * Resume a suspended workflow with human decision.
   * Uses VoltAgent's native workflow resume.
   */
  async resumeApproval(
    executionId: string,
    decision: ApprovalResumeData,
  ): Promise<ApprovalResult> {
    const suspended = this.suspendedWorkflows.get(executionId);
    if (!suspended) {
      throw new Error(`Suspended workflow not found: ${executionId}`);
    }

    // Resume the workflow with the human decision using the stored result
    const result = await suspended.workflowResult.resume(decision);

    // Clean up the suspended workflow
    this.suspendedWorkflows.delete(executionId);

    // Update HitlService if available
    if (this.hitlService) {
      if (decision.approved) {
        await this.hitlService.approveAction(
          suspended.tenantId,
          executionId,
          decision.approvedBy,
        );
      } else {
        await this.hitlService.rejectAction(
          suspended.tenantId,
          executionId,
          decision.approvedBy,
          undefined,
          decision.rejectionReason,
        );
      }
    }

    this.logger.log(
      `Workflow resumed: ${executionId}, approved: ${decision.approved}`,
    );

    return result.result as ApprovalResult;
  }

  /**
   * Get all suspended workflows for a tenant.
   */
  getSuspendedWorkflows(tenantId: string): SuspendedWorkflow[] {
    return Array.from(this.suspendedWorkflows.values()).filter(
      (w) => w.tenantId === tenantId,
    );
  }

  /**
   * Get a specific suspended workflow by ID.
   */
  getSuspendedWorkflow(executionId: string): SuspendedWorkflow | undefined {
    return this.suspendedWorkflows.get(executionId);
  }
}
