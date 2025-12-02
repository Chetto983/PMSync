import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Param,
  UsePipes,
  ValidationPipe,
  Logger,
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
import { MistralService } from '../services/mistral.service';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { EmailInsightsService } from '../services/email-insights.service';
import { KnowledgeBaseService, type KnowledgeBaseSearchHit } from '../services/knowledge-base.service';
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
@UseGuards(JwtAuthGuard, TenantGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly mistralService: MistralService,
    private readonly emailInsightsService: EmailInsightsService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  /**
   * Simple chat completion backed by Mistral
   */
  @Post('chat')
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
   */
  @Post('summarize/:emailId')
  @ApiOperation({
    summary: 'Summarize email',
    description: 'Generate an AI-powered summary of a specific email',
  })
  @ApiParam({ name: 'emailId', description: 'Email ID to summarize' })
  @ApiResponse({ status: 200, description: 'Summary generated', type: SummaryResponseDto })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async summarizeEmail(
    @Request() req: AuthenticatedRequest,
    @Param('emailId') emailId: string,
    @Body() dto?: EmailAiDto,
  ): Promise<SummaryResponseDto> {
    const summary = await this.emailInsightsService.summarizeEmail(
      req.user.tenantId,
      emailId,
      dto?.locale,
    );

    return { success: true, summary };
  }

  /**
   * Generate smart reply suggestions
   */
  @Post('smart-reply/:emailId')
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
   */
  @Post('categorize/:emailId')
  @ApiOperation({
    summary: 'Categorize email',
    description: 'Generate AI-powered label suggestions for a specific email',
  })
  @ApiParam({ name: 'emailId', description: 'Email ID to categorize' })
  @ApiResponse({ status: 200, description: 'Labels suggested', type: CategorizeResponseDto })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async categorizeEmail(
    @Request() req: AuthenticatedRequest,
    @Param('emailId') emailId: string,
    @Body() dto?: EmailAiDto,
  ): Promise<CategorizeResponseDto> {
    const labels = await this.emailInsightsService.categorizeEmail(
      req.user.tenantId,
      emailId,
      dto?.locale,
    );

    return { success: true, labels };
  }

  /**
   * Search knowledge base using semantic similarity (RAG)
   */
  @Post('memory/search')
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
   * Uses 2025 best practices: ABSA, emotion detection, churn risk
   */
  @Post('sentiment/:emailId')
  @ApiOperation({
    summary: 'Analyze email sentiment',
    description: 'Deep sentiment analysis with emotion detection, aspect-based analysis, and churn risk prediction',
  })
  @ApiParam({ name: 'emailId', description: 'Email ID to analyze' })
  @ApiResponse({ status: 200, description: 'Sentiment analysis complete', type: SentimentResponseDto })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async analyzeSentiment(
    @Request() req: AuthenticatedRequest,
    @Param('emailId') emailId: string,
    @Body() dto?: EmailAiDto,
  ): Promise<SentimentResponseDto> {
    const result = await this.emailInsightsService.analyzeSentiment(
      req.user.tenantId,
      emailId,
      dto?.locale,
    );

    return {
      success: true,
      sentiment: result.sentiment as 'positive' | 'negative' | 'neutral' | 'mixed',
      tone: result.tone,
      emotion: result.emotion,
      emotionalIntensity: result.emotionalIntensity,
      churnRisk: result.churnRisk,
      aspects: result.aspects,
      confidence: result.confidence,
      reasoning: result.reasoning,
    };
  }

  /**
   * Calculate email priority with multi-factor scoring
   */
  @Post('priority/:emailId')
  @ApiOperation({
    summary: 'Calculate email priority',
    description: 'Multi-factor priority scoring based on urgency, importance, and sender context',
  })
  @ApiParam({ name: 'emailId', description: 'Email ID to analyze' })
  @ApiResponse({ status: 200, description: 'Priority calculated', type: PriorityResponseDto })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async calculatePriority(
    @Request() req: AuthenticatedRequest,
    @Param('emailId') emailId: string,
    @Body() dto?: PriorityRequestDto,
  ): Promise<PriorityResponseDto> {
    const result = await this.emailInsightsService.calculatePriority(
      req.user.tenantId,
      emailId,
      dto?.locale,
      dto?.senderImportance,
    );

    return { success: true, ...result };
  }

  /**
   * Comprehensive email analysis
   * Combines sentiment, priority, intent, and urgency in one call
   */
  @Post('analyze/:emailId')
  @ApiOperation({
    summary: 'Comprehensive email analysis',
    description: 'Full analysis including sentiment, tone, urgency, intent, priority, and escalation risk',
  })
  @ApiParam({ name: 'emailId', description: 'Email ID to analyze' })
  @ApiResponse({ status: 200, description: 'Analysis complete', type: AnalyzeEmailResponseDto })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async analyzeEmail(
    @Request() req: AuthenticatedRequest,
    @Param('emailId') emailId: string,
    @Body() dto?: EmailAiDto,
  ): Promise<AnalyzeEmailResponseDto> {
    const result = await this.emailInsightsService.analyzeEmail(
      req.user.tenantId,
      emailId,
      dto?.locale,
    );

    return { success: true, ...result };
  }
}
