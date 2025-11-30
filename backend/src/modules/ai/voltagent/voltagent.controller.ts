/**
 * VoltAgent Controller
 *
 * REST API endpoints for VoltAgent chat and approval workflows.
 */
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { VoltAgentService, type ChatOptions } from './voltagent.service';
import type { ApprovalResumeData } from './workflows';

interface AuthenticatedRequest {
  user: {
    userId: string;
    tenantId: string;
    role: string;
  };
}

/**
 * DTO for chat request.
 */
class ChatRequestDto {
  message!: string;
  conversationId?: string;
  locale?: string;
  model?: 'small' | 'medium' | 'large';
}

/**
 * DTO for approval decision.
 */
class ApprovalDecisionDto {
  approved!: boolean;
  rejectionReason?: string;
}

/**
 * DTO for submitting an action for approval.
 */
class SubmitActionDto {
  actionType!: string;
  payload!: Record<string, unknown>;
  severity!: 'LOW' | 'MEDIUM' | 'HIGH';
  summary!: string;
  confidence?: number;
  autoApproveThreshold?: number;
}

@ApiTags('VoltAgent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/voltagent')
export class VoltAgentController {
  constructor(private readonly voltAgentService: VoltAgentService) {}

  /**
   * Send a chat message to the VoltAgent supervisor.
   */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a chat message to VoltAgent' })
  @ApiBody({ type: ChatRequestDto })
  async chat(@Req() req: AuthenticatedRequest, @Body() body: ChatRequestDto) {
    const options: ChatOptions = {
      userId: req.user.userId,
      tenantId: req.user.tenantId,
      conversationId: body.conversationId,
      locale: body.locale,
      model: body.model,
    };

    return this.voltAgentService.chat(body.message, options);
  }

  /**
   * Submit an action for approval using VoltAgent workflow.
   */
  @Post('actions/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit an action for approval' })
  @ApiBody({ type: SubmitActionDto })
  async submitAction(
    @Req() req: AuthenticatedRequest,
    @Body() body: SubmitActionDto,
  ) {
    const action = {
      actionType: body.actionType,
      payload: body.payload,
      severity: body.severity,
      summary: body.summary,
      confidence: body.confidence,
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      agentName: 'SupervisorAgent',
    };

    const result = await this.voltAgentService.submitActionForApproval(
      action,
      body.autoApproveThreshold,
    );

    // Check if it's a suspended workflow or completed result
    if ('workflowResult' in result) {
      // It's a suspended workflow - don't expose internal workflowResult
      const suspended = result;
      return {
        status: 'pending_approval',
        executionId: suspended.executionId,
        suspendReason: suspended.suspendReason,
        suspendedAt: suspended.suspendedAt,
        action: suspended.action,
      };
    }

    // It's a completed result (auto-approved)
    return {
      status: 'completed',
      ...result,
    };
  }

  /**
   * Get all pending approvals for the current tenant.
   */
  @Get('actions/pending')
  @ApiOperation({ summary: 'Get pending approval actions' })
  async getPendingActions(@Req() req: AuthenticatedRequest) {
    const suspended = this.voltAgentService.getSuspendedWorkflows(
      req.user.tenantId,
    );

    return {
      actions: suspended.map((s) => ({
        executionId: s.executionId,
        actionType: s.action.actionType,
        severity: s.action.severity,
        summary: s.action.summary,
        payload: s.action.payload,
        suspendReason: s.suspendReason,
        suspendedAt: s.suspendedAt,
        userId: s.userId,
      })),
      total: suspended.length,
    };
  }

  /**
   * Get a specific pending action.
   */
  @Get('actions/:executionId')
  @ApiOperation({ summary: 'Get a pending action by ID' })
  @ApiParam({ name: 'executionId', description: 'Workflow execution ID' })
  async getPendingAction(
    @Req() req: AuthenticatedRequest,
    @Param('executionId') executionId: string,
  ) {
    const suspended = this.voltAgentService.getSuspendedWorkflow(executionId);

    if (!suspended) {
      throw new NotFoundException(`Pending action not found: ${executionId}`);
    }

    // Verify tenant access
    if (suspended.tenantId !== req.user.tenantId) {
      throw new NotFoundException(`Pending action not found: ${executionId}`);
    }

    return {
      executionId: suspended.executionId,
      actionType: suspended.action.actionType,
      severity: suspended.action.severity,
      summary: suspended.action.summary,
      payload: suspended.action.payload,
      suspendReason: suspended.suspendReason,
      suspendedAt: suspended.suspendedAt,
      userId: suspended.userId,
    };
  }

  /**
   * Approve a pending action (resume workflow).
   */
  @Post('actions/:executionId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending action' })
  @ApiParam({ name: 'executionId', description: 'Workflow execution ID' })
  async approveAction(
    @Req() req: AuthenticatedRequest,
    @Param('executionId') executionId: string,
  ) {
    const suspended = this.voltAgentService.getSuspendedWorkflow(executionId);

    if (!suspended) {
      throw new NotFoundException(`Pending action not found: ${executionId}`);
    }

    // Verify tenant access
    if (suspended.tenantId !== req.user.tenantId) {
      throw new NotFoundException(`Pending action not found: ${executionId}`);
    }

    const decision: ApprovalResumeData = {
      approved: true,
      approvedBy: req.user.userId,
    };

    const result = await this.voltAgentService.resumeApproval(
      executionId,
      decision,
    );

    return {
      status: 'approved',
      ...result,
    };
  }

  /**
   * Reject a pending action (resume workflow with rejection).
   */
  @Post('actions/:executionId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending action' })
  @ApiParam({ name: 'executionId', description: 'Workflow execution ID' })
  @ApiBody({ type: ApprovalDecisionDto })
  async rejectAction(
    @Req() req: AuthenticatedRequest,
    @Param('executionId') executionId: string,
    @Body() body: ApprovalDecisionDto,
  ) {
    const suspended = this.voltAgentService.getSuspendedWorkflow(executionId);

    if (!suspended) {
      throw new NotFoundException(`Pending action not found: ${executionId}`);
    }

    // Verify tenant access
    if (suspended.tenantId !== req.user.tenantId) {
      throw new NotFoundException(`Pending action not found: ${executionId}`);
    }

    const decision: ApprovalResumeData = {
      approved: false,
      approvedBy: req.user.userId,
      rejectionReason: body.rejectionReason,
    };

    const result = await this.voltAgentService.resumeApproval(
      executionId,
      decision,
    );

    return {
      status: 'rejected',
      ...result,
    };
  }
}
