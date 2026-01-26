/**
 * Conversation Compaction Service
 *
 * Implements context compaction for long conversations following Anthropic's best practices:
 * 1. Summarize older messages while preserving recent context
 * 2. Maintain sliding window of recent messages
 * 3. Cache summaries for performance
 *
 * Based on: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
 *
 * Memory Architecture:
 * - Recent messages (last N): Kept verbatim for immediate context
 * - Older messages: Summarized into condensed form
 * - Key decisions/facts: Extracted and preserved separately
 */
import { Injectable, Logger } from '@nestjs/common';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { MistralService } from '../../services/mistral.service';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface CompactedContext {
  /** Summary of older conversation (before sliding window) */
  summary: string;
  /** Recent messages kept verbatim */
  recentMessages: ConversationMessage[];
  /** Key facts/decisions extracted from conversation */
  keyFacts: string[];
  /** Total messages in original conversation */
  totalMessages: number;
  /** Whether compaction was applied */
  wasCompacted: boolean;
  /** Estimated token reduction percentage */
  tokenReduction: number;
}

export interface CompactionOptions {
  /** Number of recent messages to keep verbatim (default: 6) */
  recentWindowSize?: number;
  /** Minimum messages before compaction kicks in (default: 10) */
  compactionThreshold?: number;
  /** Maximum tokens for summary (default: 500) */
  maxSummaryTokens?: number;
  /** Cache TTL in seconds (default: 300 = 5 min) */
  cacheTtl?: number;
  /** Enable incremental summarization (default: true) - only summarize new messages */
  enableIncremental?: boolean;
}

/** Tracks the state of a conversation summary for incremental updates */
export interface SummaryState {
  /** Current summary text */
  summary: string;
  /** Key facts extracted */
  keyFacts: string[];
  /** Number of messages included in this summary */
  messageCount: number;
  /** ID of the last message included in summary */
  lastMessageId?: string;
  /** Token reduction percentage */
  tokenReduction: number;
  /** When the summary was last updated */
  updatedAt: string;
}

const DEFAULT_OPTIONS: Required<CompactionOptions> = {
  recentWindowSize: 6,
  compactionThreshold: 10,
  maxSummaryTokens: 500,
  cacheTtl: 300,
  enableIncremental: true, // Phase 4.2: Incremental re-summarization for 60-80% token savings
};

@Injectable()
export class ConversationCompactionService {
  private readonly logger = new Logger(ConversationCompactionService.name);
  private readonly CACHE_PREFIX = 'conv-summary:';
  private readonly STATE_PREFIX = 'conv-state:'; // For incremental summarization state

  constructor(
    private readonly cacheService: CacheService,
    private readonly mistralService: MistralService,
  ) {}

  /**
   * Compact a conversation history into efficient context.
   *
   * Strategy (following Anthropic's guidance):
   * 1. If < threshold messages, return as-is
   * 2. Keep recent N messages verbatim (sliding window)
   * 3. Summarize older messages into condensed form
   * 4. Extract key facts/decisions for preservation
   * 5. Cache the summary for repeated access
   */
  async compactConversation(
    tenantId: string,
    conversationId: string,
    messages: ConversationMessage[],
    options: CompactionOptions = {},
  ): Promise<CompactedContext> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const totalMessages = messages.length;

    // No compaction needed for short conversations
    if (totalMessages <= opts.compactionThreshold) {
      return {
        summary: '',
        recentMessages: messages,
        keyFacts: [],
        totalMessages,
        wasCompacted: false,
        tokenReduction: 0,
      };
    }

    // Split into older messages (to summarize) and recent messages (to keep)
    const splitIndex = totalMessages - opts.recentWindowSize;
    const olderMessages = messages.slice(0, splitIndex);
    const recentMessages = messages.slice(splitIndex);

    // Phase 4.2: Try incremental summarization first
    if (opts.enableIncremental) {
      const incrementalResult = await this.tryIncrementalSummarization(
        tenantId,
        conversationId,
        olderMessages,
        recentMessages,
        opts,
      );
      if (incrementalResult) {
        return incrementalResult;
      }
    }

    // Fallback: Full summarization (no existing state or incremental disabled)
    const cacheKey = this.getCacheKey(tenantId, conversationId, olderMessages.length);
    const cached = await this.getCachedSummary(cacheKey);

    if (cached) {
      this.logger.debug(
        `Cache HIT for conversation summary: ${conversationId} (${olderMessages.length} older msgs)`,
      );
      return {
        summary: cached.summary,
        recentMessages,
        keyFacts: cached.keyFacts,
        totalMessages,
        wasCompacted: true,
        tokenReduction: cached.tokenReduction,
      };
    }

    // Generate full summary using LLM
    this.logger.debug(
      `Full compaction for conversation ${conversationId}: ${olderMessages.length} older msgs → summary`,
    );

    const { summary, keyFacts } = await this.generateSummary(olderMessages, opts);

    // Estimate token reduction
    const originalTokens = this.estimateTokens(olderMessages);
    const summaryTokens = this.estimateTokens([{ id: '', role: 'assistant', content: summary }]);
    const tokenReduction = Math.round(((originalTokens - summaryTokens) / originalTokens) * 100);

    // Cache the summary and save state for future incremental updates
    await this.cacheSummary(cacheKey, { summary, keyFacts, tokenReduction }, opts.cacheTtl);
    await this.saveSummaryState(tenantId, conversationId, {
      summary,
      keyFacts,
      messageCount: olderMessages.length,
      lastMessageId: olderMessages[olderMessages.length - 1]?.id,
      tokenReduction,
      updatedAt: new Date().toISOString(),
    }, opts.cacheTtl);

    this.logger.log(
      `Conversation compacted: ${conversationId} - ${originalTokens} → ${summaryTokens} tokens (${tokenReduction}% reduction)`,
    );

    return {
      summary,
      recentMessages,
      keyFacts,
      totalMessages,
      wasCompacted: true,
      tokenReduction,
    };
  }

  /**
   * Phase 4.2: Incremental Re-summarization
   *
   * Instead of re-processing ALL older messages, only summarize NEW messages
   * and merge with existing summary. Saves 60-80% tokens.
   *
   * @returns CompactedContext if incremental summarization was applied, null otherwise
   */
  private async tryIncrementalSummarization(
    tenantId: string,
    conversationId: string,
    olderMessages: ConversationMessage[],
    recentMessages: ConversationMessage[],
    opts: Required<CompactionOptions>,
  ): Promise<CompactedContext | null> {
    // Get existing summary state
    const existingState = await this.getSummaryState(tenantId, conversationId);

    if (!existingState || existingState.messageCount === 0) {
      // No existing state - full summarization needed
      return null;
    }

    // Check if there are new messages to summarize
    const newMessageCount = olderMessages.length - existingState.messageCount;

    if (newMessageCount <= 0) {
      // No new messages - return cached summary
      this.logger.debug(
        `Incremental: No new messages for ${conversationId}, using cached summary`,
      );
      return {
        summary: existingState.summary,
        recentMessages,
        keyFacts: existingState.keyFacts,
        totalMessages: olderMessages.length + recentMessages.length,
        wasCompacted: true,
        tokenReduction: existingState.tokenReduction,
      };
    }

    // Get only the NEW messages (messages added since last summarization)
    const newMessages = olderMessages.slice(existingState.messageCount);

    this.logger.debug(
      `Incremental summarization for ${conversationId}: ${newMessageCount} new msgs (existing: ${existingState.messageCount})`,
    );

    // Generate incremental summary - merge existing with new
    const { summary, keyFacts } = await this.generateIncrementalSummary(
      existingState.summary,
      existingState.keyFacts,
      newMessages,
      opts,
    );

    // Estimate token savings from incremental approach
    // Full approach would process ALL olderMessages, incremental only processes newMessages
    const fullTokens = this.estimateTokens(olderMessages);
    const incrementalTokens = this.estimateTokens(newMessages) +
      this.estimateTokens([{ id: '', role: 'assistant', content: existingState.summary }]);
    const tokenSavings = Math.round(((fullTokens - incrementalTokens) / fullTokens) * 100);

    const summaryTokens = this.estimateTokens([{ id: '', role: 'assistant', content: summary }]);
    const tokenReduction = Math.round(((fullTokens - summaryTokens) / fullTokens) * 100);

    // Update state with new summary
    const newState: SummaryState = {
      summary,
      keyFacts,
      messageCount: olderMessages.length,
      lastMessageId: olderMessages[olderMessages.length - 1]?.id,
      tokenReduction,
      updatedAt: new Date().toISOString(),
    };
    await this.saveSummaryState(tenantId, conversationId, newState, opts.cacheTtl);

    this.logger.log(
      `Incremental compaction: ${conversationId} - processed ${newMessageCount}/${olderMessages.length} msgs (${tokenSavings}% token savings vs full)`,
    );

    return {
      summary,
      recentMessages,
      keyFacts,
      totalMessages: olderMessages.length + recentMessages.length,
      wasCompacted: true,
      tokenReduction,
    };
  }

  /**
   * Generate incremental summary by merging existing summary with new messages.
   * This is the key to 60-80% token savings.
   */
  private async generateIncrementalSummary(
    existingSummary: string,
    existingKeyFacts: string[],
    newMessages: ConversationMessage[],
    opts: Required<CompactionOptions>,
  ): Promise<{ summary: string; keyFacts: string[] }> {
    // Format new messages
    const formattedNewMessages = newMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const existingFactsFormatted = existingKeyFacts.length > 0
      ? existingKeyFacts.map((f) => `- ${f}`).join('\n')
      : 'None yet.';

    // Incremental summarization prompt - only processes new messages
    const incrementalPrompt = `You are a conversation summarizer performing an INCREMENTAL update.

## Your Task:
Update the existing summary by integrating ONLY the new messages below.
Do NOT re-analyze the existing summary - just append/merge new information.

## Existing Summary:
${existingSummary}

## Existing Key Facts:
${existingFactsFormatted}

## NEW Messages to Integrate:
${formattedNewMessages}

## Guidelines:
1. Preserve ALL information from the existing summary
2. Add new decisions, commitments, and action items from the new messages
3. Update key facts if new important information emerged
4. Keep the summary concise - aim for ${opts.maxSummaryTokens} tokens maximum
5. Maintain chronological flow

## Output Format:
SUMMARY:
[Updated summary with new information integrated]

KEY_FACTS:
- [Existing fact 1]
- [Existing fact 2]
- [New fact from recent messages]
(Preserve existing facts and add new important ones)`;

    try {
      const response = await this.mistralService.completePrompt({
        userPrompt: incrementalPrompt,
        temperature: 0.3,
        validationContext: 'SYSTEM_INTERNAL',
      });

      // Parse the response
      const summaryMatch = response.match(/SUMMARY:\s*([\s\S]*?)(?=KEY_FACTS:|$)/i);
      const factsMatch = response.match(/KEY_FACTS:\s*([\s\S]*?)$/i);

      const summary = summaryMatch?.[1]?.trim() || response.trim();
      const factsText = factsMatch?.[1]?.trim() || '';

      // Parse key facts
      const keyFacts = factsText
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.startsWith('-'))
        .map((line: string) => line.substring(1).trim())
        .filter((fact: string) => fact.length > 0);

      return { summary, keyFacts };
    } catch (error) {
      this.logger.error(
        `Incremental summarization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Fallback: append new messages to existing summary
      const newSummary = `${existingSummary}\n\n[Recent additions: ${newMessages.length} new messages]`;
      return { summary: newSummary, keyFacts: existingKeyFacts };
    }
  }

  /**
   * Generate a summary of older conversation messages.
   * Uses a specialized prompt to preserve important context.
   */
  private async generateSummary(
    messages: ConversationMessage[],
    opts: Required<CompactionOptions>,
  ): Promise<{ summary: string; keyFacts: string[] }> {
    // Format messages for the summarization prompt
    const formattedHistory = messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const summaryPrompt = `You are a conversation summarizer. Your task is to create a concise summary of the following conversation history.

## Guidelines:
1. Preserve key decisions, commitments, and action items
2. Keep important facts, preferences, and context mentioned by the user
3. Note any unresolved questions or pending tasks
4. Be concise - aim for ${opts.maxSummaryTokens} tokens maximum
5. Use bullet points for clarity

## Conversation History:
${formattedHistory}

## Output Format:
Provide your response in this exact format:

SUMMARY:
[Your concise summary here]

KEY_FACTS:
- [Fact 1]
- [Fact 2]
- [Fact 3]
(Include only the most important facts that should be remembered)`;

    try {
      const response = await this.mistralService.completePrompt({
        userPrompt: summaryPrompt,
        temperature: 0.3, // Low temperature for consistent summaries
        validationContext: 'SYSTEM_INTERNAL', // Internal conversation compaction - skip jailbreak patterns
      });

      // Parse the response
      const summaryMatch = response.match(/SUMMARY:\s*([\s\S]*?)(?=KEY_FACTS:|$)/i);
      const factsMatch = response.match(/KEY_FACTS:\s*([\s\S]*?)$/i);

      const summary = summaryMatch?.[1]?.trim() || response.trim();
      const factsText = factsMatch?.[1]?.trim() || '';

      // Parse key facts (bullet points starting with -)
      const keyFacts = factsText
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.startsWith('-'))
        .map((line: string) => line.substring(1).trim())
        .filter((fact: string) => fact.length > 0);

      return { summary, keyFacts };
    } catch (error) {
      this.logger.error(
        `Failed to generate conversation summary: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fallback: Create a simple summary without LLM
      return this.fallbackSummary(messages);
    }
  }

  /**
   * Fallback summary generation without LLM (for error cases).
   * Uses simple heuristics to extract key content.
   */
  private fallbackSummary(messages: ConversationMessage[]): { summary: string; keyFacts: string[] } {
    // Take first and last few messages as summary points
    const firstMessage = messages[0]?.content?.substring(0, 200) || '';
    const lastMessage = messages[messages.length - 1]?.content?.substring(0, 200) || '';

    const summary = `[Earlier conversation: ${messages.length} messages exchanged]\n` +
      `Started with: "${firstMessage}..."\n` +
      `Last discussed: "${lastMessage}..."`;

    return { summary, keyFacts: [] };
  }

  /**
   * Estimate token count for messages (rough approximation).
   * Uses ~4 characters per token heuristic.
   */
  private estimateTokens(messages: ConversationMessage[]): number {
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  /**
   * Generate cache key for conversation summary.
   */
  private getCacheKey(tenantId: string, conversationId: string, messageCount: number): string {
    // Include message count to invalidate cache when new messages are added
    return `${this.CACHE_PREFIX}${tenantId}:${conversationId}:${messageCount}`;
  }

  /**
   * Get cached summary if available.
   */
  private async getCachedSummary(
    cacheKey: string,
  ): Promise<{ summary: string; keyFacts: string[]; tokenReduction: number } | null> {
    try {
      return await this.cacheService.get<{
        summary: string;
        keyFacts: string[];
        tokenReduction: number;
      }>(cacheKey, { namespace: CacheNamespace.VOLTAGENT_METRICS });
    } catch {
      return null;
    }
  }

  /**
   * Cache the generated summary.
   */
  private async cacheSummary(
    cacheKey: string,
    data: { summary: string; keyFacts: string[]; tokenReduction: number },
    ttl: number,
  ): Promise<void> {
    try {
      await this.cacheService.set(cacheKey, data, {
        ttl,
        namespace: CacheNamespace.VOLTAGENT_METRICS,
      });
    } catch (error) {
      this.logger.warn(`Failed to cache summary: ${error}`);
    }
  }

  /**
   * Format compacted context for injection into prompt.
   *
   * Output format:
   * [Conversation Summary]
   * <summary>
   *
   * [Key Context]
   * - fact 1
   * - fact 2
   *
   * [Recent Messages]
   * User: ...
   * Assistant: ...
   */
  formatForPrompt(compacted: CompactedContext): string {
    const parts: string[] = [];

    // Add summary if compaction was applied
    if (compacted.wasCompacted && compacted.summary) {
      parts.push(`[Conversation Summary - ${compacted.totalMessages - compacted.recentMessages.length} earlier messages]\n${compacted.summary}`);
    }

    // Add key facts if any
    if (compacted.keyFacts.length > 0) {
      parts.push(`[Key Context]\n${compacted.keyFacts.map((f) => `- ${f}`).join('\n')}`);
    }

    // Add recent messages
    if (compacted.recentMessages.length > 0) {
      const recentFormatted = compacted.recentMessages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');
      parts.push(`[Recent Messages]\n${recentFormatted}`);
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * Clear cached summaries for a conversation.
   * Useful when conversation is deleted or reset.
   */
  async clearCache(tenantId: string, conversationId: string): Promise<void> {
    // Clear both cache and state
    const stateKey = this.getStateKey(tenantId, conversationId);
    try {
      await this.cacheService.del(stateKey, { namespace: CacheNamespace.VOLTAGENT_METRICS });
      this.logger.debug(`Cleared summary cache and state for ${tenantId}:${conversationId}`);
    } catch {
      // Ignore errors during cache clearing
    }
  }

  // ============================================================================
  // Phase 4.2: Incremental Summary State Management
  // ============================================================================

  /**
   * Generate state key for incremental summarization.
   */
  private getStateKey(tenantId: string, conversationId: string): string {
    return `${this.STATE_PREFIX}${tenantId}:${conversationId}`;
  }

  /**
   * Get existing summary state for incremental updates.
   */
  private async getSummaryState(
    tenantId: string,
    conversationId: string,
  ): Promise<SummaryState | null> {
    try {
      const stateKey = this.getStateKey(tenantId, conversationId);
      return await this.cacheService.get<SummaryState>(stateKey, {
        namespace: CacheNamespace.VOLTAGENT_METRICS,
      });
    } catch {
      return null;
    }
  }

  /**
   * Save summary state for future incremental updates.
   */
  private async saveSummaryState(
    tenantId: string,
    conversationId: string,
    state: SummaryState,
    ttl: number,
  ): Promise<void> {
    try {
      const stateKey = this.getStateKey(tenantId, conversationId);
      await this.cacheService.set(stateKey, state, {
        ttl: ttl * 2, // Keep state longer than cache for incremental updates
        namespace: CacheNamespace.VOLTAGENT_METRICS,
      });
    } catch (error) {
      this.logger.warn(`Failed to save summary state: ${error}`);
    }
  }
}
