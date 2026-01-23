/**
 * VoltAgent Controller
 * Phase 9e: Slimmed down - domain endpoints extracted to separate controllers (2026-01-23)
 *
 * This controller handles core chat and action workflows.
 * Domain-specific endpoints are in:
 * - memory.controller.ts - Memory CRUD
 * - follow-up.controller.ts - Follow-up tracking
 * - analytics.controller.ts - Email analytics
 * - knowledge.controller.ts - Unified RAG search
 * - crm.controller.ts - Relationship intelligence
 * - scheduling.controller.ts - Calendar conflicts, focus time, meeting prep
 * - conversation.controller.ts - Conversation management
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
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { QuotaGuard, RequiresQuota } from '../../subscription/guards/quota.guard';
import { VoltAgentService, type ChatOptions } from './voltagent.service';
import { HitlService } from './services/hitl.service';
import { DailyBriefingService } from './services/daily-briefing.service';
import { WritingStyleService } from './services/writing-style.service';
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
  sessionId?: string;

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
@UseGuards(JwtAuthGuard, TenantGuard, QuotaGuard)
@Controller('api/v1/voltagent')
export class VoltAgentController {
  private readonly logger = new Logger(VoltAgentController.name);

  constructor(
    private readonly voltAgentService: VoltAgentService,
    private readonly hitlService: HitlService,
    private readonly dailyBriefingService: DailyBriefingService,
    private readonly writingStyleService: WritingStyleService,
  ) {}

  // ============ Core Chat Endpoints ============

  /**
   * Send a chat message to the VoltAgent supervisor.
   */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @RequiresQuota('ai')
  @ApiOperation({ summary: 'Send a chat message to VoltAgent' })
  @ApiBody({ type: ChatRequestDto })
  async chat(@Req() req: AuthenticatedRequest, @Body() body: ChatRequestDto) {
    const options: ChatOptions = {
      userId: req.user.userId,
      tenantId: req.user.tenantId,
      conversationId: body.conversationId || body.sessionId,
      locale: body.locale,
      model: body.model,
    };

    return this.voltAgentService.chat(body.message, options);
  }

  /**
   * Stream chat response using Server-Sent Events.
   */
  @Post('chat/stream')
  @RequiresQuota('ai')
  @ApiOperation({ summary: 'Stream chat response via SSE' })
  @ApiBody({ type: ChatRequestDto })
  async streamChat(
    @Req() req: AuthenticatedRequest,
    @Body() body: ChatRequestDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const conversationId =
      body.conversationId ||
      body.sessionId ||
      `${req.user.tenantId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const options: ChatOptions = {
      userId: req.user.userId,
      tenantId: req.user.tenantId,
      conversationId,
      locale: body.locale,
      model: body.model,
    };

    let isConnectionClosed = false;

    (req as unknown as Request).on('close', () => {
      isConnectionClosed = true;
      this.logger.debug(`Client disconnected from stream: ${options.userId}`);
    });

    try {
      res.write(`data: ${JSON.stringify({ type: 'metadata', conversationId })}\n\n`);

      for await (const chunk of this.voltAgentService.streamChat(body.message, options)) {
        if (isConnectionClosed) {
          this.logger.debug(`Stopping stream - client disconnected`);
          break;
        }
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      }

      if (!isConnectionClosed) {
        res.write(`data: ${JSON.stringify({ type: 'done', conversationId })}\n\n`);
      }
    } catch (error) {
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

  // ============ Action Approval Endpoints ============

  /**
   * Submit an action for approval using VoltAgent workflow.
   */
  @Post('actions/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit an action for approval' })
  @ApiBody({ type: SubmitActionDto })
  async submitAction(@Req() req: AuthenticatedRequest, @Body() body: SubmitActionDto) {
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

    if ('workflowResult' in result) {
      const suspended = result;
      return {
        status: 'pending_approval',
        executionId: suspended.executionId,
        suspendReason: suspended.suspendReason,
        suspendedAt: suspended.suspendedAt,
        action: suspended.action,
      };
    }

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
    const suspended = await this.voltAgentService.getSuspendedWorkflows(req.user.tenantId);

    return {
      success: true,
      actions: suspended.map((s) => ({
        id: s.executionId,
        executionId: s.executionId,
        actionType: s.action.actionType,
        severity: s.action.severity,
        summary: s.action.summary,
        payload: s.action.payload,
        status: 'PENDING',
        suspendReason: s.suspendReason,
        reasoningSteps: s.action.reasoningSteps,
        suspendedAt: s.suspendedAt,
        userId: s.userId,
        agentName: s.action.agentName,
        confidence: s.action.confidence,
        sessionId: s.sessionId,
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

    if (!suspended || suspended.tenantId !== req.user.tenantId) {
      throw new NotFoundException(`Pending action not found: ${executionId}`);
    }

    return {
      id: suspended.executionId,
      executionId: suspended.executionId,
      actionType: suspended.action.actionType,
      severity: suspended.action.severity,
      summary: suspended.action.summary,
      payload: suspended.action.payload,
      status: 'PENDING',
      suspendReason: suspended.suspendReason,
      reasoningSteps: suspended.action.reasoningSteps,
      suspendedAt: suspended.suspendedAt,
      userId: suspended.userId,
    };
  }

  /**
   * Approve a pending action.
   */
  @Post('actions/:executionId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending action' })
  @ApiParam({ name: 'executionId', description: 'Workflow execution ID' })
  async approveAction(
    @Req() req: AuthenticatedRequest,
    @Param('executionId') executionId: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const suspended = await this.voltAgentService.getSuspendedWorkflow(
      executionId,
      req.user.tenantId,
    );

    if (!suspended || suspended.tenantId !== req.user.tenantId) {
      throw new NotFoundException(`Pending action not found: ${executionId}`);
    }

    const decision: ApprovalResumeData = {
      approved: true,
      approvedBy: req.user.userId,
      payload: body.payload,
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
   * Reject a pending action.
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

    if (!suspended || suspended.tenantId !== req.user.tenantId) {
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

  // ============ Stats & Telemetry Endpoints ============

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
   * Get writing style statistics for the current user.
   */
  @Get('stats/writing-style')
  @ApiOperation({ summary: 'Get writing style profile' })
  async getWritingStyle(@Req() req: AuthenticatedRequest) {
    const profile = await this.writingStyleService.getOrCreateProfile(
      req.user.tenantId,
      req.user.userId,
    );
    return { success: true, profile };
  }

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
    const metrics = await this.voltAgentService.getRecentMetrics(agentName, limit ?? 100);
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

  // ============ Cache Management Endpoints ============

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

  /**
   * Clear agent cache (forces prompt reload).
   */
  @Post('cache/clear-agents')
  @ApiOperation({ summary: 'Clear agent cache (reload prompts)' })
  async clearAgentCache() {
    this.voltAgentService.clearAgentCache();
    return {
      success: true,
      message: 'Agent cache cleared. New prompts will be loaded on next request.',
    };
  }

  /**
   * Get semantic cache analytics - REMOVED for security.
   */
  @Get('cache/analytics')
  @ApiOperation({ summary: 'Semantic cache removed - returns disabled status' })
  async getCacheAnalytics(@Req() _req: AuthenticatedRequest) {
    return {
      success: true,
      message: 'Semantic cache was removed due to cross-tenant security issues.',
      analytics: {
        enabled: false,
        lookups: 0,
        hits: 0,
        misses: 0,
        hitRate: '0%',
      },
      recommendations: ['Semantic cache disabled for tenant isolation security.'],
    };
  }

  /**
   * Reset semantic cache analytics - REMOVED for security.
   */
  @Post('cache/analytics/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Semantic cache removed - no-op' })
  async resetCacheAnalytics(@Req() _req: AuthenticatedRequest) {
    return {
      success: true,
      message: 'Semantic cache was removed. No analytics to reset.',
    };
  }

  /**
   * Set adaptive threshold - REMOVED for security.
   */
  @Post('cache/threshold')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Semantic cache removed - no-op' })
  async setAdaptiveThreshold(
    @Req() _req: AuthenticatedRequest,
    @Body() _body: { threshold: number },
  ) {
    return {
      success: false,
      message: 'Semantic cache was removed due to cross-tenant security issues.',
    };
  }

  // ============ Daily Briefing Endpoints ============

  /**
   * Get enhanced daily briefing for the current user.
   */
  @Get('briefing')
  @RequiresQuota('ai')
  @ApiOperation({
    summary: 'Get enhanced daily briefing',
    description: `Returns a comprehensive daily briefing aggregating all AI Secretary data.`,
  })
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
  @ApiOperation({
    summary: 'Refresh daily briefing',
    description: 'Force regenerates the daily briefing with fresh data.',
  })
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
  @ApiOperation({
    summary: 'Get briefing service status',
    description: 'Returns service configuration and queue statistics.',
  })
  async getBriefingStatus() {
    const status = await this.dailyBriefingService.getStatus();
    return {
      success: true,
      ...status,
    };
  }

  // ============ Deadline Stubs (Disabled) ============

  @Get('deadlines')
  @ApiOperation({ summary: 'Get upcoming deadlines (stub)' })
  async getDeadlines(@Query('days') _days?: string) {
    return { success: true, enabled: false, count: 0, deadlines: [] };
  }

  @Post('deadlines/extract')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extract deadlines from text (stub)' })
  async extractDeadlines(@Body() _body: { text: string; locale?: string }) {
    return { success: true, enabled: false, count: 0, deadlines: [] };
  }

  @Post('deadlines/:id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark deadline complete (stub)' })
  async completeDeadline(@Param('id') _id: string) {
    return { success: true, enabled: false };
  }

  @Post('deadlines/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss deadline (stub)' })
  async dismissDeadline(@Param('id') _id: string) {
    return { success: true, enabled: false };
  }

  @Get('deadlines/stats')
  @ApiOperation({ summary: 'Get deadline stats (stub)' })
  async getDeadlineStats() {
    return { success: true, enabled: false, total: 0, today: 0, thisWeek: 0, overdue: 0 };
  }

  @Get('deadlines/queue')
  @ApiOperation({ summary: 'Get deadline queue stats (stub)' })
  async getDeadlineQueueStats() {
    return { success: true, enabled: false, pending: 0, processed: 0 };
  }
}
