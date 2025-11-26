import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RealtimeEventsService } from '../../../realtime/services/realtime-events.service';
import { AgentAction, ActionSeverity } from '../interfaces/agent-action.interface';
import { Prisma } from '@prisma/client';

export type ActingUser = { userId: string; role: string };

/**
 * Status of a pending action.
 */
export enum PendingActionStatus {
  PENDING = 'PENDING',
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
  ) {}

  /**
   * Create a new pending action for approval.
   * Always scoped by tenantId for isolation.
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

    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const pendingAction = await this.prisma.agentPendingAction.create({
      data: {
        tenantId,
        userId,
        sessionId,
        agentName,
        actionType: action.type,
        payload: action.payload as Prisma.JsonObject,
        confidence: action.confidence,
        adjustedConfidence: action.adjustedConfidence,
        severity: action.severity,
        reasoningSteps: action.reasoningSteps,
        status: PendingActionStatus.PENDING,
        expiresAt,
      },
    });

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

    const where: Prisma.AgentPendingActionWhereInput = {
      tenantId, // Always filter by tenant!
    };

    if (userId) {
      where.userId = userId;
    }
    if (status) {
      where.status = status;
    }
    if (agentName) {
      where.agentName = agentName;
    }

    const [actions, total] = await Promise.all([
      this.prisma.agentPendingAction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.agentPendingAction.count({ where }),
    ]);

    return {
      actions,
      total,
      limit,
      offset,
    };
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
    const action = await this.prisma.agentPendingAction.findFirst({
      where: {
        id: actionId,
        tenantId, // Tenant isolation
      },
      include: {
        feedback: true,
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
  ): Promise<ApprovalResult> {
    this.logger.debug(
      `Approving action ${actionId} for tenant ${tenantId} by ${approvedBy}`,
    );

    // Verify action exists and belongs to tenant
    const action = await this.getPendingAction(tenantId, actionId, actingUser);

    // Check if action is still pending
    const status = action.status as PendingActionStatus;
    if (status !== PendingActionStatus.PENDING) {
      throw new ForbiddenException(
        `Action ${actionId} is no longer pending (status: ${action.status})`,
      );
    }

    // Check if expired
    if (action.expiresAt && new Date() > action.expiresAt) {
      await this.prisma.agentPendingAction.update({
        where: { id: actionId },
        data: { status: PendingActionStatus.EXPIRED },
      });
      throw new ForbiddenException(`Action ${actionId} has expired`);
    }

    // Update status to approved
    await this.prisma.agentPendingAction.update({
      where: { id: actionId },
      data: {
        status: PendingActionStatus.APPROVED,
        approvedAt: new Date(),
        approvedBy,
      },
    });

    this.logger.log(`Action ${actionId} approved by ${approvedBy}`);

    // Emit real-time event for UI notification
    this.realtimeEvents.emitAiActionApproved(tenantId, {
      actionId,
      userId: action.userId,
      agentName: action.agentName,
      actionType: action.actionType,
      status: 'approved',
      confidence: action.confidence ?? undefined,
      severity: action.severity as 'LOW' | 'MEDIUM' | 'HIGH' | undefined,
      timestamp: new Date().toISOString(),
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

    // Check if action is still pending
    const status = action.status as PendingActionStatus;
    if (status !== PendingActionStatus.PENDING) {
      throw new ForbiddenException(
        `Action ${actionId} is no longer pending (status: ${action.status})`,
      );
    }

    // Update status to rejected
    await this.prisma.agentPendingAction.update({
      where: { id: actionId },
      data: {
        status: PendingActionStatus.REJECTED,
        rejectedAt: new Date(),
        rejectedBy,
        rejectionReason: reason,
      },
    });

    this.logger.log(`Action ${actionId} rejected by ${rejectedBy}: ${reason || 'No reason provided'}`);

    // Emit real-time event for UI notification
    this.realtimeEvents.emitAiActionRejected(tenantId, {
      actionId,
      userId: action.userId,
      agentName: action.agentName,
      actionType: action.actionType,
      status: 'rejected',
      confidence: action.confidence ?? undefined,
      severity: action.severity as 'LOW' | 'MEDIUM' | 'HIGH' | undefined,
      reason,
      timestamp: new Date().toISOString(),
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

    await this.prisma.agentPendingAction.update({
      where: { id: actionId },
      data: {
        status,
        executedAt: new Date(),
      },
    });

    if (!success && error) {
      this.logger.warn(`Action ${actionId} execution failed: ${error}`);
    } else {
      this.logger.log(`Action ${actionId} marked as ${status}`);
    }

    // Emit real-time event for UI notification
    const eventPayload = {
      actionId,
      userId: action.userId,
      agentName: action.agentName,
      actionType: action.actionType,
      status: success ? 'executed' as const : 'failed' as const,
      confidence: action.confidence ?? undefined,
      severity: action.severity as 'LOW' | 'MEDIUM' | 'HIGH' | undefined,
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
    const where: Prisma.AgentPendingActionWhereInput = { tenantId };
    if (userId) {
      where.userId = userId;
    }

    const counts = await this.prisma.agentPendingAction.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });

    return counts.reduce(
      (acc, item) => {
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
    const result = await this.prisma.agentPendingAction.updateMany({
      where: {
        status: PendingActionStatus.PENDING,
        expiresAt: {
          lt: new Date(),
        },
      },
      data: {
        status: PendingActionStatus.EXPIRED,
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

    // Delete in order due to foreign key constraints
    // Feedback references PendingAction, so it's deleted via cascade
    // But we also need to delete LearningProfiles separately
    await this.prisma.$transaction([
      // Delete feedback (cascades from pending actions)
      this.prisma.agentPendingAction.deleteMany({
        where: { tenantId },
      }),
      // Delete learning profiles
      this.prisma.agentLearningProfile.deleteMany({
        where: { tenantId },
      }),
    ]);

    this.logger.log(`Deleted all agent data for tenant ${tenantId}`);
  }

  /**
   * Delete all agent data for a specific user within a tenant.
   */
  async deleteUserData(tenantId: string, userId: string): Promise<void> {
      this.logger.warn(
        `Deleting agent data for user ${userId} in tenant ${tenantId}`,
    );

    await this.prisma.$transaction([
      this.prisma.agentPendingAction.deleteMany({
        where: { tenantId, userId },
      }),
      this.prisma.agentLearningProfile.deleteMany({
        where: { tenantId, userId },
      }),
    ]);

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
