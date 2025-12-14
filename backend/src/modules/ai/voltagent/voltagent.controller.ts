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
  Query,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber, IsIn, IsObject } from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { VoltAgentService, type ChatOptions } from './voltagent.service';
import { FeedbackService } from './services/feedback.service';
import { HitlService } from './services/hitl.service';
import { DailyBriefingService } from './services/daily-briefing.service';
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
  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsIn(['small', 'medium', 'large'])
  model?: 'small' | 'medium' | 'large';
}

/**
 * DTO for approval decision.
 */
class ApprovalDecisionDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

/**
 * DTO for submitting an action for approval.
 */
class SubmitActionDto {
  @IsString()
  actionType!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  severity!: 'LOW' | 'MEDIUM' | 'HIGH';

  @IsString()
  summary!: string;

  @IsOptional()
  @IsNumber()
  confidence?: number;

  @IsOptional()
  @IsNumber()
  autoApproveThreshold?: number;
}

@ApiTags('VoltAgent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/voltagent')
export class VoltAgentController {
  private readonly logger = new Logger(VoltAgentController.name);

  constructor(
    private readonly voltAgentService: VoltAgentService,
    private readonly feedbackService: FeedbackService,
    private readonly hitlService: HitlService,
    private readonly dailyBriefingService: DailyBriefingService,
  ) {}

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
    const suspended = await this.voltAgentService.getSuspendedWorkflows(
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
    const suspended = await this.voltAgentService.getSuspendedWorkflow(
      executionId,
      req.user.tenantId,
    );

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
    const suspended = await this.voltAgentService.getSuspendedWorkflow(
      executionId,
      req.user.tenantId,
    );

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
      req.user.tenantId,
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
    const suspended = await this.voltAgentService.getSuspendedWorkflow(
      executionId,
      req.user.tenantId,
    );

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
      req.user.tenantId,
    );

    return {
      status: 'rejected',
      ...result,
    };
  }

  // ============ Stats & Feedback Endpoints ============

  /**
   * Get action counts by status.
   */
  @Get('stats/action-counts')
  @ApiOperation({ summary: 'Get action counts by status' })
  async getActionCounts(@Req() req: AuthenticatedRequest) {
    const counts = await this.hitlService.getActionCounts(req.user.tenantId);
    return { success: true, counts };
  }

  /**
   * Get learning statistics for the tenant.
   */
  @Get('stats/learning')
  @ApiOperation({ summary: 'Get learning profile statistics' })
  async getLearningStats(
    @Req() req: AuthenticatedRequest,
    @Query('userId') userId?: string,
  ) {
    const stats = await this.feedbackService.getLearningStats(
      req.user.tenantId,
      userId,
    );
    return { success: true, stats };
  }

  /**
   * Get aggregate statistics across all agents.
   */
  @Get('stats/aggregate')
  @ApiOperation({ summary: 'Get aggregate statistics' })
  async getAggregateStats(@Req() req: AuthenticatedRequest) {
    const stats = await this.feedbackService.getAggregateStats(req.user.tenantId);
    return { success: true, stats };
  }

  /**
   * Get feedback history.
   */
  @Get('feedback')
  @ApiOperation({ summary: 'Get feedback history' })
  async getFeedbackHistory(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('agentName') agentName?: string,
  ) {
    const result = await this.feedbackService.getFeedbackHistory(
      req.user.tenantId,
      {
        userId: req.user.userId,
        agentName,
        limit: limit ?? 50,
        offset: offset ?? 0,
      },
    );
    return { success: true, ...result };
  }

  /**
   * Reset learning profile for specific agent/action type.
   */
  @Post('learning/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset learning profile' })
  async resetLearning(
    @Req() req: AuthenticatedRequest,
    @Body() body: { agentName?: string; actionType?: string },
  ) {
    if (!body.agentName) {
      // Reset all learning for the user
      await this.feedbackService.resetLearningProfile(
        req.user.tenantId,
        req.user.userId,
        'SupervisorAgent', // Default agent
      );
      return { success: true, message: 'All learning profiles reset' };
    }

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

  // ============ Performance Telemetry Endpoints ============

  /**
   * Get performance telemetry and latency statistics.
   */
  @Get('stats/performance')
  @ApiOperation({ summary: 'Get performance telemetry statistics' })
  async getPerformanceStats(@Req() _req: AuthenticatedRequest) {
    const stats = await this.voltAgentService.getMetricsStats('SupervisorAgent');
    return {
      success: true,
      stats: {
        totalOperations: stats.totalOperations,
        avgLatencyMs: Math.round(stats.avgDuration),
        successRate: stats.successRate,
        totalTokens: stats.totalTokens,
      },
    };
  }

  /**
   * Get recent performance metrics for debugging.
   */
  @Get('stats/metrics')
  @ApiOperation({ summary: 'Get recent agent metrics' })
  async getRecentMetrics(
    @Req() _req: AuthenticatedRequest,
    @Query('agentName') agentName?: string,
    @Query('limit') limit?: number,
  ) {
    const metrics = await this.voltAgentService.getRecentMetrics(
      agentName,
      limit ?? 100,
    );
    return {
      success: true,
      metrics: metrics.map((m) => ({
        agentName: m.agentName,
        duration: m.duration,
        totalTokens: m.totalTokens,
        toolCalls: m.toolCalls,
        success: m.success,
        timestamp: m.timestamp,
      })),
      count: metrics.length,
    };
  }

  /**
   * Get comprehensive optimization statistics.
   * Includes semantic cache, model routing, and queue metrics.
   */
  @Get('stats/optimizations')
  @ApiOperation({ summary: 'Get AI optimization statistics (cache, routing, queues)' })
  async getOptimizationStats(@Req() req: AuthenticatedRequest) {
    const stats = await this.voltAgentService.getOptimizationStats(req.user.tenantId);
    return {
      success: true,
      optimizations: {
        semanticCache: {
          enabled: stats.semanticCache.enabled,
          cacheEntries: stats.semanticCache.entries,
          cacheHits: stats.semanticCache.totalHits,
          estimatedCostSavingsUSD: stats.semanticCache.estimatedSavings.toFixed(4),
        },
        modelRouting: {
          enabled: stats.modelRouting.enabled,
          totalRequests: stats.modelRouting.totalRequests,
          requestsByModel: stats.modelRouting.byModel,
          estimatedCostSavingsUSD: stats.modelRouting.estimatedSavings.toFixed(4),
        },
        backgroundQueue: {
          enabled: stats.queue.enabled,
          queues: stats.queue.metrics,
        },
        agentPerformance: {
          totalOperations: stats.agentMetrics.totalOperations,
          avgLatencyMs: Math.round(stats.agentMetrics.avgDuration),
          successRate: `${stats.agentMetrics.successRate.toFixed(1)}%`,
          totalTokensUsed: stats.agentMetrics.totalTokens,
        },
      },
    };
  }

  /**
   * Invalidate semantic cache for current tenant.
   */
  @Post('cache/invalidate')
  @ApiOperation({ summary: 'Invalidate semantic cache' })
  async invalidateCache(
    @Req() req: AuthenticatedRequest,
    @Body() body: { pattern?: string },
  ) {
    const invalidated = await this.voltAgentService.invalidateCache(
      req.user.tenantId,
      body.pattern,
    );
    return {
      success: true,
      message: body.pattern
        ? `Invalidated cache entries matching "${body.pattern}"`
        : 'All cache entries invalidated',
      entriesRemoved: invalidated,
    };
  }

  // ============ SSE Streaming Endpoint ============

  /**
   * Stream chat response using Server-Sent Events.
   * Uses POST to accept message body, returns SSE stream.
   * Supports client abort via connection close.
   */
  @Post('chat/stream')
  @ApiOperation({ summary: 'Stream chat response via SSE' })
  @ApiBody({ type: ChatRequestDto })
  async streamChat(
    @Req() req: AuthenticatedRequest,
    @Body() body: ChatRequestDto,
    @Res() res: Response,
  ) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    const options: ChatOptions = {
      userId: req.user.userId,
      tenantId: req.user.tenantId,
      conversationId: body.conversationId,
      locale: body.locale,
      model: body.model,
    };

    // Track connection state for abort handling
    let isConnectionClosed = false;

    // Handle client disconnect (AbortController on frontend)
    // Cast to Express Request to access the 'on' event method
    (req as unknown as Request).on('close', () => {
      isConnectionClosed = true;
      this.logger.debug(`Client disconnected from stream: ${options.userId}`);
    });

    try {
      // Stream chunks from VoltAgent
      for await (const chunk of this.voltAgentService.streamChat(body.message, options)) {
        // Check if client disconnected (abort)
        if (isConnectionClosed) {
          this.logger.debug(`Stopping stream - client disconnected`);
          break;
        }

        // Send SSE data event
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      }

      // Send completion event only if still connected
      if (!isConnectionClosed) {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      }
    } catch (error) {
      // Send error event only if still connected
      if (!isConnectionClosed) {
        const message = error instanceof Error ? error.message : 'Stream error';
        res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
      }
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  // ============ Daily Briefing Endpoints ============

  /**
   * Get daily briefing for the current user.
   * Returns cached briefing if available, generates on-demand if not.
   */
  @Get('briefing')
  @ApiOperation({ summary: 'Get daily email briefing' })
  async getBriefing(@Req() req: AuthenticatedRequest) {
    const briefing = await this.dailyBriefingService.generateBriefingOnDemand(
      req.user.tenantId,
      req.user.userId,
    );

    return {
      success: true,
      briefing,
    };
  }

  /**
   * Force regenerate daily briefing for the current user.
   */
  @Post('briefing/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh daily briefing' })
  async refreshBriefing(@Req() req: AuthenticatedRequest) {
    const result = await this.dailyBriefingService.triggerManualBriefing(
      req.user.tenantId,
      req.user.userId,
    );

    return {
      success: true,
      jobId: result.jobId,
      message: 'Briefing refresh triggered',
    };
  }

  /**
   * Get daily briefing service status.
   */
  @Get('briefing/status')
  @ApiOperation({ summary: 'Get briefing service status' })
  async getBriefingStatus() {
    const status = await this.dailyBriefingService.getStatus();
    return {
      success: true,
      ...status,
    };
  }
}
