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
import { SemanticCacheService } from './services/semantic-cache.service';
import { DeadlineExtractorService } from './services/deadline-extractor.service';
import { FollowUpService } from './services/follow-up.service';
import { ActionItemService } from './services/action-item.service';
import { AnalyticsService } from './services/analytics.service';
import { LongTermMemoryService, type MemoryCategory } from './memory';
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
    private readonly semanticCacheService: SemanticCacheService,
    private readonly deadlineExtractorService: DeadlineExtractorService,
    private readonly followUpService: FollowUpService,
    private readonly actionItemService: ActionItemService,
    private readonly analyticsService: AnalyticsService,
    private readonly longTermMemoryService: LongTermMemoryService,
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

  // ============ Semantic Cache Analytics Endpoints ============

  /**
   * Get detailed semantic cache analytics.
   * Includes hit rate, category breakdown, and tuning recommendations.
   */
  @Get('cache/analytics')
  @ApiOperation({ summary: 'Get semantic cache analytics and recommendations' })
  async getCacheAnalytics(@Req() req: AuthenticatedRequest) {
    const analytics = await this.semanticCacheService.getDetailedAnalytics(req.user.tenantId);
    return {
      success: true,
      analytics: {
        enabled: this.semanticCacheService.isEnabled(),
        lookups: analytics.analytics.lookups,
        hits: analytics.analytics.hits,
        misses: analytics.analytics.misses,
        hitRate: analytics.analytics.lookups > 0
          ? `${((analytics.analytics.hits / analytics.analytics.lookups) * 100).toFixed(1)}%`
          : '0%',
        avgHitSimilarity: analytics.analytics.avgHitSimilarity.toFixed(3),
        adaptiveThreshold: analytics.analytics.adaptiveThreshold.toFixed(3),
        lastThresholdAdjustment: new Date(analytics.analytics.lastThresholdAdjustment).toISOString(),
        thresholdHistory: analytics.analytics.thresholdHistory.map(h => ({
          threshold: h.threshold.toFixed(3),
          hitRate: `${(h.hitRate * 100).toFixed(1)}%`,
          timestamp: new Date(h.timestamp).toISOString(),
        })),
        categoryStats: Object.entries(analytics.analytics.categoryStats).map(([category, stats]) => ({
          category,
          lookups: stats.lookups,
          hits: stats.hits,
          hitRate: stats.lookups > 0 ? `${((stats.hits / stats.lookups) * 100).toFixed(1)}%` : '0%',
          threshold: analytics.categoryThresholds[category as keyof typeof analytics.categoryThresholds]?.toFixed(3) || '0.920',
        })),
      },
      config: {
        baseThreshold: analytics.config.similarityThreshold,
        adaptiveEnabled: analytics.config.adaptiveThreshold,
        categoryThresholdsEnabled: analytics.config.categoryThresholds,
        targetHitRate: `${(analytics.config.targetHitRate * 100).toFixed(0)}%`,
        minLookupsForTuning: analytics.config.minLookupsForTuning,
      },
      recommendations: analytics.recommendations,
    };
  }

  /**
   * Reset semantic cache analytics for current tenant.
   * Useful for recalibrating adaptive threshold after major changes.
   */
  @Post('cache/analytics/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset cache analytics for recalibration' })
  async resetCacheAnalytics(@Req() req: AuthenticatedRequest) {
    await this.semanticCacheService.resetAnalytics(req.user.tenantId);
    return {
      success: true,
      message: 'Cache analytics reset. Adaptive threshold will recalibrate based on new data.',
    };
  }

  /**
   * Manually set adaptive threshold for current tenant (admin override).
   */
  @Post('cache/threshold')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually set adaptive threshold (admin)' })
  async setAdaptiveThreshold(
    @Req() req: AuthenticatedRequest,
    @Body() body: { threshold: number },
  ) {
    if (body.threshold < 0.80 || body.threshold > 0.98) {
      return {
        success: false,
        error: 'Threshold must be between 0.80 and 0.98',
      };
    }

    this.semanticCacheService.setAdaptiveThreshold(req.user.tenantId, body.threshold);
    return {
      success: true,
      message: `Adaptive threshold set to ${body.threshold.toFixed(3)}`,
      newThreshold: body.threshold,
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
  // Long-Term Memory (Mem0) Endpoints
  // ========================================================================

  /**
   * Get all long-term memories for the current user.
   */
  @Get('memory')
  @ApiOperation({ summary: 'Get all long-term memories' })
  async getMemories(
    @Req() req: AuthenticatedRequest,
    @Query('category') category?: MemoryCategory,
    @Query('limit') limit?: number,
  ) {
    const memories = await this.longTermMemoryService.getAllMemories(
      req.user.tenantId,
      req.user.userId,
      { category, limit: limit ? Number(limit) : undefined },
    );

    return {
      success: true,
      count: memories.length,
      memories,
    };
  }

  /**
   * Search long-term memories using semantic search.
   */
  @Get('memory/search')
  @ApiOperation({ summary: 'Search long-term memories' })
  async searchMemories(
    @Req() req: AuthenticatedRequest,
    @Query('query') query: string,
    @Query('category') category?: MemoryCategory,
    @Query('limit') limit?: number,
    @Query('minImportance') minImportance?: number,
  ) {
    if (!query) {
      return {
        success: false,
        error: 'Query parameter is required',
      };
    }

    const memories = await this.longTermMemoryService.searchMemories(
      req.user.tenantId,
      req.user.userId,
      query,
      {
        category,
        limit: limit ? Number(limit) : undefined,
        minImportance: minImportance ? Number(minImportance) : undefined,
        includeMetadata: true,
      },
    );

    return {
      success: true,
      count: memories.length,
      memories,
    };
  }

  /**
   * Add a fact/memory manually.
   */
  @Post('memory')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a memory fact' })
  async addMemory(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      fact: string;
      category?: MemoryCategory;
      importance?: number;
    },
  ) {
    const memoryId = await this.longTermMemoryService.addFact(
      req.user.tenantId,
      req.user.userId,
      body.fact,
      {
        category: body.category,
        importance: body.importance,
      },
    );

    return {
      success: !!memoryId,
      memoryId,
    };
  }

  /**
   * Delete a specific memory.
   */
  @Post('memory/:memoryId/delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a memory' })
  @ApiParam({ name: 'memoryId', description: 'Memory ID to delete' })
  async deleteMemory(
    @Req() req: AuthenticatedRequest,
    @Param('memoryId') memoryId: string,
  ) {
    const deleted = await this.longTermMemoryService.deleteMemory(
      req.user.tenantId,
      memoryId,
    );

    return {
      success: deleted,
    };
  }

  /**
   * Delete all memories for the current user (GDPR compliance).
   */
  @Post('memory/delete-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete all memories (GDPR)' })
  async deleteAllMemories(@Req() req: AuthenticatedRequest) {
    const count = await this.longTermMemoryService.deleteUserMemories(
      req.user.tenantId,
      req.user.userId,
    );

    return {
      success: true,
      deletedCount: count,
    };
  }

  /**
   * Get memory statistics.
   */
  @Get('memory/stats')
  @ApiOperation({ summary: 'Get memory statistics' })
  async getMemoryStats(@Req() req: AuthenticatedRequest) {
    const stats = await this.longTermMemoryService.getStats(
      req.user.tenantId,
      req.user.userId,
    );

    return {
      success: true,
      enabled: this.longTermMemoryService.isEnabled(),
      ...stats,
    };
  }

  // ==========================================================================
  // DEADLINE EXTRACTION ENDPOINTS
  // ==========================================================================

  /**
   * Get upcoming deadlines for the current user.
   * Uses Redis cache for fast retrieval (supports >1000 users).
   */
  @Get('deadlines')
  @ApiOperation({ summary: 'Get upcoming deadlines' })
  async getUpcomingDeadlines(
    @Req() req: AuthenticatedRequest,
    @Query('days') days?: string,
  ) {
    const daysNum = days ? parseInt(days, 10) : 7;
    const deadlines = await this.deadlineExtractorService.getUpcomingDeadlines(
      req.user.tenantId,
      req.user.userId,
      daysNum,
    );

    return {
      success: true,
      enabled: this.deadlineExtractorService.isEnabled(),
      count: deadlines.length,
      deadlines,
    };
  }

  /**
   * Extract deadlines from text (preview mode).
   */
  @Post('deadlines/extract')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extract deadlines from text' })
  async extractDeadlines(
    @Req() _req: AuthenticatedRequest,
    @Body() body: { text: string; locale?: 'en' | 'it' },
  ) {
    const extracted = this.deadlineExtractorService.extractDeadlines(
      body.text,
      new Date(),
      body.locale || 'en',
    );

    return {
      success: true,
      count: extracted.length,
      deadlines: extracted.map((d) => ({
        date: d.date.toISOString(),
        text: d.text,
        context: d.context,
        confidence: d.confidence,
        isRecurring: d.isRecurring,
      })),
    };
  }

  /**
   * Mark a deadline as completed.
   */
  @Post('deadlines/:id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark deadline as completed' })
  @ApiParam({ name: 'id', description: 'Deadline ID' })
  async completeDeadline(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.deadlineExtractorService.completeDeadline(
      req.user.tenantId,
      req.user.userId,
      id,
    );

    return { success: true };
  }

  /**
   * Dismiss a deadline.
   */
  @Post('deadlines/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss a deadline' })
  @ApiParam({ name: 'id', description: 'Deadline ID' })
  async dismissDeadline(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.deadlineExtractorService.dismissDeadline(
      req.user.tenantId,
      req.user.userId,
      id,
    );

    return { success: true };
  }

  /**
   * Get deadline statistics.
   */
  @Get('deadlines/stats')
  @ApiOperation({ summary: 'Get deadline statistics' })
  async getDeadlineStats(@Req() req: AuthenticatedRequest) {
    const stats = await this.deadlineExtractorService.getDeadlineStats(
      req.user.tenantId,
      req.user.userId,
    );

    return {
      success: true,
      enabled: this.deadlineExtractorService.isEnabled(),
      ...stats,
    };
  }

  /**
   * Get deadline queue statistics (admin).
   */
  @Get('deadlines/queue')
  @ApiOperation({ summary: 'Get deadline queue stats' })
  async getDeadlineQueueStats(@Req() _req: AuthenticatedRequest) {
    const stats = await this.deadlineExtractorService.getQueueStats();

    return {
      success: true,
      ...stats,
    };
  }

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
    @Req() _req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const followUp = await this.followUpService.getFollowUp(id);

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
    @Req() _req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const followUp = await this.followUpService.resolveFollowUp(id, 'MANUAL');

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
    @Req() _req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { dueDate: string },
  ) {
    const followUp = await this.followUpService.snoozeFollowUp(
      id,
      new Date(body.dueDate),
    );

    return {
      success: true,
      followUp,
    };
  }

  // ===========================================================================
  // ACTION ITEMS ENDPOINTS (P1 Feature)
  // ===========================================================================

  /**
   * List action items with optional filters.
   */
  @Get('action-items')
  @ApiOperation({ summary: 'List action items' })
  async listActionItems(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('sourceType') sourceType?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const { tenantId, userId } = req.user;

    const items = await this.actionItemService.list(tenantId, userId, {
      status: status ? (status.split(',') as never) : undefined,
      sourceType: sourceType as never,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });

    return {
      success: true,
      items,
      count: items.length,
    };
  }

  /**
   * Get pending action items (cached for performance).
   */
  @Get('action-items/pending')
  @ApiOperation({ summary: 'Get pending action items (cached)' })
  async getPendingActionItems(@Req() req: AuthenticatedRequest) {
    const { tenantId, userId } = req.user;
    const items = await this.actionItemService.getPending(tenantId, userId);

    return {
      success: true,
      items,
      count: items.length,
    };
  }

  /**
   * Get overdue action items.
   */
  @Get('action-items/overdue')
  @ApiOperation({ summary: 'Get overdue action items' })
  async getOverdueActionItems(@Req() req: AuthenticatedRequest) {
    const { tenantId, userId } = req.user;
    const items = await this.actionItemService.getOverdue(tenantId, userId);

    return {
      success: true,
      items,
      count: items.length,
    };
  }

  /**
   * Get action item statistics.
   */
  @Get('action-items/stats')
  @ApiOperation({ summary: 'Get action item statistics' })
  async getActionItemStats(@Req() req: AuthenticatedRequest) {
    const { tenantId, userId } = req.user;
    const stats = await this.actionItemService.getStats(tenantId, userId);

    return {
      success: true,
      stats,
    };
  }

  /**
   * Create a new action item manually.
   */
  @Post('action-items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an action item' })
  async createActionItem(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      title: string;
      description?: string;
      sourceType?: string;
      sourceId?: string;
      priority?: number;
      dueDate?: string;
    },
  ) {
    const { tenantId, userId } = req.user;

    const item = await this.actionItemService.create({
      tenantId,
      userId,
      title: body.title,
      description: body.description,
      sourceType: (body.sourceType as never) || 'MANUAL',
      sourceId: body.sourceId,
      priority: body.priority,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      aiExtracted: false,
    });

    return {
      success: true,
      item,
    };
  }

  /**
   * Analyze text for action item patterns (pattern detection, no AI).
   */
  @Post('action-items/analyze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Analyze text for action item patterns' })
  async analyzeForActionItems(
    @Req() _req: AuthenticatedRequest,
    @Body() body: { text: string },
  ) {
    const detected = this.actionItemService.detectActionPatterns(body.text);
    const needsExtraction = this.actionItemService.needsExtraction(body.text);

    return {
      success: true,
      needsExtraction,
      detected,
      count: detected.length,
    };
  }

  /**
   * Extract action items from email using AI.
   */
  @Post('action-items/extract')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extract action items from email using AI' })
  async extractActionItems(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      emailId: string;
      subject: string;
      body: string;
      senderEmail?: string;
    },
  ) {
    const { tenantId, userId } = req.user;

    const createdIds = await this.actionItemService.extractFromEmail(
      tenantId,
      userId,
      body.emailId,
      body.subject,
      body.body,
      body.senderEmail,
    );

    return {
      success: true,
      createdIds,
      count: createdIds.length,
    };
  }

  /**
   * Queue action item extraction for background processing.
   */
  @Post('action-items/queue')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue action item extraction for email' })
  async queueActionItemExtraction(
    @Req() req: AuthenticatedRequest,
    @Body() body: { emailId?: string; emailIds?: string[] },
  ) {
    const { tenantId, userId } = req.user;

    let jobId: string;
    if (body.emailIds && body.emailIds.length > 0) {
      jobId = await this.actionItemService.queueBatchExtraction(
        tenantId,
        userId,
        body.emailIds,
      );
    } else if (body.emailId) {
      jobId = await this.actionItemService.queueExtraction(
        tenantId,
        userId,
        body.emailId,
      );
    } else {
      return { success: false, error: 'Either emailId or emailIds required' };
    }

    return {
      success: true,
      jobId,
    };
  }

  /**
   * Get a specific action item.
   */
  @Get('action-items/:id')
  @ApiOperation({ summary: 'Get an action item by ID' })
  @ApiParam({ name: 'id', description: 'Action item ID' })
  async getActionItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const { tenantId, userId } = req.user;
    const item = await this.actionItemService.getById(tenantId, userId, id);

    if (!item) {
      throw new NotFoundException('Action item not found');
    }

    return {
      success: true,
      item,
    };
  }

  /**
   * Update action item status.
   */
  @Post('action-items/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update action item status' })
  @ApiParam({ name: 'id', description: 'Action item ID' })
  async updateActionItemStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    const { tenantId, userId } = req.user;

    const item = await this.actionItemService.updateStatus(
      tenantId,
      userId,
      id,
      body.status as never,
    );

    return {
      success: true,
      item,
    };
  }

  /**
   * Update action item priority.
   */
  @Post('action-items/:id/priority')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update action item priority' })
  @ApiParam({ name: 'id', description: 'Action item ID' })
  async updateActionItemPriority(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { priority: number },
  ) {
    const { tenantId, userId } = req.user;

    const item = await this.actionItemService.updatePriority(
      tenantId,
      userId,
      id,
      body.priority,
    );

    return {
      success: true,
      item,
    };
  }

  /**
   * Update action item due date.
   */
  @Post('action-items/:id/due-date')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update action item due date' })
  @ApiParam({ name: 'id', description: 'Action item ID' })
  async updateActionItemDueDate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { dueDate: string | null },
  ) {
    const { tenantId, userId } = req.user;

    const item = await this.actionItemService.updateDueDate(
      tenantId,
      userId,
      id,
      body.dueDate ? new Date(body.dueDate) : null,
    );

    return {
      success: true,
      item,
    };
  }

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
}
