/**
 * VoltAgent Session Bridge Service
 *
 * Provides unified session management using VoltAgent memory.
 * Clean implementation without legacy dependencies.
 *
 * 2025 Best Practices:
 * - Tenant isolation maintained
 * - Unified session interface
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  VoltAgentMemoryService,
  type ConversationContext,
  type MemoryMessage,
} from './memory.service';

/**
 * Session info returned to clients
 */
export interface SessionInfo {
  id: string;
  title: string | null;
  lastActiveAt: Date;
  messageCount: number;
}

@Injectable()
export class SessionBridgeService {
  private readonly logger = new Logger(SessionBridgeService.name);

  constructor(
    private readonly memoryService: VoltAgentMemoryService,
  ) {}

  /**
   * List all sessions for a user.
   */
  async listSessions(
    tenantId: string,
    userId: string,
    limit = 10,
  ): Promise<SessionInfo[]> {
    const sessions = await this.memoryService.listConversations(
      tenantId,
      userId,
      limit,
    );

    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      lastActiveAt: s.lastActiveAt,
      messageCount: s.messageCount,
    }));
  }

  /**
   * Get or create a session.
   */
  async getOrCreateSession(
    ctx: ConversationContext,
  ): Promise<{ id: string; isNew: boolean }> {
    return this.memoryService.getOrCreateConversation(ctx);
  }

  /**
   * Get messages for a session.
   */
  async getSessionMessages(
    ctx: ConversationContext,
    limit = 50,
  ): Promise<MemoryMessage[]> {
    const result = await this.memoryService.retrieveHistory(ctx, { limit });
    return result.messages;
  }

  /**
   * Add a message to a session.
   */
  async addMessage(
    ctx: ConversationContext,
    message: MemoryMessage,
  ): Promise<void> {
    await this.memoryService.addMessage(ctx, message);
  }

  /**
   * Delete a session.
   */
  async deleteSession(
    tenantId: string,
    userId: string,
    sessionId: string,
  ): Promise<boolean> {
    return this.memoryService.deleteConversation(tenantId, userId, sessionId);
  }

  /**
   * Generate title for a session.
   */
  async generateTitle(
    conversationId: string,
    locale?: string,
  ): Promise<string> {
    return this.memoryService.generateTitle(conversationId, locale);
  }

  /**
   * Semantic search across session history.
   */
  async searchHistory(
    ctx: ConversationContext,
    query: string,
    limit = 5,
  ): Promise<MemoryMessage[]> {
    return this.memoryService.semanticSearch(ctx, query, { limit });
  }
}
