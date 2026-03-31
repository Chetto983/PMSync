import {
  BadRequestException,
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Query,
  UseGuards,
  Request,
  Req,
  Param,
  UsePipes,
  ValidationPipe,
  Logger,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { FollowUpStatus } from '@prisma/client';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { QuotaGuard, RequiresQuota } from '../../subscription/guards/quota.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { EmailInsightsService } from '../services/email-insights.service';
import { KnowledgeBaseService, type KnowledgeBaseSearchHit } from '../services/knowledge-base.service';
import { EmailTriageService } from '../services/email-triage.service';
import { RequiresConsent } from '../../compliance/decorators/requires-consent.decorator';
import { RateTierDecorator } from '../../../common/decorators/rate-tier.decorator';
import { ConsentGuard } from '../../compliance/guards/consent.guard';
import { TriageBackfillSchedulerService } from '../services/triage-backfill-scheduler.service';
// Phase 26: Non-chat AI services
import { BriefingService } from '../services/briefing.service';
import { RelationshipScoreService } from '../../contacts/services/relationship-score.service';
import { FollowUpDetectionService } from '../services/follow-up-detection.service';
import { DraftGenerationService } from '../services/draft-generation.service';
import { SearchKnowledgeBaseDto } from '../dto/knowledge-base.dto';
import {
  EmailAiDto,
  SummaryResponseDto,
  SmartReplyResponseDto,
  CategorizeResponseDto,
  ComposeEmailDto,
  ComposeEmailResponseDto,
  SentimentResponseDto,
  PriorityResponseDto,
  PriorityRequestDto,
  AnalyzeEmailResponseDto,
  UpdateFollowUpStatusDto,
  SnoozeFollowUpDto,
} from '../dto/ai.dto';

/**
 * AI Controller
 *
 * Provides AI-powered endpoints for:
 * - Email insights (summarize, smart-reply, categorize, compose)
 * - Knowledge base search (RAG)
 * - Email triage and priority scoring
 * - Daily briefing, follow-up detection, draft generation (Phase 26)
 *
 * Phase 24: Chat endpoint moved to AiChatModule (ai-chat.controller.ts)
 */
@ApiTags('AI')
@ApiCookieAuth()
@Controller('ai')
@UseGuards(TenantGuard, QuotaGuard, ConsentGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly emailInsightsService: EmailInsightsService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly emailTriageService: EmailTriageService,
    private readonly triageBackfillService: TriageBackfillSchedulerService,
    private readonly prisma: PrismaService,
    // Phase 26: Non-chat AI services
    private readonly briefingService: BriefingService,
    private readonly followUpDetectionService: FollowUpDetectionService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly relationshipScoreService: RelationshipScoreService,
  ) {}

  // Phase 24: Chat endpoint moved to AiChatModule (ai-chat.controller.ts)

  /**
   * AI-assisted email composition (draft body + optional subject)
   */
  @Post('compose')
  @RateTierDecorator('safe-write')
  @HttpCode(HttpStatus.OK)
  @RequiresConsent('ai_email_processing')
  @RequiresQuota('ai')
  @ApiOperation({
    summary: 'AI-assisted email composition',
    description: 'Generate a ready-to-send email draft from a prompt, with optional tone and context',
  })
  @ApiResponse({ status: 200, description: 'Draft generated', type: ComposeEmailResponseDto })
  async composeEmail(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ComposeEmailDto,
  ): Promise<ComposeEmailResponseDto> {
    const result = await this.emailInsightsService.composeEmail(req.user.tenantId, dto, req.user.userId);
    return { success: true, ...result };
  }

  /** Summarize email (CONSOLIDATED: unified analysis with 24h cache) */
  @Post('summarize/:emailId')
  @RateTierDecorator('safe-write')
  @HttpCode(HttpStatus.OK)
  @RequiresConsent('ai_email_processing')
  @RequiresQuota('ai')
  @ApiOperation({
    summary: 'Summarize email',
    description: 'Generate an AI-powered summary of a specific email (uses unified analysis with 24h cache)',
  })
  @ApiParam({ name: 'emailId', description: 'Email ID to summarize' })
  @ApiResponse({ status: 200, description: 'Summary generated', type: SummaryResponseDto })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async summarizeEmail(
    @Request() req: AuthenticatedRequest,
    @Param('emailId') emailId: string,
    @Body() dto?: EmailAiDto,
  ): Promise<SummaryResponseDto> {
    const analysis = await this.emailInsightsService.analyzeEmailUnified(
      req.user.tenantId,
      emailId,
      dto?.locale,
    );

    return { success: true, summary: analysis.summary, meta: analysis.meta };
  }

  /** Generate smart reply suggestions */
  @Post('smart-reply/:emailId')
  @RateTierDecorator('safe-write')
  @HttpCode(HttpStatus.OK)
  @RequiresConsent('ai_email_processing')
  @RequiresQuota('ai')
  @ApiOperation({
    summary: 'Generate smart replies',
    description: 'Generate AI-powered reply suggestions for a specific email',
  })
  @ApiParam({ name: 'emailId', description: 'Email ID to generate replies for' })
  @ApiResponse({ status: 200, description: 'Suggestions generated', type: SmartReplyResponseDto })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async smartReply(
    @Request() req: AuthenticatedRequest,
    @Param('emailId') emailId: string,
    @Body() dto?: EmailAiDto,
  ): Promise<SmartReplyResponseDto> {
    const suggestions = await this.emailInsightsService.generateSmartReplies(
      req.user.tenantId,
      emailId,
      dto?.locale,
      dto?.tone,
    );

    return { success: true, suggestions };
  }

  /** Categorize email (CONSOLIDATED: unified analysis with 24h cache) */
  @Post('categorize/:emailId')
  @RateTierDecorator('safe-write')
  @HttpCode(HttpStatus.OK)
  @RequiresConsent('ai_email_processing')
  @RequiresQuota('ai')
  @ApiOperation({
    summary: 'Categorize email',
    description: 'Generate AI-powered label suggestions for a specific email (uses unified analysis with 24h cache)',
  })
  @ApiParam({ name: 'emailId', description: 'Email ID to categorize' })
  @ApiResponse({ status: 200, description: 'Labels suggested', type: CategorizeResponseDto })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async categorizeEmail(
    @Request() req: AuthenticatedRequest,
    @Param('emailId') emailId: string,
    @Body() dto?: EmailAiDto,
  ): Promise<CategorizeResponseDto> {
    const analysis = await this.emailInsightsService.analyzeEmailUnified(
      req.user.tenantId,
      emailId,
      dto?.locale,
    );

    return { success: true, labels: analysis.labels, meta: analysis.meta };
  }

  /** Search knowledge base using semantic similarity (RAG) */
  @Post('memory/search')
  @RateTierDecorator('safe-write')
  @HttpCode(HttpStatus.OK)
  @RequiresQuota('ai')
  @ApiOperation({
    summary: 'Search knowledge base',
    description: 'Search the tenant knowledge base using semantic similarity (RAG)',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results returned',
    schema: {
      properties: {
        success: { type: 'boolean', example: true },
        usedQuery: { type: 'string' },
        items: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  async searchMemory(
    @Request() req: AuthenticatedRequest,
    @Body() dto: SearchKnowledgeBaseDto,
  ): Promise<{ success: true; usedQuery: string; items: KnowledgeBaseSearchHit[] }> {
    const result = await this.knowledgeBaseService.searchKnowledgeBase({
      tenantId: req.user.tenantId,
      emailId: dto.emailId,
      query: dto.query,
      limit: dto.limit,
    });

    return { success: true, ...result };
  }

  // ============ Email Intelligence Endpoints (2025 Best Practices) ============

  /** Analyze email sentiment (CONSOLIDATED: unified analysis with 24h cache) */
  @Post('sentiment/:emailId')
  @RateTierDecorator('safe-write')
  @HttpCode(HttpStatus.OK)
  @RequiresConsent('ai_email_processing')
  @RequiresQuota('ai')
  @ApiOperation({
    summary: 'Analyze email sentiment',
    description: 'Sentiment analysis with tone and escalation risk (uses unified analysis with 24h cache)',
  })
  @ApiParam({ name: 'emailId', description: 'Email ID to analyze' })
  @ApiResponse({ status: 200, description: 'Sentiment analysis complete', type: SentimentResponseDto })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async analyzeSentiment(
    @Request() req: AuthenticatedRequest,
    @Param('emailId') emailId: string,
    @Body() dto?: EmailAiDto,
  ): Promise<SentimentResponseDto> {
    const analysis = await this.emailInsightsService.analyzeEmailUnified(
      req.user.tenantId,
      emailId,
      dto?.locale,
    );

    return {
      success: true,
      meta: analysis.meta,
      sentiment: analysis.sentiment,
      tone: analysis.tone,
      emotion: analysis.sentiment, // Map sentiment as primary emotion
      emotionalIntensity: analysis.confidence,
      churnRisk: analysis.escalationRisk,
      aspects: {}, // Unified analysis doesn't do aspect-based breakdown
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
    };
  }

  /** Calculate email priority (CONSOLIDATED: unified analysis with 24h cache) */
  @Post('priority/:emailId')
  @RateTierDecorator('safe-write')
  @HttpCode(HttpStatus.OK)
  @RequiresConsent('ai_email_processing')
  @RequiresQuota('ai')
  @ApiOperation({
    summary: 'Calculate email priority',
    description: 'Priority scoring based on urgency and importance (uses unified analysis with 24h cache)',
  })
  @ApiParam({ name: 'emailId', description: 'Email ID to analyze' })
  @ApiResponse({ status: 200, description: 'Priority calculated', type: PriorityResponseDto })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async calculatePriority(
    @Request() req: AuthenticatedRequest,
    @Param('emailId') emailId: string,
    @Body() dto?: PriorityRequestDto,
  ): Promise<PriorityResponseDto> {
    const analysis = await this.emailInsightsService.analyzeEmailUnified(
      req.user.tenantId,
      emailId,
      dto?.locale,
    );

    // Map 1-5 priority to 1-10 score (inverse: 1=highest priority → score 10)
    const score = 11 - (analysis.priority * 2);
    const recommendationMap: Record<string, string> = {
      critical: 'handle_immediately',
      high: 'handle_today',
      medium: 'handle_this_week',
      low: 'handle_when_convenient',
    };

    return {
      success: true,
      meta: analysis.meta,
      score: Math.max(1, Math.min(10, score)),
      urgency: analysis.urgency,
      recommendation: recommendationMap[analysis.urgency] || 'handle_this_week',
      factors: analysis.keyTopics.slice(0, 3),
    };
  }

  /** Comprehensive email analysis (CONSOLIDATED: unified analysis with 24h cache) */
  @Post('analyze/:emailId')
  @RateTierDecorator('safe-write')
  @HttpCode(HttpStatus.OK)
  @RequiresConsent('ai_email_processing')
  @RequiresQuota('ai')
  @ApiOperation({
    summary: 'Comprehensive email analysis',
    description: 'Full analysis including sentiment, tone, urgency, intent, priority, and escalation risk (24h cache)',
  })
  @ApiParam({ name: 'emailId', description: 'Email ID to analyze' })
  @ApiResponse({ status: 200, description: 'Analysis complete', type: AnalyzeEmailResponseDto })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async analyzeEmail(
    @Request() req: AuthenticatedRequest,
    @Param('emailId') emailId: string,
    @Body() dto?: EmailAiDto,
  ): Promise<AnalyzeEmailResponseDto> {
    const analysis = await this.emailInsightsService.analyzeEmailUnified(
      req.user.tenantId,
      emailId,
      dto?.locale,
    );

    // Map urgency to suggested response timeframe
    const suggestedResponseMap: Record<string, string> = {
      critical: 'immediate',
      high: 'within_day',
      medium: 'within_week',
      low: 'optional',
    };

    return {
      success: true,
      meta: analysis.meta,
      sentiment: analysis.sentiment,
      tone: analysis.tone,
      urgency: analysis.urgency,
      intent: analysis.intent,
      priority: analysis.priority,
      escalationRisk: analysis.escalationRisk,
      keyTopics: analysis.keyTopics,
      suggestedResponse: suggestedResponseMap[analysis.urgency] || 'within_day',
      confidence: analysis.confidence,
    };
  }

  /** Trigger auto-triage for untriaged emails */
  @Post('triage')
  @RateTierDecorator('safe-write')
  @RequiresConsent('ai_auto_triage')
  @HttpCode(HttpStatus.OK)
  @RequiresQuota('ai')
  @ApiOperation({
    summary: 'Trigger auto-triage',
    description: 'Process untriaged emails from the last 24 hours with AI classification',
  })
  @ApiResponse({ status: 200, description: 'Triage complete' })
  async triggerTriage(@Request() req: AuthenticatedRequest) {
    this.logger.log(`Manual triage triggered for tenant ${req.user.tenantId}`);
    const result = await this.emailTriageService.processUntriagedEmails({
      tenantId: req.user.tenantId,
      userId: req.user.id,
    });
    return {
      success: true,
      ...result,
    };
  }

  /** Get triage backfill status */
  @Get('triage/backfill/status')
  @ApiOperation({
    summary: 'Get triage backfill status',
    description: 'Check how many emails are pending triage and queue status',
  })
  @ApiResponse({ status: 200, description: 'Backfill status' })
  async getTriageBackfillStatus() {
    const status = await this.triageBackfillService.getStatus();
    return {
      success: true,
      ...status,
    };
  }

  /** Get AI-suggested VIP contacts based on interaction data */
  @Get('triage/suggested-vips')
  @ApiOperation({
    summary: 'Get AI-suggested VIP contacts',
    description: 'Returns non-VIP contacts ranked by interaction frequency and relationship score',
  })
  @ApiResponse({ status: 200, description: 'Suggested VIP contacts returned' })
  async getSuggestedVips(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limitParam?: string,
  ) {
    const tenantId = req.user.tenantId;
    const limit = Math.min(Math.max(parseInt(limitParam || '10', 10) || 10, 1), 20);

    const suggestedVips = await this.prisma.contact.findMany({
      where: {
        tenantId,
        isDeleted: false,
        isVip: false,
        OR: [
          { totalInteractions: { gte: 10 } },
          { relationshipScore: { gte: 60 } },
        ],
      },
      select: {
        id: true,
        displayName: true,
        firstName: true,
        lastName: true,
        company: true,
        emails: true,
        totalInteractions: true,
        relationshipScore: true,
        lastInteractedAt: true,
      },
      orderBy: [
        { totalInteractions: 'desc' },
        { relationshipScore: 'desc' },
      ],
      take: limit,
    });

    return { suggestions: suggestedVips, total: suggestedVips.length };
  }

  /** Manually trigger triage backfill */
  @Post('triage/backfill')
  @RateTierDecorator('safe-write')
  @RequiresConsent('ai_auto_triage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger triage backfill',
    description: 'Manually trigger processing of all untriaged emails across tenants',
  })
  @ApiResponse({ status: 200, description: 'Backfill job queued' })
  async triggerTriageBackfill(@Request() req: AuthenticatedRequest) {
    this.logger.log(`Manual triage backfill triggered by user ${req.user.id}`);
    const result = await this.triageBackfillService.triggerManualBackfill(
      req.user.tenantId,
      req.user.id,
    );
    return {
      success: true,
      ...result,
    };
  }

  // ============ Phase 26: Non-Chat AI Endpoints ============

  @Get('briefing')
  @RequiresConsent('ai_email_processing')
  @RequiresQuota('ai')
  @ApiOperation({ summary: 'Get daily briefing', description: 'Comprehensive daily briefing' })
  @ApiResponse({ status: 200, description: 'Briefing generated' })
  async getBriefing(@Request() req: AuthenticatedRequest) {
    const prefs = await this.prisma.userPreferences.findFirst({
      where: { tenantId: req.user.tenantId, userId: req.user.userId },
      select: { timezone: true, language: true },
    });
    const result = await this.briefingService.generateBriefing(req.user.tenantId, prefs?.timezone || undefined, prefs?.language || undefined);
    return { success: true, briefing: result.data, meta: result.meta, ...(result.error ? { error: result.error } : {}) };
  }

  @Post('briefing/refresh')
  @RateTierDecorator('safe-write')
  @HttpCode(HttpStatus.OK)
  @RequiresConsent('ai_email_processing')
  @RequiresQuota('ai')
  @ApiOperation({ summary: 'Refresh daily briefing', description: 'Force regenerate briefing' })
  @ApiResponse({ status: 200, description: 'Briefing refreshed' })
  async refreshBriefing(@Request() req: AuthenticatedRequest) {
    const prefs = await this.prisma.userPreferences.findFirst({
      where: { tenantId: req.user.tenantId, userId: req.user.userId },
      select: { timezone: true, language: true },
    });
    const result = await this.briefingService.generateBriefing(req.user.tenantId, prefs?.timezone || undefined, prefs?.language || undefined);
    return { success: true, briefing: result.data, meta: result.meta, ...(result.error ? { error: result.error } : {}) };
  }

  // Phase 77: actions/pending endpoint removed -- ActionQueue replaced by AI SDK native HITL

  @Get('follow-ups/pending')
  @ApiOperation({ summary: 'List pending follow-ups', description: 'Returns pending/overdue follow-ups' })
  @ApiResponse({ status: 200, description: 'Pending follow-ups listed' })
  async getPendingFollowUps(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limitParam?: string,
    @Query('includeResolved') includeResolved?: string,
  ) {
    const limit = Math.min(Math.max(parseInt(limitParam || '50', 10) || 50, 1), 500);
    const allStatuses = includeResolved === 'true';

    const followUps = await this.prisma.emailFollowUp.findMany({
      where: {
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        ...(allStatuses ? {} : { status: { in: [FollowUpStatus.PENDING, FollowUpStatus.REMINDED] } }),
      },
      include: {
        email: {
          select: {
            id: true,
            subject: true,
            from: true,
          },
        },
      },
      orderBy: { dueDate: 'asc' },
      take: limit,
    });

    const items = followUps.map((followUp) => ({
      id: followUp.id,
      emailId: followUp.emailId,
      dueDate: followUp.dueDate,
      status: followUp.status,
      reason: followUp.reason,
      subject: followUp.email?.subject || null,
      contactName: followUp.email?.from || null,
      contactEmail: followUp.email?.from || null,
      email: followUp.email
        ? {
            id: followUp.email.id,
            subject: followUp.email.subject,
            from: followUp.email.from,
          }
        : null,
    }));

    return {
      success: true,
      followUps: items,
      count: items.length,
    };
  }

  @Get('deadlines')
  @ApiOperation({ summary: 'Get upcoming deadlines', description: 'Deadlines extracted from follow-ups' })
  @ApiResponse({ status: 200, description: 'Upcoming deadlines listed' })
  async getUpcomingDeadlines(
    @Request() req: AuthenticatedRequest,
    @Query('days') daysParam?: string,
  ) {
    const days = Math.min(Math.max(parseInt(daysParam || '7', 10) || 7, 1), 90);
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + days);

    const followUps = await this.prisma.emailFollowUp.findMany({
      where: {
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        status: { in: [FollowUpStatus.PENDING, FollowUpStatus.REMINDED] },
        dueDate: {
          lte: end,
        },
      },
      include: {
        email: {
          select: {
            subject: true,
          },
        },
      },
      orderBy: { dueDate: 'asc' },
      take: 50,
    });

    const deadlines = followUps.map((followUp) => ({
      id: followUp.id,
      title: followUp.email?.subject || followUp.reason || 'Follow-up deadline',
      description: followUp.reason || undefined,
      deadline: followUp.dueDate.toISOString(),
      sourceType: 'email',
      sourceId: followUp.emailId,
      status: followUp.status.toLowerCase(),
      confidence: followUp.confidence ?? undefined,
      remindBefore: [1],
      createdAt: followUp.createdAt.toISOString(),
    }));

    return {
      success: true,
      enabled: true,
      count: deadlines.length,
      deadlines,
    };
  }

  @Get('follow-ups/by-email/:emailId')
  @ApiOperation({ summary: 'Get active follow-up for a specific email' })
  @ApiResponse({ status: 200, description: 'Follow-up for email (or null)' })
  async getFollowUpByEmail(
    @Request() req: AuthenticatedRequest,
    @Param('emailId') emailId: string,
  ) {
    const followUp = await this.prisma.emailFollowUp.findFirst({
      where: {
        emailId,
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        status: { not: FollowUpStatus.RESOLVED },
      },
      include: { email: { select: { subject: true, from: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, followUp };
  }

  @Get('follow-ups/stats')
  @ApiOperation({ summary: 'Follow-up status counts' })
  @ApiResponse({ status: 200, description: 'Follow-up stats returned' })
  async getFollowUpStats(@Request() req: AuthenticatedRequest) {
    const where = { tenantId: req.user.tenantId, userId: req.user.userId };
    const now = new Date();

    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const [pending, reminded, resolved, expired, overdue, dueToday] = await Promise.all([
      this.prisma.emailFollowUp.count({ where: { ...where, status: FollowUpStatus.PENDING } }),
      this.prisma.emailFollowUp.count({ where: { ...where, status: FollowUpStatus.REMINDED } }),
      this.prisma.emailFollowUp.count({ where: { ...where, status: FollowUpStatus.RESOLVED } }),
      this.prisma.emailFollowUp.count({ where: { ...where, status: FollowUpStatus.EXPIRED } }),
      this.prisma.emailFollowUp.count({
        where: { ...where, status: { in: [FollowUpStatus.PENDING, FollowUpStatus.REMINDED] }, dueDate: { lt: now } },
      }),
      this.prisma.emailFollowUp.count({
        where: { ...where, status: { in: [FollowUpStatus.PENDING, FollowUpStatus.REMINDED] }, dueDate: { gte: now, lt: endOfDay } },
      }),
    ]);

    return { success: true, stats: { pending, reminded, resolved, expired, overdue, dueToday } };
  }

  @Patch('follow-ups/:id/status')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Update follow-up status' })
  @ApiParam({ name: 'id', description: 'Follow-up ID' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  async updateFollowUpStatus(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateFollowUpStatusDto,
  ) {
    const validStatuses: FollowUpStatus[] = [
      FollowUpStatus.RESOLVED,
      FollowUpStatus.EXPIRED,
      FollowUpStatus.PENDING,
    ];
    if (!validStatuses.includes(dto.status as FollowUpStatus)) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      );
    }

    const status = dto.status as FollowUpStatus;

    const followUp = await this.prisma.emailFollowUp.updateMany({
      where: { id, tenantId: req.user.tenantId, userId: req.user.userId },
      data: {
        status: status as FollowUpStatus,
        ...(status === FollowUpStatus.RESOLVED ? { resolvedAt: new Date() } : {}),
      },
    });

    if (followUp.count === 0) {
      throw new NotFoundException('Follow-up not found');
    }

    return { success: true, updated: followUp.count };
  }

  @Patch('follow-ups/:id/snooze')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Snooze a follow-up' })
  @ApiParam({ name: 'id', description: 'Follow-up ID' })
  @ApiResponse({ status: 200, description: 'Follow-up snoozed' })
  async snoozeFollowUp(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SnoozeFollowUpDto,
  ) {
    const dueDate = new Date(dto.dueDate);
    if (isNaN(dueDate.getTime()) || dueDate.getTime() <= Date.now()) {
      throw new BadRequestException('dueDate must be a valid future date');
    }

    const followUp = await this.prisma.emailFollowUp.updateMany({
      where: {
        id,
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        status: { in: [FollowUpStatus.PENDING, FollowUpStatus.REMINDED] },
      },
      data: { dueDate, status: FollowUpStatus.PENDING, remindCount: 0 },
    });

    if (followUp.count === 0) {
      throw new NotFoundException('Follow-up not found or already resolved');
    }

    return { success: true, dueDate: dueDate.toISOString() };
  }

  @Delete('follow-ups/:id')
  @RateTierDecorator('destructive-write')
  @ApiOperation({ summary: 'Soft-delete a follow-up' })
  @ApiParam({ name: 'id', description: 'Follow-up ID' })
  @ApiResponse({ status: 200, description: 'Follow-up deleted' })
  async deleteFollowUp(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const followUp = await this.prisma.emailFollowUp.updateMany({
      where: { id, tenantId: req.user.tenantId, userId: req.user.userId },
      data: { status: FollowUpStatus.RESOLVED, resolvedAt: new Date() },
    });

    if (followUp.count === 0) {
      throw new NotFoundException('Follow-up not found');
    }

    return { success: true };
  }

  @Get('analytics/email')
  @RequiresConsent('email_analytics')
  @ApiOperation({ summary: 'Get email analytics', description: 'Returns email volume trends for dashboard' })
  @ApiResponse({ status: 200, description: 'Email analytics returned' })
  async getEmailAnalytics(
    @Request() req: AuthenticatedRequest,
    @Query('period') period: 'day' | 'week' | 'month' = 'week',
  ) {
    const daysByPeriod: Record<'day' | 'week' | 'month', number> = {
      day: 1,
      week: 7,
      month: 30,
    };
    const dayCount = daysByPeriod[period] ?? 7;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (dayCount - 1));

    const emails = await this.prisma.email.findMany({
      where: {
        tenantId: req.user.tenantId,
        isDeleted: false,
        OR: [
          { receivedAt: { gte: start } },
          { sentAt: { gte: start }, folder: 'SENT' },
        ],
      },
      select: {
        receivedAt: true,
        sentAt: true,
        folder: true,
      },
    });

    const buckets = new Map<string, { date: string; sent: number; received: number }>();
    const formatter = new Intl.DateTimeFormat('en', { weekday: 'short' });

    for (let i = 0; i < dayCount; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const dateKey = date.toISOString().slice(0, 10);
      buckets.set(dateKey, { date: dateKey, sent: 0, received: 0 });
    }

    for (const email of emails) {
      if (email.folder === 'SENT') {
        // Sent emails: use sentAt date
        const sentKey = email.sentAt?.toISOString().slice(0, 10);
        if (sentKey && buckets.has(sentKey)) {
          buckets.get(sentKey)!.sent += 1;
        }
      } else {
        // Received emails: use receivedAt date
        const receivedKey = email.receivedAt?.toISOString().slice(0, 10);
        if (receivedKey && buckets.has(receivedKey)) {
          buckets.get(receivedKey)!.received += 1;
        }
      }
    }

    const volumeTrends = Array.from(buckets.values()).map((bucket) => {
      const date = new Date(`${bucket.date}T00:00:00.000Z`);
      return {
        date: bucket.date,
        name: formatter.format(date),
        emails: bucket.sent + bucket.received,
        sent: bucket.sent,
        received: bucket.received,
      };
    });

    const totals = volumeTrends.reduce(
      (acc, item) => {
        acc.totalEmails += item.emails;
        acc.totalSent += item.sent;
        acc.totalReceived += item.received;
        return acc;
      },
      { totalEmails: 0, totalSent: 0, totalReceived: 0 },
    );

    return {
      success: true,
      analytics: {
        period,
        volumeTrends,
        ...totals,
      },
    };
  }

  @Get('crm/stale-contacts')
  @ApiOperation({ summary: 'Get stale contacts with relationship scores', description: 'Returns contacts needing re-engagement, ranked by relationship intelligence' })
  @ApiResponse({ status: 200, description: 'Stale contacts with scores listed' })
  async getStaleContacts(
    @Request() req: AuthenticatedRequest,
    @Query('days') daysParam?: string,
    @Query('limit') limitParam?: string,
  ) {
    const thresholdDays = Math.min(Math.max(parseInt(daysParam || '60', 10) || 60, 7), 365);
    const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 100);

    // Use RelationshipScoreService for intelligent scoring
    const [staleContacts, allScores] = await Promise.all([
      this.relationshipScoreService.getStaleContacts(req.user.tenantId, {
        daysSince: thresholdDays,
        limit,
      }),
      this.relationshipScoreService.getRelationshipScores(req.user.tenantId, {
        limit: 200,
      }),
    ]);

    // Build score lookup for enrichment
    const scoreMap = new Map(allScores.map(s => [s.contactId, s]));

    const enrichedContacts = staleContacts.map((contact) => {
      const scores = scoreMap.get(contact.contactId);
      return {
        contactId: contact.contactId,
        displayName: contact.name,
        daysSinceLastContact: contact.daysSinceContact,
        previousFrequency: contact.previousFrequency,
        suggestedAction: contact.suggestedAction,
        // Relationship intelligence from scoring service
        relationshipScore: scores?.totalScore ?? 0,
        recencyScore: scores?.recencyScore ?? 0,
        frequencyScore: scores?.frequencyScore ?? 0,
        reciprocityScore: scores?.reciprocityScore ?? 0,
        trendScore: scores?.trendScore ?? 0,
        trend: scores?.trend ?? 'stable',
        totalInteractions: scores?.totalInteractions ?? 0,
        isStale: true,
      };
    });

    return {
      success: true,
      staleContacts: enrichedContacts,
      count: enrichedContacts.length,
      thresholdDays,
    };
  }

  @Post('follow-ups/detect')
  @RateTierDecorator('safe-write')
  @HttpCode(HttpStatus.OK)
  @RequiresConsent('ai_email_processing')
  @RequiresQuota('ai')
  @ApiOperation({ summary: 'Detect follow-ups', description: 'Analyze recent emails for follow-up needs' })
  @ApiResponse({ status: 200, description: 'Detection complete' })
  async detectFollowUps(
    @Request() req: AuthenticatedRequest,
    @Body() dto?: { locale?: string },
  ) {
    const result = await this.followUpDetectionService.detectFollowUps(req.user.tenantId, 24, dto?.locale);
    return { success: true, ...result.data, meta: result.meta, ...(result.error ? { error: result.error } : {}) };
  }

  @Post('drafts/generate')
  @RateTierDecorator('safe-write')
  @HttpCode(HttpStatus.OK)
  @RequiresConsent('ai_email_processing')
  @RequiresQuota('ai')
  @ApiOperation({ summary: 'Generate reply draft', description: 'AI-powered reply draft generation' })
  @ApiResponse({ status: 200, description: 'Draft generated' })
  async generateDraft(
    @Request() req: AuthenticatedRequest,
    @Body() dto: { emailId: string; instruction: string; tone?: string },
  ) {
    const result = await this.draftGenerationService.generateDraft(req.user.tenantId, dto);
    return { success: true, draft: result.data, meta: result.meta, ...(result.error ? { error: result.error } : {}) };
  }

  // ==========================================
  // Writing Style Profile
  // ==========================================

  @Get('stats/writing-style')
  @RequiresConsent('ai_email_processing')
  @ApiOperation({ summary: 'Get writing style profile', description: 'Returns the user writing style profile, optionally filtered by provider' })
  @ApiQuery({ name: 'providerId', required: false, description: 'Filter by email provider ID' })
  @ApiResponse({ status: 200, description: 'Writing style profile' })
  async getWritingStyle(
    @Request() req: AuthenticatedRequest,
    @Query('providerId') providerId?: string,
  ) {
    const profile = await this.prisma.writingStyleProfile.findFirst({
      where: {
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        providerId: providerId ?? null,
      },
    });
    return { success: true, profile: profile ?? null };
  }

  @Get('draft-stats')
  @RequiresConsent('ai_email_processing')
  @ApiOperation({ summary: 'Get AI draft quality statistics' })
  @ApiResponse({ status: 200, description: 'Draft stats' })
  async getDraftStats(@Request() req: AuthenticatedRequest) {
    const feedbacks = await this.prisma.aiDraftFeedback.findMany({
      where: { tenantId: req.user.tenantId, userId: req.user.userId },
      select: { action: true, editDistance: true },
    });
    const total = feedbacks.length;
    if (total === 0) {
      return { success: true, stats: { totalDrafts: 0, acceptRate: 0, editRate: 0, rejectRate: 0, avgEditDistance: 0 } };
    }
    const accepted = feedbacks.filter(f => f.action === 'accepted').length;
    const edited = feedbacks.filter(f => f.action === 'edited').length;
    const rejected = feedbacks.filter(f => f.action === 'rejected').length;
    const editDistances = feedbacks.filter(f => f.editDistance != null).map(f => f.editDistance!);
    const avgEditDistance = editDistances.length > 0 ? editDistances.reduce((a, b) => a + b, 0) / editDistances.length : 0;
    return {
      success: true,
      stats: {
        totalDrafts: total,
        acceptRate: accepted / total,
        editRate: edited / total,
        rejectRate: rejected / total,
        avgEditDistance,
      },
    };
  }

  @Post('writing-style/manual-samples')
  @RateTierDecorator('safe-write')
  @HttpCode(HttpStatus.OK)
  @RequiresConsent('ai_email_processing')
  @ApiOperation({ summary: 'Update manual writing samples' })
  @ApiResponse({ status: 200, description: 'Samples saved' })
  async updateManualSamples(
    @Request() req: AuthenticatedRequest,
    @Body() body: { samples: string; providerId?: string },
  ) {
    const existing = await this.prisma.writingStyleProfile.findFirst({
      where: {
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        providerId: body.providerId ?? null,
      },
    });
    if (existing) {
      await this.prisma.writingStyleProfile.update({
        where: { id: existing.id },
        data: { manualSamples: body.samples },
      });
    } else {
      await this.prisma.writingStyleProfile.create({
        data: {
          tenantId: req.user.tenantId,
          userId: req.user.userId,
          providerId: body.providerId ?? null,
          manualSamples: body.samples,
        },
      });
    }
    return { success: true };
  }

}
