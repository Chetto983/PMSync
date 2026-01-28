/**
 * ChatContextBuilder Service
 *
 * Builds enhanced context for chat requests:
 * - Episodic memory injection (learned lessons from rejections)
 * - Long-term memory injection (semantic search for user facts)
 *
 * NOTE: Conversation history is handled by VoltAgent's native memory (contextLimit: 20)
 *
 * Simplified: 2026-01-26 - Removed duplicate conversation history injection
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { PiiDetectionService } from '../../guards';
import { EpisodicMemoryService } from './episodic-memory.service';
import { MemoryIntelligenceService } from './memory-intelligence.service';

/**
 * Sanitize LLM response to remove accidentally echoed internal context markers.
 */
export function sanitizeLlmResponse(text: string): string {
  if (!text) return text;

  return text
    .replace(/\[User Memory\][\s\S]*?---\s*/gi, '')
    .replace(/## Learned Constraints[\s\S]*?(?=\n\n## |$)/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface ContextBuildOptions {
  tenantId: string;
  userId: string;
  logPrefix: string;
}

export interface EnhancedContext {
  enhancedMessage: string;
}

@Injectable()
export class ChatContextBuilderService {
  private readonly logger = new Logger(ChatContextBuilderService.name);

  constructor(
    @Optional() private readonly piiDetectionService: PiiDetectionService | null,
    @Optional() private readonly episodicMemoryService: EpisodicMemoryService | null,
    @Optional() private readonly memoryIntelligenceService: MemoryIntelligenceService | null,
  ) {}

  /**
   * Build enhanced message with episodic + long-term memory.
   * Conversation history is handled by VoltAgent's native memory (contextLimit: 20).
   */
  async build(message: string, options: ContextBuildOptions): Promise<EnhancedContext> {
    const buildStart = Date.now();
    const timings: Record<string, number> = {};
    let enhancedMessage = message;

    // 1. Inject episodic learning (rejection lessons)
    const episodicStart = Date.now();
    enhancedMessage = await this.injectEpisodicLessons(enhancedMessage, options);
    timings['episodic'] = Date.now() - episodicStart;

    // 2. Inject long-term memory context (semantic search for user facts)
    const memoryStart = Date.now();
    enhancedMessage = await this.injectLongTermMemory(enhancedMessage, message, options);
    timings['memory'] = Date.now() - memoryStart;

    timings['total'] = Date.now() - buildStart;
    this.logger.log(
      `${options.logPrefix} [PERF] context_build: episodic=${timings['episodic']}ms | memory=${timings['memory']}ms | total=${timings['total']}ms`
    );

    return { enhancedMessage };
  }

  /**
   * Inject episodic learning lessons from past rejections.
   */
  private async injectEpisodicLessons(message: string, options: ContextBuildOptions): Promise<string> {
    if (!this.episodicMemoryService) {
      return message;
    }

    try {
      const lessons = await this.episodicMemoryService.getRecentLessons(
        options.tenantId,
        options.userId,
        undefined,
        5,
      );
      const lessonContext = this.episodicMemoryService.formatLessonsForPrompt(lessons);

      if (lessonContext) {
        const safeLessonContext = this.piiDetectionService
          ? this.piiDetectionService.redact(lessonContext)
          : lessonContext;
        this.logger.debug(`[tenant:${options.tenantId}] Episodic lessons injected: ${lessons.length}`);
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
  private async injectLongTermMemory(
    enhancedMessage: string,
    originalMessage: string,
    options: ContextBuildOptions,
  ): Promise<string> {
    if (!this.memoryIntelligenceService || !options.userId) {
      return enhancedMessage;
    }

    try {
      const memoryContext = await this.memoryIntelligenceService.getRelevantContext(
        options.tenantId,
        options.userId,
        originalMessage,
        { limit: 5, useReranking: false },
      );

      if (memoryContext) {
        const safeMemoryContext = this.piiDetectionService
          ? this.piiDetectionService.redact(memoryContext)
          : memoryContext;
        this.logger.debug(`[tenant:${options.tenantId}] Long-term memory injected`);
        return `[User Memory]\n${safeMemoryContext}\n\n---\n\n${enhancedMessage}`;
      }
    } catch (error) {
      this.logger.warn(`[tenant:${options.tenantId}] Failed to fetch memory context: ${error}`);
    }

    return enhancedMessage;
  }
}
