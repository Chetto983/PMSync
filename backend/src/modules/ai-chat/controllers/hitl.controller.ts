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
@Controller(['ai/chat', 'api/v1/ai/chat'])
@UseGuards(JwtAuthGuard, TenantGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class HitlController {
  constructor(private readonly hitlService: HitlService) {}

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
        // Phase 25: Execute the approved action here
        // For now, mark as executed with stub result
        await this.hitlService.markExecuted(dto.actionId, {
          stub: true,
          message: 'Phase 25 will implement real tool execution',
        });
        break;

      case 'modify':
        action = await this.hitlService.approveAction(
          dto.actionId,
          tenantId,
          userId,
          dto.modifiedPayload,
        );
        // Phase 25: Execute with modified payload
        await this.hitlService.markExecuted(dto.actionId, {
          stub: true,
          modified: true,
        });
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
}
