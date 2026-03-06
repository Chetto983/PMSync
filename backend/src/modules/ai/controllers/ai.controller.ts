import {
  Controller,
  Post,
  Get,
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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ActionStatus, FollowUpStatus } from '@prisma/client';
import { TenantGuard } from '../../../modules/auth/guards/tenant.guard';
import { QuotaGuard, RequiresQuota } from '../../subscription/guards/quota.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { EmailInsightsService } from '../services/email-insights.service';
import { KnowledgeBaseService, type KnowledgeBaseSearchHit } from '../services/knowledge-base.service';
import { EmailTriageService } from '../services/email-triage.service';
import { RequiresConsent } from '../../compliance/decorators/requires-consent.decorator';
import { ConsentGuard } from '../../compliance/guards/consent.guard';
import { TriageBackfillSchedulerService } from '../services/triage-backfill-scheduler.service';
// Phase 26: Non-chat AI services
import { BriefingService } from '../services/briefing.service';
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
@ApiBearerAuth()
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
  ) {}

  // Phase 24: Chat endpoint moved to AiChatModule (ai-chat.controller.ts)

  /**
   * AI-assisted email composition (draft body + optional subject)
   */
  @Post('compose')
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

    return { success: true, summary: analysis.summary };
  }

  /** Generate smart reply suggestions */
  @Post('smart-reply/:emailId')
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

    return { success: true, labels: analysis.labels };
  }

  /** Search knowledge base using semantic similarity (RAG) */
  @Post('memory/search')
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
      score: Math.max(1, Math.min(10, score)),
      urgency: analysis.urgency,
      recommendation: recommendationMap[analysis.urgency] || 'handle_this_week',
      factors: analysis.keyTopics.slice(0, 3),
    };
  }

  /** Comprehensive email analysis (CONSOLIDATED: unified analysis with 24h cache) */
  @Post('analyze/:emailId')
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
    const result = await this.briefingService.generateBriefing(req.user.tenantId);
    return { success: true, briefing: result.data, ...(result.error ? { error: result.error } : {}) };
  }

  @Post('briefing/refresh')
  @HttpCode(HttpStatus.OK)
  @RequiresConsent('ai_email_processing')
  @RequiresQuota('ai')
  @ApiOperation({ summary: 'Refresh daily briefing', description: 'Force regenerate briefing' })
  @ApiResponse({ status: 200, description: 'Briefing refreshed' })
  async refreshBriefing(@Request() req: AuthenticatedRequest) {
    const result = await this.briefingService.generateBriefing(req.user.tenantId);
    return { success: true, briefing: result.data, ...(result.error ? { error: result.error } : {}) };
  }

  @Get('actions/pending')
  @ApiOperation({ summary: 'List pending actions', description: 'Returns pending HITL actions for current user' })
  @ApiResponse({ status: 200, description: 'Pending actions listed' })
  async getPendingActions(
    @Request() req: AuthenticatedRequest,
    @Query('conversationId') conversationId?: string,
  ) {
    const now = new Date();
    const actions = await this.prisma.actionQueue.findMany({
      where: {
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        status: ActionStatus.PENDING_APPROVAL,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        actionType: true,
        actionPayload: true,
        confidence: true,
        reasoning: true,
        createdAt: true,
      },
    });

    const filtered = conversationId
      ? actions.filter((action) => {
          const payload = (action.actionPayload || {}) as Record<string, unknown>;
          return payload.conversationId === conversationId;
        })
      : actions;

    const mapped = filtered.map((action) => ({
      id: action.id,
      executionId: action.id,
      actionType: action.actionType,
      severity: this.mapActionSeverity(action.actionType),
      payload: action.actionPayload || {},
      summary: action.reasoning || `${action.actionType} requires approval`,
      suspendReason: 'requires_approval',
      suspendedAt: action.createdAt,
      userId: req.user.userId,
      agentName: 'ai-chat',
      confidence: action.confidence ?? undefined,
      status: 'PENDING' as const,
    }));

    return { success: true, actions: mapped, total: mapped.length };
  }

  @Get('follow-ups/pending')
  @ApiOperation({ summary: 'List pending follow-ups', description: 'Returns pending/overdue follow-ups' })
  @ApiResponse({ status: 200, description: 'Pending follow-ups listed' })
  async getPendingFollowUps(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limitParam?: string,
  ) {
    const limit = Math.min(Math.max(parseInt(limitParam || '10', 10) || 10, 1), 50);

    const followUps = await this.prisma.emailFollowUp.findMany({
      where: {
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        status: { in: [FollowUpStatus.PENDING, FollowUpStatus.REMINDED] },
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
          gte: now,
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
          { sentAt: { gte: start } },
        ],
      },
      select: {
        receivedAt: true,
        sentAt: true,
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
      const receivedKey = email.receivedAt?.toISOString().slice(0, 10);
      if (receivedKey && buckets.has(receivedKey)) {
        const bucket = buckets.get(receivedKey)!;
        bucket.received += 1;
      }

      const sentKey = email.sentAt?.toISOString().slice(0, 10);
      if (sentKey && buckets.has(sentKey)) {
        const bucket = buckets.get(sentKey)!;
        bucket.sent += 1;
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
  @ApiOperation({ summary: 'Get stale contacts', description: 'Returns contacts with stale interactions' })
  @ApiResponse({ status: 200, description: 'Stale contacts listed' })
  async getStaleContacts(
    @Request() req: AuthenticatedRequest,
    @Query('days') daysParam?: string,
    @Query('limit') limitParam?: string,
  ) {
    const thresholdDays = Math.min(Math.max(parseInt(daysParam || '60', 10) || 60, 7), 365);
    const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 100);
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - thresholdDays);

    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId: req.user.tenantId,
        isDeleted: false,
        OR: [
          { lastInteractedAt: { lt: thresholdDate } },
          { lastInteractedAt: null },
        ],
      },
      select: {
        id: true,
        displayName: true,
        emails: true,
        lastInteractedAt: true,
        totalInteractions: true,
        sentCount: true,
        receivedCount: true,
        relationshipScore: true,
      },
      orderBy: [
        { lastInteractedAt: 'asc' },
        { relationshipScore: 'asc' },
      ],
      take: limit,
    });

    const now = new Date();
    const staleContacts = contacts.map((contact) => {
      const email = this.extractPrimaryEmail(contact.emails);
      const lastInteraction = contact.lastInteractedAt;
      const daysSince = lastInteraction
        ? Math.floor((now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24))
        : thresholdDays + 1;

      return {
        contactId: contact.id,
        email,
        displayName: contact.displayName || email,
        lastInteraction: lastInteraction ? lastInteraction.toISOString() : null,
        totalInteractions: contact.totalInteractions ?? 0,
        emailsSent: contact.sentCount ?? 0,
        emailsReceived: contact.receivedCount ?? 0,
        relationshipScore: contact.relationshipScore ?? 0,
        recencyScore: null,
        frequencyScore: null,
        reciprocityScore: null,
        trendScore: null,
        isStale: true,
        daysSinceLastContact: daysSince,
      };
    });

    return {
      success: true,
      staleContacts,
      count: staleContacts.length,
      thresholdDays,
    };
  }

  @Post('follow-ups/detect')
  @HttpCode(HttpStatus.OK)
  @RequiresConsent('ai_email_processing')
  @RequiresQuota('ai')
  @ApiOperation({ summary: 'Detect follow-ups', description: 'Analyze recent emails for follow-up needs' })
  @ApiResponse({ status: 200, description: 'Detection complete' })
  async detectFollowUps(@Request() req: AuthenticatedRequest) {
    const result = await this.followUpDetectionService.detectFollowUps(req.user.tenantId);
    return { success: true, ...result.data, ...(result.error ? { error: result.error } : {}) };
  }

  @Post('drafts/generate')
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
    return { success: true, draft: result.data, ...(result.error ? { error: result.error } : {}) };
  }

  // ==========================================
  // Writing Style Profile
  // ==========================================

  @Get('stats/writing-style')
  @RequiresConsent('ai_email_processing')
  @ApiOperation({ summary: 'Get writing style profile', description: 'Returns the user writing style profile' })
  @ApiResponse({ status: 200, description: 'Writing style profile' })
  async getWritingStyle(@Request() req: AuthenticatedRequest) {
    const profile = await this.prisma.writingStyleProfile.findFirst({
      where: { tenantId: req.user.tenantId, userId: req.user.userId },
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

  private mapActionSeverity(actionType: string): 'LOW' | 'MEDIUM' | 'HIGH' {
    const highSeverity = new Set(['SEND_EMAIL', 'DELETE_EMAIL', 'DELETE_CONTACT']);
    const mediumSeverity = new Set(['SCHEDULE_MEETING', 'REPLY_EMAIL', 'FORWARD_EMAIL']);

    if (highSeverity.has(actionType)) return 'HIGH';
    if (mediumSeverity.has(actionType)) return 'MEDIUM';
    return 'LOW';
  }

  private extractPrimaryEmail(rawEmails: unknown): string {
    if (!rawEmails) return '';

    if (Array.isArray(rawEmails)) {
      for (const entry of rawEmails) {
        if (typeof entry === 'string' && entry.length > 0) {
          return entry;
        }
        if (
          entry &&
          typeof entry === 'object' &&
          'value' in entry &&
          typeof (entry as { value?: unknown }).value === 'string'
        ) {
          return (entry as { value: string }).value;
        }
      }
    }

    return '';
  }
}
