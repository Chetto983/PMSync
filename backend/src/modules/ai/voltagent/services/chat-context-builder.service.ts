/**
 * ChatContextBuilder Service
 *
 * Builds enhanced context for chat requests:
 * - Episodic memory injection (learned lessons from rejections)
 * - Long-term memory injection (semantic search)
 * - Conversation history injection with compaction
 *
 * Part of VoltAgentService refactoring (2302 → <500 lines)
 * Created: 2026-01-22
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import type { Memory } from '@voltagent/core';
import { PiiDetectionService } from '../../guards';
import { EpisodicMemoryService } from './episodic-memory.service';
import { MemoryIntelligenceService } from './memory-intelligence.service';
import { ConversationCompactionService, type ConversationMessage } from './conversation-compaction.service';

/**
 * Sanitize LLM response to remove accidentally echoed internal context markers.
 * Extracted from voltagent.service.ts for reuse.
 */
export function sanitizeLlmResponse(text: string): string {
  if (!text) return text;

  return text
    .replace(/\[Conversation History\][\s\S]*?\[Current Message\]\s*/gi, '')
    .replace(/\[Conversation Summary[^\]]*\]\s*/gi, '')
    .replace(/\[Key Context\][\s\S]*?(?=\n\n|\[|$)/gi, '')
    .replace(/\[Recent Messages\][\s\S]*?(?=\n\n|\[|$)/gi, '')
    .replace(/\[User Memory\][\s\S]*?---\s*/gi, '')
    .replace(/## Learned Constraints[\s\S]*?(?=\n\n## |$)/gi, '')
    .replace(/\[(Conversation History|Current Message|Key Context|Recent Messages|User Memory)\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface ContextBuildOptions {
  tenantId: string;
  userId: string;
  sessionId: string;
  tenantUserId: string;
  memory: Memory | null;
  logPrefix: string;
}

export interface EnhancedContext {
  enhancedMessage: string;
  contextTruncated: boolean;
}

export interface EpisodicInjectionOptions {
  tenantId: string;
  userId: string;
  limit?: number;
}

export interface MemoryInjectionOptions {
  tenantId: string;
  userId: string;
  message: string;
  limit?: number;
  useReranking?: boolean;
}

export interface HistoryInjectionOptions {
  tenantId: string;
  tenantUserId: string;
  sessionId: string;
  memory: Memory;
  logPrefix: string;
  compactionThreshold?: number;
  recentWindowSize?: number;
}

@Injectable()
export class ChatContextBuilderService {
  private readonly logger = new Logger(ChatContextBuilderService.name);

  constructor(
    @Optional() private readonly piiDetectionService: PiiDetectionService | null,
    @Optional() private readonly episodicMemoryService: EpisodicMemoryService | null,
    @Optional() private readonly memoryIntelligenceService: MemoryIntelligenceService | null,
    @Optional() private readonly compactionService: ConversationCompactionService | null,
  ) {}

  /**
   * Build enhanced message with all context injections.
   *
   * @param message - Processed user message (already PII-redacted)
   * @param options - Context building options
   * @returns Enhanced message with injected context
   */
  async build(message: string, options: ContextBuildOptions): Promise<EnhancedContext> {
    let enhancedMessage = message;
    let contextTruncated = false;

    // 1. Inject episodic learning (rejection lessons)
    enhancedMessage = await this.injectEpisodicLessons(enhancedMessage, {
      tenantId: options.tenantId,
      userId: options.userId,
    });

    // 2. Inject long-term memory context (semantic search)
    enhancedMessage = await this.injectLongTermMemory(enhancedMessage, {
      tenantId: options.tenantId,
      userId: options.userId,
      message,
    });

    // 3. Inject conversation history with compaction
    if (options.memory) {
      const historyResult = await this.injectConversationHistory(enhancedMessage, {
        tenantId: options.tenantId,
        tenantUserId: options.tenantUserId,
        sessionId: options.sessionId,
        memory: options.memory,
        logPrefix: options.logPrefix,
      });
      enhancedMessage = historyResult.enhancedMessage;
      contextTruncated = historyResult.contextTruncated;
    }

    return { enhancedMessage, contextTruncated };
  }

  /**
   * Inject episodic learning lessons from past rejections.
   */
  async injectEpisodicLessons(message: string, options: EpisodicInjectionOptions): Promise<string> {
    if (!this.episodicMemoryService) {
      return message;
    }

    try {
      const lessons = await this.episodicMemoryService.getRecentLessons(
        options.tenantId,
        options.userId,
        undefined, // Fetch all lessons
        options.limit ?? 5,
      );
      const lessonContext = this.episodicMemoryService.formatLessonsForPrompt(lessons);

      if (lessonContext) {
        const safeLessonContext = this.piiDetectionService
          ? this.piiDetectionService.redact(lessonContext)
          : lessonContext;
        this.logger.debug(
          `[tenant:${options.tenantId}] Episodic learning lessons injected: ${lessons.length}`,
        );
        return `${safeLessonContext}\n\n---\n\n${message}`;
      }
    } catch (error) {
      this.logger.warn(`[tenant:${options.tenantId}] Failed to fetch episodic lessons: ${error}`);
    }

    return message;
  }

  /**
   * Inject long-term memory context via semantic search.
   */
  async injectLongTermMemory(message: string, options: MemoryInjectionOptions): Promise<string> {
    if (!this.memoryIntelligenceService || !options.userId) {
      return message;
    }

    try {
      const memoryContext = await this.memoryIntelligenceService.getRelevantContext(
        options.tenantId,
        options.userId,
        options.message,
        { limit: options.limit ?? 5, useReranking: options.useReranking ?? false },
      );

      if (memoryContext) {
        const safeMemoryContext = this.piiDetectionService
          ? this.piiDetectionService.redact(memoryContext)
          : memoryContext;
        this.logger.debug(`[tenant:${options.tenantId}] Long-term memory context injected`);
        return `[User Memory]\n${safeMemoryContext}\n\n---\n\n${message}`;
      }
    } catch (error) {
      this.logger.warn(`[tenant:${options.tenantId}] Failed to fetch memory context: ${error}`);
    }

    return message;
  }

  /**
   * Inject conversation history with compaction for long conversations.
   */
  async injectConversationHistory(
    message: string,
    options: HistoryInjectionOptions,
  ): Promise<EnhancedContext> {
    let contextTruncated = false;

    try {
      const history = await options.memory.getMessages(options.tenantUserId, options.sessionId, {
        limit: 50,
      });

      if (!history || history.length === 0) {
        return { enhancedMessage: message, contextTruncated: false };
      }

      // Convert to compaction format
      const messages: ConversationMessage[] = history.map((msg, idx) => {
        const rawContent = msg.parts
          ?.map((part) => (part as { type: string; text?: string }).text || '')
          .filter(Boolean)
          .join(' ') || '';
        const content = sanitizeLlmResponse(rawContent);
        return {
          id: `msg-${idx}`,
          role: msg.role as 'user' | 'assistant',
          content,
          timestamp:
            (msg as unknown as { createdAt?: Date }).createdAt?.toISOString?.() ||
            new Date().toISOString(),
        };
      });

      let historyContext: string;
      const compactionThreshold = options.compactionThreshold ?? 10;
      const recentWindowSize = options.recentWindowSize ?? 6;

      // Use compaction service if available and conversation is long
      if (this.compactionService && messages.length > compactionThreshold) {
        const compacted = await this.compactionService.compactConversation(
          options.tenantId,
          options.sessionId,
          messages,
          { recentWindowSize, compactionThreshold },
        );
        historyContext = this.compactionService.formatForPrompt(compacted);

        if (compacted.wasCompacted) {
          contextTruncated = true;
          this.logger.debug(
            `${options.logPrefix} Conversation compacted: ${messages.length} msgs → ${compacted.recentMessages.length} recent + summary (${compacted.tokenReduction}% reduction)`,
          );
        }
      } else {
        // Fallback: Use raw history for short conversations
        historyContext = messages
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n\n');
      }

      // Redact PII from history if service available
      const safeHistoryContext = this.piiDetectionService
        ? this.piiDetectionService.redact(historyContext)
        : historyContext;

      const enhancedMessage = `[Conversation History]\n${safeHistoryContext}\n\n[Current Message]\n${message}`;
      this.logger.debug(
        `${options.logPrefix} Conversation history injected: ${history.length} messages`,
      );

      return { enhancedMessage, contextTruncated };
    } catch (error) {
      this.logger.warn(`${options.logPrefix} Failed to fetch conversation history: ${error}`);
      return { enhancedMessage: message, contextTruncated: false };
    }
  }
}
