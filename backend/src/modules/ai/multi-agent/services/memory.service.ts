import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';

/**
 * Message structure for conversation history.
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  metadata?: {
    agentName?: string;
    intent?: string;
    actionCount?: number;
  };
}

/**
 * Session memory structure.
 */
export interface SessionMemory {
  sessionId: string;
  tenantId: string;
  userId: string;
  messages: ConversationMessage[];
  createdAt: Date;
  lastAccessedAt: Date;
  totalMessageCount: number;
}

/**
 * Memory configuration options.
 */
export interface MemoryConfig {
  maxMessages: number;           // Maximum messages to keep in memory (FIFO)
  maxTokensEstimate: number;     // Approximate max tokens (rough estimate)
  summarizeThreshold: number;    // Messages count before summarizing
  sessionTimeoutMinutes: number; // Session timeout for cleanup
}

const DEFAULT_CONFIG: MemoryConfig = {
  maxMessages: 20,
  maxTokensEstimate: 4000,      // ~4k tokens for context
  summarizeThreshold: 15,       // Summarize after 15 messages
  sessionTimeoutMinutes: 60,    // 1 hour timeout
};

/**
 * MemoryService provides FIFO (First-In-First-Out) conversation memory management.
 *
 * Features:
 * - Maintains conversation history with configurable limits
 * - Automatically removes oldest messages when limit is reached
 * - Persists to database for session continuity
 * - Supports session-based memory isolation
 * - Estimates token usage to prevent context overflow
 *
 * PMS (PMSync) Multi-Agent Memory Service.
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly config: MemoryConfig;

  // In-memory cache for active sessions
  private readonly memoryCache = new Map<string, SessionMemory>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    // Load config with defaults
    this.config = {
      maxMessages:
        this.configService.get<number>('AI_MEMORY_MAX_MESSAGES') ||
        DEFAULT_CONFIG.maxMessages,
      maxTokensEstimate:
        this.configService.get<number>('AI_MEMORY_MAX_TOKENS') ||
        DEFAULT_CONFIG.maxTokensEstimate,
      summarizeThreshold:
        this.configService.get<number>('AI_MEMORY_SUMMARIZE_THRESHOLD') ||
        DEFAULT_CONFIG.summarizeThreshold,
      sessionTimeoutMinutes:
        this.configService.get<number>('AI_SESSION_TIMEOUT_MINUTES') ||
        DEFAULT_CONFIG.sessionTimeoutMinutes,
    };

    this.logger.log(
      `MemoryService initialized: maxMessages=${this.config.maxMessages}, ` +
        `maxTokens=${this.config.maxTokensEstimate}`,
    );
  }

  /**
   * Get or create session memory.
   */
  async getSessionMemory(
    sessionId: string,
    tenantId: string,
    userId: string,
  ): Promise<SessionMemory> {
    const cacheKey = this.getCacheKey(sessionId, tenantId);

    // Check cache first
    if (this.memoryCache.has(cacheKey)) {
      const cached = this.memoryCache.get(cacheKey)!;
      cached.lastAccessedAt = new Date();
      return cached;
    }

    // Load from database
    const session = await this.prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        tenantId,
        userId,
      },
    });

    let memory: SessionMemory;

    if (session) {
      // Parse existing messages
      const messages = this.parseStoredMessages(session.messages);
      memory = {
        sessionId,
        tenantId,
        userId,
        messages,
        createdAt: session.createdAt,
        lastAccessedAt: new Date(),
        totalMessageCount: messages.length,
      };
    } else {
      // Create new session
      const newSession = await this.prisma.chatSession.create({
        data: {
          id: sessionId,
          tenantId,
          userId,
          title: 'PMS AI Session',
          messages: [],
        },
      });

      memory = {
        sessionId,
        tenantId,
        userId,
        messages: [],
        createdAt: newSession.createdAt,
        lastAccessedAt: new Date(),
        totalMessageCount: 0,
      };
    }

    // Cache it
    this.memoryCache.set(cacheKey, memory);

    return memory;
  }

  /**
   * Add a message to session memory with FIFO management.
   */
  async addMessage(
    sessionId: string,
    tenantId: string,
    userId: string,
    message: ConversationMessage,
  ): Promise<void> {
    const memory = await this.getSessionMemory(sessionId, tenantId, userId);

    // Add message
    message.timestamp = message.timestamp || new Date();
    memory.messages.push(message);
    memory.totalMessageCount++;
    memory.lastAccessedAt = new Date();

    // Apply FIFO: remove oldest messages if over limit
    if (memory.messages.length > this.config.maxMessages) {
      const removeCount = memory.messages.length - this.config.maxMessages;
      memory.messages = memory.messages.slice(removeCount);
      this.logger.debug(
        `FIFO: Removed ${removeCount} old messages from session ${sessionId}`,
      );
    }

    // Persist to database
    await this.persistMemory(memory);
  }

  /**
   * Add user message to session.
   */
  async addUserMessage(
    sessionId: string,
    tenantId: string,
    userId: string,
    content: string,
  ): Promise<void> {
    await this.addMessage(sessionId, tenantId, userId, {
      role: 'user',
      content,
    });
  }

  /**
   * Add assistant message to session.
   */
  async addAssistantMessage(
    sessionId: string,
    tenantId: string,
    userId: string,
    content: string,
    metadata?: ConversationMessage['metadata'],
  ): Promise<void> {
    await this.addMessage(sessionId, tenantId, userId, {
      role: 'assistant',
      content,
      metadata,
    });
  }

  /**
   * Get conversation history for LLM context.
   * Returns messages formatted for the AI prompt.
   */
  async getHistory(
    sessionId: string,
    tenantId: string,
    userId: string,
    maxMessages?: number,
  ): Promise<ConversationMessage[]> {
    const memory = await this.getSessionMemory(sessionId, tenantId, userId);

    const limit = maxMessages || this.config.maxMessages;
    const messages = memory.messages.slice(-limit);

    return messages;
  }

  /**
   * Get formatted history string for prompts.
   */
  async getFormattedHistory(
    sessionId: string,
    tenantId: string,
    userId: string,
    maxMessages?: number,
  ): Promise<string> {
    const messages = await this.getHistory(
      sessionId,
      tenantId,
      userId,
      maxMessages,
    );

    if (messages.length === 0) {
      return '';
    }

    return messages
      .map((m) => `${m.role === 'user' ? 'User' : 'PMS'}: ${m.content}`)
      .join('\n\n');
  }

  /**
   * Estimate token count for messages.
   * Rough estimate: ~4 chars per token.
   */
  estimateTokens(messages: ConversationMessage[]): number {
    const totalChars = messages.reduce(
      (sum, m) => sum + m.content.length + 10, // +10 for role prefix
      0,
    );
    return Math.ceil(totalChars / 4);
  }

  /**
   * Get messages within token budget.
   */
  async getMessagesWithinTokenBudget(
    sessionId: string,
    tenantId: string,
    userId: string,
    maxTokens?: number,
  ): Promise<ConversationMessage[]> {
    const memory = await this.getSessionMemory(sessionId, tenantId, userId);
    const budget = maxTokens || this.config.maxTokensEstimate;

    const result: ConversationMessage[] = [];
    let tokenCount = 0;

    // Start from most recent messages
    for (let i = memory.messages.length - 1; i >= 0; i--) {
      const msg = memory.messages[i];
      const msgTokens = Math.ceil((msg.content.length + 10) / 4);

      if (tokenCount + msgTokens > budget) {
        break;
      }

      result.unshift(msg);
      tokenCount += msgTokens;
    }

    this.logger.debug(
      `Token budget: ${result.length} messages, ~${tokenCount} tokens`,
    );

    return result;
  }

  /**
   * Clear session memory.
   */
  async clearSession(
    sessionId: string,
    tenantId: string,
  ): Promise<void> {
    const cacheKey = this.getCacheKey(sessionId, tenantId);
    this.memoryCache.delete(cacheKey);

    await this.prisma.chatSession.updateMany({
      where: { id: sessionId, tenantId },
      data: { messages: [] },
    });

    this.logger.log(`Cleared memory for session ${sessionId}`);
  }

  /**
   * Delete session completely.
   */
  async deleteSession(
    sessionId: string,
    tenantId: string,
  ): Promise<void> {
    const cacheKey = this.getCacheKey(sessionId, tenantId);
    this.memoryCache.delete(cacheKey);

    await this.prisma.chatSession.deleteMany({
      where: { id: sessionId, tenantId },
    });

    this.logger.log(`Deleted session ${sessionId}`);
  }

  /**
   * Get session statistics.
   */
  async getSessionStats(
    sessionId: string,
    tenantId: string,
    userId: string,
  ): Promise<{
    messageCount: number;
    totalMessageCount: number;
    estimatedTokens: number;
    createdAt: Date;
    lastAccessedAt: Date;
  }> {
    const memory = await this.getSessionMemory(sessionId, tenantId, userId);

    return {
      messageCount: memory.messages.length,
      totalMessageCount: memory.totalMessageCount,
      estimatedTokens: this.estimateTokens(memory.messages),
      createdAt: memory.createdAt,
      lastAccessedAt: memory.lastAccessedAt,
    };
  }

  /**
   * Cleanup old sessions from cache.
   */
  cleanupCache(): void {
    const now = new Date();
    const timeoutMs = this.config.sessionTimeoutMinutes * 60 * 1000;
    let cleaned = 0;

    for (const [key, memory] of this.memoryCache.entries()) {
      const age = now.getTime() - memory.lastAccessedAt.getTime();
      if (age > timeoutMs) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned ${cleaned} stale sessions from cache`);
    }
  }

  /**
   * Persist memory to database.
   */
  private async persistMemory(memory: SessionMemory): Promise<void> {
    const messages = memory.messages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp?.toISOString(),
      metadata: m.metadata,
    }));

    await this.prisma.chatSession.update({
      where: { id: memory.sessionId },
      data: {
        messages,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Parse stored messages from database.
   */
  private parseStoredMessages(stored: unknown): ConversationMessage[] {
    if (!Array.isArray(stored)) {
      return [];
    }

    return stored.map((m: any) => ({
      role: m.role || 'user',
      content: m.content || '',
      timestamp: m.timestamp ? new Date(m.timestamp) : undefined,
      metadata: m.metadata,
    }));
  }

  /**
   * Get cache key for session.
   */
  private getCacheKey(sessionId: string, tenantId: string): string {
    return `${tenantId}:${sessionId}`;
  }
}
