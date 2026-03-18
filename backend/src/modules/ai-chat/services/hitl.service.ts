import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping';
import { ActionStatus, ActionType } from '@prisma/client';

/** Pending actions expire after 1 hour */
const HITL_EXPIRY_MS = 60 * 60 * 1000;

export interface CreateActionParams {
  tenantId: string;
  userId: string;
  conversationId: string;
  actionType: string;
  toolName?: string;
  actionPayload: Record<string, unknown>;
  confidence: number;
  reasoning: string;
  emailId?: string;
  batchId?: string;
}

/**
 * HitlService -- Human-in-the-Loop action management.
 *
 * Manages the ActionQueue lifecycle:
 * - Create PENDING_APPROVAL entries (from tool calls with needsApproval)
 * - Approve / reject / modify actions
 * - Expire stale actions via @Cron
 * - Mark actions as executed or failed
 *
 * Phase 24: Backend Core Pipeline (Plan 02)
 */
@Injectable()
export class HitlService {
  private readonly logger = new Logger(HitlService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a pending HITL action from a tool call that needs approval.
   * Sets expiresAt to 1 hour from now.
   */
  async createPendingAction(params: CreateActionParams) {
    const expiresAt = new Date(Date.now() + HITL_EXPIRY_MS);

    const action = await this.prisma.actionQueue.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        actionType: params.actionType as ActionType,
        actionPayload: {
          ...params.actionPayload,
          conversationId: params.conversationId,
          ...(params.toolName ? { toolName: params.toolName } : {}),
        },
        confidence: params.confidence,
        reasoning: params.reasoning,
        status: ActionStatus.PENDING_APPROVAL,
        expiresAt,
        emailId: params.emailId,
      },
    });

    this.logger.log(
      `Created HITL action ${action.id} (${params.actionType}) for user ${params.userId}`,
    );

    return action;
  }

  /**
   * Approve an action. Optionally modify the payload.
   * Returns the action for execution by the caller.
   */
  async approveAction(
    actionId: string,
    tenantId: string,
    userId: string,
    modifiedPayload?: Record<string, unknown>,
  ) {
    const action = await this.findAndValidateAction(actionId, tenantId);

    const updateData: Record<string, unknown> = {
      status: ActionStatus.APPROVED,
      approvedBy: userId,
      approvedAt: new Date(),
    };

    if (modifiedPayload) {
      updateData.actionPayload = {
        ...(action.actionPayload as Record<string, unknown>),
        ...modifiedPayload,
      };
    }

    const updated = await this.prisma.actionQueue.update({
      where: { id: actionId },
      data: updateData,
    });

    this.logger.log(
      `Action ${actionId} approved by ${userId}${modifiedPayload ? ' (modified)' : ''}`,
    );

    return updated;
  }

  /**
   * Reject an action with optional reason.
   */
  async rejectAction(
    actionId: string,
    tenantId: string,
    userId: string,
    reason?: string,
  ) {
    const action = await this.findAndValidateAction(actionId, tenantId);

    const updated = await this.prisma.actionQueue.update({
      where: { id: actionId },
      data: {
        status: ActionStatus.REJECTED,
        rejectedReason: reason || null,
      },
    });

    this.logger.log(`Action ${actionId} rejected by ${userId}`);

    return updated;
  }

  /**
   * Get pending actions for a user, optionally filtered by conversation.
   * Excludes expired actions.
   */
  async getPendingActions(
    tenantId: string,
    userId: string,
    conversationId?: string,
  ) {
    const now = new Date();

    const where: Record<string, unknown> = {
      tenantId,
      userId,
      status: ActionStatus.PENDING_APPROVAL,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };

    const actions = await this.prisma.actionQueue.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        actionType: true,
        actionPayload: true,
        confidence: true,
        reasoning: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    // Filter by conversationId if provided (stored in actionPayload)
    if (conversationId) {
      return actions.filter((a) => {
        const payload = a.actionPayload as Record<string, unknown>;
        return payload?.conversationId === conversationId;
      });
    }

    return actions;
  }

  /**
   * Expire stale PENDING_APPROVAL actions.
   * Runs every 5 minutes via NestJS @Cron.
   */
  @Cron('0 */5 * * * *')
  async expireStaleActions(): Promise<void> {
    await withoutTenantScopingAsync(async () => {
      const now = new Date();

      const result = await this.prisma.actionQueue.updateMany({
        where: {
          status: ActionStatus.PENDING_APPROVAL,
          expiresAt: { lt: now },
        },
        data: {
          status: ActionStatus.EXPIRED,
        },
      });

      if (result.count > 0) {
        this.logger.log(`Expired ${result.count} stale HITL actions`);
      }
    });
  }

  /**
   * Mark an action as successfully executed.
   */
  async markExecuted(actionId: string, result: Record<string, unknown>) {
    await this.prisma.actionQueue.update({
      where: { id: actionId },
      data: {
        status: ActionStatus.EXECUTED,
        executedAt: new Date(),
        executionResult: result as any, // Prisma Json type
      },
    });
  }

  /**
   * Mark an action as failed.
   */
  async markFailed(actionId: string, error: string) {
    await this.prisma.actionQueue.update({
      where: { id: actionId },
      data: {
        status: ActionStatus.FAILED,
        executionError: error,
      },
    });
  }

  /**
   * Load and validate an action exists, belongs to tenant, and is PENDING_APPROVAL.
   */
  private async findAndValidateAction(actionId: string, tenantId: string) {
    const action = await this.prisma.actionQueue.findUnique({
      where: { id: actionId },
    });

    if (!action) {
      throw new NotFoundException(`Action ${actionId} not found`);
    }

    if (action.tenantId !== tenantId) {
      throw new ForbiddenException('Action belongs to a different tenant');
    }

    if (action.status !== ActionStatus.PENDING_APPROVAL) {
      throw new ForbiddenException(
        `Action ${actionId} is ${action.status}, not PENDING_APPROVAL`,
      );
    }

    return action;
  }
}
