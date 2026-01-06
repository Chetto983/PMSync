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
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { VoltAgentService, type ChatOptions } from './voltagent.service';
// FeedbackService removed - AI refactor v2.0
import { HitlService } from './services/hitl.service';
import { DailyBriefingService } from './services/daily-briefing.service';
// SemanticCacheService REMOVED - cross-tenant security issue
// DeadlineExtractorService removed - AI refactor v2.0
import { FollowUpService } from './services/follow-up.service';
import { WritingStyleService } from './services/writing-style.service';
// ActionItemService removed - AI refactor v2.0
import { AnalyticsService } from './services/analytics.service';
import { UnifiedKnowledgeService } from './services/unified-knowledge.service';
import { RelationshipIntelligenceService } from './services/relationship-intelligence.service';
import { CalendarConflictService } from './services/calendar-conflict.service';
import { FocusTimeService } from './services/focus-time.service';
import { MeetingPrepService } from './services/meeting-prep.service';
// Memory services removed - AI refactor v2.0
import type { AnalyticsResult, EmailAnalytics, DashboardAnalytics } from './services/analytics.service';
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

  /**
   * Alias for conversationId (for backwards compatibility)
   */
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
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('api/v1/voltagent')
export class VoltAgentController {
  private readonly logger = new Logger(VoltAgentController.name);

  constructor(
    private readonly voltAgentService: VoltAgentService,
    // FeedbackService removed - AI refactor v2.0
    private readonly hitlService: HitlService,
    private readonly dailyBriefingService: DailyBriefingService,
    // SemanticCacheService REMOVED - cross-tenant security issue
    // DeadlineExtractorService removed - AI refactor v2.0
    private readonly followUpService: FollowUpService,
    // ActionItemService removed - AI refactor v2.0
    private readonly analyticsService: AnalyticsService,
    // LongTermMemoryService removed - AI refactor v2.0
    private readonly unifiedKnowledgeService: UnifiedKnowledgeService,
    private readonly relationshipIntelligenceService: RelationshipIntelligenceService,
    private readonly calendarConflictService: CalendarConflictService,
    private readonly focusTimeService: FocusTimeService,
    private readonly meetingPrepService: MeetingPrepService,
    // VoltAgentMemoryService removed - AI refactor v2.0
    private readonly writingStyleService: WritingStyleService,
  ) { }

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
      // Support both conversationId and sessionId (backwards compatibility)
      conversationId: body.conversationId || body.sessionId,
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
      success: true,
      actions: suspended.map((s) => ({
        id: s.executionId, // Frontend compatibility alias
        executionId: s.executionId,
        actionType: s.action.actionType,
        severity: s.action.severity,
        summary: s.action.summary,
        payload: s.action.payload,
        status: 'PENDING',
        suspendReason: s.suspendReason,
        reasoningSteps: s.action.reasoningSteps, // Added for frontend display
        suspendedAt: s.suspendedAt,
        userId: s.userId,
        agentName: s.action.agentName,
        confidence: s.action.confidence,
        sessionId: s.sessionId, // ConversationId for linking to inline chat actions
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
      id: suspended.executionId, // Frontend compatibility alias
      executionId: suspended.executionId,
      actionType: suspended.action.actionType,
      severity: suspended.action.severity,
      summary: suspended.action.summary,
      payload: suspended.action.payload,
      status: 'PENDING',
      suspendReason: suspended.suspendReason,
      reasoningSteps: suspended.action.reasoningSteps, // Added for frontend display
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
    @Body() body: { payload?: Record<string, unknown> },
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

  // FeedbackService endpoints removed - AI refactor v2.0

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

    // Generate tenant-isolated conversationId if not provided
    const conversationId = body.conversationId || body.sessionId
      || `${req.user.tenantId}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const options: ChatOptions = {
      userId: req.user.userId,
      tenantId: req.user.tenantId,
      conversationId,
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
      // Send metadata event with conversationId FIRST (before streaming content)
      res.write(`data: ${JSON.stringify({ type: 'metadata', conversationId })}\n\n`);

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
        res.write(`data: ${JSON.stringify({ type: 'done', conversationId })}\n\n`);
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

  // ============ Semantic Cache Analytics Endpoints ============
  // NOTE: Semantic cache was REMOVED due to cross-tenant security issues.
  // These endpoints are kept for API compatibility but return disabled status.

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

  // ============ Enhanced Daily Briefing Endpoints ============

  /**
   * Get enhanced daily briefing for the current user.
   * Aggregates data from all AI Secretary services:
   * - Email summary (unread count, highlights, urgent items)
   * - Follow-up tracking (pending, overdue, due today)
   * - Deadline alerts (today, this week, overdue)
   * - Action items (todo, in progress, overdue, high priority)
   * - Calendar events (today's meetings)
   *
   * Returns cached briefing if available, generates on-demand if not.
   */
  @Get('briefing')
  @ApiOperation({
    summary: 'Get enhanced daily briefing',
    description: `Returns a comprehensive daily briefing aggregating all AI Secretary data:
    - **Email summary**: Unread count, urgent emails, key highlights
    - **Follow-ups**: Pending follow-ups, overdue items, due today
    - **Deadlines**: Today's deadlines, this week, overdue count
    - **Action items**: Todo count, in-progress, overdue, high priority items
    - **Calendar**: Today's meetings (if calendar connected)

    Briefings are cached for 24 hours. Use /briefing/refresh to force regeneration.`,
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
   * Clears the cache and generates a fresh briefing with latest data.
   */
  @Post('briefing/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh daily briefing',
    description: 'Force regenerates the daily briefing with fresh data from all AI Secretary services.',
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

  // ========================================================================
  // Long-Term Memory Endpoints - Removed (AI refactor v2.0)
  // LongTermMemoryService removed - use unified knowledge search
  // ========================================================================

  // ==========================================================================
  // DEADLINE EXTRACTION ENDPOINTS - Removed (AI refactor v2.0)
  // DeadlineExtractorService removed - deadlines in EmailAnalysis model
  // ==========================================================================

  // ==========================================================================
  // FOLLOW-UP TRACKING (P0 Critical Feature)
  // ==========================================================================

  /**
   * Get pending follow-ups for the user.
   */
  @Get('follow-ups')
  @ApiOperation({ summary: 'Get follow-ups' })
  async getFollowUps(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    // Parse status filter (PENDING, REMINDED, RESOLVED, EXPIRED)
    const statusFilter = status
      ? (status.split(',') as Array<'PENDING' | 'REMINDED' | 'RESOLVED' | 'EXPIRED'>)
      : undefined;

    const followUps = await this.followUpService.listFollowUps(
      req.user.tenantId,
      req.user.userId,
      {
        status: statusFilter && statusFilter.length === 1 ? statusFilter[0] : statusFilter,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0,
      },
    );

    return {
      success: true,
      count: followUps.length,
      followUps,
    };
  }

  /**
   * Get pending follow-ups (cached, fast).
   */
  @Get('follow-ups/pending')
  @ApiOperation({ summary: 'Get pending follow-ups (cached)' })
  async getPendingFollowUps(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    const followUps = await this.followUpService.getPendingFollowUps(
      req.user.tenantId,
      req.user.userId,
      limit ? parseInt(limit, 10) : 20,
    );

    return {
      success: true,
      count: followUps.length,
      followUps,
    };
  }

  /**
   * Get overdue follow-ups.
   */
  @Get('follow-ups/overdue')
  @ApiOperation({ summary: 'Get overdue follow-ups' })
  async getOverdueFollowUps(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    const followUps = await this.followUpService.getOverdueFollowUps(
      req.user.tenantId,
      req.user.userId,
      limit ? parseInt(limit, 10) : 20,
    );

    return {
      success: true,
      count: followUps.length,
      followUps,
    };
  }

  /**
   * Get follow-up statistics.
   */
  @Get('follow-ups/stats')
  @ApiOperation({ summary: 'Get follow-up statistics' })
  async getFollowUpStats(@Req() req: AuthenticatedRequest) {
    const stats = await this.followUpService.getStats(
      req.user.tenantId,
      req.user.userId,
    );

    return {
      success: true,
      ...stats,
    };
  }

  /**
   * Create a follow-up for an email.
   */
  @Post('follow-ups')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a follow-up' })
  async createFollowUp(
    @Req() req: AuthenticatedRequest,
    @Body() body: { emailId: string; reason?: string; dueDate?: string },
  ) {
    const followUp = await this.followUpService.createFollowUp({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      emailId: body.emailId,
      reason: body.reason,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    });

    return {
      success: true,
      followUp,
    };
  }

  /**
   * Analyze email text for follow-up patterns.
   */
  @Post('follow-ups/analyze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Analyze text for follow-up patterns' })
  async analyzeForFollowUp(
    @Req() _req: AuthenticatedRequest,
    @Body() body: { body: string; subject?: string },
  ) {
    const result = this.followUpService.analyzeForFollowUp(body.body, body.subject);

    return {
      success: true,
      ...result,
    };
  }

  /**
   * Get a specific follow-up.
   */
  @Get('follow-ups/:id')
  @ApiOperation({ summary: 'Get a follow-up by ID' })
  @ApiParam({ name: 'id', description: 'Follow-up ID' })
  async getFollowUp(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const followUp = await this.followUpService.getFollowUp(
      req.user.tenantId,
      req.user.userId,
      id,
    );

    if (!followUp) {
      throw new NotFoundException('Follow-up not found');
    }

    return {
      success: true,
      followUp,
    };
  }

  /**
   * Resolve a follow-up.
   */
  @Post('follow-ups/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a follow-up' })
  @ApiParam({ name: 'id', description: 'Follow-up ID' })
  async resolveFollowUp(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const followUp = await this.followUpService.resolveFollowUp(
      req.user.tenantId,
      req.user.userId,
      id,
      'MANUAL',
    );

    return {
      success: true,
      followUp,
    };
  }

  /**
   * Snooze a follow-up (extend due date).
   */
  @Post('follow-ups/:id/snooze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Snooze a follow-up' })
  @ApiParam({ name: 'id', description: 'Follow-up ID' })
  async snoozeFollowUp(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { dueDate: string },
  ) {
    const followUp = await this.followUpService.snoozeFollowUp(
      req.user.tenantId,
      req.user.userId,
      id,
      new Date(body.dueDate),
    );

    return {
      success: true,
      followUp,
    };
  }

  // ===========================================================================
  // ACTION ITEMS ENDPOINTS - Removed (AI refactor v2.0)
  // ActionItemService removed - use ActionQueue model via HITL endpoints
  // ===========================================================================

  // ===========================================================================
  // ANALYTICS ENDPOINTS (P1.5 - Mistral Code Interpreter)
  // ===========================================================================

  /**
   * Get dashboard analytics with email statistics and insights.
   */
  @Get('analytics/dashboard')
  @ApiOperation({
    summary: 'Get dashboard analytics',
    description: `Returns comprehensive dashboard analytics including:
    - **Email summary**: Total emails, unread count, sent/received today
    - **Volume trends**: Email volume over the past week
    - **Top senders**: Most frequent email senders
    - **Hourly distribution**: Email activity by hour of day
    - **AI insights**: Actionable recommendations based on email patterns

    Results are cached for 30 minutes. Use /analytics/dashboard/refresh to force regeneration.`,
  })
  async getDashboardAnalytics(@Req() req: AuthenticatedRequest): Promise<{
    success: boolean;
    analytics: DashboardAnalytics;
  }> {
    const { tenantId, userId } = req.user;
    const analytics = await this.analyticsService.getDashboardAnalytics(tenantId, userId);

    return {
      success: true,
      analytics,
    };
  }

  /**
   * Get email analytics for a specific period.
   */
  @Get('analytics/email')
  @ApiOperation({
    summary: 'Get email analytics',
    description: `Returns detailed email analytics for the specified period:
    - **Volume trends**: Sent vs received over time
    - **Top senders**: Most frequent email senders (top 10)
    - **Hourly distribution**: When you receive the most emails
    - **Insights**: AI-generated recommendations

    Periods: day, week (default), month`,
  })
  async getEmailAnalytics(
    @Req() req: AuthenticatedRequest,
    @Query('period') period?: 'day' | 'week' | 'month',
  ): Promise<{
    success: boolean;
    analytics: EmailAnalytics;
  }> {
    const { tenantId, userId } = req.user;
    const analytics = await this.analyticsService.getEmailAnalytics(
      tenantId,
      userId,
      period || 'week',
    );

    return {
      success: true,
      analytics,
    };
  }

  /**
   * Run AI-powered custom analytics using Mistral code_interpreter.
   * This endpoint executes Python code to analyze provided data.
   */
  @Post('analytics/ai')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run AI-powered analytics',
    description: `Execute AI-powered analytics using Mistral's code_interpreter tool.
    This allows for complex data analysis with Python code execution.

    **Request body:**
    - query: What to analyze (e.g., "show email volume trends", "find peak activity hours")
    - data: Optional JSON data to analyze. If not provided, will use available user data.
    - locale: Optional locale for response language (en, it)

    **Response includes:**
    - answer: Natural language analysis result
    - insights: Key findings (3-5 bullet points)
    - codeExecuted: Python code that was run (if any)
    - visualization: Base64-encoded chart image (if generated)

    Results are cached for 30 minutes based on query + data hash.`,
  })
  async runAiAnalytics(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      query: string;
      data?: Record<string, unknown>;
      locale?: string;
    },
  ): Promise<{
    success: boolean;
    result: AnalyticsResult;
  }> {
    const { tenantId, userId } = req.user;

    const result = await this.analyticsService.runAiAnalytics(
      tenantId,
      userId,
      body.query,
      body.data || {},
      body.locale || 'en',
    );

    return {
      success: true,
      result,
    };
  }

  /**
   * Invalidate analytics cache for the current user.
   */
  @Post('analytics/invalidate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Invalidate analytics cache',
    description: 'Clears cached analytics data for the current user. Use this after significant email changes.',
  })
  async invalidateAnalyticsCache(@Req() req: AuthenticatedRequest): Promise<{
    success: boolean;
    message: string;
  }> {
    const { tenantId, userId } = req.user;
    await this.analyticsService.invalidateCache(tenantId, userId);

    return {
      success: true,
      message: 'Analytics cache invalidated',
    };
  }

  /**
   * Check if analytics service is enabled.
   */
  @Get('analytics/status')
  @ApiOperation({
    summary: 'Get analytics service status',
    description: 'Returns whether the analytics service is enabled and configured.',
  })
  async getAnalyticsStatus(): Promise<{
    success: boolean;
    enabled: boolean;
  }> {
    return {
      success: true,
      enabled: this.analyticsService.isEnabled(),
    };
  }

  // ===========================================================================
  // UNIFIED KNOWLEDGE ENDPOINTS (P1.6 - Memory-First RAG)
  // ===========================================================================

  /**
   * Search across all knowledge sources with memory-first RAG.
   * Searches: emails, deadlines, follow-ups, action items, and user memories.
   */
  @Post('knowledge/search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unified knowledge search',
    description: `Performs memory-first RAG search across all knowledge sources:
    - **Memories**: User's long-term memories and preferences (searched first)
    - **Emails**: Semantic + keyword search (excluding spam/trash)
    - **Deadlines**: Upcoming and pending deadlines
    - **Follow-ups**: Pending follow-up items
    - **Action items**: Tasks and action items

    The search uses self-reflection to determine which sources are relevant
    based on the query, then performs parallel multi-source retrieval with
    memory-boosted re-ranking for personalized results.`,
  })
  async unifiedKnowledgeSearch(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      query: string;
      sources?: Array<'emails' | 'deadlines' | 'followups' | 'actions'>;
      limit?: number;
    },
  ): Promise<{
    success: boolean;
    context: string;
    sources: string[];
    itemCount: number;
  }> {
    const { tenantId, userId } = req.user;
    const locale = (req as unknown as Request).headers?.['accept-language'] || 'en';

    return this.unifiedKnowledgeService.search(tenantId, userId, body.query, {
      sources: body.sources,
      limit: body.limit,
      locale: typeof locale === 'string' ? locale : 'en',
    });
  }

  /**
   * Store information in long-term memory via unified knowledge service.
   */
  @Post('knowledge/remember')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remember information',
    description: `Store information in long-term memory for future retrieval.
    Categories:
    - **preference**: User preferences and settings
    - **fact**: Facts about the user or their work
    - **contact**: Information about contacts and relationships
    - **project**: Project-related information
    - **general**: General information`,
  })
  async rememberKnowledge(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      content: string;
      category?: 'preference' | 'fact' | 'contact' | 'project' | 'general';
    },
  ): Promise<{
    success: boolean;
    memoryId?: string;
  }> {
    const { tenantId, userId } = req.user;
    const locale = (req as unknown as Request).headers?.['accept-language'] || 'en';

    return this.unifiedKnowledgeService.remember(tenantId, userId, body.content, {
      category: body.category,
      locale: typeof locale === 'string' ? locale : 'en',
    });
  }

  /**
   * Get unified knowledge base statistics.
   */
  @Get('knowledge/stats')
  @ApiOperation({
    summary: 'Get knowledge base statistics',
    description: `Returns counts of items across all knowledge sources:
    - Memory count (long-term memories)
    - Deadline count (pending + due soon)
    - Follow-up count (pending + overdue)
    - Action item count (not done)`,
  })
  async getKnowledgeStats(@Req() req: AuthenticatedRequest): Promise<{
    success: boolean;
    memoryCount: number;
    deadlineCount: number;
    followupCount: number;
    actionCount: number;
  }> {
    const { tenantId, userId } = req.user;
    const stats = await this.unifiedKnowledgeService.getStats(tenantId, userId);

    return {
      success: true,
      ...stats,
    };
  }

  // ===========================================================================
  // CRM INTELLIGENCE ENDPOINTS (P1.7 - Relationship Tracking)
  // ===========================================================================

  /**
   * Get stale contacts (no interaction in X days).
   * Important contacts you may have lost touch with.
   */
  @Get('crm/stale-contacts')
  @ApiOperation({
    summary: 'Get stale contacts',
    description: `Returns contacts with no interaction in the specified number of days.
    Default threshold is 60 days. Results are sorted by relationship score (most important first).`,
  })
  async getStaleContacts(
    @Req() req: AuthenticatedRequest,
    @Query('days') days?: string,
    @Query('limit') limit?: string,
    @Query('minInteractions') minInteractions?: string,
  ) {
    const { tenantId } = req.user;

    const contacts = await this.relationshipIntelligenceService.getStaleContacts(tenantId, {
      staleDays: days ? parseInt(days, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      minInteractions: minInteractions ? parseInt(minInteractions, 10) : undefined,
    });

    return {
      success: true,
      count: contacts.length,
      contacts,
    };
  }

  /**
   * Get contacts needing reconnection (for scheduled reminders).
   */
  @Get('crm/reconnect')
  @ApiOperation({
    summary: 'Get contacts needing reconnection',
    description: `Returns stale contacts that haven't had a reconnect reminder sent recently.
    Used by the reconnect reminder scheduler job.`,
  })
  async getContactsNeedingReconnect(
    @Req() req: AuthenticatedRequest,
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    const { tenantId } = req.user;

    const contacts = await this.relationshipIntelligenceService.getContactsNeedingReconnect(tenantId, {
      staleDays: days ? parseInt(days, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    return {
      success: true,
      count: contacts.length,
      contacts,
    };
  }

  /**
   * Get top contacts by relationship score.
   */
  @Get('crm/top-contacts')
  @ApiOperation({
    summary: 'Get top contacts by relationship score',
    description: `Returns your most important contacts ranked by relationship score.
    Score is calculated based on: recency (40%), frequency (30%), reciprocity (20%), trend (10%).`,
  })
  async getTopContacts(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('minScore') minScore?: string,
  ) {
    const { tenantId } = req.user;

    const contacts = await this.relationshipIntelligenceService.getTopContacts(tenantId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      minScore: minScore ? parseFloat(minScore) : undefined,
    });

    return {
      success: true,
      count: contacts.length,
      contacts,
    };
  }

  /**
   * Get relationship stats for a specific contact.
   */
  @Get('crm/contacts/:contactId')
  @ApiOperation({
    summary: 'Get contact relationship stats',
    description: `Returns detailed relationship statistics for a specific contact:
    - Last interaction date
    - Total interactions (sent + received)
    - Reciprocity ratio (balance of sent vs received)
    - Relationship score
    - Stale status`,
  })
  @ApiParam({ name: 'contactId', description: 'Contact ID' })
  async getContactRelationshipStats(
    @Req() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
  ) {
    const { tenantId } = req.user;

    const stats = await this.relationshipIntelligenceService.getContactRelationshipStats(
      tenantId,
      contactId,
    );

    if (!stats) {
      throw new NotFoundException('Contact not found');
    }

    return {
      success: true,
      stats,
    };
  }

  /**
   * Get interaction history for a contact.
   */
  @Get('crm/contacts/:contactId/interactions')
  @ApiOperation({
    summary: 'Get contact interaction history',
    description: `Returns the interaction history for a specific contact.
    Includes emails sent/received, meetings, calls, and notes.`,
  })
  @ApiParam({ name: 'contactId', description: 'Contact ID' })
  async getContactInteractionHistory(
    @Req() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const { tenantId } = req.user;

    const interactions = await this.relationshipIntelligenceService.getContactInteractionHistory(
      tenantId,
      contactId,
      {
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      },
    );

    return {
      success: true,
      count: interactions.length,
      interactions,
    };
  }

  /**
   * Record a manual interaction with a contact (call, meeting, note).
   */
  @Post('crm/contacts/:contactId/interactions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Record manual interaction',
    description: `Record a manual interaction with a contact (call, meeting, or note).
    Email interactions are recorded automatically during sync.`,
  })
  @ApiParam({ name: 'contactId', description: 'Contact ID' })
  async recordManualInteraction(
    @Req() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
    @Body() body: {
      type: 'MEETING' | 'CALL' | 'NOTE';
      date?: string;
      summary?: string;
    },
  ) {
    const { tenantId, userId } = req.user;

    const interactionId = await this.relationshipIntelligenceService.recordManualInteraction(
      tenantId,
      userId,
      contactId,
      body.type,
      body.date ? new Date(body.date) : new Date(),
      body.summary,
    );

    return {
      success: true,
      interactionId,
    };
  }

  /**
   * Recalculate relationship score for a contact.
   */
  @Post('crm/contacts/:contactId/recalculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recalculate relationship score',
    description: `Triggers recalculation of the relationship score for a specific contact.
    Returns the score components and total score.`,
  })
  @ApiParam({ name: 'contactId', description: 'Contact ID' })
  async recalculateRelationshipScore(
    @Req() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
  ) {
    const { tenantId } = req.user;

    const scoreComponents = await this.relationshipIntelligenceService.calculateRelationshipScore(
      tenantId,
      contactId,
    );

    return {
      success: true,
      score: scoreComponents,
    };
  }

  /**
   * Get relationship graph for a contact (connected contacts).
   */
  @Get('crm/contacts/:contactId/graph')
  @ApiOperation({
    summary: 'Get relationship graph',
    description: `Returns contacts connected to the specified contact through shared
    email threads or meetings. Uses recursive CTE for graph traversal.`,
  })
  @ApiParam({ name: 'contactId', description: 'Contact ID' })
  async getRelationshipGraph(
    @Req() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
    @Query('depth') depth?: string,
  ) {
    const { tenantId } = req.user;

    const graph = await this.relationshipIntelligenceService.getRelationshipGraph(
      tenantId,
      contactId,
      depth ? parseInt(depth, 10) : undefined,
    );

    return {
      success: true,
      count: graph.length,
      nodes: graph,
    };
  }

  /**
   * Mark a contact as reminded (to prevent reminder spam).
   */
  @Post('crm/contacts/:contactId/reminded')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark contact as reminded',
    description: `Records that a reconnect reminder was sent for this contact.
    Prevents sending multiple reminders in a short time period.`,
  })
  @ApiParam({ name: 'contactId', description: 'Contact ID' })
  async markContactReminded(
    @Req() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
  ) {
    await this.relationshipIntelligenceService.markContactReminded(req.user.tenantId, contactId);

    return {
      success: true,
    };
  }

  /**
   * Batch recalculate all relationship scores (admin/backfill).
   */
  @Post('crm/recalculate-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recalculate all relationship scores',
    description: `Triggers batch recalculation of relationship scores for all contacts.
    Use this after importing historical data or for periodic refresh.`,
  })
  async recalculateAllScores(@Req() req: AuthenticatedRequest) {
    const { tenantId } = req.user;

    const result = await this.relationshipIntelligenceService.recalculateAllScores(tenantId);

    return {
      success: true,
      ...result,
    };
  }

  // ==========================================================================
  // P2 SMART SCHEDULING ENDPOINTS
  // ==========================================================================

  /**
   * Detect calendar conflicts for a proposed event.
   */
  @Post('scheduling/conflicts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Detect calendar conflicts',
    description: `Checks if a proposed event conflicts with existing calendar events.
    Returns conflict details and alternative time slot suggestions.`,
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'startTime', 'endTime'],
      properties: {
        title: { type: 'string', description: 'Event title' },
        startTime: { type: 'string', format: 'date-time', description: 'Event start time' },
        endTime: { type: 'string', format: 'date-time', description: 'Event end time' },
        duration: { type: 'number', description: 'Duration in minutes' },
        isFlexible: { type: 'boolean', description: 'Can be rescheduled if conflicts' },
        includeSuggestions: { type: 'boolean', description: 'Include alternative slots' },
        numSuggestions: { type: 'number', description: 'Number of suggestions to return' },
      },
    },
  })
  async detectConflicts(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      title: string;
      startTime: string;
      endTime: string;
      duration?: number;
      isFlexible?: boolean;
      includeSuggestions?: boolean;
      numSuggestions?: number;
    },
  ) {
    const { tenantId, userId } = req.user;

    const proposedEvent = {
      title: body.title,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      duration:
        body.duration ||
        Math.round(
          (new Date(body.endTime).getTime() - new Date(body.startTime).getTime()) /
          (1000 * 60),
        ),
      isFlexible: body.isFlexible ?? true,
    };

    const result = await this.calendarConflictService.detectConflicts(
      tenantId,
      userId,
      proposedEvent,
      {
        includeSuggestions: body.includeSuggestions,
        numSuggestions: body.numSuggestions,
      },
    );

    return {
      success: true,
      ...result,
    };
  }

  /**
   * Find available time slots for a meeting.
   */
  @Get('scheduling/available-slots')
  @ApiOperation({
    summary: 'Find available time slots',
    description: `Returns available time slots for scheduling a meeting
    within the user's working hours over the next N days.`,
  })
  async findAvailableSlots(
    @Req() req: AuthenticatedRequest,
    @Query('duration') duration?: string,
    @Query('days') days?: string,
    @Query('numSlots') numSlots?: string,
  ) {
    const { tenantId, userId } = req.user;

    const durationMinutes = duration ? parseInt(duration, 10) : 30;
    const lookAheadDays = days ? parseInt(days, 10) : 7;
    const slots = numSlots ? parseInt(numSlots, 10) : 5;

    const availableSlots = await this.calendarConflictService.findAlternativeSlots(
      tenantId,
      userId,
      {
        title: 'New Meeting',
        startTime: new Date(),
        endTime: new Date(Date.now() + durationMinutes * 60 * 1000),
        duration: durationMinutes,
        isFlexible: true,
      },
      slots,
      lookAheadDays,
    );

    return {
      success: true,
      count: availableSlots.length,
      slots: availableSlots,
    };
  }

  /**
   * Get user's scheduling preferences.
   */
  @Get('scheduling/preferences')
  @ApiOperation({
    summary: 'Get scheduling preferences',
    description: 'Returns user scheduling preferences including working hours and days.',
  })
  async getSchedulingPreferences(@Req() req: AuthenticatedRequest) {
    const { tenantId, userId } = req.user;

    const preferences = await this.calendarConflictService.getUserSchedulingPreferences(
      tenantId,
      userId,
    );

    return {
      success: true,
      preferences,
    };
  }

  /**
   * Get day's calendar busy percentage.
   */
  @Get('scheduling/day-load')
  @ApiOperation({
    summary: 'Get calendar load for a day',
    description: 'Returns how busy a specific day is as a percentage of working hours.',
  })
  async getDayLoad(
    @Req() req: AuthenticatedRequest,
    @Query('date') date?: string,
  ) {
    const { tenantId, userId } = req.user;

    const targetDate = date ? new Date(date) : new Date();
    const busyPercentage = await this.calendarConflictService.getDayBusyPercentage(
      tenantId,
      targetDate,
      userId,
    );

    return {
      success: true,
      date: targetDate.toISOString().split('T')[0],
      busyPercentage,
      freePercentage: 100 - busyPercentage,
    };
  }

  // ==========================================================================
  // FOCUS TIME ENDPOINTS
  // ==========================================================================

  /**
   * Find optimal focus time slots.
   */
  @Get('scheduling/focus-time/optimal')
  @ApiOperation({
    summary: 'Find optimal focus time slots',
    description: `Analyzes calendar patterns to find optimal times for focused work.
    Returns slots with minimal meeting conflicts.`,
  })
  async findOptimalFocusSlots(
    @Req() req: AuthenticatedRequest,
    @Query('duration') duration?: string,
    @Query('preferredTime') preferredTime?: string,
    @Query('numSlots') numSlots?: string,
  ) {
    const { tenantId, userId } = req.user;

    const preferences = {
      duration: duration ? parseInt(duration, 10) : 120,
      frequency: 'daily' as const,
      preferredTime: (preferredTime as 'morning' | 'afternoon' | 'flexible') || 'flexible',
      minBlockSize: 60,
      protectFromMeetings: true,
      autoDeclineMeetings: false,
    };

    const slots = await this.focusTimeService.findOptimalFocusSlots(
      tenantId,
      userId,
      preferences,
      numSlots ? parseInt(numSlots, 10) : 5,
    );

    return {
      success: true,
      count: slots.length,
      slots,
    };
  }

  /**
   * Get focus time statistics.
   */
  @Get('scheduling/focus-time/stats')
  @ApiOperation({
    summary: 'Get focus time statistics',
    description: 'Returns statistics about calendar patterns and focus time availability.',
  })
  async getFocusTimeStats(
    @Req() req: AuthenticatedRequest,
    @Query('days') days?: string,
  ) {
    const { tenantId, userId } = req.user;

    const stats = await this.focusTimeService.getFocusTimeStats(
      tenantId,
      userId,
      days ? parseInt(days, 10) : 30,
    );

    return {
      success: true,
      stats,
    };
  }

  /**
   * Create focus time blocks based on preferences.
   */
  @Post('scheduling/focus-time/create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create focus time blocks',
    description: 'Creates protected focus time blocks based on user preferences.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        duration: { type: 'number', description: 'Duration in minutes (default: 120)' },
        frequency: {
          type: 'string',
          enum: ['daily', 'weekly', 'twice_weekly'],
          description: 'How often to schedule focus time',
        },
        preferredTime: {
          type: 'string',
          enum: ['morning', 'afternoon', 'flexible'],
          description: 'Preferred time of day',
        },
        protectFromMeetings: { type: 'boolean', description: 'Block meeting requests' },
      },
    },
  })
  async createFocusBlocks(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      duration?: number;
      frequency?: 'daily' | 'weekly' | 'twice_weekly';
      preferredTime?: 'morning' | 'afternoon' | 'flexible';
      protectFromMeetings?: boolean;
    },
  ) {
    const { tenantId, userId } = req.user;

    const preferences = {
      duration: body.duration || 120,
      frequency: body.frequency || 'daily',
      preferredTime: body.preferredTime || 'flexible',
      minBlockSize: 60,
      protectFromMeetings: body.protectFromMeetings ?? true,
      autoDeclineMeetings: false,
    };

    const blocks = await this.focusTimeService.createFocusBlocks(
      tenantId,
      userId,
      preferences,
    );

    return {
      success: true,
      count: blocks.length,
      blocks,
    };
  }

  /**
   * Check if current time is during a focus block.
   */
  @Get('scheduling/focus-time/status')
  @ApiOperation({
    summary: 'Check focus time status',
    description: 'Returns whether the current time is during a focus block.',
  })
  async getFocusTimeStatus(@Req() req: AuthenticatedRequest) {
    const { tenantId, userId } = req.user;

    const status = await this.focusTimeService.isInFocusBlock(tenantId, userId, new Date());

    return {
      success: true,
      ...status,
    };
  }

  // ==========================================================================
  // MEETING PREP ENDPOINTS
  // ==========================================================================

  /**
   * Get meeting preparation brief.
   */
  @Get('scheduling/meeting-prep/:eventId')
  @ApiOperation({
    summary: 'Get meeting preparation brief',
    description: `Generates a comprehensive meeting brief including attendee info,
    related emails, previous meetings, and suggested agenda.`,
  })
  @ApiParam({ name: 'eventId', description: 'Calendar event ID' })
  async getMeetingBrief(
    @Req() req: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Query('includeEmails') includeEmails?: string,
    @Query('includePreviousMeetings') includePreviousMeetings?: string,
    @Query('includeActionItems') includeActionItems?: string,
  ) {
    const { tenantId, userId } = req.user;

    const brief = await this.meetingPrepService.prepareBrief(tenantId, userId, eventId, {
      includeEmails: includeEmails !== 'false',
      includePreviousMeetings: includePreviousMeetings !== 'false',
      includeActionItems: includeActionItems !== 'false',
    });

    return {
      success: true,
      brief,
    };
  }

  /**
   * Get upcoming meetings needing preparation.
   */
  @Get('scheduling/meeting-prep')
  @ApiOperation({
    summary: 'Get meetings needing prep',
    description: 'Returns upcoming meetings that may need preparation briefs.',
  })
  async getUpcomingMeetingsNeedingPrep(
    @Req() req: AuthenticatedRequest,
    @Query('hoursAhead') hoursAhead?: string,
  ) {
    const { tenantId, userId } = req.user;

    const meetings = await this.meetingPrepService.getUpcomingMeetingsNeedingPrep(
      tenantId,
      userId,
      hoursAhead ? parseInt(hoursAhead, 10) : 24,
    );

    return {
      success: true,
      count: meetings.length,
      meetings,
    };
  }

  // ==========================================================================
  // CONVERSATION MANAGEMENT ENDPOINTS - Removed (AI refactor v2.0)
  // VoltAgentMemoryService removed - conversations are stateless
  // ==========================================================================
}
