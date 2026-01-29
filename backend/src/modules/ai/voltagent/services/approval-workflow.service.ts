/**
 * ApprovalWorkflowService - HITL approval workflow management
 * Uses Redis for horizontal scaling and HitlService as source of truth.
 * Extracted from VoltAgentService (2026-01-22)
 */
import { Inject, Injectable, OnModuleInit, Optional, Logger } from '@nestjs/common';
import { CacheService } from '../../../../common/services/cache.service';
import { CorrelationContext } from '../../../../common/services/correlation-context.service';
import { HitlService, PendingActionStatus } from './hitl.service';
import { ActionExecutorService, ActionExecutionResult } from './action-executor.service';
import { AgentAction, AgentActionType, ActionSeverity } from '../interfaces/agent-action.interface';
import { AgentContext } from '../interfaces/agent-context.interface';
import { AiError, AiErrorCode } from '../../errors';
import { getErrorTranslations } from '../locales';
import {
  createApprovalWorkflow,
  type ApprovalInput,
  type ApprovalResult,
  type ApprovalResumeData,
} from '../workflows';

// Types
type ApprovalWorkflowResult = Awaited<ReturnType<ReturnType<typeof createApprovalWorkflow>['run']>>;

export interface SuspendedWorkflow {
  executionId: string;
  tenantId: string;
  userId: string;
  sessionId?: string;
  action: ApprovalInput['action'];
  suspendReason: string;
  suspendedAt: Date;
  workflowResult: ApprovalWorkflowResult;
}

export interface SerializableSuspendedWorkflow {
  executionId: string;
  tenantId: string;
  userId: string;
  sessionId?: string;
  action: ApprovalInput['action'];
  suspendReason: string;
  suspendedAt: string;
  /** ActionQueue ID from hitlService - used for approve/reject (C2 fix) */
  actionQueueId?: string;
}

/** Extract properties from ActionQueue.actionPayload JSON field */
export function extractActionPayload(actionPayload: unknown): {
  agentName: string;
  sessionId: string | undefined;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  payload: Record<string, unknown>;
} {
  const data = typeof actionPayload === 'object' && actionPayload !== null
    ? (actionPayload as Record<string, unknown>)
    : {};
  return {
    agentName: (data.agentName as string) || 'SupervisorAgent',
    sessionId: data.sessionId as string | undefined,
    severity: (data.severity as 'LOW' | 'MEDIUM' | 'HIGH') || 'LOW',
    payload: data,
  };
}

@Injectable()
export class ApprovalWorkflowService implements OnModuleInit {
  private readonly logger = new Logger(ApprovalWorkflowService.name);
  private readonly SUSPENDED_WORKFLOW_PREFIX = 'voltagent:workflow:suspended:';
  private readonly SUSPENDED_WORKFLOW_TTL = 86400;
  private approvalWorkflow: ReturnType<typeof createApprovalWorkflow> | null = null;

  constructor(
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(CacheService) private readonly cacheService?: CacheService,
    @Optional() @Inject(HitlService) private readonly hitlService?: HitlService,
    @Optional() @Inject(ActionExecutorService) private readonly actionExecutorService?: ActionExecutorService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.approvalWorkflow = createApprovalWorkflow();
    this.logger.log('ApprovalWorkflowService initialized');
  }

  /** Submit an action for approval. Auto-approves or suspends based on severity/confidence. */
  async submitActionForApproval(
    action: ApprovalInput['action'],
    autoApproveThreshold = 0.9,
  ): Promise<ApprovalResult | SuspendedWorkflow> {
    if (!this.approvalWorkflow) {
      throw new AiError(getErrorTranslations('en').ai.approvalNotInitialized, AiErrorCode.INTERNAL_ERROR, { retryable: false });
    }

    const result = await this.approvalWorkflow.run({ action, autoApproveThreshold });
    const corrId = CorrelationContext.getCorrelationId();

    if (result.status === 'suspended') {
      const executionId = result.executionId;
      const suspendedAt = result.suspension?.suspendedAt || new Date();
      const serializable: SerializableSuspendedWorkflow = {
        executionId,
        tenantId: action.tenantId,
        userId: action.userId,
        sessionId: (action as { sessionId?: string }).sessionId,
        action,
        suspendReason: result.suspension?.reason || 'Approval required',
        suspendedAt: suspendedAt.toISOString(),
      };

      if (this.cacheService) {
        await this.cacheService.set(
          `${this.SUSPENDED_WORKFLOW_PREFIX}${action.tenantId}:${executionId}`,
          serializable,
          { ttl: this.SUSPENDED_WORKFLOW_TTL },
        );
      }

      // FIX C2: Capture ActionQueue ID from createPendingAction for approve/reject
      let actionQueueId: string | undefined;
      if (this.hitlService) {
        actionQueueId = await this.hitlService.createPendingAction({
          tenantId: action.tenantId,
          userId: action.userId,
          sessionId: executionId,
          agentName: action.agentName,
          action: {
            type: action.actionType as unknown as AgentActionType,
            payload: action.payload,
            confidence: action.confidence ?? 0.8,
            severity: action.severity as ActionSeverity,
            reasoningSteps: action.summary,
          },
        });
        // Store actionQueueId in serializable for later use in resumeApproval
        serializable.actionQueueId = actionQueueId;
        // Update cache with actionQueueId
        if (this.cacheService) {
          await this.cacheService.set(
            `${this.SUSPENDED_WORKFLOW_PREFIX}${action.tenantId}:${executionId}`,
            serializable,
            { ttl: this.SUSPENDED_WORKFLOW_TTL },
          );
        }
      }

      this.logger.log(`[${corrId}] [tenant:${action.tenantId}] Action suspended: ${executionId}`);
      return {
        executionId,
        tenantId: action.tenantId,
        userId: action.userId,
        action,
        suspendReason: serializable.suspendReason,
        suspendedAt,
        workflowResult: result,
      };
    }

    this.logger.log(`[${corrId}] [tenant:${action.tenantId}] Action auto-approved: ${action.actionType}`);
    return result.result as ApprovalResult;
  }

  /** Resume a suspended workflow with human decision */
  async resumeApproval(executionId: string, decision: ApprovalResumeData, tenantId?: string): Promise<ApprovalResult> {
    const suspended = await this.getSerializableSuspended(executionId, tenantId);

    if (!suspended) {
      throw new AiError(`Suspended workflow not found: ${executionId}`, AiErrorCode.WORKFLOW_FAILED, { retryable: false });
    }

    // Clean up Redis
    if (this.cacheService) {
      await this.cacheService.del(`${this.SUSPENDED_WORKFLOW_PREFIX}${suspended.tenantId}:${executionId}`);
    }

    // Update database using ActionQueue ID (C2 fix: use actionQueueId, not executionId)
    if (this.hitlService) {
      // Use actionQueueId if available, fallback to executionId for backward compatibility
      const actionId = suspended.actionQueueId || executionId;
      if (decision.approved) {
        await this.hitlService.approveAction(suspended.tenantId, actionId, decision.approvedBy);
      } else {
        await this.hitlService.rejectAction(suspended.tenantId, actionId, decision.approvedBy, undefined, decision.rejectionReason);
      }
    }

    const corrId = CorrelationContext.getCorrelationId();
    this.logger.log(`[${corrId}] [tenant:${suspended.tenantId}] Workflow resumed: ${executionId}, approved: ${decision.approved}`);

    // Execute approved actions
    let executionResult: ActionExecutionResult | undefined;
    if (decision.approved && this.actionExecutorService) {
      executionResult = await this.executeApprovedAction(suspended, executionId, corrId);
    }

    return {
      approved: decision.approved,
      action: suspended.action,
      approvedBy: decision.approvedBy,
      approvedAt: new Date(),
      rejectionReason: decision.rejectionReason,
      executionResult,
    } as ApprovalResult;
  }

  /** Get all suspended workflows for a tenant */
  async getSuspendedWorkflows(tenantId: string): Promise<SuspendedWorkflow[]> {
    if (!this.hitlService) return [];

    const result = await this.hitlService.getPendingActions({ tenantId, status: PendingActionStatus.PENDING });
    return result.actions.map((a) => this.mapActionToSuspendedWorkflow(a));
  }

  /** Get a specific suspended workflow by ID */
  async getSuspendedWorkflow(executionId: string, tenantId?: string): Promise<SuspendedWorkflow | undefined> {
    if (this.cacheService && tenantId) {
      const data = await this.cacheService.get<SerializableSuspendedWorkflow>(
        `${this.SUSPENDED_WORKFLOW_PREFIX}${tenantId}:${executionId}`,
      );
      if (data) {
        return {
          ...data,
          suspendedAt: new Date(data.suspendedAt),
          workflowResult: null as unknown as ApprovalWorkflowResult,
        };
      }
    }

    if (this.hitlService && tenantId) {
      try {
        const action = await this.hitlService.getPendingAction(tenantId, executionId);
        return this.mapActionToSuspendedWorkflow(action);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  isInitialized(): boolean {
    return this.approvalWorkflow !== null;
  }

  // Private helpers
  private async getSerializableSuspended(executionId: string, tenantId?: string): Promise<SerializableSuspendedWorkflow | null> {
    if (this.cacheService && tenantId) {
      const data = await this.cacheService.get<SerializableSuspendedWorkflow>(
        `${this.SUSPENDED_WORKFLOW_PREFIX}${tenantId}:${executionId}`,
      );
      if (data) return data;
    }

    if (this.hitlService && tenantId) {
      this.logger.debug(`Checking HitlService for: ${executionId}`);
      try {
        const action = await this.hitlService.getPendingAction(tenantId, executionId);
        const p = extractActionPayload(action.actionPayload);
        return {
          executionId: action.id,
          tenantId: action.tenantId,
          userId: action.userId ?? 'system',
          action: {
            tenantId: action.tenantId,
            userId: action.userId ?? 'system',
            agentName: p.agentName,
            actionType: action.actionType,
            payload: p.payload,
            summary: action.reasoning || '',
            severity: p.severity,
            confidence: action.confidence ?? undefined,
          },
          suspendReason: 'Approval required',
          suspendedAt: action.createdAt.toISOString(),
        };
      } catch {
        this.logger.debug(`Pending action not found: ${executionId}`);
      }
    }
    return null;
  }

  private mapActionToSuspendedWorkflow(action: Awaited<ReturnType<HitlService['getPendingAction']>>): SuspendedWorkflow {
    const p = extractActionPayload(action.actionPayload);
    return {
      executionId: action.id,
      tenantId: action.tenantId,
      userId: action.userId ?? 'system',
      sessionId: p.sessionId,
      action: {
        tenantId: action.tenantId,
        userId: action.userId ?? 'system',
        agentName: p.agentName,
        actionType: action.actionType,
        payload: p.payload,
        summary: action.reasoning || '',
        severity: p.severity,
        confidence: action.confidence,
      },
      suspendReason: 'Approval required',
      suspendedAt: action.createdAt,
      workflowResult: null as unknown as ApprovalWorkflowResult,
    };
  }

  private async executeApprovedAction(
    suspended: SerializableSuspendedWorkflow,
    executionId: string,
    corrId: string,
  ): Promise<ActionExecutionResult> {
    try {
      const agentAction: AgentAction = {
        type: suspended.action.actionType as AgentActionType,
        payload: suspended.action.payload,
        confidence: suspended.action.confidence ?? 0.8,
        severity: (suspended.action.severity as ActionSeverity) ?? ActionSeverity.MEDIUM,
        reasoningSteps: suspended.action.summary,
      };

      const agentContext: AgentContext = {
        tenantId: suspended.tenantId,
        userId: suspended.userId,
        sessionId: suspended.sessionId ?? `${suspended.tenantId}:${suspended.userId}:default`,
        correlationId: corrId,
        userMessage: '',
      };

      this.logger.log(`[${corrId}] [tenant:${suspended.tenantId}] Executing: ${agentAction.type}`);
      const result = await this.actionExecutorService!.execute(agentAction, agentContext);

      if (this.hitlService) {
        await this.hitlService.markExecuted(suspended.tenantId, executionId, result.success, result.error);
      }

      if (result.success) {
        this.logger.log(`[${corrId}] [tenant:${suspended.tenantId}] Executed successfully: ${agentAction.type}`);
      } else {
        this.logger.error(`[${corrId}] [tenant:${suspended.tenantId}] Execution failed: ${result.error}`);
      }
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${corrId}] [tenant:${suspended.tenantId}] Execution error: ${msg}`);
      return { success: false, error: msg, executionTimeMs: 0 };
    }
  }
}
