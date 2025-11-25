import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/guards/tenant.guard';
import { AuthenticatedRequest } from '../../../../common/types/request.types';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MultiAgentService } from '../services/multi-agent.service';
import { HitlService, PendingActionStatus } from '../services/hitl.service';
import { FeedbackService } from '../services/feedback.service';
import { ProcessMessageDto } from '../dto/process-message.dto';
import {
  ApproveActionDto,
  RejectActionDto,
  GetPendingActionsQueryDto,
} from '../dto/pending-action.dto';
import { AgentContext } from '../interfaces/agent-context.interface';

@ApiTags('Multi-Agent AI')
@Controller('ai/multi-agent')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MultiAgentController {
  private readonly logger = new Logger(MultiAgentController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly multiAgentService: MultiAgentService,
    private readonly hitlService: HitlService,
    private readonly feedbackService: FeedbackService,
  ) {}

  /**
   * Fetch user preferences from the database.
   */
  private async getUserPreferences(userId: string): Promise<{
    language: string;
    timezone: string;
    autoApproveThreshold: number | null;
    aiSmartRepliesEnabled: boolean;
    aiSummarizationEnabled: boolean;
    aiSchedulingEnabled: boolean;
  }> {
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
      select: {
        language: true,
        timezone: true,
        aiAutoApproveThreshold: true,
        aiSmartRepliesEnabled: true,
        aiSummarizationEnabled: true,
        aiSchedulingEnabled: true,
      },
    });

    return {
      language: prefs?.language || 'en',
      timezone: prefs?.timezone || 'UTC',
      autoApproveThreshold: prefs?.aiAutoApproveThreshold ?? 0.9,
      aiSmartRepliesEnabled: prefs?.aiSmartRepliesEnabled ?? true,
      aiSummarizationEnabled: prefs?.aiSummarizationEnabled ?? true,
      aiSchedulingEnabled: prefs?.aiSchedulingEnabled ?? true,
    };
  }

  /**
   * Process a user message through the multi-agent system.
   * POST /ai/multi-agent/process
   */
  @Post('process')
  @ApiOperation({ summary: 'Process a message through the multi-agent system' })
  @ApiResponse({ status: 200, description: 'Message processed successfully' })
  async processMessage(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ProcessMessageDto,
  ) {
    // Fetch user preferences from database
    const userPrefs = await this.getUserPreferences(req.user.userId);

    // Check if AI features are enabled for this user
    // Note: We still allow processing, but specific agents can check these flags
    this.logger.debug(
      `User preferences: language=${userPrefs.language}, timezone=${userPrefs.timezone}, ` +
      `autoApprove=${userPrefs.autoApproveThreshold}, smartReplies=${userPrefs.aiSmartRepliesEnabled}`,
    );

    const context: AgentContext = {
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      sessionId: dto.sessionId,
      userMessage: dto.message,
      history: dto.history,
      preferences: {
        // Use dto.locale as override, otherwise use database preference
        language: dto.locale || userPrefs.language,
        timezone: userPrefs.timezone,
        // Use dto.autoApproveThreshold as override, otherwise use database preference
        autoApproveThreshold: dto.autoApproveThreshold ?? userPrefs.autoApproveThreshold ?? 0.9,
        // Pass AI feature flags to context for agents to check
        aiSmartRepliesEnabled: userPrefs.aiSmartRepliesEnabled,
        aiSummarizationEnabled: userPrefs.aiSummarizationEnabled,
        aiSchedulingEnabled: userPrefs.aiSchedulingEnabled,
      },
    };

    const result = await this.multiAgentService.process(context, {
      knownIntent: dto.knownIntent,
      forceAgent: dto.forceAgent,
      autoApproveThreshold: dto.autoApproveThreshold ?? userPrefs.autoApproveThreshold ?? 0.9,
    });

    return {
      success: true,
      ...result,
    };
  }

  /**
   * Get list of registered agents.
   * GET /ai/multi-agent/agents
   */
  @Get('agents')
  @ApiOperation({ summary: 'List registered agents' })
  async getAgents() {
    const agents = this.multiAgentService.getRegisteredAgents();

    return {
      success: true,
      agents: agents.map((agent) => ({
        name: agent.name,
        description: agent.description,
        supportedIntents: agent.supportedIntents,
      })),
    };
  }

  /**
   * Get pending actions for the current user/tenant.
   * GET /ai/multi-agent/pending-actions
   */
  @Get('pending-actions')
  @ApiOperation({ summary: 'Get pending actions awaiting approval' })
  async getPendingActions(
    @Request() req: AuthenticatedRequest,
    @Query() query: GetPendingActionsQueryDto,
  ) {
    const result = await this.hitlService.getPendingActions({
      tenantId: req.user.tenantId,
      userId: query.userId || req.user.userId,
      status: query.status || PendingActionStatus.PENDING,
      agentName: query.agentName,
      limit: query.limit || 50,
      offset: query.offset || 0,
    });

    return {
      success: true,
      ...result,
    };
  }

  /**
   * Get a single pending action by ID.
   * GET /ai/multi-agent/pending-actions/:id
   */
  @Get('pending-actions/:id')
  @ApiOperation({ summary: 'Get a specific pending action' })
  async getPendingAction(
    @Request() req: AuthenticatedRequest,
    @Param('id') actionId: string,
  ) {
    const action = await this.hitlService.getPendingAction(
      req.user.tenantId,
      actionId,
    );

    return {
      success: true,
      action,
    };
  }

  /**
   * Approve a pending action.
   * POST /ai/multi-agent/pending-actions/:id/approve
   */
  @Post('pending-actions/:id/approve')
  @ApiOperation({ summary: 'Approve and execute a pending action' })
  async approveAction(
    @Request() req: AuthenticatedRequest,
    @Param('id') actionId: string,
    @Body() dto: ApproveActionDto,
  ) {
    const result = await this.multiAgentService.approveAndExecuteAction(
      req.user.tenantId,
      actionId,
      req.user.userId,
    );

    return {
      success: result.success,
      actionId,
      error: result.error,
    };
  }

  /**
   * Reject a pending action.
   * POST /ai/multi-agent/pending-actions/:id/reject
   */
  @Post('pending-actions/:id/reject')
  @ApiOperation({ summary: 'Reject a pending action' })
  async rejectAction(
    @Request() req: AuthenticatedRequest,
    @Param('id') actionId: string,
    @Body() dto: RejectActionDto,
  ) {
    await this.multiAgentService.rejectAction(
      req.user.tenantId,
      actionId,
      req.user.userId,
      dto.reason,
    );

    return {
      success: true,
      actionId,
    };
  }

  /**
   * Get action counts by status.
   * GET /ai/multi-agent/pending-actions/counts
   */
  @Get('stats/action-counts')
  @ApiOperation({ summary: 'Get action counts by status' })
  async getActionCounts(@Request() req: AuthenticatedRequest) {
    const counts = await this.hitlService.getActionCounts(
      req.user.tenantId,
      req.user.userId,
    );

    return {
      success: true,
      counts,
    };
  }

  /**
   * Get learning statistics.
   * GET /ai/multi-agent/stats/learning
   */
  @Get('stats/learning')
  @ApiOperation({ summary: 'Get learning profile statistics' })
  async getLearningStats(@Request() req: AuthenticatedRequest) {
    const stats = await this.multiAgentService.getLearningStats(
      req.user.tenantId,
      req.user.userId,
    );

    return {
      success: true,
      stats,
    };
  }

  /**
   * Get aggregate statistics.
   * GET /ai/multi-agent/stats/aggregate
   */
  @Get('stats/aggregate')
  @ApiOperation({ summary: 'Get aggregate statistics' })
  async getAggregateStats(@Request() req: AuthenticatedRequest) {
    const stats = await this.multiAgentService.getAggregateStats(
      req.user.tenantId,
    );

    return {
      success: true,
      stats,
    };
  }

  /**
   * Get feedback history.
   * GET /ai/multi-agent/feedback
   */
  @Get('feedback')
  @ApiOperation({ summary: 'Get feedback history' })
  async getFeedbackHistory(
    @Request() req: AuthenticatedRequest,
    @Query('agentName') agentName?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const result = await this.feedbackService.getFeedbackHistory(
      req.user.tenantId,
      {
        userId: req.user.userId,
        agentName,
        limit: limit || 50,
        offset: offset || 0,
      },
    );

    return {
      success: true,
      ...result,
    };
  }

  /**
   * Reset learning profile for an agent.
   * POST /ai/multi-agent/learning/reset
   */
  @Post('learning/reset')
  @ApiOperation({ summary: 'Reset learning profile for an agent' })
  async resetLearning(
    @Request() req: AuthenticatedRequest,
    @Body() body: { agentName: string; actionType?: string },
  ) {
    await this.feedbackService.resetLearningProfile(
      req.user.tenantId,
      req.user.userId,
      body.agentName,
      body.actionType,
    );

    return {
      success: true,
      message: `Learning profile reset for ${body.agentName}${body.actionType ? `:${body.actionType}` : ''}`,
    };
  }
}
