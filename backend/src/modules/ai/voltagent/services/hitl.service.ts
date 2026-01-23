import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { RedisLockService } from '../../../../common/services/redis-lock.service';
import { AgentAction, ActionSeverity } from '../interfaces/agent-action.interface';
import { Prisma, ActionStatus, ActionType } from '@prisma/client';
import { LearningService } from './learning.service';

export type ActingUser = { userId: string; role: string };

/**
 * Status of a pending action.
 * Maps to ActionStatus enum in Prisma.
 */
export enum PendingActionStatus {
  PENDING = 'PENDING_APPROVAL', // Maps to ActionStatus.PENDING_APPROVAL
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXECUTED = 'EXECUTED',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
}

/**
 * Options for creating a pending action.
 */
export interface CreatePendingActionOptions {
  tenantId: string;
  userId: string;
  sessionId?: string;
  agentName: string;
  action: AgentAction;
  expiresInMinutes?: number;
}

/**
 * Options for querying pending actions.
 */
export interface GetPendingActionsOptions {
  tenantId: string;
  userId?: string;
  status?: PendingActionStatus;
  agentName?: string;
  limit?: number;
  offset?: number;
}

/**
 * Result of action approval.
 */
export interface ApprovalResult {
  actionId: string;
  status: PendingActionStatus;
  executedAt?: Date;
  error?: string;
}

/**
 * HitlService (Human-in-the-Loop) manages the approval workflow
 * for agent-proposed actions. It ensures tenant isolation and
 * provides approve/reject functionality.
 */
@Injectable()
export class HitlService {
  private readonly logger = new Logger(HitlService.name);

  // Default expiration time for pending actions (24 hours)
  private readonly DEFAULT_EXPIRATION_MINUTES = 24 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly learningService: LearningService,
    private readonly redisLock: RedisLockService,
  ) { }

  /**
   * Map action type string to ActionType enum.
   * Valid ActionType: SEND_EMAIL, SCHEDULE_MEETING, CREATE_TASK, UPDATE_CONTACT,
   *                   UPDATE_DEAL, ADD_LABEL, ARCHIVE_EMAIL, SNOOZE_EMAIL,
   *                   CREATE_CONTACT, DELETE_CONTACT, DELETE_EMAIL, REPLY_EMAIL, FORWARD_EMAIL
   */
  private mapActionType(type: string): ActionType {
    const mapping: Record<string, ActionType> = {
      SEND_EMAIL: ActionType.SEND_EMAIL,
      SCHEDULE_MEETING: ActionType.SCHEDULE_MEETING,
      CREATE_TASK: ActionType.CREATE_TASK,
      UPDATE_CONTACT: ActionType.UPDATE_CONTACT,
      UPDATE_DEAL: ActionType.UPDATE_DEAL,
      ADD_LABEL: ActionType.ADD_LABEL,
      ARCHIVE_EMAIL: ActionType.ARCHIVE_EMAIL,
      SNOOZE_EMAIL: ActionType.SNOOZE_EMAIL,
      // Contact CRUD (P6 fix)
      CREATE_CONTACT: ActionType.CREATE_CONTACT,
      DELETE_CONTACT: ActionType.DELETE_CONTACT,
      // Email CRUD (P6 fix)
      DELETE_EMAIL: ActionType.DELETE_EMAIL,
      REPLY_EMAIL: ActionType.REPLY_EMAIL,
      FORWARD_EMAIL: ActionType.FORWARD_EMAIL,
      // Legacy mappings for backward compatibility
      CREATE_EVENT: ActionType.SCHEDULE_MEETING, // Map to closest equivalent
      UPDATE_EMAIL_LABELS: ActionType.ADD_LABEL,
      MOVE_EMAIL: ActionType.ARCHIVE_EMAIL,
    };
    return mapping[type] || ActionType.CREATE_TASK; // Default fallback
  }

  /**
   * Compute idempotency hash for an action.
   * Hash = SHA256(tenantId + sessionId + actionType + sortedPayloadJSON)
   */
  private computeActionHash(
    tenantId: string,
    sessionId: string | undefined,
    actionType: string,
    payload: Record<string, unknown>,
  ): string {
    // Sort payload keys for consistent hashing
    const sortedPayload = JSON.stringify(payload, Object.keys(payload).sort());
    const data = `${tenantId}:${sessionId || ''}:${actionType}:${sortedPayload}`;
    return createHash('sha256').update(data).digest('hex').substring(0, 32);
  }

  /**
   * Create a new pending action for approval.
   * Always scoped by tenantId for isolation.
   * Uses idempotency hash to prevent duplicate actions.
   */
  async createPendingAction(
    options: CreatePendingActionOptions,
  ): Promise<string> {
    const {
      tenantId,
      userId,
      sessionId,
      agentName,
      action,
      expiresInMinutes = this.DEFAULT_EXPIRATION_MINUTES,
    } = options;

    this.logger.debug(
      `Creating pending action for tenant ${tenantId}, agent ${agentName}, type ${action.type}`,
    );

    // Compute idempotency hash
    const actionHash = this.computeActionHash(
      tenantId,
      sessionId,
      action.type,
      action.payload as Record<string, unknown>,
    );

    // Phase 8 TOCTOU fix: Use Redis lock to prevent race condition between check and create
    // Lock key is scoped to tenant + actionHash to prevent duplicate actions
    const lockKey = `hitl:action:${tenantId}:${actionHash}`;
    const lockTtlMs = 5000; // 5 seconds - plenty for DB operation

    const pendingAction = await this.redisLock.withLock(
      lockKey,
      lockTtlMs,
      async () => {
        // Check for existing action with same hash (idempotency)
        // Store hash in actionPayload for idempotency check
        const existing = await this.prisma.actionQueue.findFirst({
          where: {
            tenantId,
            actionPayload: {
              path: ['actionHash'],
              equals: actionHash,
            },
            status: {
              in: [ActionStatus.PENDING_APPROVAL, ActionStatus.APPROVED],
            },
          },
        });

        if (existing) {
          this.logger.debug(
            `Duplicate action detected (hash: ${actionHash}), returning existing action ${existing.id}`,
          );
          return { id: existing.id, isExisting: true };
        }

        const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

        // Map action type string to ActionType enum
        const actionTypeEnum = this.mapActionType(action.type);

        const created = await this.prisma.actionQueue.create({
          data: {
            tenantId,
            userId,
            actionType: actionTypeEnum,
            actionPayload: {
              ...(action.payload as Record<string, unknown>),
              sessionId,
              agentName,
              actionHash,
              severity: action.severity,
            },
            confidence: action.confidence,
            reasoning: action.reasoningSteps,
            status: ActionStatus.PENDING_APPROVAL,
            expiresAt,
          },
        });

        return { id: created.id, isExisting: false };
      },
    );

    // If it was an existing action, return early (no events needed)
    if (pendingAction.isExisting) {
      return pendingAction.id;
    }

    this.logger.log(
      `Created pending action ${pendingAction.id} for tenant ${tenantId}`,
    );

    // Emit real-time event for UI notification
    this.realtimeEvents.emitAiActionCreated(tenantId, {
      actionId: pendingAction.id,
      userId,
      agentName,
      actionType: action.type,
      status: 'pending',
      confidence: action.confidence,
      severity: action.severity as 'LOW' | 'MEDIUM' | 'HIGH',
      payload: action.payload,
      timestamp: new Date().toISOString(),
    });

    return pendingAction.id;
  }

  /**
   * Extract metadata from actionPayload.
   */
  private getPayloadMeta(payload: Prisma.JsonValue): { agentName?: string; severity?: string } {
    if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
      const obj = payload as Record<string, unknown>;
      return {
        agentName: obj.agentName as string | undefined,
        severity: obj.severity as string | undefined,
      };
    }
    return {};
  }

  /**
   * Create multiple pending actions in a batch.
   */
  async createPendingActions(
    tenantId: string,
    userId: string,
    sessionId: string | undefined,
    agentName: string,
    actions: AgentAction[],
  ): Promise<string[]> {
    const actionIds: string[] = [];

    for (const action of actions) {
      const id = await this.createPendingAction({
        tenantId,
        userId,
        sessionId,
        agentName,
        action,
      });
      actionIds.push(id);
    }

    return actionIds;
  }

  /**
   * Get pending actions for a tenant (with optional filters).
   * Always enforces tenant isolation.
   */
  async getPendingActions(options: GetPendingActionsOptions) {
    const {
      tenantId,
      userId,
      status,
      agentName,
      limit = 50,
      offset = 0,
    } = options;

    const where: Prisma.ActionQueueWhereInput = {
      tenantId, // Always filter by tenant!
    };

    if (userId) {
      where.userId = userId;
    }
    if (status) {
      // Map PendingActionStatus to ActionStatus
      const statusMap: Record<string, ActionStatus> = {
        [PendingActionStatus.PENDING]: ActionStatus.PENDING_APPROVAL,
        [PendingActionStatus.APPROVED]: ActionStatus.APPROVED,
        [PendingActionStatus.REJECTED]: ActionStatus.REJECTED,
        [PendingActionStatus.EXECUTED]: ActionStatus.EXECUTED,
        [PendingActionStatus.EXPIRED]: ActionStatus.EXPIRED,
      };
      where.status = statusMap[status] || (status as ActionStatus);
    }
    if (agentName) {
      where.actionPayload = {
        path: ['agentName'],
        equals: agentName,
      };
    }

    const [actions, total] = await Promise.all([
      this.prisma.actionQueue.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.actionQueue.count({ where }),
    ]);

    return {
      actions,
      total,
      limit,
      offset,
    };
  }

  /**
   * Get pending actions for a specific session.
   * Used to retrieve HITL actions captured by hooks during delegate_task execution.
   * Always enforces tenant isolation.
   *
   * @param tenantId - Tenant ID for isolation
   * @param sessionId - Session/conversation ID
   * @param createdAfter - Only return actions created after this timestamp (for request-scoping)
   * @returns Array of pending actions for this session
   */
  async getPendingActionsBySession(
    tenantId: string,
    sessionId: string,
    createdAfter?: Date,
  ): Promise<Array<{
    id: string;
    actionType: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    payload: Record<string, unknown>;
    summary: string;
  }>> {
    const where: Prisma.ActionQueueWhereInput = {
      tenantId,
      status: ActionStatus.PENDING_APPROVAL,
      actionPayload: {
        path: ['sessionId'],
        equals: sessionId,
      },
    };

    // If createdAfter is provided, only fetch actions created during this request
    if (createdAfter) {
      where.createdAt = { gte: createdAfter };
    }

    const actions = await this.prisma.actionQueue.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    return actions.map((action) => {
      const payload = action.actionPayload as Record<string, unknown>;
      return {
        id: action.id,
        actionType: action.actionType,
        severity: (payload?.severity as 'LOW' | 'MEDIUM' | 'HIGH') || 'MEDIUM',
        payload: {
          ...payload,
          // Remove internal fields
          sessionId: undefined,
          agentName: undefined,
          actionHash: undefined,
          severity: undefined,
        },
        summary: action.reasoning || `${action.actionType} action requires approval`,
      };
    });
  }

  /**
   * Get a single pending action by ID.
   * Enforces tenant isolation.
   */
  async getPendingAction(
    tenantId: string,
    actionId: string,
    actingUser?: ActingUser,
  ) {
    const action = await this.prisma.actionQueue.findFirst({
      where: {
        id: actionId,
        tenantId, // Tenant isolation
      },
    });

    if (!action) {
      throw new NotFoundException(
        `Pending action ${actionId} not found for tenant`,
      );
    }

    // Optional ownership enforcement (skip for admins)
    if (actingUser && !this.canActOnAction(action.userId, actingUser)) {
      throw new ForbiddenException('You are not allowed to access this action');
    }

    return action;
  }

  /**
   * Approve a pending action.
   * Marks it as approved and ready for execution.
   */
  async approveAction(
    tenantId: string,
    actionId: string,
    approvedBy: string,
    actingUser?: ActingUser,
    payload?: Record<string, unknown>,
  ): Promise<ApprovalResult> {
    this.logger.debug(
      `Approving action ${actionId} for tenant ${tenantId} by ${approvedBy}`,
    );

    // Verify action exists and belongs to tenant
    const action = await this.getPendingAction(tenantId, actionId, actingUser);

    // Phase 8 TOCTOU fix: Use compound WHERE with status check to prevent race condition
    // This ensures the update only succeeds if the action is still PENDING_APPROVAL
    const updateData: Prisma.ActionQueueUpdateManyMutationInput = {
      status: ActionStatus.APPROVED,
      approvedAt: new Date(),
      approvedBy,
    };

    if (payload) {
      const meta = this.getPayloadMeta(action.actionPayload);
      const newHash = this.computeActionHash(
        tenantId,
        (action.actionPayload as Record<string, unknown>)?.sessionId as string | undefined,
        action.actionType,
        payload,
      );
      updateData.actionPayload = {
        ...payload,
        agentName: meta.agentName,
        severity: meta.severity,
        actionHash: newHash,
      };
    }

    // Atomic check-and-update: only approve if still PENDING_APPROVAL and not expired
    const result = await this.prisma.actionQueue.updateMany({
      where: {
        id: actionId,
        tenantId,
        status: ActionStatus.PENDING_APPROVAL,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      data: updateData,
    });

    // If no rows updated, determine the reason
    if (result.count === 0) {
      // Re-fetch to provide accurate error message
      const current = await this.prisma.actionQueue.findFirst({
        where: { id: actionId, tenantId },
      });

      if (!current) {
        throw new NotFoundException(`Action ${actionId} not found`);
      }

      if (current.expiresAt && new Date() > current.expiresAt) {
        // Mark as expired and throw
        await this.prisma.actionQueue.updateMany({
          where: { id: actionId, tenantId },
          data: { status: ActionStatus.EXPIRED },
        });
        throw new ForbiddenException(`Action ${actionId} has expired`);
      }

      throw new ForbiddenException(
        `Action ${actionId} is no longer pending (status: ${current.status})`,
      );
    }

    this.logger.log(`Action ${actionId} approved by ${approvedBy}`);

    // Emit real-time event for UI notification
    const approvedMeta = this.getPayloadMeta(action.actionPayload);
    this.realtimeEvents.emitAiActionApproved(tenantId, {
      actionId,
      userId: action.userId,
      agentName: approvedMeta.agentName || 'SupervisorAgent',
      actionType: action.actionType,
      status: 'approved',
      confidence: action.confidence ?? undefined,
      severity: approvedMeta.severity as 'LOW' | 'MEDIUM' | 'HIGH' | undefined,
      timestamp: new Date().toISOString(),
    });

    // Record feedback for learning system
    const approvedPayloadMeta = this.getPayloadMeta(action.actionPayload);
    await this.learningService.recordFeedback({
      actionId,
      tenantId,
      userId: action.userId,
      agentName: approvedPayloadMeta.agentName || 'UnknownAgent',
      actionType: action.actionType,
      wasApproved: true,
      wasExecuted: false, // Will be updated after execution
      originalConfidence: action.confidence ?? 0,
      timestamp: Date.now(),
    });

    return {
      actionId,
      status: PendingActionStatus.APPROVED,
    };
  }

  /**
   * Reject a pending action.
   * Records rejection reason for learning.
   */
  async rejectAction(
    tenantId: string,
    actionId: string,
    rejectedBy: string,
    actingUser?: ActingUser,
    reason?: string,
  ): Promise<ApprovalResult> {
    this.logger.debug(
      `Rejecting action ${actionId} for tenant ${tenantId} by ${rejectedBy}`,
    );

    // Verify action exists and belongs to tenant
    const action = await this.getPendingAction(tenantId, actionId, actingUser);

    // Phase 8 TOCTOU fix: Atomic check-and-update to prevent race condition
    // Only reject if still PENDING_APPROVAL
    const result = await this.prisma.actionQueue.updateMany({
      where: {
        id: actionId,
        tenantId,
        status: ActionStatus.PENDING_APPROVAL,
      },
      data: {
        status: ActionStatus.REJECTED,
        rejectedReason: reason,
      },
    });

    // If no rows updated, action was already processed by another request
    if (result.count === 0) {
      const current = await this.prisma.actionQueue.findFirst({
        where: { id: actionId, tenantId },
      });

      if (!current) {
        throw new NotFoundException(`Action ${actionId} not found`);
      }

      throw new ForbiddenException(
        `Action ${actionId} is no longer pending (status: ${current.status})`,
      );
    }

    this.logger.log(`Action ${actionId} rejected by ${rejectedBy}: ${reason || 'No reason provided'}`);

    // Emit real-time event for UI notification
    const rejectedMeta = this.getPayloadMeta(action.actionPayload);
    this.realtimeEvents.emitAiActionRejected(tenantId, {
      actionId,
      userId: action.userId,
      agentName: rejectedMeta.agentName || 'SupervisorAgent',
      actionType: action.actionType,
      status: 'rejected',
      confidence: action.confidence ?? undefined,
      severity: rejectedMeta.severity as 'LOW' | 'MEDIUM' | 'HIGH' | undefined,
      reason,
      timestamp: new Date().toISOString(),
    });

    // Record feedback for learning system (rejection)
    const rejectedPayloadMeta = this.getPayloadMeta(action.actionPayload);
    await this.learningService.recordFeedback({
      actionId,
      tenantId,
      userId: action.userId,
      agentName: rejectedPayloadMeta.agentName || 'UnknownAgent',
      actionType: action.actionType,
      wasApproved: false,
      wasExecuted: false,
      userFeedback: reason,
      originalConfidence: action.confidence ?? 0,
      timestamp: Date.now(),
    });

    return {
      actionId,
      status: PendingActionStatus.REJECTED,
    };
  }

  /**
   * Mark an action as executed (after successful execution).
   */
  async markExecuted(
    tenantId: string,
    actionId: string,
    success: boolean,
    error?: string,
  ): Promise<void> {
    // Verify action exists and belongs to tenant
    const action = await this.getPendingAction(tenantId, actionId);

    const status = success
      ? PendingActionStatus.EXECUTED
      : PendingActionStatus.FAILED;

    await this.prisma.actionQueue.updateMany({
      where: { id: actionId, tenantId },
      data: {
        status: status === PendingActionStatus.EXECUTED ? ActionStatus.EXECUTED : ActionStatus.FAILED,
        executedAt: new Date(),
        executionError: error,
      },
    });

    if (!success && error) {
      this.logger.warn(`Action ${actionId} execution failed: ${error}`);
    } else {
      this.logger.log(`Action ${actionId} marked as ${status}`);
    }

    // Emit real-time event for UI notification
    const execMeta = this.getPayloadMeta(action.actionPayload);
    const eventPayload = {
      actionId,
      userId: action.userId,
      agentName: execMeta.agentName || 'SupervisorAgent',
      actionType: action.actionType,
      status: success ? 'executed' as const : 'failed' as const,
      confidence: action.confidence ?? undefined,
      severity: execMeta.severity as 'LOW' | 'MEDIUM' | 'HIGH' | undefined,
      error,
      timestamp: new Date().toISOString(),
    };

    if (success) {
      this.realtimeEvents.emitAiActionExecuted(tenantId, eventPayload);
    } else {
      this.realtimeEvents.emitAiActionFailed(tenantId, eventPayload);
    }
  }

  /**
   * Check if an action should be auto-approved based on confidence
   * and user preferences.
   */
  shouldAutoApprove(
    action: AgentAction,
    autoApproveThreshold: number,
  ): boolean {
    // Never auto-approve high severity actions
    if (action.severity === ActionSeverity.HIGH) {
      return false;
    }

    // Use adjusted confidence if available (from learning)
    const confidence = action.adjustedConfidence ?? action.confidence;

    return confidence >= autoApproveThreshold;
  }

  /**
   * Get counts of pending actions by status for a tenant.
   */
  async getActionCounts(tenantId: string, userId?: string) {
    const where: Prisma.ActionQueueWhereInput = { tenantId };
    if (userId) {
      where.userId = userId;
    }

    const counts = await this.prisma.actionQueue.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });

    return counts.reduce(
      (acc: Record<string, number>, item: { status: ActionStatus; _count: { status: number } }) => {
        acc[item.status] = item._count.status;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  /**
   * Clean up expired pending actions.
   * Should be called periodically (e.g., via cron job).
   */
  async cleanupExpiredActions(): Promise<number> {
    const result = await this.prisma.actionQueue.updateMany({
      where: {
        status: ActionStatus.PENDING_APPROVAL,
        expiresAt: {
          lt: new Date(),
        },
      },
      data: {
        status: ActionStatus.EXPIRED,
      },
    });

    if (result.count > 0) {
      this.logger.log(`Marked ${result.count} actions as expired`);
    }

    return result.count;
  }

  /**
   * Delete all agent data for a tenant (for subscription cancellation).
   * IMPORTANT: This should be called when user cancels subscription.
   */
  async deleteAllTenantData(tenantId: string): Promise<void> {
    this.logger.warn(`Deleting all agent data for tenant ${tenantId}`);

    // Delete action queue entries for tenant
    await this.prisma.actionQueue.deleteMany({
      where: { tenantId },
    });

    this.logger.log(`Deleted all agent data for tenant ${tenantId}`);
  }

  /**
   * Delete all agent data for a specific user within a tenant.
   */
  async deleteUserData(tenantId: string, userId: string): Promise<void> {
    this.logger.warn(
      `Deleting agent data for user ${userId} in tenant ${tenantId}`,
    );

    await this.prisma.actionQueue.deleteMany({
      where: { tenantId, userId },
    });

    this.logger.log(`Deleted agent data for user ${userId}`);
  }

  /**
   * Validate if acting user can view/modify the action.
   */
  private canActOnAction(actionUserId: string, actingUser: ActingUser): boolean {
    if (!actingUser) {
      return false;
    }

    if (actingUser.role === 'admin' || actingUser.role === 'super-admin') {
      return true;
    }

    return actionUserId === actingUser.userId;
  }
}
