import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import type { AuthenticatedRequest } from '../../../common/types/request.types';
import { PiiResolutionService } from '../../ai/guards/pii-resolution.service';
import {
  ApproveActionDto,
  PendingActionResponse,
} from '../dto/hitl.dto';
import { HitlService } from '../services/hitl.service';
import {
  CalendarToolsService,
  ContactToolsService,
  EmailToolsService,
} from '../tools';

type ExecutionResult = {
  success: boolean;
  error?: string;
  summary?: string;
  data?: Record<string, unknown>;
  executionTimeMs: number;
};

type ExecutableTool = {
  execute?: (input: Record<string, unknown>) => Promise<unknown>;
};

/**
 * HitlController -- HITL approval endpoints for AI chat actions.
 *
 * POST /ai/chat/approve -- Approve, reject, or modify a pending action
 * GET  /ai/chat/pending-actions -- List pending HITL actions for the user
 */
@ApiTags('AI Chat - HITL')
@ApiBearerAuth()
@Controller('ai/chat')
@UseGuards(TenantGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class HitlController {
  private readonly logger = new Logger(HitlController.name);

  constructor(
    private readonly hitlService: HitlService,
    private readonly emailToolsService: EmailToolsService,
    private readonly calendarToolsService: CalendarToolsService,
    private readonly contactToolsService: ContactToolsService,
    private readonly piiResolutionService: PiiResolutionService,
  ) {}

  @Post('approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolve a HITL action',
    description:
      'Approve, reject, or modify a pending tool action that required human approval.',
  })
  @ApiResponse({ status: 200, description: 'Action resolved' })
  @ApiResponse({ status: 404, description: 'Action not found' })
  @ApiResponse({
    status: 403,
    description: 'Action belongs to different tenant or not pending',
  })
  async approve(
    @Req() req: Request & { user: AuthenticatedRequest['user'] },
    @Body() dto: ApproveActionDto,
  ) {
    const { tenantId, userId } = req.user;

    let action;
    let executionResult: ExecutionResult | undefined;

    switch (dto.decision) {
      case 'approve':
        action = await this.hitlService.approveAction(
          dto.actionId,
          tenantId,
          userId,
        );
        executionResult = await this.executeApprovedAction(
          dto.actionId,
          action.actionPayload as Record<string, unknown>,
          action.actionType as string,
          tenantId,
          userId,
        );
        break;

      case 'modify':
        action = await this.hitlService.approveAction(
          dto.actionId,
          tenantId,
          userId,
          dto.modifiedPayload,
        );
        executionResult = await this.executeApprovedAction(
          dto.actionId,
          action.actionPayload as Record<string, unknown>,
          action.actionType as string,
          tenantId,
          userId,
        );
        break;

      case 'reject':
        action = await this.hitlService.rejectAction(
          dto.actionId,
          tenantId,
          userId,
          dto.rejectionReason,
        );
        return {
          status: 'rejected' as const,
          approved: false,
          rejectionReason: dto.rejectionReason,
          action: this.mapApprovalAction(action),
        };
    }

    return {
      status: 'approved' as const,
      approved: true,
      approvedBy: userId,
      approvedAt: action.approvedAt,
      executionResult,
      action: this.mapApprovalAction(action),
    };
  }

  @Get('pending-actions')
  @ApiOperation({
    summary: 'List pending HITL actions',
    description:
      'Returns pending actions that need approval for the current user.',
  })
  @ApiQuery({
    name: 'conversationId',
    required: false,
    description: 'Filter by conversation ID',
  })
  @ApiResponse({ status: 200, description: 'Pending actions listed' })
  async getPendingActions(
    @Req() req: Request & { user: AuthenticatedRequest['user'] },
    @Query('conversationId') conversationId?: string,
  ) {
    const actions = await this.hitlService.getPendingActions(
      req.user.tenantId,
      req.user.userId,
      conversationId,
    );

    const mapped = actions.map((action) =>
      this.mapPendingAction(action, req.user.userId),
    );

    return { success: true, actions: mapped, total: mapped.length };
  }

  private async executeApprovedAction(
    actionId: string,
    payload: Record<string, unknown>,
    actionType: string,
    tenantId: string,
    userId: string,
  ): Promise<ExecutionResult> {
    const startedAt = Date.now();
    const toolName = this.resolveToolName(actionType, payload);

    if (!toolName) {
      const msg = `No tool mapping for actionType ${actionType}`;
      this.logger.warn(`HITL execution skipped: ${msg}`);
      await this.hitlService.markFailed(actionId, msg);
      return {
        success: false,
        error: msg,
        executionTimeMs: Date.now() - startedAt,
      };
    }

    const conversationId =
      typeof payload.conversationId === 'string'
        ? payload.conversationId
        : undefined;

    const tool = this.getExecutableTool(
      toolName,
      tenantId,
      userId,
      conversationId,
    );
    if (!tool?.execute) {
      const msg = `Tool '${toolName}' not available for actionType ${actionType}`;
      this.logger.warn(`HITL execution skipped: ${msg}`);
      await this.hitlService.markFailed(actionId, msg);
      return {
          success: false,
        error: msg,
        executionTimeMs: Date.now() - startedAt,
      };
    }

    try {
      const result = await tool.execute(this.stripInternalPayload(payload));
      await this.hitlService.markExecuted(actionId, {
        result: result as Record<string, unknown>,
        toolName,
        executedAt: new Date().toISOString(),
      });
      this.logger.log(`HITL action ${actionId} executed via tool '${toolName}'`);
      return {
        success: true,
        summary: `Executed ${toolName}`,
        data: result as Record<string, unknown>,
        executionTimeMs: Date.now() - startedAt,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`HITL action ${actionId} execution failed: ${errorMsg}`);
      await this.hitlService.markFailed(actionId, errorMsg);
      return {
        success: false,
        error: errorMsg,
        executionTimeMs: Date.now() - startedAt,
      };
    }
  }

  private mapPendingAction(
    action: {
      id: string;
      actionType: string;
      actionPayload: unknown;
      confidence: number;
      reasoning: string | null;
      createdAt: Date;
      expiresAt: Date | null;
    },
    userId: string,
  ): PendingActionResponse {
    const payload = (action.actionPayload || {}) as Record<string, unknown>;
    const toolName =
      typeof payload.toolName === 'string' ? payload.toolName : undefined;

    return {
      id: action.id,
      executionId: action.id,
      actionType: action.actionType,
      severity: this.mapSeverity(action.actionType, toolName),
      summary:
        action.reasoning ??
        `${toolName ?? action.actionType} requires approval`,
      payload,
      suspendReason: 'requires_approval',
      suspendedAt: action.createdAt,
      userId,
      agentName: 'ai-chat',
      confidence: action.confidence ?? undefined,
      status: 'PENDING',
      expiresAt: action.expiresAt,
      reasoningSteps: action.reasoning ?? undefined,
    };
  }

  private mapApprovalAction(action: {
    actionType: string;
    actionPayload: unknown;
    reasoning?: string | null;
  }) {
    return {
      actionType: action.actionType,
      summary:
        action.reasoning ??
        `${action.actionType} requires approval`,
      payload: (action.actionPayload ?? {}) as Record<string, unknown>,
    };
  }

  private mapSeverity(
    actionType: string,
    toolName?: string,
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (toolName === 'delete_event') return 'HIGH';

    const highSeverity = new Set(['SEND_EMAIL', 'DELETE_EMAIL', 'DELETE_CONTACT']);
    const mediumSeverity = new Set([
      'SCHEDULE_MEETING',
      'REPLY_EMAIL',
      'FORWARD_EMAIL',
    ]);

    if (highSeverity.has(actionType)) return 'HIGH';
    if (mediumSeverity.has(actionType)) return 'MEDIUM';
    return 'LOW';
  }

  private resolveToolName(
    actionType: string,
    payload: Record<string, unknown>,
  ): string | undefined {
    if (typeof payload.toolName === 'string') {
      return payload.toolName;
    }

    if (
      actionType === 'DELETE_EMAIL' &&
      typeof payload.eventId === 'string' &&
      typeof payload.emailId !== 'string'
    ) {
      return 'delete_event';
    }

    const actionTypeToTool: Record<string, string> = {
      SEND_EMAIL: 'send_email',
      REPLY_EMAIL: 'reply_email',
      FORWARD_EMAIL: 'forward_email',
      DELETE_EMAIL: 'delete_email',
      SCHEDULE_MEETING: 'delete_event',
      DELETE_CONTACT: 'delete_contact',
    };

    return actionTypeToTool[actionType];
  }

  private getExecutableTool(
    toolName: string,
    tenantId: string,
    userId: string,
    conversationId?: string,
  ): ExecutableTool | undefined {
    const resolvedConversationId = conversationId ?? `hitl:${userId}`;
    const piiResolve = async (
      rawPayload: Record<string, unknown>,
    ): Promise<Record<string, unknown>> =>
      this.piiResolutionService.resolvePayload(
        tenantId,
        resolvedConversationId,
        rawPayload,
      );

    const tools = {
      ...this.emailToolsService.getTools(
        tenantId,
        resolvedConversationId,
        piiResolve,
      ),
      ...this.calendarToolsService.getTools(
        tenantId,
        resolvedConversationId,
        piiResolve,
      ),
      ...this.contactToolsService.getTools(
        tenantId,
        resolvedConversationId,
        piiResolve,
      ),
    };

    return (tools as unknown as Record<string, ExecutableTool>)[toolName];
  }

  private stripInternalPayload(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const { conversationId: _conversationId, toolName: _toolName, ...rest } =
      payload;
    return rest;
  }
}
