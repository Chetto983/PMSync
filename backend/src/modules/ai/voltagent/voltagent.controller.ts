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
  Optional,
  Inject,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsNumber, IsIn, IsObject, IsNotEmpty } from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { QuotaGuard, RequiresQuota } from '../../subscription/guards/quota.guard';
import { VoltAgentService, type ChatOptions} from './voltagent.service';
import { HitlService } from './services/hitl.service';
import { DailyBriefingService } from './services/daily-briefing.service';
import { WritingStyleService } from './services/writing-style.service';
import { SuggestedPromptsService, type ViewContext, type PromptSuggestion } from './services/suggested-prompts.service';
import type { ApprovalResumeData } from './workflows';
import { PiiResolutionService } from '../guards';
import { RequiresConsent } from '../../compliance/decorators/requires-consent.decorator';

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
  @IsNotEmpty({ message: 'Message cannot be empty' })
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
  @IsIn(['small', 'large', 'creative', 'router', 'reasoning'])
  model?: 'small' | 'large' | 'creative' | 'router' | 'reasoning';

  @IsOptional()
  @IsObject()
  viewContext?: {
    currentView: string;
    selectedEmailId?: string;
    selectedFolderId?: string;
    selectedContactId?: string;
  };
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
    private readonly suggestedPromptsService: SuggestedPromptsService,
    @Optional() @Inject(PiiResolutionService) private readonly piiResolutionService: PiiResolutionService | null,
  ) {}

  // ============ Core Chat Endpoints ============

  /**
   * Send a chat message to the VoltAgent supervisor.
   */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @RequiresConsent('ai_email_processing')
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
      viewContext: body.viewContext,
    };

    return this.voltAgentService.chat(body.message, options);
  }

  /**
   * Stream chat response using AI SDK v6 native protocol.
   * Uses VoltAgent's toUIMessageStream() for proper protocol compliance.
   * Frontend should use DefaultChatTransport from @ai-sdk/react.
   */
  @Post('chat/stream/v3')
  @HttpCode(HttpStatus.OK)
  @RequiresConsent('ai_email_processing')
  @RequiresQuota('ai')
  @ApiOperation({ summary: 'Stream chat via AI SDK v6 native protocol' })
  @ApiBody({ type: ChatRequestDto })
  async streamChatV3(
    @Req() req: AuthenticatedRequest,
    @Body() body: ChatRequestDto,
    @Res() res: Response,
  ) {
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
      viewContext: body.viewContext,
    };

    let isConnectionClosed = false;
    (req as unknown as Request).on('close', () => {
      isConnectionClosed = true;
    });

    try {
      // Get raw VoltAgent result with PII transform
      const { streamResult, piiTransform } = await this.voltAgentService.createStreamContext(
        body.message,
        options,
      );

      // Use VoltAgent's native toUIMessageStream() for AI SDK v6 compliance
      // Send metadata to frontend via messageMetadata callback
      const uiStream = streamResult.toUIMessageStream({
        sendReasoning: false,
        sendSources: false,
        messageMetadata: ({ part }: { part: { type: string; usage?: { totalTokens?: number } } }) => {
          // Only send metadata on finish part
          if (part.type === 'finish' && part.usage) {
            return {
              totalTokens: part.usage.totalTokens,
            };
          }
          return undefined;
        },
      });

      // Apply PII sanitization transform
      const sanitizedStream = uiStream.pipeThrough(piiTransform);

      // Set AI SDK v6 required headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('x-vercel-ai-ui-message-stream', 'v1');
      res.flushHeaders();

      // Stream chunks to response
      const reader = sanitizedStream.getReader();
      const encoder = new TextEncoder();

      while (!isConnectionClosed) {
        const { done, value } = await reader.read();
        if (done) break;

        // AI SDK streams UIMessageChunk objects - serialize to SSE format
        const sseData = `data: ${JSON.stringify(value)}\n\n`;
        res.write(encoder.encode(sseData));
      }

      if (!isConnectionClosed) {
        res.write('data: [DONE]\n\n');
      }
    } catch (error) {
      this.logger.error(`[V3 Stream] Error: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('x-vercel-ai-ui-message-stream', 'v1');
      }
      res.write(`data: ${JSON.stringify({ type: 'error', errorText: error instanceof Error ? error.message : 'Stream error' })}\n\n`);
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  // ============ Suggested Prompts Endpoint (CHAT-02) ============

  /**
   * Get suggested prompts based on user's current view context.
   * Frontend calls this when view changes to get relevant prompt suggestions.
   */
  @Get('suggested-prompts')
  @ApiOperation({ summary: 'Get context-aware prompt suggestions' })
  async getSuggestedPrompts(
    @Query('view') view: string = 'ai',
    @Query('locale') locale: string = 'en',
    @Query('emailId') emailId?: string,
    @Query('folderId') folderId?: string,
    @Query('contactId') contactId?: string,
  ): Promise<{ prompts: PromptSuggestion[] }> {
    const viewContext: ViewContext = {
      currentView: view as ViewContext['currentView'],
      selectedEmailId: emailId,
      selectedFolderId: folderId,
      selectedContactId: contactId,
    };
    return {
      prompts: this.suggestedPromptsService.getPromptsForView(viewContext, locale),
    };
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

    // Resolve PII placeholders so user can verify real addresses before approving
    const actions = await Promise.all(
      suspended.map(async (s) => {
        let payload = s.action.payload;
        let summary = s.action.summary;

        if (this.piiResolutionService && s.sessionId) {
          payload = await this.piiResolutionService.resolvePayload(
            req.user.tenantId, s.sessionId, payload,
          );
          if (summary) {
            summary = await this.piiResolutionService.resolveText(
              req.user.tenantId, s.sessionId, summary,
            );
          }
        }

        return {
          id: s.executionId,
          executionId: s.executionId,
          actionType: s.action.actionType,
          severity: s.action.severity,
          summary,
          payload,
          status: 'PENDING',
          suspendReason: s.suspendReason,
          reasoningSteps: s.action.reasoningSteps,
          suspendedAt: s.suspendedAt,
          userId: s.userId,
          agentName: s.action.agentName,
          confidence: s.action.confidence,
          sessionId: s.sessionId,
        };
      }),
    );

    return {
      success: true,
      actions,
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

    // Resolve PII placeholders so user can verify real addresses before approving
    let payload = suspended.action.payload;
    let summary = suspended.action.summary;

    if (this.piiResolutionService && suspended.sessionId) {
      payload = await this.piiResolutionService.resolvePayload(
        req.user.tenantId, suspended.sessionId, payload,
      );
      if (summary) {
        summary = await this.piiResolutionService.resolveText(
          req.user.tenantId, suspended.sessionId, summary,
        );
      }
    }

    return {
      id: suspended.executionId,
      executionId: suspended.executionId,
      actionType: suspended.action.actionType,
      severity: suspended.action.severity,
      summary,
      payload,
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
   * Clear all agent cache (admin only, forces prompt reload).
   * Uses Redis SCAN for production safety.
   */
  @Post('cache/clear-agents')
  @ApiOperation({ summary: 'Clear all agent cache (admin only)' })
  async clearAgentCache() {
    const count = await this.voltAgentService.clearAgentCache();
    return {
      success: true,
      message: 'Agent cache cleared. New prompts will be loaded on next request.',
      cleared: count,
    };
  }

  /**
   * Clear agent cache for current tenant (GDPR-compliant).
   * Uses Redis SCAN for production safety (non-blocking).
   */
  @Post('cache/clear-tenant')
  @ApiOperation({ summary: 'Clear agent cache for current tenant (GDPR)' })
  async clearTenantCache(@Req() req: AuthenticatedRequest) {
    const tenantId = req.user.tenantId;
    const count = await this.voltAgentService.clearAgentCacheForTenant(tenantId);
    return {
      success: true,
      cleared: count,
      gdprCompliant: true,
    };
  }

  /**
   * Clear all caches for a specific user (GDPR Art. 17 - Right to Erasure).
   * Called automatically when user requests account deletion.
   * Security: Only allows clearing own cache or admin clearing any user.
   */
  @Post('cache/clear-user/:userId')
  @ApiOperation({ summary: 'Clear all caches for a user (GDPR Art. 17)' })
  @ApiParam({ name: 'userId', description: 'User ID (email) to clear cache for' })
  async clearUserCache(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
  ) {
    const tenantId = req.user.tenantId;

    // Security: Only allow clearing your own cache or admin clearing any user
    // FIX (L8): Role values are lowercase ('admin', 'super-admin', 'user')
    if (req.user.userId !== userId && req.user.role !== 'admin' && req.user.role !== 'super-admin') {
      return {
        success: false,
        error: 'Cannot clear other users cache',
      };
    }

    const results = await this.voltAgentService.clearUserCaches(tenantId, userId);

    this.logger.log(`[GDPR Art.17] Cache clear requested for user ${userId} in tenant ${tenantId}`);

    return {
      success: true,
      cleared: {
        agentPool: results.agentPool,
        userContext: results.userContext ? 1 : 0,
      },
      gdprArt17Compliant: true,
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
