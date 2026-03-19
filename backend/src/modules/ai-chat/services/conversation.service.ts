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
  static readonly RETENTION_DAYS = 30;

  constructor(private readonly prisma: PrismaService) {}

  private getRetentionCutoff(): Date {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ConversationService.RETENTION_DAYS);
    return cutoff;
  }

  private async touchConversationTx(
    tx: Prisma.TransactionClient,
    conversationId: string,
  ): Promise<void> {
    await tx.aiConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  }

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
    userId?: string,
  ): Promise<AiConversation | null> {
    return this.prisma.aiConversation.findFirst({
      where: {
        id: conversationId,
        tenantId,
        ...(userId ? { userId } : {}),
        updatedAt: { gte: this.getRetentionCutoff() },
      },
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
      const existing = await this.getConversation(conversationId, tenantId, userId);
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
    tenantId?: string,
  ): Promise<ModelMessage[]> {
    const conversation = await this.prisma.aiConversation.findUnique({
      where: { id: conversationId },
      select: { summary: true },
    });

    const messages = await this.prisma.aiMessage.findMany({
      where: {
        conversationId,
        ...(tenantId ? { conversation: { tenantId } } : {}),
      },
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
    const [message] = await this.prisma.$transaction(async (tx) => {
      const created = await tx.aiMessage.create({
        data: {
          conversationId,
          role: 'user',
          content: { type: 'text', text: content },
        },
      });
      await this.touchConversationTx(tx, conversationId);
      return [created];
    });

    return message;
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
    const [message] = await this.prisma.$transaction(async (tx) => {
      const created = await tx.aiMessage.create({
        data: {
          conversationId,
          role: 'assistant',
          content,
          tokenCount,
          stepIndex,
        },
      });
      await this.touchConversationTx(tx, conversationId);
      return [created];
    });

    return message;
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
    const [message] = await this.prisma.$transaction(async (tx) => {
      const created = await tx.aiMessage.create({
        data: {
          conversationId,
          role: 'tool',
          content,
          toolCallId,
          stepIndex,
        },
      });
      await this.touchConversationTx(tx, conversationId);
      return [created];
    });

    return message;
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
      where: {
        tenantId,
        userId,
        updatedAt: { gte: this.getRetentionCutoff() },
      },
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
    userId: string,
  ): Promise<boolean> {
    const result = await this.prisma.aiConversation.deleteMany({
      where: { id: conversationId, tenantId, userId },
    });
    return result.count > 0;
  }

  /**
   * Get the N most recent messages in chronological order.
   */
  async getRecentMessages(
    conversationId: string,
    count: number,
    tenantId?: string,
  ): Promise<AiMessage[]> {
    const messages = await this.prisma.aiMessage.findMany({
      where: {
        conversationId,
        ...(tenantId ? { conversation: { tenantId } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: count,
    });
    messages.reverse();
    return messages;
  }

  /**
   * Get total message count for a conversation (used for summary trigger).
   */
  async getMessageCount(conversationId: string, tenantId?: string): Promise<number> {
    return this.prisma.aiMessage.count({
      where: {
        conversationId,
        ...(tenantId ? { conversation: { tenantId } } : {}),
      },
    });
  }

  /**
   * Load older messages for summary generation.
   * Returns messages from start up to (total - recentCount).
   */
  async getOlderMessages(
    conversationId: string,
    recentCount = 10,
    tenantId?: string,
  ): Promise<AiMessage[]> {
    const total = await this.getMessageCount(conversationId, tenantId);
    if (total <= recentCount) return [];

    const olderCount = total - recentCount;
    return this.prisma.aiMessage.findMany({
      where: {
        conversationId,
        ...(tenantId ? { conversation: { tenantId } } : {}),
      },
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
      .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
      .map((m): ModelMessage => {
        const content = m.content as Record<string, unknown>;

        if (m.role === 'user') {
          const text =
            typeof content === 'string'
              ? content
              : (content as { text?: string })?.text ?? '';
          return { role: 'user', content: text };
        }

        if (m.role === 'tool') {
          return this.formatStoredToolMessage(content, m.toolCallId);
        }

        // assistant
        const text =
          typeof content === 'string'
            ? content
            : (content as { text?: string })?.text ?? '';
        return { role: 'assistant', content: text };
      });
  }

  private formatStoredToolMessage(
    content: Record<string, unknown>,
    fallbackToolCallId?: string | null,
  ): ModelMessage {
    const toolResult = {
      type: 'tool-result',
      toolCallId:
        typeof content.toolCallId === 'string'
          ? content.toolCallId
          : fallbackToolCallId ?? 'unknown',
      toolName:
        typeof content.toolName === 'string' ? content.toolName : 'unknown',
      input: content.input ?? {},
      output: content.output ?? content.result ?? content,
      ...(typeof content.dynamic === 'boolean'
        ? { dynamic: content.dynamic }
        : { dynamic: true }),
      ...(typeof content.providerExecuted === 'boolean'
        ? { providerExecuted: content.providerExecuted }
        : {}),
      ...(typeof content.preliminary === 'boolean'
        ? { preliminary: content.preliminary }
        : {}),
      ...(typeof content.title === 'string' ? { title: content.title } : {}),
      ...(content.providerMetadata &&
      typeof content.providerMetadata === 'object'
        ? { providerMetadata: content.providerMetadata }
        : {}),
    };

    return {
      role: 'tool',
      content: [toolResult],
    } as any; // ModelMessage union type needs cast for tool
  }
}
