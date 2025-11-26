import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Param,
  Delete,
  UsePipes,
  ValidationPipe,
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
import { AgentService } from '../services/agent.service';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { ChatSessionService, StoredChatMessage } from '../services/chat-session.service';
import { EmailInsightsService } from '../services/email-insights.service';
import { KnowledgeBaseService, type KnowledgeBaseSearchHit } from '../services/knowledge-base.service';
import { SearchKnowledgeBaseDto } from '../dto/knowledge-base.dto';
import {
  ChatDto,
  AgentDto,
  CreateSessionDto,
  EmailAiDto,
  ChatResponseDto,
  SessionResponseDto,
  SessionListResponseDto,
  AgentResponseDto,
  SummaryResponseDto,
  SmartReplyResponseDto,
  CategorizeResponseDto,
} from '../dto/ai.dto';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai')
@UseGuards(JwtAuthGuard, TenantGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AiController {
  constructor(
    private readonly mistralService: MistralService,
    private readonly agentService: AgentService,
    private readonly chatSessionService: ChatSessionService,
    private readonly emailInsightsService: EmailInsightsService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  /**
   * Classic chat completion backed by the Mistral service
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
   * List latest chat sessions (FIFO)
   */
  @Get('chat/sessions')
  @ApiOperation({
    summary: 'List chat sessions',
    description: 'Retrieve all chat sessions for the current user',
  })
  @ApiResponse({ status: 200, description: 'Sessions retrieved', type: SessionListResponseDto })
  async listSessions(@Request() req: AuthenticatedRequest): Promise<SessionListResponseDto> {
    const sessions = await this.chatSessionService.listSessions(
      req.user.tenantId,
      req.user.userId,
    );
    return { success: true, sessions };
  }

  /**
   * Get a single chat session by id
   */
  @Get('chat/sessions/:id')
  @ApiOperation({
    summary: 'Get chat session',
    description: 'Retrieve a specific chat session by ID',
  })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Session retrieved', type: SessionResponseDto })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getSession(
    @Request() req: AuthenticatedRequest,
    @Param('id') sessionId: string,
  ): Promise<SessionResponseDto | { success: false; session: null }> {
    const session = await this.chatSessionService.getSession(
      req.user.tenantId,
      req.user.userId,
      sessionId,
    );

    if (!session) {
      return { success: false, session: null };
    }

    return { success: true, session };
  }

  /**
   * Create a new chat session
   */
  @Post('chat/sessions')
  @ApiOperation({
    summary: 'Create chat session',
    description: 'Create a new chat session for the current user',
  })
  @ApiResponse({ status: 201, description: 'Session created', type: SessionResponseDto })
  async createSession(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateSessionDto,
  ): Promise<SessionResponseDto> {
    const session = await this.chatSessionService.createSession({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      locale: dto?.locale,
    });

    return { success: true, session };
  }

  /**
   * Delete a chat session
   */
  @Delete('chat/sessions/:id')
  @ApiOperation({
    summary: 'Delete chat session',
    description: 'Delete a specific chat session by ID',
  })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Session deleted' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async deleteSession(
    @Request() req: AuthenticatedRequest,
    @Param('id') sessionId: string,
  ): Promise<{ success: boolean }> {
    const deleted = await this.chatSessionService.deleteSession({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      sessionId,
    });

    return { success: deleted };
  }

  /**
   * Agentic workflow powered by LangChain
   */
  @Post('agent')
  @ApiOperation({
    summary: 'Agentic AI workflow',
    description: 'Process a message using LangChain-powered agent with tool execution capabilities',
  })
  @ApiResponse({ status: 200, description: 'Agent response generated', type: AgentResponseDto })
  async agent(
    @Request() req: AuthenticatedRequest,
    @Body() dto: AgentDto,
  ): Promise<AgentResponseDto> {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;

    let session =
      (await this.chatSessionService.getSession(tenantId, userId, dto.sessionId ?? '')) ?? null;

    if (!session) {
      session = await this.chatSessionService.createSession({
        tenantId,
        userId,
        locale: dto.locale,
      });
    }

    const history: StoredChatMessage[] = (dto.history ?? []).map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: item.content,
      ...(item.steps ? { steps: item.steps } : {}),
    }));

    const result = await this.agentService.runAgent({
      tenantId,
      userId,
      prompt: dto.message,
      conversationId: session.id,
      history,
    });

    const assistantMessage: StoredChatMessage = {
      role: 'assistant',
      content: result.output,
      steps: result.intermediateSteps ?? [],
    };

    const updatedMessages: StoredChatMessage[] = [...history, assistantMessage];

    const updatedSession = await this.chatSessionService.saveSessionMessages({
      tenantId,
      userId,
      sessionId: session.id,
      messages: updatedMessages,
      locale: dto.locale,
    });

    return {
      success: true,
      sessionId: updatedSession.id,
      session: updatedSession,
      messages: updatedMessages,
      response: result.output,
      steps: result.intermediateSteps ?? [],
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
   * Retrieve semantic memories (RAG) scoped to the tenant
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
}
