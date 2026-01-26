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
import { sanitizeLlmResponse } from './chat-context-builder.service';

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
   * Includes deduplication to prevent duplicate messages from VoltAgent memory.
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

      const rawMessages = await memory.getMessages(tenantUserId, conversationId, { limit: messageLimit });

      // Map to our format with sanitization
      const mappedMessages = rawMessages.map((m: { role: string; parts?: Array<{ type: string; text?: string }>; createdAt?: Date }) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: sanitizeLlmResponse(this.extractMessageContent(m)),
        createdAt: m.createdAt || new Date(),
      }));

      // Deduplicate messages by content hash (role + first 200 chars)
      // This prevents duplicates from VoltAgent storing both original and enhanced messages
      const seenContent = new Set<string>();
      const dedupedMessages = mappedMessages.filter((m) => {
        const key = `${m.role}:${m.content.slice(0, 200)}`;
        if (seenContent.has(key)) {
          this.logger.debug(`Duplicate message filtered in conversation ${conversationId}: ${key.slice(0, 50)}...`);
          return false;
        }
        seenContent.add(key);
        return true;
      });

      if (dedupedMessages.length < mappedMessages.length) {
        this.logger.warn(
          `Filtered ${mappedMessages.length - dedupedMessages.length} duplicate messages from conversation ${conversationId}`,
        );
      }

      return {
        id: conversationId,
        title: (conversation.metadata?.title as string) || null,
        lastActiveAt: new Date(),
        messageCount: dedupedMessages.length,
        createdAt: new Date(),
        messages: dedupedMessages,
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
        validationContext: 'SYSTEM_INTERNAL', // Internal title generation - skip jailbreak patterns
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
