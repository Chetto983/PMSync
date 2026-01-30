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
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
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

/**
 * Fast-path patterns that don't need memory lookup (saves ~400-600 tokens per request).
 * These are stateless queries where user memory context is not relevant.
 *
 * PERF FIX 2026-01-28: Added compose/write/draft patterns
 * PERF FIX 2026-01-30: Expanded to skip ~40% more queries (Part 17 Memory Optimization)
 *
 * VoltAgent Best Practice: Use `memory: false` equivalent for stateless queries
 * @see https://voltagent.dev/docs/agents/memory/overview/
 */
const SKIP_MEMORY_PATTERNS = [
  // Greetings (EN/IT) - expanded
  /^(ciao|hello|hi|hey|buongiorno|buonasera|salve|good\s*(morning|afternoon|evening))[\s!?.]*$/i,
  // Time queries (EN/IT)
  /^(che ore?|what time|ora|orario|che giorno)[\s\S]{0,20}$/i,
  // Simple help/status
  /^(help|aiuto|status|\?)[\s!?.]*$/i,
  // Very short messages (likely not needing context)
  /^.{1,10}$/,
  // Compose/write/draft requests - creative model doesn't need memory lookup
  /\b(draft|compose|write|scrivi|componi|bozza)\b.*\b(email|message|messaggio|mail|reply|risposta)/i,
  /\b(help\s*(me\s*)?(write|draft)|aiutami\s*(a\s*)?(scrivere|comporre))/i,
  /\b(send|invia|reply|rispondi)\s*(an?\s*)?(email|message|mail)/i,
  // Informational queries (stateless) - EN/IT
  /^(what is|how do|explain|describe|tell me about|cos'[eè]|come\s+(funziona|si))/i,
  // Email listing/searching - context from RAG, not memory
  /^(list|show me|find|search|get my|display)\s+(emails?|messages?)/i,
  /^(mostra|trova|cerca|elenca|dammi)\s+(le\s+)?(email|mail|messaggi)/i,
  // Calendar queries - context from calendar API, not memory
  /^(calendar|events?|schedule|meeting|appointment|appuntament|riunion)/i,
  /^(what('s| is) on|show)\s+(my\s+)?(calendar|schedule)/i,
  // Status/summary queries - data-driven, not memory-driven
  /^(inbox|unread|summary|overview|briefing|status)/i,
  // Count queries
  /^(how many|quant[ie]|count)/i,
  // Delete/archive/move - action queries don't need memory
  /\b(delete|archive|move|mark|flag|sposta|elimina|archivia|segna)\b/i,
  // Simple acknowledgments
  /^(ok|okay|yes|no|sì|si|no|va bene|perfetto|grazie|thanks|got it|understood)\b/i,
  // Command-style requests - stateless
  /^(open|close|refresh|reload|apri|chiudi|aggiorna)/i,
  // Attachment queries - data-driven
  /\b(attachment|allegat|download|scarica)\b/i,
  // Folder operations
  /\b(folder|cartella|label|etichetta)\b.*\b(create|delete|rename|crea|elimina|rinomina)\b/i,
];

export interface EnhancedContext {
  enhancedMessage: string;
}

/**
 * Check if a message contains memory-worthy content (preferences, facts, personal info).
 * Use this to gate expensive fact extraction - only process messages likely to contain memories.
 *
 * P2.2 (Part 17 Memory Optimization): Reduces unnecessary LLM calls by ~50%
 */
export function needsMemoryContext(message: string): boolean {
  const lower = message.toLowerCase();

  // Messages likely to contain memory-worthy content
  const memoryPatterns = [
    // Personal preferences
    /\b(i prefer|i like|i don't like|i hate|i always|i never|my favorite)\b/,
    /\b(preferisco|mi piace|non mi piace|odio|sempre|mai|il mio preferito)\b/,
    // Personal facts
    /\b(my (name|job|role|company|team|boss|manager|email) is|i work|i am a)\b/,
    /\b(mi chiamo|lavoro|sono un|il mio (nome|lavoro|ruolo|capo))\b/,
    // Contact info mentions
    /\b(usually|typically|often|normally)\b.*\b(send|reply|contact|email)\b/,
    // Explicit memory request
    /\b(remember|don't forget|note that|keep in mind)\b/,
    /\b(ricorda|non dimenticare|nota che|tieni a mente)\b/,
    // Confirmations that may contain facts
    /\b(yes|correct|exactly|that's right|confirmed)\b/,
    // Working patterns
    /\b(every (day|week|monday|morning)|at \d{1,2}(:\d{2})?\s*(am|pm)?)\b/i,
  ];

  return memoryPatterns.some((pattern) => pattern.test(lower));
}

@Injectable()
export class ChatContextBuilderService {
  private readonly logger = new Logger(ChatContextBuilderService.name);

  constructor(
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(PiiDetectionService) private readonly piiDetectionService: PiiDetectionService | null,
    @Optional() @Inject(EpisodicMemoryService) private readonly episodicMemoryService: EpisodicMemoryService | null,
    @Optional() @Inject(MemoryIntelligenceService) private readonly memoryIntelligenceService: MemoryIntelligenceService | null,
  ) {
    this.logger.log(`[INIT] Services injected: PII=${!!this.piiDetectionService}, Episodic=${!!this.episodicMemoryService}, Memory=${!!this.memoryIntelligenceService}`);
  }

  /**
   * Check if message is a simple query that doesn't need memory lookup.
   * This is a performance optimization to avoid expensive embedding generation.
   */
  private shouldSkipMemory(message: string): boolean {
    const trimmed = message.trim();
    return SKIP_MEMORY_PATTERNS.some((pattern) => pattern.test(trimmed));
  }

  /**
   * Build enhanced message with episodic + long-term memory.
   * Conversation history is handled by VoltAgent's native memory (contextLimit: 20).
   */
  async build(message: string, options: ContextBuildOptions): Promise<EnhancedContext> {
    const buildStart = Date.now();
    const timings: Record<string, number> = {};
    let enhancedMessage = message;

    // Fast-path: Skip memory for simple queries (saves ~500-1000ms)
    const skipMemory = this.shouldSkipMemory(message);
    if (skipMemory) {
      this.logger.debug(`${options.logPrefix} [FAST-PATH] Skipping memory for simple query`);
      return { enhancedMessage };
    }

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
   * Detect query intent for filtering episodic lessons.
   * Returns action type hints that should match lesson actionTypes.
   */
  private detectQueryIntent(message: string): string[] {
    const lower = message.toLowerCase();
    const intents: string[] = [];

    // Email actions
    if (/\b(send|reply|forward|compose|draft|email|mail|invia|rispondi|inoltra)\b/.test(lower)) {
      intents.push('EMAIL_SEND', 'EMAIL_REPLY', 'EMAIL_FORWARD', 'EMAIL_DRAFT');
    }
    // Calendar actions
    if (/\b(calendar|event|meeting|schedule|appointment|appuntament|riunion)\b/.test(lower)) {
      intents.push('CALENDAR_CREATE', 'CALENDAR_UPDATE', 'CALENDAR_DELETE');
    }
    // Contact actions
    if (/\b(contact|add contact|save contact|contatt)\b/.test(lower)) {
      intents.push('CONTACT_CREATE', 'CONTACT_UPDATE');
    }
    // Folder actions
    if (/\b(folder|label|move|archive|delete|cartella|etichetta|sposta|archivia|elimina)\b/.test(lower)) {
      intents.push('FOLDER_CREATE', 'EMAIL_MOVE', 'EMAIL_DELETE', 'EMAIL_ARCHIVE');
    }

    return intents;
  }

  /**
   * Inject episodic learning lessons from past rejections.
   * P2.1 (Part 17): Only injects lessons RELEVANT to current query intent.
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

      if (lessons.length === 0) {
        return message;
      }

      // P2.1: Filter lessons by relevance to current query
      const queryIntents = this.detectQueryIntent(message);
      let relevantLessons = lessons;

      if (queryIntents.length > 0) {
        // Only include lessons that match current query intent
        relevantLessons = lessons.filter((lesson) =>
          queryIntents.some((intent) =>
            lesson.actionType.toUpperCase().includes(intent.split('_')[0]) ||
            intent.includes(lesson.actionType.toUpperCase().split('_')[0])
          )
        );
        // Max 2 relevant lessons to reduce token usage
        relevantLessons = relevantLessons.slice(0, 2);

        if (relevantLessons.length < lessons.length) {
          this.logger.debug(
            `[tenant:${options.tenantId}] Episodic filter: ${relevantLessons.length}/${lessons.length} lessons relevant to intents: ${queryIntents.join(', ')}`
          );
        }
      }

      if (relevantLessons.length === 0) {
        return message;
      }

      const lessonContext = this.episodicMemoryService.formatLessonsForPrompt(relevantLessons);

      if (lessonContext) {
        const safeLessonContext = this.piiDetectionService
          ? this.piiDetectionService.redact(lessonContext)
          : lessonContext;
        this.logger.debug(`[tenant:${options.tenantId}] Episodic lessons injected: ${relevantLessons.length}`);
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
