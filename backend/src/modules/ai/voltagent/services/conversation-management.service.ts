/**
 * Conversation Management Service
 *
 * Handles chat conversation CRUD operations using VoltAgent Memory API.
 * Extracted from VoltAgentService to maintain single responsibility principle.
 *
 * ## Atomicity Note (DEBT-01)
 * This service uses ONLY VoltAgent Memory API for storage.
 * ConversationAtomicityService is NOT applicable here because:
 * - No Prisma writes in this service
 * - VoltAgent Memory API is the sole data store
 * - Memory object is passed in from VoltAgentService (external dependency)
 *
 * ConversationAtomicityService is designed for hybrid scenarios where
 * Prisma writes must be coordinated with VoltAgent Memory API calls
 * (saga pattern with compensating transactions).
 *
 * @see ConversationAtomicityService for hybrid Prisma+VoltAgent operations
 * @see https://voltagent.dev/docs/agents/memory/overview/
 */
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import type { Memory } from '@voltagent/core';
import { MistralService } from '../../services/mistral.service';
import { sanitizeLlmResponse } from './chat-context-builder.service';
import { RedisLockService } from '../../../../common/services/redis-lock.service';
import { RetryService } from '../../../../common/services/retry.service';

/** Lock TTL for conversation operations (5 seconds) */
const CONVERSATION_LOCK_TTL_MS = 5000;

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

  constructor(
    private readonly mistralService: MistralService,
    @Optional() @Inject(RedisLockService) private readonly redisLockService?: RedisLockService,
    @Optional() @Inject(RetryService) private readonly retryService?: RetryService,
  ) {
    this.logger.log(`[INIT] ConversationManagementService: lock=${!!this.redisLockService}, retry=${!!this.retryService}`);
  }

  /**
   * Create tenant-scoped user ID for isolation.
   * Format: {tenantId}:{userId}
   */
  private getTenantUserId(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
  }

  /**
   * Execute a Memory API call with retry logic (VOLT-03).
   * Retries on transient errors (network blips, temporary failures).
   */
  private async withMemoryRetry<T>(
    fn: () => Promise<T>,
    operation: string,
  ): Promise<T> {
    if (!this.retryService) {
      return fn();
    }

    return this.retryService.withRetry(fn, {
      maxAttempts: 3,
      loggerName: `ConversationManagement.${operation}`,
      // VoltAgent Memory API may return 500 errors on temporary DB issues
      extractStatus: (error) => {
        if (error?.response?.status) return error.response.status;
        if (error?.statusCode) return error.statusCode;
        // Treat connection errors as retryable (5xx equivalent)
        if (error?.code === 'ECONNRESET' || error?.code === 'ECONNREFUSED') return 503;
        return undefined;
      },
    });
  }

  /**
   * Execute a conversation mutation with distributed lock (VOLT-02).
   * Prevents race conditions in multi-instance deployments.
   */
  private async withConversationLock<T>(
    conversationId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!this.redisLockService) {
      return fn();
    }

    try {
      return await this.redisLockService.withLock(
        `conversation:${conversationId}`,
        CONVERSATION_LOCK_TTL_MS,
        fn,
      );
    } catch (error) {
      // If lock acquisition fails, log and proceed without lock
      // This ensures graceful degradation when Redis is unavailable
      if (error instanceof Error && error.message.includes('Failed to acquire lock')) {
        this.logger.warn(`Lock acquisition failed for conversation ${conversationId}, proceeding without lock`);
        return fn();
      }
      throw error;
    }
  }

  /**
   * Extract ONLY text content from VoltAgent's UIMessage parts (AI SDK format).
   * VoltAgent stores multiple part types in a single message:
   * - type: "tool-*" = tool call data (internal)
   * - type: "step-start" = step markers (internal)
   * - type: "text" or undefined = actual text content (user-visible)
   *
   * We ONLY extract parts with type "text" or no type (plain text).
   */
  private extractMessageContent(message: { parts?: Array<{ type?: string; text?: string }> }): string {
    if (!message.parts) return '';
    // Only extract text from "text" type parts or parts without type
    return message.parts
      .filter((part) => !part.type || part.type === 'text')
      .map((part) => part.text || '')
      .filter(Boolean)
      .join(' ');
  }

  /**
   * Check if message has NO user-visible text content.
   * A message should be filtered if it has NO text-type parts (only tool/step parts).
   */
  private hasNoTextContent(parts?: Array<{ type?: string; text?: string }>): boolean {
    if (!parts || parts.length === 0) return true;
    // Check if there's at least one text-type part with actual content
    const hasText = parts.some((part) =>
      (!part.type || part.type === 'text') && part.text && part.text.trim().length > 0
    );
    return !hasText;
  }

  /**
   * Check if a message looks like an internal delegation task (fallback content filter).
   * These are supervisor-to-subagent messages that shouldn't appear in chat history.
   *
   * Patterns detected:
   * - "Send email to X with subject 'Y' and body 'Z'"
   * - "Update the email body to 'X' and send it to Y"
   * - Messages that match exact tool call patterns
   */
  private isDelegationTaskMessage(content: string): boolean {
    // Patterns that indicate internal delegation (case-insensitive)
    const delegationPatterns = [
      // Email delegation patterns
      /^Send email to .+ with subject ['"].+['"] and body ['"].+['"]/i,
      /^Update the email body to ['"].+['"] and send it to .+/i,
      /^Forward email .+ to .+/i,
      /^Reply to email .+ with ['"].+['"]/i,
      // Calendar delegation patterns
      /^Create event ['"].+['"] on .+/i,
      /^Schedule meeting .+ with .+/i,
      /^Delete event ['"].+['"]/i,
      // Contact delegation patterns
      /^Update contact .+ with .+/i,
      /^Create contact .+/i,
      /^Delete contact .+/i,
      // Generic delegation patterns
      /^Search .+ for .+/i,
      /^Find .+ and .+/i,
      /^Count .+ emails?/i,
    ];

    return delegationPatterns.some((pattern) => pattern.test(content.trim()));
  }

  /**
   * List conversations for a user.
   * Uses VoltAgent Memory.getConversationsByUserId() method.
   *
   * VOLT-03: Wrapped with retry logic for transient failures.
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
      // VOLT-03: Use retry for transient failures
      const conversations = await this.withMemoryRetry(
        () => memory.getConversationsByUserId(tenantUserId, {
          limit,
          orderBy: 'updated_at',
          orderDirection: 'DESC',
        }),
        'getConversationsByUserId',
      );

      // Get message counts for each conversation
      const results = await Promise.all(
        conversations.map(async (c: { id: string; title?: string; metadata?: Record<string, unknown>; updatedAt: string }) => {
          // VOLT-03: Use retry for transient failures
          const messages = await this.withMemoryRetry(
            () => memory.getMessages(tenantUserId, c.id, { limit: 1000 }),
            'getMessages',
          );
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
   *
   * VOLT-03: Wrapped with retry logic for transient failures.
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
      // VOLT-03: Use retry for transient failures
      const conversation = await this.withMemoryRetry(
        () => memory.getConversation(conversationId),
        'getConversation',
      );
      if (!conversation) {
        return null;
      }

      // VOLT-03: Use retry for transient failures
      const rawMessages = await this.withMemoryRetry(
        () => memory.getMessages(tenantUserId, conversationId, { limit: messageLimit }),
        'getMessages',
      );

      // FIX: Filter out internal delegation messages from VoltAgent subagent coordination
      // PRIMARY: Check parts[].type - tool calls have type like "tool-delegate_task", "tool-manage_email"
      // SECONDARY: Check metadata.subAgentId/subAgentName or content patterns as fallback
      const userVisibleMessages = rawMessages.filter((m) => {
        // Cast to access VoltAgent-specific properties
        const msg = m as unknown as {
          role: string;
          parts?: Array<{ type?: string; text?: string }>;
          metadata?: Record<string, unknown>;
        };
        // PRIMARY FILTER: Filter out messages with NO user-visible text
        // VoltAgent stores multiple parts per message (tool-*, step-start, text)
        // We keep messages that have at least one text-type part with content
        if (this.hasNoTextContent(msg.parts)) {
          this.logger.debug(`Filtered empty message in conversation ${conversationId} (no text parts)`);
          return false;
        }
        // SECONDARY: Filter out messages with subAgentId or subAgentName (internal delegation)
        const metadata = msg.metadata || {};
        if (metadata.subAgentId || metadata.subAgentName) {
          this.logger.debug(`Filtered internal delegation message in conversation ${conversationId}`);
          return false;
        }
        // SECONDARY: Filter out explicitly internal messages
        if (metadata.isInternal) {
          return false;
        }
        // FALLBACK: Content-based filter for delegation task patterns
        // These are supervisor-to-subagent messages that look like tool commands
        const content = this.extractMessageContent(msg);
        if (content && this.isDelegationTaskMessage(content)) {
          this.logger.debug(`Filtered delegation task message in conversation ${conversationId}: ${content.slice(0, 50)}...`);
          return false;
        }
        return true;
      });

      // Map to our format with sanitization
      const mappedMessages = userVisibleMessages.map((m) => {
        const msg = m as unknown as { role: string; parts?: Array<{ type?: string; text?: string }>; createdAt?: Date };
        return {
          role: msg.role as 'user' | 'assistant' | 'system',
          content: sanitizeLlmResponse(this.extractMessageContent(msg)),
          createdAt: msg.createdAt || new Date(),
        };
      });

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
   *
   * VOLT-02: Protected by distributed lock to prevent race conditions.
   * VOLT-03: Wrapped with retry logic for transient failures.
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
      // VOLT-02: Use distributed lock to prevent concurrent updates
      return await this.withConversationLock(conversationId, async () => {
        // VOLT-03: Use retry for transient failures
        await this.withMemoryRetry(
          () => memory.updateConversation(conversationId, {
            title: updates.title,
            metadata: updates.isArchived !== undefined ? { isArchived: updates.isArchived } : undefined,
          }),
          'updateConversation',
        );
        return true;
      });
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
   *
   * VOLT-02: Protected by distributed lock to prevent race conditions.
   * VOLT-03: Wrapped with retry logic for transient failures.
   *
   * Idempotent: Returns true if conversation doesn't exist (nothing to delete).
   */
  async deleteConversation(
    memory: Memory | null,
    conversationId: string,
  ): Promise<boolean> {
    if (!memory) {
      return false;
    }

    try {
      // VOLT-02: Use distributed lock to prevent concurrent deletes
      return await this.withConversationLock(conversationId, async () => {
        // Check if conversation exists first (idempotent delete)
        const existing = await this.withMemoryRetry(
          () => memory.getConversation(conversationId),
          'getConversation',
        ).catch(() => null);

        if (!existing) {
          // Conversation doesn't exist - treat as already deleted (idempotent)
          this.logger.debug(`Conversation ${conversationId} not found, treating as already deleted`);
          return true;
        }

        // VOLT-03: Use retry for transient failures
        await this.withMemoryRetry(
          () => memory.deleteConversation(conversationId),
          'deleteConversation',
        );
        return true;
      });
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
        modelTier: 'fast', // Title generation is a simple task
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
