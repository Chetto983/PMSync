import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { pipeUIMessageStreamToResponse } from 'ai';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { ConsentGuard } from '../../compliance/guards/consent.guard';
import { QuotaGuard, RequiresQuota } from '../../subscription/guards/quota.guard';
import { RequiresConsent } from '../../compliance/decorators/requires-consent.decorator';
import { SkipEnvelope } from '../../../common/decorators/skip-envelope.decorator';
import { AiChatService } from '../services/ai-chat.service';
import { ConversationService } from '../services/conversation.service';
import { ChatRequestDto } from '../dto/chat-request.dto';
import type { AuthenticatedRequest } from '../../../common/types/request.types';

/**
 * AiChatController -- Streaming chat endpoint + conversation management.
 *
 * POST /ai/chat         -- Stream a chat response (SSE via AI SDK v6)
 * GET  /ai/chat/conversations   -- List conversations
 * DELETE /ai/chat/conversations/:id -- Delete a conversation
 *
 * Guards: TenantGuard, ConsentGuard, QuotaGuard
 *
 * Phase 24: Backend Core Pipeline
 *
 * CHAT 403 ROOT CAUSE (Phase 31 investigation):
 * The guard chain is: BetterAuthGuard (global) -> TenantGuard -> ConsentGuard -> QuotaGuard.
 * ConsentGuard: @RequiresConsent('ai_chat') is commented out, so it passes.
 * QuotaGuard: calls subscriptionService.getOrCreateSubscription() which auto-creates
 * a FREE subscription with ACTIVE status if none exists (with a transient fallback
 * on DB error). The 403 occurs when QuotaGuard detects:
 *   - FREE tier daily cost cap hit ($0.10/day via CostProtectionService)
 *   - FREE tier monthly AI quota exceeded (50 calls/month)
 *   - Subscription status is CANCELED or PAST_DUE (explicit admin action)
 * This is expected guard behavior, not a bug. Fix: ensure E2E tests mock subscription
 * as pro/active. For production: upgrade plan or wait for daily/monthly reset.
 */
@ApiTags('AI Chat')
@ApiBearerAuth()
@Controller('ai')
@UseGuards(TenantGuard, ConsentGuard, QuotaGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AiChatController {
  constructor(
    private readonly aiChatService: AiChatService,
    private readonly conversationService: ConversationService,
  ) {}

  /**
   * Stream a chat response via SSE.
   *
   * Uses AI SDK v6 pipeUIMessageStreamToResponse.
   * CRITICAL: Returns void -- pipeUIMessageStreamToResponse handles the response.
   * Do NOT call res.json() or return a value.
   */
  @Post('chat')
  @SkipEnvelope()
  @HttpCode(HttpStatus.OK)
  // TODO: Re-enable when consent onboarding UI exists. ai_chat is declared in CONSENT_FEATURES.
  // @RequiresConsent('ai_chat')
  @RequiresQuota('ai')
  @ApiOperation({
    summary: 'AI chat (streaming)',
    description:
      'Send a message and receive a streaming AI response via SSE. ' +
      'If conversationId is provided, continues existing conversation. ' +
      'If omitted, creates a new conversation.',
  })
  @ApiResponse({
    status: 200,
    description: 'SSE stream of AI response chunks',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Consent required or quota exceeded' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 503, description: 'AI service temporarily unavailable' })
  async chat(
    @Req() req: Request & { user: AuthenticatedRequest['user'] },
    @Res() res: Response,
    @Body() dto: ChatRequestDto,
  ): Promise<void> {
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    const stream = await this.aiChatService.streamChat({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      message: dto.message,
      conversationId: dto.conversationId,
      model: dto.model,
      abortSignal: abortController.signal,
    });

    pipeUIMessageStreamToResponse({ stream, response: res });
  }

  /**
   * List conversations for the current user.
   */
  @Get('chat/conversations')
  @ApiOperation({
    summary: 'List AI chat conversations',
    description: 'Returns conversations for the current user, most recent first',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max conversations to return (default 20)',
  })
  @ApiResponse({ status: 200, description: 'Conversations listed' })
  async listConversations(
    @Req() req: Request & { user: AuthenticatedRequest['user'] },
    @Query('limit') limitParam?: string,
  ) {
    const limit = Math.min(
      Math.max(parseInt(limitParam || '20', 10) || 20, 1),
      50,
    );

    const conversations = await this.conversationService.listConversations(
      req.user.tenantId,
      req.user.userId,
      limit,
    );

    return {
      success: true,
      conversations,
      total: conversations.length,
    };
  }

  /**
   * Delete a conversation and all its messages.
   */
  @Delete('chat/conversations/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an AI chat conversation',
    description: 'Permanently deletes a conversation and all its messages',
  })
  @ApiParam({ name: 'id', description: 'Conversation ID to delete' })
  @ApiResponse({ status: 200, description: 'Conversation deleted' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async deleteConversation(
    @Req() req: Request & { user: AuthenticatedRequest['user'] },
    @Param('id') conversationId: string,
  ) {
    await this.conversationService.deleteConversation(
      conversationId,
      req.user.tenantId,
    );

    return { success: true };
  }
}
