/**
 * VoltAgent Enhanced Memory Service
 *
 * 2025 Best Practices Implementation:
 * - Dual memory: Short-term (recent messages) + Long-term (summaries)
 * - Hybrid search: Semantic similarity + Recency decay
 * - Memory compression: Automatic summarization of old messages
 * - Tenant isolation: Strict data segregation per tenant
 *
 * References:
 * - https://voltagent.dev/docs/agents/memory/overview/
 * - https://dev.to/jakob_sandstrm_a11b3056c/under-the-hood-building-a-hybrid-search-engine-for-ai-memory-nodejs-pgvector-3c5k
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { MistralService } from '../../services/mistral.service';
import { getLocale } from '../locales';

/**
 * Message role type
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Memory message interface
 */
export interface MemoryMessage {
  role: MessageRole;
  content: string;
  toolCalls?: Array<{ tool: string; args: Record<string, unknown> }>;
  toolResults?: Array<{ tool: string; result: unknown }>;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Conversation context for retrieval
 */
export interface ConversationContext {
  tenantId: string;
  userId: string;
  conversationId?: string;
  locale?: string;
}

/**
 * Hybrid search options
 */
export interface HybridSearchOptions {
  /** Maximum number of results */
  limit?: number;
  /** Vector similarity weight (0-1), rest is recency */
  vectorWeight?: number;
  /** Include summaries in search */
  includeSummaries?: boolean;
  /** Recency decay factor (higher = faster decay) */
  recencyDecay?: number;
}

/**
 * Memory retrieval result
 */
export interface MemoryRetrievalResult {
  messages: MemoryMessage[];
  summaries?: string[];
  totalMessages: number;
  hasMore: boolean;
}

/**
 * Token budget configuration for different model tiers
 */
export const TOKEN_BUDGET_CONFIG = {
  /** Default budget for most conversations (Mistral small) */
  default: 4000,
  /** Extended budget for complex tasks (Mistral medium/large) */
  extended: 8000,
  /** Compact budget for simple queries */
  compact: 2000,
  /** Reserve tokens for system prompt and response */
  systemReserve: 500,
  /** Reserve tokens for model response */
  responseReserve: 1000,
};

/**
 * Summarization threshold configuration
 */
const SUMMARIZATION_CONFIG = {
  /** Messages before triggering summarization */
  messageThreshold: 20,
  /** Keep this many recent messages unsummarized */
  keepRecentCount: 10,
  /** Max messages to summarize in one batch */
  batchSize: 15,
  /** Max token estimate for context window */
  maxContextTokens: TOKEN_BUDGET_CONFIG.default,
  /** Min messages before LLM summarization (use rule-based for fewer) */
  llmSummarizationThreshold: 5,
};

/**
 * Token budget result interface
 */
export interface TokenBudgetResult {
  /** Messages that fit within the budget */
  messages: MemoryMessage[];
  /** Summaries included for context */
  summaries: string[];
  /** Total tokens used */
  totalTokens: number;
  /** Budget limit used */
  budgetLimit: number;
  /** Whether messages were truncated */
  wasTruncated: boolean;
  /** Number of messages dropped due to budget */
  messagesDropped: number;
  /** Whether summarization was triggered */
  summarizationTriggered: boolean;
}

@Injectable()
export class VoltAgentMemoryService {
  private readonly logger = new Logger(VoltAgentMemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mistralService: MistralService,
  ) {}

  /**
   * Get or create a conversation for the user.
   * Implements tenant isolation via tenantId.
   */
  async getOrCreateConversation(
    ctx: ConversationContext,
  ): Promise<{ id: string; isNew: boolean }> {
    const { tenantId, userId, conversationId, locale } = ctx;

    // If conversationId provided, try to find it
    if (conversationId) {
      const existing = await this.prisma.voltAgentConversation.findFirst({
        where: {
          id: conversationId,
          tenantId,
          userId,
          isDeleted: false,
        },
        select: { id: true },
      });

      if (existing) {
        return { id: existing.id, isNew: false };
      }
    }

    // Create new conversation
    const conversation = await this.prisma.voltAgentConversation.create({
      data: {
        tenantId,
        userId,
        locale: getLocale(locale),
      },
      select: { id: true },
    });

    return { id: conversation.id, isNew: true };
  }

  /**
   * Add a message to the conversation.
   * Automatically triggers summarization if threshold reached.
   */
  async addMessage(
    ctx: ConversationContext,
    message: MemoryMessage,
  ): Promise<void> {
    const { id: conversationId } = await this.getOrCreateConversation(ctx);

    // Get current message count
    const conversation = await this.prisma.voltAgentConversation.findUnique({
      where: { id: conversationId },
      select: { messageCount: true },
    });

    const messageIndex = (conversation?.messageCount ?? 0);

    // Insert message
    await this.prisma.voltAgentMessage.create({
      data: {
        conversationId,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        role: message.role,
        content: message.content,
        toolCalls: message.toolCalls as Prisma.InputJsonValue | undefined,
        toolResults: message.toolResults as Prisma.InputJsonValue | undefined,
        messageIndex,
        tokenCount: message.tokenCount ?? this.estimateTokens(message.content),
        metadata: message.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    // Update conversation
    await this.prisma.voltAgentConversation.update({
      where: { id: conversationId },
      data: {
        messageCount: messageIndex + 1,
        lastActiveAt: new Date(),
      },
    });

    // Check if summarization needed
    if (messageIndex + 1 >= SUMMARIZATION_CONFIG.messageThreshold) {
      await this.maybeSummarize(conversationId, ctx);
    }
  }

  /**
   * Retrieve conversation history with hybrid search.
   * Combines recent messages + relevant summaries for optimal context.
   * IMPORTANT: Enforces token limit to prevent context window overflow.
   */
  async retrieveHistory(
    ctx: ConversationContext,
    options: HybridSearchOptions = {},
  ): Promise<MemoryRetrievalResult> {
    const {
      limit = 20,
      includeSummaries = true,
    } = options;

    const { id: conversationId, isNew } = await this.getOrCreateConversation(ctx);

    if (isNew) {
      return { messages: [], totalMessages: 0, hasMore: false };
    }

    // Get recent messages (always include)
    const messages = await this.prisma.voltAgentMessage.findMany({
      where: {
        conversationId,
        tenantId: ctx.tenantId,
      },
      orderBy: { messageIndex: 'desc' },
      take: limit,
      select: {
        role: true,
        content: true,
        toolCalls: true,
        toolResults: true,
        tokenCount: true,
        metadata: true,
      },
    });

    // Reverse to chronological order and enforce token limit
    const chronologicalMessages: MemoryMessage[] = [];
    let totalTokens = 0;

    for (const m of messages.reverse()) {
      const tokenCount = m.tokenCount ?? this.estimateTokens(m.content);

      // Stop if we'd exceed context window limit
      if (totalTokens + tokenCount > SUMMARIZATION_CONFIG.maxContextTokens) {
        this.logger.debug(
          `Context window limit reached: ${totalTokens}/${SUMMARIZATION_CONFIG.maxContextTokens} tokens, truncating ${messages.length - chronologicalMessages.length} messages`,
        );
        break;
      }

      totalTokens += tokenCount;
      chronologicalMessages.push({
        role: m.role as MessageRole,
        content: m.content,
        toolCalls: m.toolCalls as MemoryMessage['toolCalls'],
        toolResults: m.toolResults as MemoryMessage['toolResults'],
        tokenCount: tokenCount,
        metadata: m.metadata as MemoryMessage['metadata'],
      });
    }

    // Get summaries if requested and conversation has them
    let summaries: string[] | undefined;
    if (includeSummaries) {
      const summaryRecords = await this.prisma.conversationSummary.findMany({
        where: {
          conversationId,
          tenantId: ctx.tenantId,
        },
        orderBy: { startMessageIndex: 'desc' },
        take: 3, // Limit to recent summaries
        select: { summary: true },
      });
      if (summaryRecords.length > 0) {
        summaries = summaryRecords.map((s) => s.summary);
      }
    }

    // Get total count
    const totalMessages = await this.prisma.voltAgentMessage.count({
      where: { conversationId, tenantId: ctx.tenantId },
    });

    return {
      messages: chronologicalMessages,
      summaries,
      totalMessages,
      hasMore: totalMessages > limit,
    };
  }

  /**
   * Get conversation context optimized for a specific token budget.
   * Implements intelligent truncation and on-demand summarization.
   *
   * Strategy:
   * 1. Always include system messages and recent context
   * 2. Include summaries of older conversation
   * 3. Truncate oldest messages first if budget exceeded
   * 4. Trigger LLM summarization if significant context is lost
   *
   * @param ctx - Conversation context
   * @param budget - Token budget type ('default' | 'extended' | 'compact') or number
   * @param currentMessage - Current user message to include in budget calculation
   */
  async getContextWithBudget(
    ctx: ConversationContext,
    budget: keyof typeof TOKEN_BUDGET_CONFIG | number = 'default',
    currentMessage?: string,
  ): Promise<TokenBudgetResult> {
    const budgetLimit = typeof budget === 'number'
      ? budget
      : TOKEN_BUDGET_CONFIG[budget];

    // Reserve space for system prompt, current message, and response
    const availableBudget = budgetLimit
      - TOKEN_BUDGET_CONFIG.systemReserve
      - TOKEN_BUDGET_CONFIG.responseReserve
      - (currentMessage ? this.estimateTokens(currentMessage) : 0);

    const { id: conversationId, isNew } = await this.getOrCreateConversation(ctx);

    if (isNew) {
      return {
        messages: [],
        summaries: [],
        totalTokens: 0,
        budgetLimit,
        wasTruncated: false,
        messagesDropped: 0,
        summarizationTriggered: false,
      };
    }

    // Get all messages (we'll filter by budget)
    const allMessages = await this.prisma.voltAgentMessage.findMany({
      where: {
        conversationId,
        tenantId: ctx.tenantId,
      },
      orderBy: { messageIndex: 'desc' },
      select: {
        role: true,
        content: true,
        toolCalls: true,
        toolResults: true,
        tokenCount: true,
        metadata: true,
        messageIndex: true,
      },
    });

    // Get existing summaries
    const summaryRecords = await this.prisma.conversationSummary.findMany({
      where: {
        conversationId,
        tenantId: ctx.tenantId,
      },
      orderBy: { startMessageIndex: 'desc' },
      take: 3,
      select: { summary: true, summaryTokens: true },
    });

    // Calculate summary tokens
    let summaryTokens = 0;
    const summaries: string[] = [];
    for (const s of summaryRecords) {
      const tokens = s.summaryTokens ?? this.estimateTokens(s.summary);
      if (summaryTokens + tokens <= availableBudget * 0.2) { // Max 20% of budget for summaries
        summaries.push(s.summary);
        summaryTokens += tokens;
      }
    }

    // Fill remaining budget with recent messages
    const remainingBudget = availableBudget - summaryTokens;
    const includedMessages: MemoryMessage[] = [];
    let totalTokens = summaryTokens;
    let messagesDropped = 0;

    // Process messages from most recent to oldest
    for (const m of allMessages) {
      const tokenCount = m.tokenCount ?? this.estimateTokens(m.content);

      if (totalTokens + tokenCount <= remainingBudget + summaryTokens) {
        totalTokens += tokenCount;
        includedMessages.push({
          role: m.role as MessageRole,
          content: m.content,
          toolCalls: m.toolCalls as MemoryMessage['toolCalls'],
          toolResults: m.toolResults as MemoryMessage['toolResults'],
          tokenCount,
          metadata: m.metadata as MemoryMessage['metadata'],
        });
      } else {
        messagesDropped++;
      }
    }

    // Reverse to chronological order
    includedMessages.reverse();

    const wasTruncated = messagesDropped > 0;
    let summarizationTriggered = false;

    // If we dropped significant messages, trigger async summarization
    if (messagesDropped >= SUMMARIZATION_CONFIG.llmSummarizationThreshold) {
      this.logger.debug(
        `Token budget exceeded: dropped ${messagesDropped} messages, triggering summarization`,
      );
      // Trigger summarization in background (don't await)
      this.triggerLlmSummarization(conversationId, ctx).catch((err) =>
        this.logger.error('Background summarization failed', err),
      );
      summarizationTriggered = true;
    }

    return {
      messages: includedMessages,
      summaries,
      totalTokens,
      budgetLimit,
      wasTruncated,
      messagesDropped,
      summarizationTriggered,
    };
  }

  /**
   * Trigger LLM-powered summarization for long conversations.
   * Called when token budget is exceeded significantly.
   */
  private async triggerLlmSummarization(
    conversationId: string,
    ctx: ConversationContext,
  ): Promise<void> {
    const conversation = await this.prisma.voltAgentConversation.findUnique({
      where: { id: conversationId },
      select: {
        messageCount: true,
        summaryUpToIndex: true,
      },
    });

    if (!conversation) return;

    const unsummarizedStart = conversation.summaryUpToIndex ?? 0;
    const totalMessages = conversation.messageCount;
    const unsummarizedCount = totalMessages - unsummarizedStart;

    // Only summarize if we have enough unsummarized messages
    if (unsummarizedCount < SUMMARIZATION_CONFIG.llmSummarizationThreshold) {
      return;
    }

    // Get messages to summarize (excluding recent ones)
    const messagesToSummarizeCount = Math.min(
      unsummarizedCount - SUMMARIZATION_CONFIG.keepRecentCount,
      SUMMARIZATION_CONFIG.batchSize,
    );

    if (messagesToSummarizeCount <= 0) return;

    const messages = await this.prisma.voltAgentMessage.findMany({
      where: {
        conversationId,
        messageIndex: {
          gte: unsummarizedStart,
          lt: unsummarizedStart + messagesToSummarizeCount,
        },
      },
      orderBy: { messageIndex: 'asc' },
      select: { role: true, content: true, messageIndex: true },
    });

    if (messages.length === 0) return;

    const startIndex = messages[0].messageIndex;
    const endIndex = messages[messages.length - 1].messageIndex;

    try {
      // Use LLM for summarization if available and enough messages
      let summary: { text: string; keyFacts: Array<{ fact: string; importance: number }>; topics: string[] };

      if (messages.length >= SUMMARIZATION_CONFIG.llmSummarizationThreshold) {
        summary = await this.generateLlmSummary(messages, ctx.locale);
      } else {
        summary = this.generateRuleBasedSummary(messages, ctx.locale);
      }

      // Store summary with embedding for semantic search
      let vector: number[] | undefined;
      try {
        vector = await this.mistralService.generateEmbedding(summary.text);
      } catch {
        this.logger.debug('Failed to generate embedding for summary, storing without vector');
      }

      await this.prisma.conversationSummary.create({
        data: {
          conversationId,
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          summary: summary.text,
          startMessageIndex: startIndex,
          endMessageIndex: endIndex,
          messageCountCovered: messages.length,
          keyFacts: summary.keyFacts as Prisma.InputJsonValue,
          topics: summary.topics,
          summaryTokens: this.estimateTokens(summary.text),
          ...(vector ? { vector } : {}),
        },
      });

      // Update conversation
      await this.prisma.voltAgentConversation.update({
        where: { id: conversationId },
        data: {
          isSummarized: true,
          summaryUpToIndex: endIndex + 1,
        },
      });

      this.logger.log(`LLM summarized messages ${startIndex}-${endIndex} for conversation ${conversationId}`);
    } catch (error) {
      this.logger.error('LLM summarization failed', error);
    }
  }

  /**
   * Generate summary using LLM (Mistral).
   * More accurate than rule-based for longer conversations.
   */
  private async generateLlmSummary(
    messages: Array<{ role: string; content: string }>,
    locale?: string,
  ): Promise<{ text: string; keyFacts: Array<{ fact: string; importance: number }>; topics: string[] }> {
    const isItalian = locale?.startsWith('it');

    // Format messages for LLM
    const transcript = messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 500)}`)
      .join('\n');

    const systemPrompt = isItalian
      ? `Sei un assistente che riassume conversazioni. Crea un riassunto conciso che catturi:
1. Gli argomenti principali discussi
2. Le richieste chiave dell'utente
3. Le azioni o risposte importanti
Rispondi in formato JSON: {"summary": "...", "topics": ["..."], "keyFacts": [{"fact": "...", "importance": 0.8}]}`
      : `You are a conversation summarizer. Create a concise summary capturing:
1. Main topics discussed
2. Key user requests
3. Important actions or responses
Reply in JSON format: {"summary": "...", "topics": ["..."], "keyFacts": [{"fact": "...", "importance": 0.8}]}`;

    try {
      const response = await this.mistralService.completePrompt({
        systemPrompt,
        userPrompt: `Conversation to summarize:\n${transcript}`,
        temperature: 0.3,
        maxTokens: 300,
      });

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          text: parsed.summary || this.generateRuleBasedSummary(messages, locale).text,
          keyFacts: parsed.keyFacts || [],
          topics: parsed.topics || [],
        };
      }
    } catch (error) {
      this.logger.warn('LLM summarization failed, falling back to rule-based', error);
    }

    // Fallback to rule-based
    return this.generateRuleBasedSummary(messages, locale);
  }

  /**
   * Semantic search across conversation history.
   * Uses hybrid scoring: vector similarity + recency decay.
   */
  async semanticSearch(
    ctx: ConversationContext,
    query: string,
    options: HybridSearchOptions = {},
  ): Promise<MemoryMessage[]> {
    const {
      limit = 5,
      vectorWeight = 0.7,
      recencyDecay = 0.1,
      includeSummaries = true,
    } = options;

    const { id: conversationId, isNew } = await this.getOrCreateConversation(ctx);

    if (isNew) {
      return [];
    }

    // Generate embedding for query
    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.mistralService.generateEmbedding(query);
    } catch (error) {
      this.logger.warn('Failed to generate embedding for semantic search, falling back to recent messages', error);
      const result = await this.retrieveHistory(ctx, { limit });
      return result.messages;
    }

    // Hybrid search with pgvector + recency scoring
    // Formula: final_score = (1 - distance) * vectorWeight + recency_score * (1 - vectorWeight)
    // where recency_score = exp(-recencyDecay * age_in_hours)
    const vectorLiteral = Prisma.raw(`'[${queryEmbedding.join(',')}]'::vector`);

    const results = await this.prisma.$queryRaw<
      Array<{
        role: string;
        content: string;
        toolCalls: unknown;
        toolResults: unknown;
        tokenCount: number | null;
        metadata: unknown;
      }>
    >(
      Prisma.sql`
        WITH scored_messages AS (
          SELECT
            role,
            content,
            "toolCalls",
            "toolResults",
            "tokenCount",
            metadata,
            "createdAt",
            CASE
              WHEN vector IS NOT NULL THEN (1 - (vector <-> ${vectorLiteral}))
              ELSE 0
            END AS vector_score,
            EXP(-${recencyDecay} * EXTRACT(EPOCH FROM (NOW() - "createdAt")) / 3600) AS recency_score
          FROM "voltagent_messages"
          WHERE "conversationId" = ${conversationId}
            AND "tenantId" = ${ctx.tenantId}
        )
        SELECT
          role,
          content,
          "toolCalls",
          "toolResults",
          "tokenCount",
          metadata
        FROM scored_messages
        ORDER BY (vector_score * ${vectorWeight} + recency_score * ${1 - vectorWeight}) DESC
        LIMIT ${limit}
      `,
    );

    // Include summary search if enabled
    if (includeSummaries) {
      const summaryResults = await this.prisma.$queryRaw<
        Array<{ summary: string }>
      >(
        Prisma.sql`
          SELECT summary
          FROM "conversation_summaries"
          WHERE "conversationId" = ${conversationId}
            AND "tenantId" = ${ctx.tenantId}
            AND vector IS NOT NULL
          ORDER BY (vector <-> ${vectorLiteral})
          LIMIT 2
        `,
      );

      // Prepend summary context as system messages
      const summaryMessages = summaryResults.map((s) => ({
        role: 'system' as MessageRole,
        content: `[Previous conversation context]: ${s.summary}`,
      }));

      return [
        ...summaryMessages,
        ...results.map((m) => ({
          role: m.role as MessageRole,
          content: m.content,
          toolCalls: m.toolCalls as MemoryMessage['toolCalls'],
          toolResults: m.toolResults as MemoryMessage['toolResults'],
          tokenCount: m.tokenCount ?? undefined,
          metadata: m.metadata as MemoryMessage['metadata'],
        })),
      ];
    }

    return results.map((m) => ({
      role: m.role as MessageRole,
      content: m.content,
      toolCalls: m.toolCalls as MemoryMessage['toolCalls'],
      toolResults: m.toolResults as MemoryMessage['toolResults'],
      tokenCount: m.tokenCount ?? undefined,
      metadata: m.metadata as MemoryMessage['metadata'],
    }));
  }

  /**
   * List conversations for a user.
   */
  async listConversations(
    tenantId: string,
    userId: string,
    limit = 10,
  ): Promise<Array<{ id: string; title: string | null; lastActiveAt: Date; messageCount: number }>> {
    return this.prisma.voltAgentConversation.findMany({
      where: {
        tenantId,
        userId,
        isDeleted: false,
      },
      orderBy: { lastActiveAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        lastActiveAt: true,
        messageCount: true,
      },
    });
  }

  /**
   * Delete a conversation (soft delete).
   */
  async deleteConversation(
    tenantId: string,
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    const result = await this.prisma.voltAgentConversation.updateMany({
      where: {
        id: conversationId,
        tenantId,
        userId,
        isDeleted: false,
      },
      data: { isDeleted: true },
    });

    return result.count > 0;
  }

  /**
   * Generate title for a conversation based on first messages.
   */
  async generateTitle(conversationId: string, locale?: string): Promise<string> {
    const messages = await this.prisma.voltAgentMessage.findMany({
      where: { conversationId },
      orderBy: { messageIndex: 'asc' },
      take: 4,
      select: { role: true, content: true },
    });

    if (messages.length === 0) {
      return locale?.startsWith('it') ? 'Nuova chat' : 'New chat';
    }

    try {
      const title = await this.mistralService.generateChatTitle(
        messages.map((m) => ({ role: m.role, content: m.content })),
        locale,
      );
      return title;
    } catch {
      // Fallback to first user message
      const firstUser = messages.find((m) => m.role === 'user');
      if (firstUser?.content) {
        return firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? '...' : '');
      }
      return locale?.startsWith('it') ? 'Nuova chat' : 'New chat';
    }
  }

  /**
   * Check if summarization is needed and perform it.
   * Private method called after adding messages.
   */
  private async maybeSummarize(
    conversationId: string,
    ctx: ConversationContext,
  ): Promise<void> {
    const conversation = await this.prisma.voltAgentConversation.findUnique({
      where: { id: conversationId },
      select: {
        messageCount: true,
        summaryUpToIndex: true,
        isSummarized: true,
      },
    });

    if (!conversation) return;

    const unsummarizedStart = conversation.summaryUpToIndex ?? 0;
    const totalMessages = conversation.messageCount;
    const unsummarizedCount = totalMessages - unsummarizedStart;

    // Only summarize if we have enough unsummarized messages
    // and we'd still have enough recent messages left
    const messagesToSummarize = unsummarizedCount - SUMMARIZATION_CONFIG.keepRecentCount;
    if (messagesToSummarize < SUMMARIZATION_CONFIG.batchSize) {
      return;
    }

    // Get messages to summarize
    const messages = await this.prisma.voltAgentMessage.findMany({
      where: {
        conversationId,
        messageIndex: {
          gte: unsummarizedStart,
          lt: unsummarizedStart + SUMMARIZATION_CONFIG.batchSize,
        },
      },
      orderBy: { messageIndex: 'asc' },
      select: { role: true, content: true, messageIndex: true },
    });

    if (messages.length === 0) return;

    // Generate summary using LLM
    const startIndex = messages[0].messageIndex;
    const endIndex = messages[messages.length - 1].messageIndex;

    try {
      const summary = this.generateRuleBasedSummary(messages, ctx.locale);

      // Store summary
      await this.prisma.conversationSummary.create({
        data: {
          conversationId,
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          summary: summary.text,
          startMessageIndex: startIndex,
          endMessageIndex: endIndex,
          messageCountCovered: messages.length,
          keyFacts: summary.keyFacts as Prisma.InputJsonValue,
          topics: summary.topics,
          summaryTokens: this.estimateTokens(summary.text),
        },
      });

      // Update conversation
      await this.prisma.voltAgentConversation.update({
        where: { id: conversationId },
        data: {
          isSummarized: true,
          summaryUpToIndex: endIndex + 1,
        },
      });

      this.logger.log(`Summarized messages ${startIndex}-${endIndex} for conversation ${conversationId}`);
    } catch (error) {
      this.logger.error('Failed to summarize conversation', error);
    }
  }

  /**
   * Generate a summary of messages using rule-based extraction.
   * Fast and reliable fallback for memory compression.
   * Keeps key information while reducing token count.
   */
  private generateRuleBasedSummary(
    messages: Array<{ role: string; content: string }>,
    locale?: string,
  ): { text: string; keyFacts: Array<{ fact: string; importance: number }>; topics: string[] } {
    const userMessages = messages.filter((m) => m.role === 'user');
    const assistantMessages = messages.filter((m) => m.role === 'assistant');
    const isItalian = locale?.startsWith('it');

    // Extract topics from user messages (simple keyword extraction)
    const topics = new Set<string>();
    const keyFacts: Array<{ fact: string; importance: number }> = [];

    // Get key user queries
    const keyQueries: string[] = [];
    for (const msg of userMessages.slice(0, 3)) {
      const snippet = msg.content.slice(0, 100).trim();
      if (snippet.length > 10) {
        keyQueries.push(snippet);
        // Extract significant words as topics
        const words = msg.content.toLowerCase().split(/\s+/).filter((w) => w.length > 5);
        words.slice(0, 2).forEach((w) => topics.add(w.replace(/[^a-zA-Z]/g, '')));
      }
    }

    // Extract key assistant responses
    for (const msg of assistantMessages.slice(0, 2)) {
      const snippet = msg.content.slice(0, 100).trim();
      if (snippet.length > 20) {
        keyFacts.push({ fact: snippet, importance: 0.7 });
      }
    }

    // Build summary text
    const topicsStr = [...topics].slice(0, 3).join(', ') || (isItalian ? 'vari' : 'various');
    const queryStr = keyQueries[0]?.slice(0, 50) || (isItalian ? 'domanda utente' : 'user query');

    const summaryText = isItalian
      ? `Conversazione (${messages.length} msg). Argomenti: ${topicsStr}. Inizio: "${queryStr}".`
      : `Conversation (${messages.length} msgs). Topics: ${topicsStr}. Started: "${queryStr}".`;

    return {
      text: summaryText,
      keyFacts: keyFacts.slice(0, 5),
      topics: [...topics].slice(0, 3),
    };
  }

  /**
   * Estimate token count from text.
   * Rough estimate: ~4 chars per token for English.
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
