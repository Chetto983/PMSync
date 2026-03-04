import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Inject,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { HitlService } from '../services/hitl.service';
import { ApproveActionDto } from '../dto/hitl.dto';
import type { AuthenticatedRequest } from '../../../common/types/request.types';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../../common/interfaces/tool-registry.interface';

/**
 * HitlController -- HITL approval endpoints for AI chat actions.
 *
 * POST /ai/chat/approve      -- Approve, reject, or modify a pending action
 * GET  /ai/chat/pending-actions -- List pending HITL actions for the user
 *
 * Phase 24: Backend Core Pipeline (Plan 02)
 */
@ApiTags('AI Chat - HITL')
@ApiBearerAuth()
@Controller('ai/chat')
@UseGuards(JwtAuthGuard, TenantGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class HitlController {
  private readonly logger = new Logger(HitlController.name);

  constructor(
    private readonly hitlService: HitlService,
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
  ) {}

  /**
   * Approve, reject, or modify a pending HITL action.
   */
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

    switch (dto.decision) {
      case 'approve':
        action = await this.hitlService.approveAction(
          dto.actionId,
          tenantId,
          userId,
        );
        await this.executeApprovedAction(
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
        // Use the modified payload stored by approveAction
        await this.executeApprovedAction(
          dto.actionId,
          (dto.modifiedPayload ?? action.actionPayload) as Record<string, unknown>,
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
        break;
    }

    return { success: true, action };
  }

  /**
   * List pending HITL actions for the authenticated user.
   */
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

    return { success: true, actions, total: actions.length };
  }

  /**
   * Execute an approved action via the tool registry.
   * Maps ActionType back to a tool name, locates the registered tool,
   * and invokes it. Marks the action EXECUTED on success, FAILED on error.
   */
  private async executeApprovedAction(
    actionId: string,
    payload: Record<string, unknown>,
    actionType: string,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    // Map ActionType enum value -> tool name registered in ToolRegistry
    const actionTypeToTool: Record<string, string> = {
      SEND_EMAIL: 'send_email',
      REPLY_EMAIL: 'reply_email',
      FORWARD_EMAIL: 'forward_email',
      DELETE_EMAIL: 'delete_email',
      SCHEDULE_MEETING: 'delete_event',
      DELETE_CONTACT: 'delete_contact',
    };

    const toolName = actionTypeToTool[actionType];
    if (!toolName) {
      const msg = `No tool mapping for actionType ${actionType}`;
      this.logger.warn(`HITL execution skipped: ${msg}`);
      await this.hitlService.markFailed(actionId, msg);
      return;
    }

    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) {
      const msg = `Tool '${toolName}' not found in registry for actionType ${actionType}`;
      this.logger.warn(`HITL execution skipped: ${msg}`);
      await this.hitlService.markFailed(actionId, msg);
      return;
    }

    try {
      const result = await tool.execute(payload, { tenantId, userId });
      await this.hitlService.markExecuted(actionId, {
        result: result as Record<string, unknown>,
        toolName,
        executedAt: new Date().toISOString(),
      });
      this.logger.log(`HITL action ${actionId} executed via tool '${toolName}'`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`HITL action ${actionId} execution failed: ${errorMsg}`);
      await this.hitlService.markFailed(actionId, errorMsg);
    }
  }
}
