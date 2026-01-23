/**
 * Conversation Controller
 * Phase 9e: Extracted from voltagent.controller.ts (2026-01-23)
 *
 * Handles conversation management for VoltAgent chat sessions.
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
  HttpCode,
  HttpStatus,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/guards/tenant.guard';
import { QuotaGuard } from '../../../subscription/guards/quota.guard';
import { VoltAgentService } from '../voltagent.service';

interface AuthenticatedRequest {
  user: {
    userId: string;
    tenantId: string;
    role: string;
  };
}

@ApiTags('VoltAgent Conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, QuotaGuard)
@Controller('api/v1/voltagent')
export class ConversationController {
  private readonly logger = new Logger(ConversationController.name);

  constructor(private readonly voltAgentService: VoltAgentService) {}

  /**
   * List conversations for the current user.
   */
  @Get('conversations')
  @ApiOperation({ summary: 'List conversations' })
  async listConversations(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    const conversations = await this.voltAgentService.listConversations(
      req.user.tenantId,
      req.user.userId,
      limit ? parseInt(limit, 10) : 50,
    );

    return {
      success: true,
      conversations,
      count: conversations.length,
    };
  }

  /**
   * Get a specific conversation with messages.
   */
  @Get('conversations/:conversationId')
  @ApiOperation({ summary: 'Get conversation with messages' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  async getConversation(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Query('messageLimit') messageLimit?: string,
  ) {
    const conversation = await this.voltAgentService.getConversationWithMessages(
      req.user.tenantId,
      req.user.userId,
      conversationId,
      messageLimit ? parseInt(messageLimit, 10) : 50,
    );

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return {
      success: true,
      conversation,
    };
  }

  /**
   * Update a conversation (title, archived status).
   */
  @Post('conversations/:conversationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update conversation' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  async updateConversation(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Body() body: { title?: string; isArchived?: boolean },
  ) {
    const success = await this.voltAgentService.updateConversation(
      req.user.tenantId,
      req.user.userId,
      conversationId,
      body,
    );

    return {
      success,
      message: success ? 'Conversation updated' : 'Failed to update conversation',
    };
  }

  /**
   * Delete a conversation.
   */
  @Post('conversations/:conversationId/delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete conversation' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  async deleteConversation(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ) {
    const success = await this.voltAgentService.deleteConversation(
      req.user.tenantId,
      req.user.userId,
      conversationId,
    );

    return {
      success,
      message: success ? 'Conversation deleted' : 'Failed to delete conversation',
    };
  }

  /**
   * Generate a title for a conversation using AI.
   */
  @Post('conversations/:conversationId/generate-title')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate conversation title' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  async generateConversationTitle(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Query('locale') locale?: string,
  ) {
    const title = await this.voltAgentService.generateConversationTitle(
      req.user.tenantId,
      req.user.userId,
      conversationId,
      locale || 'en',
    );

    if (!title) {
      throw new NotFoundException('Failed to generate title');
    }

    return {
      success: true,
      title,
    };
  }
}
