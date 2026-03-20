import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AiConversation, AiMessage, Prisma } from '@prisma/client';
import type { ModelMessage } from 'ai';
import * as PrismaRetry from '../../../common/services/prisma-retry.service';

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

    // Frontend always sends a real conversationId via eager initialize().
    // No auto-resolve fallback -- create a fresh conversation.
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
    const [message] = await PrismaRetry.withPrismaRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.aiMessage.create({
          data: {
            conversationId,
            role: 'user',
            content: { type: 'text', text: content },
          },
        });
        await this.touchConversationTx(tx, conversationId);
        return [created];
      }),
    );

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
    const [message] = await PrismaRetry.withPrismaRetry(() =>
      this.prisma.$transaction(async (tx) => {
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
      }),
    );

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
    const [message] = await PrismaRetry.withPrismaRetry(() =>
      this.prisma.$transaction(async (tx) => {
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
      }),
    );

    return message;
  }

  /**
   * Persist multiple tool result messages in a single transaction.
   */
  async saveToolMessagesBatch(
    conversationId: string,
    entries: Array<{
      content: Prisma.InputJsonValue;
      toolCallId: string;
      stepIndex: number;
    }>,
  ): Promise<void> {
    if (entries.length === 0) return;

    await PrismaRetry.withPrismaRetry(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.aiMessage.createMany({
          data: entries.map((entry) => ({
            conversationId,
            role: 'tool',
            content: entry.content,
            toolCallId: entry.toolCallId,
            stepIndex: entry.stepIndex,
          })),
        });
        await this.touchConversationTx(tx, conversationId);
      }),
    );
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
    const raw = messages
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

        // assistant — may be text-only OR array with text + tool-call parts
        if (Array.isArray(content)) {
          // Multi-part assistant message (text + tool calls from onStepFinish)
          return { role: 'assistant', content } as any;
        }
        const text =
          typeof content === 'string'
            ? content
            : (content as { text?: string })?.text ?? '';
        return { role: 'assistant', content: text };
      });

    // Merge consecutive same-role user messages to avoid InvalidPromptError.
    // This happens when prior AI responses failed (no assistant message saved)
    // leaving orphaned user messages in sequence.
    const merged = this.mergeConsecutiveUserMessages(raw);

    // Drop orphaned tool messages whose toolCallIds don't exist in any
    // preceding assistant message. This handles old conversations where
    // tool calls were not saved as part of assistant messages.
    return this.dropOrphanedToolMessages(merged);
  }

  /**
   * Merge consecutive user messages into a single message.
   * Mistral (and other providers) require strictly alternating user/assistant roles.
   */
  private mergeConsecutiveUserMessages(messages: ModelMessage[]): ModelMessage[] {
    const result: ModelMessage[] = [];
    for (const msg of messages) {
      const prev = result[result.length - 1];
      if (
        prev &&
        msg.role === 'user' &&
        prev.role === 'user' &&
        typeof msg.content === 'string' &&
        typeof prev.content === 'string'
      ) {
        prev.content = prev.content + '\n' + msg.content;
      } else {
        result.push(msg);
      }
    }
    return result;
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

  /**
   * Drop tool messages whose toolCallIds are not present in any
   * preceding assistant message's tool-call parts.
   *
   * This handles legacy conversations where assistant messages were saved
   * as text-only (without tool-call parts), leaving tool result messages
   * that reference non-existent toolCallIds — causing AI SDK to reject
   * the prompt with "messages do not match ModelMessage[] schema".
   */
  private dropOrphanedToolMessages(messages: ModelMessage[]): ModelMessage[] {
    // Collect all toolCallIds from assistant messages
    const knownToolCallIds = new Set<string>();
    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            (part as any).type === 'tool-call' &&
            'toolCallId' in part
          ) {
            knownToolCallIds.add((part as any).toolCallId);
          }
        }
      }
    }

    // If no tool calls found in any assistant message, drop ALL tool messages
    // (they're all orphaned from old-format saves)
    if (knownToolCallIds.size === 0) {
      return messages.filter((m) => m.role !== 'tool');
    }

    // Otherwise, keep only tool messages whose toolCallIds are known
    return messages.filter((msg) => {
      if (msg.role !== 'tool') return true;
      const content = msg.content;
      if (!Array.isArray(content) || content.length === 0) return false;
      const toolCallId = (content[0] as any)?.toolCallId;
      return typeof toolCallId === 'string' && knownToolCallIds.has(toolCallId);
    });
  }
}
