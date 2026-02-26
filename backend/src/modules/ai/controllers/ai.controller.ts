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
import { JwtAuthGuard } from '../../../modules/auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../modules/auth/guards/tenant.guard';
import { QuotaGuard, RequiresQuota } from '../../subscription/guards/quota.guard';
import { MistralService } from '../services/mistral.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { EmailInsightsService } from '../services/email-insights.service';
import { KnowledgeBaseService, type KnowledgeBaseSearchHit } from '../services/knowledge-base.service';
import { EmailTriageService } from '../services/email-triage.service';
import { RequiresConsent } from '../../compliance/decorators/requires-consent.decorator';
import { TriageBackfillSchedulerService } from '../services/triage-backfill-scheduler.service';
import { SearchKnowledgeBaseDto } from '../dto/knowledge-base.dto';
import {
  ChatDto,
  EmailAiDto,
  ChatResponseDto,
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
 * - Simple chat completion (MistralService)
 * - Email insights (summarize, smart-reply, categorize, compose)
 * - Knowledge base search (RAG)
 *
 * For agentic workflows and session management, use VoltAgentController:
 * - POST /voltagent/chat - Agentic chat with tool execution
 * - GET /voltagent/sessions - List sessions
 * - POST /voltagent/sessions - Create session
 * - DELETE /voltagent/sessions/:id - Delete session
 */
@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai')
@UseGuards(JwtAuthGuard, TenantGuard, QuotaGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly mistralService: MistralService,
    private readonly emailInsightsService: EmailInsightsService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly emailTriageService: EmailTriageService,
    private readonly triageBackfillService: TriageBackfillSchedulerService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Simple chat completion backed by Mistral
   */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @RequiresConsent('ai_email_processing')
  @RequiresQuota('ai')
  @ApiOperation({
    summary: 'Chat completion',
    description: 'Send a message and receive an AI-generated response using Mistral',
  })
  @ApiResponse({ status: 200, description: 'Chat response generated', type: ChatResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async chat(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ChatDto,
  ): Promise<ChatResponseDto> {
    const response = await this.mistralService.generateResponse(
      req.user.tenantId,
      req.user.userId,
      dto.message,
      dto.conversationHistory || [],
      { conversationId: dto.conversationId },
    );

    return { success: true, response };
  }

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
    const result = await this.emailInsightsService.composeEmail(
      req.user.tenantId,
      dto,
      req.user.userId,
    );

    return {
      success: true,
      ...result,
    };
  }

  /**
   * Generate AI summary for an email
   * CONSOLIDATED: Uses analyzeEmailUnified() for single LLM call with DB caching
   */
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

  /**
   * Generate smart reply suggestions
   */
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

  /**
   * Suggest labels for an email
   * CONSOLIDATED: Uses analyzeEmailUnified() for single LLM call with DB caching
   */
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

  /**
   * Search knowledge base using semantic similarity (RAG)
   */
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

  /**
   * Analyze email sentiment with aspect-based analysis
   * CONSOLIDATED: Uses analyzeEmailUnified() for single LLM call with DB caching
   */
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

  /**
   * Calculate email priority with multi-factor scoring
   * CONSOLIDATED: Uses analyzeEmailUnified() for single LLM call with DB caching
   */
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

  /**
   * Comprehensive email analysis
   * CONSOLIDATED: Uses analyzeEmailUnified() for single LLM call with DB caching
   */
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

  /**
   * Trigger auto-triage for untriaged emails
   */
  @Post('triage')
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

  /**
   * Get triage backfill status
   */
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

  /**
   * Get AI-suggested VIP contacts based on interaction data
   */
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

  /**
   * Manually trigger triage backfill
   */
  @Post('triage/backfill')
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
}
