import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AiConversation, AiMessage, Prisma } from '@prisma/client';
import type { ModelMessage } from 'ai';

/**
 * ConversationService -- CRUD for AI chat conversations and message persistence.
 *
 * Provides the "rolling summary + recent verbatim" history strategy:
 * - Last N messages are loaded verbatim as ModelMessage[]
 * - Older messages are summarized and stored in AiConversation.summary
 * - Summary is prepended as a system message when loading context
 *
 * Phase 24: Backend Core Pipeline
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new conversation for a user within a tenant.
   */
  async createConversation(
    tenantId: string,
    userId: string,
  ): Promise<AiConversation> {
    return this.prisma.aiConversation.create({
      data: { tenantId, userId },
    });
  }

  /**
   * Load a conversation with tenant isolation check.
   * Returns null if not found or tenant mismatch.
   */
  async getConversation(
    conversationId: string,
    tenantId: string,
  ): Promise<AiConversation | null> {
    return this.prisma.aiConversation.findFirst({
      where: { id: conversationId, tenantId },
    });
  }

  /**
   * Get or create a conversation.
   * If conversationId is provided, loads it (with tenant check).
   * If not provided, creates a new one.
   */
  async getOrCreateConversation(
    conversationId: string | undefined,
    tenantId: string,
    userId: string,
  ): Promise<AiConversation> {
    if (conversationId) {
      const existing = await this.getConversation(conversationId, tenantId);
      if (!existing) {
        throw new NotFoundException(
          `Conversation ${conversationId} not found`,
        );
      }
      return existing;
    }

    // Auto-resolve: reuse user's most recent active conversation if updated within 30 min.
    // This ensures context continuity even when the frontend doesn't pass conversationId.
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const recent = await this.prisma.aiConversation.findFirst({
      where: {
        tenantId,
        userId,
        updatedAt: { gte: thirtyMinAgo },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (recent) {
      this.logger.debug(
        `Reusing recent conversation ${recent.id} (updated ${recent.updatedAt.toISOString()})`,
      );
      return recent;
    }

    return this.createConversation(tenantId, userId);
  }

  /**
   * Load conversation history as ModelMessage[] for AI SDK.
   *
   * Strategy:
   * - If conversation has a summary, prepend it as a system message
   * - Load last `maxMessages` messages verbatim
   */
  async getMessagesForContext(
    conversationId: string,
    maxMessages = 10,
  ): Promise<ModelMessage[]> {
    const conversation = await this.prisma.aiConversation.findUnique({
      where: { id: conversationId },
      select: { summary: true },
    });

    const messages = await this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: maxMessages,
    });

    // Reverse to chronological order
    messages.reverse();

    const coreMessages = this.formatMessagesAsModelMessages(messages);

    // Prepend summary as system context if available
    if (conversation?.summary) {
      coreMessages.unshift({
        role: 'system',
        content: `Previous conversation context:\n${conversation.summary}`,
      });
    }

    return coreMessages;
  }

  /**
   * Persist a user message to the conversation.
   */
  async saveUserMessage(
    conversationId: string,
    content: string,
  ): Promise<AiMessage> {
    return this.prisma.aiMessage.create({
      data: {
        conversationId,
        role: 'user',
        content: { type: 'text', text: content },
      },
    });
  }

  /**
   * Persist an assistant message to the conversation.
   */
  async saveAssistantMessage(
    conversationId: string,
    content: Prisma.InputJsonValue,
    tokenCount?: number,
    stepIndex?: number,
  ): Promise<AiMessage> {
    return this.prisma.aiMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content,
        tokenCount,
        stepIndex,
      },
    });
  }

  /**
   * Persist a tool result message to the conversation.
   */
  async saveToolMessage(
    conversationId: string,
    content: Prisma.InputJsonValue,
    toolCallId: string,
    stepIndex: number,
  ): Promise<AiMessage> {
    return this.prisma.aiMessage.create({
      data: {
        conversationId,
        role: 'tool',
        content,
        toolCallId,
        stepIndex,
      },
    });
  }

  /**
   * Update conversation title (typically auto-generated from first response).
   */
  async updateConversationTitle(
    conversationId: string,
    title: string,
  ): Promise<void> {
    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { title },
    });
  }

  /**
   * Update conversation summary (rolling summary of older messages).
   */
  async updateConversationSummary(
    conversationId: string,
    summary: string,
  ): Promise<void> {
    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { summary },
    });
  }

  /**
   * List conversations for a user (most recent first).
   */
  async listConversations(
    tenantId: string,
    userId: string,
    limit = 20,
  ): Promise<AiConversation[]> {
    return this.prisma.aiConversation.findMany({
      where: { tenantId, userId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Delete a conversation (hard delete with cascade to messages).
   */
  async deleteConversation(
    conversationId: string,
    tenantId: string,
  ): Promise<void> {
    const conversation = await this.getConversation(conversationId, tenantId);
    if (!conversation) {
      throw new NotFoundException(
        `Conversation ${conversationId} not found`,
      );
    }
    await this.prisma.aiConversation.delete({
      where: { id: conversationId },
    });
  }

  /**
   * Get total message count for a conversation (used for summary trigger).
   */
  async getMessageCount(conversationId: string): Promise<number> {
    return this.prisma.aiMessage.count({
      where: { conversationId },
    });
  }

  /**
   * Load older messages for summary generation.
   * Returns messages from start up to (total - recentCount).
   */
  async getOlderMessages(
    conversationId: string,
    recentCount = 10,
  ): Promise<AiMessage[]> {
    const total = await this.getMessageCount(conversationId);
    if (total <= recentCount) return [];

    const olderCount = total - recentCount;
    return this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: olderCount,
    });
  }

  /**
   * Map Prisma AiMessage[] to AI SDK ModelMessage[] format.
   *
   * Role mapping: 'user' -> 'user', 'assistant' -> 'assistant', 'tool' -> 'tool'
   * Content is stored as JSON (AI SDK UIMessage parts format).
   */
  private formatMessagesAsModelMessages(messages: AiMessage[]): ModelMessage[] {
    return messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m): ModelMessage => {
        const content = m.content as Record<string, unknown>;

        if (m.role === 'user') {
          const text =
            typeof content === 'string'
              ? content
              : (content as { text?: string })?.text ?? '';
          return { role: 'user', content: text };
        }

        // assistant
        const text =
          typeof content === 'string'
            ? content
            : (content as { text?: string })?.text ?? '';
        return { role: 'assistant', content: text };
      });
  }
}
