import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { RedisLockService } from '../../../../common/services/redis-lock.service';
import { AgentAction} from '../interfaces/agent-action.interface';
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

  // Config keys (avoid magic strings)
  private static readonly CONFIG_EXPIRATION_HOURS = 'ai.hitl.actionExpirationHours';
  private static readonly CONFIG_MAX_PENDING = 'ai.hitl.maxPendingActionsPerUser';
  // Defaults (fallback if config not available)
  private static readonly DEFAULT_EXPIRATION_HOURS = 24;
  private static readonly DEFAULT_MAX_PENDING_ACTIONS = 50;

  /**
   * Bulk operation thresholds (ESEMPIO_FOLDER_FINDINGS consolidation - 2026-01-30)
   * Enforces safety limits for operations affecting multiple items.
   */
  private static readonly BULK_THRESHOLDS = {
    IMMEDIATE: 2,   // 1-2 items: execute immediately
    PREVIEW: 5,     // 3-5 items: preview samples first
    CONFIRM: 20,    // 6-20 items: require confirmation
    // 21+ items: suggest staged/batched processing
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly learningService: LearningService,
    private readonly redisLock: RedisLockService,
    private readonly configService: ConfigService,
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
      expiresInMinutes,
    } = options;

    // Get expiration from config (hours → minutes) or use provided value
    const expirationHours = this.configService.get<number>(
      HitlService.CONFIG_EXPIRATION_HOURS,
      HitlService.DEFAULT_EXPIRATION_HOURS,
    );
    const effectiveExpiresInMinutes = expiresInMinutes ?? expirationHours * 60;

    this.logger.debug(
      `Creating pending action for tenant ${tenantId}, agent ${agentName}, type ${action.type}`,
    );

    // Enforce max pending actions per user (AI_MAX_PENDING_ACTIONS)
    const maxPendingActions = this.configService.get<number>(
      HitlService.CONFIG_MAX_PENDING,
      HitlService.DEFAULT_MAX_PENDING_ACTIONS,
    );
    const currentPendingCount = await this.prisma.actionQueue.count({
      where: {
        tenantId,
        userId,
        status: ActionStatus.PENDING_APPROVAL,
      },
    });
    if (currentPendingCount >= maxPendingActions) {
      this.logger.warn(
        `[tenant:${tenantId}] User ${userId} has ${currentPendingCount} pending actions (max: ${maxPendingActions})`,
      );
      throw new BadRequestException(
        `Maximum pending actions limit reached (${maxPendingActions}). Please approve or reject existing actions first.`,
      );
    }

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

        // FIX: Auto-cancel superseded actions of the same type in the same session
        // When user modifies a request (e.g., "make it more formal"), the old pending action
        // should be automatically cancelled to prevent duplicate cards in chat history
        let supersededActions: Array<{ id: string; actionType: string; userId: string | null; confidence: number | null; actionPayload: unknown }> = [];
        if (sessionId) {
          // First, find superseded actions to get their IDs for WebSocket events
          supersededActions = await this.prisma.actionQueue.findMany({
            where: {
              tenantId,
              actionType: this.mapActionType(action.type),
              status: ActionStatus.PENDING_APPROVAL,
              actionPayload: {
                path: ['sessionId'],
                equals: sessionId,
              },
            },
            select: { id: true, actionType: true, userId: true, confidence: true, actionPayload: true },
          });

          if (supersededActions.length > 0) {
            // Update all superseded actions
            await this.prisma.actionQueue.updateMany({
              where: {
                id: { in: supersededActions.map(a => a.id) },
              },
              data: {
                status: ActionStatus.REJECTED,
                rejectedReason: 'Superseded by modified request',
              },
            });

            this.logger.debug(
              `Auto-cancelled ${supersededActions.length} superseded ${action.type} action(s) in session ${sessionId}`,
            );
          }
        }

        const expiresAt = new Date(Date.now() + effectiveExpiresInMinutes * 60 * 1000);

        // Map action type string to ActionType enum
        const actionTypeEnum = this.mapActionType(action.type);

        // Validate userId exists to avoid FK constraint violation
        // If user doesn't exist (e.g., test scenarios), set to undefined
        let validatedUserId: string | undefined = undefined;
        if (userId) {
          const userExists = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
          });
          validatedUserId = userExists ? userId : undefined;
        }

        const created = await this.prisma.actionQueue.create({
          data: {
            tenantId,
            userId: validatedUserId,
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

        return { id: created.id, isExisting: false, supersededActions };
      },
    );

    // If it was an existing action, return early (no events needed)
    if (pendingAction.isExisting) {
      return pendingAction.id;
    }

    // Emit WebSocket events for superseded actions (outside the lock)
    if (pendingAction.supersededActions && pendingAction.supersededActions.length > 0) {
      for (const superseded of pendingAction.supersededActions) {
        const meta = this.getPayloadMeta(superseded.actionPayload as Prisma.JsonValue);
        this.realtimeEvents.emitAiActionRejected(tenantId, {
          actionId: superseded.id,
          userId: superseded.userId ?? 'system',
          agentName: meta.agentName || 'SupervisorAgent',
          actionType: superseded.actionType,
          status: 'rejected',
          confidence: superseded.confidence ?? undefined,
          severity: meta.severity as 'LOW' | 'MEDIUM' | 'HIGH' | undefined,
          reason: 'Superseded by modified request',
          timestamp: new Date().toISOString(),
        });
      }
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
    if (actingUser && !this.canActOnAction(action.userId ?? undefined, actingUser)) {
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
      userId: action.userId ?? 'system',
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
      userId: action.userId ?? 'system',
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
      userId: action.userId ?? 'system',
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
      userId: action.userId ?? 'system',
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
      userId: action.userId ?? 'system',
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

  // NOTE: Auto-approval logic is in approval.workflow.ts (lines 110-129)
  // It checks: HIGH severity → always suspend, else confidence >= threshold → auto-approve

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
   * Get approval level for bulk operations based on item count.
   * Implements safety thresholds from ESEMPIO_FOLDER_FINDINGS.
   *
   * @param itemCount - Number of items affected by the operation
   * @returns Approval level indicating required user interaction
   *
   * Added: 2026-01-30 (ESEMPIO_FOLDER_FINDINGS consolidation)
   */
  getBulkApprovalLevel(itemCount: number): 'immediate' | 'preview' | 'confirm' | 'staged' {
    if (itemCount <= HitlService.BULK_THRESHOLDS.IMMEDIATE) {
      return 'immediate';
    }
    if (itemCount <= HitlService.BULK_THRESHOLDS.PREVIEW) {
      return 'preview';
    }
    if (itemCount <= HitlService.BULK_THRESHOLDS.CONFIRM) {
      return 'confirm';
    }
    return 'staged';
  }

  /**
   * Check if a bulk operation requires special handling.
   * Returns true if the operation needs preview, confirmation, or staging.
   *
   * @param itemCount - Number of items affected
   * @returns True if the operation should not auto-execute
   */
  requiresBulkApproval(itemCount: number): boolean {
    return itemCount > HitlService.BULK_THRESHOLDS.IMMEDIATE;
  }

  /**
   * Get the recommended batch size for staged operations.
   * For operations with 21+ items, suggests batches of 20.
   */
  getRecommendedBatchSize(): number {
    return HitlService.BULK_THRESHOLDS.CONFIRM; // 20 items per batch
  }

  /**
   * Validate if acting user can view/modify the action.
   */
  private canActOnAction(actionUserId: string | null | undefined, actingUser: ActingUser): boolean {
    if (!actingUser) {
      return false;
    }

    // Admins can act on any action including system actions (null userId)
    if (actingUser.role === 'admin' || actingUser.role === 'super-admin') {
      return true;
    }

    // System actions (null userId) can only be accessed by admins
    if (!actionUserId) {
      return false;
    }

    return actionUserId === actingUser.userId;
  }
}
