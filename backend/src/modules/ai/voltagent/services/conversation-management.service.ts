/**
 * Conversation Management Service
 *
 * Handles chat conversation CRUD operations using VoltAgent Memory API.
 * Extracted from VoltAgentService to maintain single responsibility principle.
 *
 * Based on: https://voltagent.dev/docs/agents/memory/overview/
 */
import { Injectable, Logger } from '@nestjs/common';
import type { Memory } from '@voltagent/core';
import { MistralService } from '../../services/mistral.service';

/**
 * Sanitize message content to remove internal context markers.
 * These markers are used for LLM context but should never be shown to users.
 */
function sanitizeMessageContent(text: string): string {
  if (!text) return text;

  return text
    // Remove [Conversation History]...[Current Message] blocks
    .replace(/\[Conversation History\][\s\S]*?\[Current Message\]\s*/gi, '')
    // Remove [Conversation Summary...] headers
    .replace(/\[Conversation Summary[^\]]*\]\s*/gi, '')
    // Remove [Key Context] sections
    .replace(/\[Key Context\][\s\S]*?(?=\n\n|\[|$)/gi, '')
    // Remove [Recent Messages] sections
    .replace(/\[Recent Messages\][\s\S]*?(?=\n\n|\[|$)/gi, '')
    // Remove [User Memory]...--- blocks
    .replace(/\[User Memory\][\s\S]*?---\s*/gi, '')
    // Remove ## Learned Constraints sections (including content until next ## or end)
    .replace(/## Learned Constraints[\s\S]*?(?=\n\n## |\n\n---|\n\n\[|$)/gi, '')
    // Remove standalone internal markers
    .replace(/\[(Conversation History|Current Message|Key Context|Recent Messages|User Memory)\]/gi, '')
    // Remove separator lines that were between context sections
    .replace(/^---\s*$/gm, '')
    // Clean up multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Conversation summary for listing */
export interface ConversationSummary {
  id: string;
  title: string | null;
  lastActiveAt: Date;
  messageCount: number;
}

/** Conversation message for API responses (distinct from compaction service) */
export interface ConversationMessageDetail {
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

/** Full conversation with messages */
export interface ConversationDetail extends ConversationSummary {
  createdAt: Date;
  messages: ConversationMessageDetail[];
}

@Injectable()
export class ConversationManagementService {
  private readonly logger = new Logger(ConversationManagementService.name);

  constructor(private readonly mistralService: MistralService) {}

  /**
   * Create tenant-scoped user ID for isolation.
   * Format: {tenantId}:{userId}
   */
  private getTenantUserId(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
  }

  /**
   * Extract text content from VoltAgent's UIMessage parts (AI SDK format).
   */
  private extractMessageContent(message: { parts?: Array<{ type: string; text?: string }> }): string {
    return message.parts
      ?.map((part) => part.text || '')
      .filter(Boolean)
      .join(' ') || '';
  }

  /**
   * List conversations for a user.
   * Uses VoltAgent Memory.getConversationsByUserId() method.
   */
  async listConversations(
    memory: Memory | null,
    tenantId: string,
    userId: string,
    limit = 50,
  ): Promise<ConversationSummary[]> {
    const tenantUserId = this.getTenantUserId(tenantId, userId);

    if (!memory) {
      return [];
    }

    try {
      const conversations = await memory.getConversationsByUserId(tenantUserId, {
        limit,
        orderBy: 'updated_at',
        orderDirection: 'DESC',
      });

      // Get message counts for each conversation
      const results = await Promise.all(
        conversations.map(async (c: { id: string; title?: string; metadata?: Record<string, unknown>; updatedAt: string }) => {
          const messages = await memory.getMessages(tenantUserId, c.id, { limit: 1000 });
          return {
            id: c.id,
            title: c.title || (c.metadata?.title as string) || null,
            lastActiveAt: new Date(c.updatedAt),
            messageCount: messages.length,
          };
        }),
      );

      return results;
    } catch (error) {
      this.logger.error('Failed to list conversations', {
        tenantId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get a conversation with its messages.
   */
  async getConversationWithMessages(
    memory: Memory | null,
    tenantId: string,
    userId: string,
    conversationId: string,
    messageLimit = 50,
  ): Promise<ConversationDetail | null> {
    const tenantUserId = this.getTenantUserId(tenantId, userId);

    if (!memory) {
      return null;
    }

    try {
      const conversation = await memory.getConversation(conversationId);
      if (!conversation) {
        return null;
      }

      const messages = await memory.getMessages(tenantUserId, conversationId, { limit: messageLimit });

      return {
        id: conversationId,
        title: (conversation.metadata?.title as string) || null,
        lastActiveAt: new Date(),
        messageCount: messages.length,
        createdAt: new Date(),
        messages: messages.map((m: { role: string; parts?: Array<{ type: string; text?: string }>; createdAt?: Date }) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: this.extractMessageContent(m),
          createdAt: m.createdAt || new Date(),
        })),
      };
    } catch (error) {
      this.logger.error('Failed to get conversation with messages', {
        tenantId,
        userId,
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Update conversation metadata (title, archived status).
   * Uses VoltAgent Memory.updateConversation() method.
   */
  async updateConversation(
    memory: Memory | null,
    conversationId: string,
    updates: { title?: string; isArchived?: boolean },
  ): Promise<boolean> {
    if (!memory) {
      return false;
    }

    try {
      await memory.updateConversation(conversationId, {
        title: updates.title,
        metadata: updates.isArchived !== undefined ? { isArchived: updates.isArchived } : undefined,
      });
      return true;
    } catch (error) {
      this.logger.error('Failed to update conversation', {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Delete a conversation and its messages.
   * Uses VoltAgent Memory.deleteConversation() method.
   */
  async deleteConversation(
    memory: Memory | null,
    conversationId: string,
  ): Promise<boolean> {
    if (!memory) {
      return false;
    }

    try {
      await memory.deleteConversation(conversationId);
      return true;
    } catch (error) {
      this.logger.error('Failed to delete conversation', {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Generate a title for a conversation using AI.
   */
  async generateConversationTitle(
    memory: Memory | null,
    tenantId: string,
    userId: string,
    conversationId: string,
    locale = 'en',
  ): Promise<string | null> {
    try {
      // Get first few messages to generate title
      const conversation = await this.getConversationWithMessages(memory, tenantId, userId, conversationId, 6);
      if (!conversation || conversation.messages.length === 0) {
        return null;
      }

      const messagesText = conversation.messages
        .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
        .join('\n');

      const prompt = locale === 'it'
        ? `Genera un breve titolo (max 50 caratteri) per questa conversazione:\n\n${messagesText}\n\nTitolo:`
        : `Generate a brief title (max 50 characters) for this conversation:\n\n${messagesText}\n\nTitle:`;

      const title = await this.mistralService.completePrompt({
        userPrompt: prompt,
        temperature: 0.3,
      });

      // Clean up the title
      const cleanTitle = title.trim().replace(/^["']|["']$/g, '').slice(0, 50);

      // Save the title
      await this.updateConversation(memory, conversationId, { title: cleanTitle });

      return cleanTitle;
    } catch (error) {
      this.logger.error('Failed to generate conversation title', {
        tenantId,
        userId,
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
