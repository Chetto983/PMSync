import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mistral } from '@mistralai/mistralai';
import type { Messages as MistralChatMessage } from '@mistralai/mistralai/models/components/chatcompletionrequest.js';
import type { AssistantMessage } from '@mistralai/mistralai/models/components/assistantmessage.js';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';
import { QueryEmbeddingCacheService } from './query-embedding-cache.service';
import { CorrelationContext } from '../../../common/services/correlation-context.service';
import {
  getLocale,
  getTranslations,
  type SupportedLocale,
} from '../voltagent/locales';
// Telemetry removed - AI module refactor v2.0

import { PromptGuardService } from '../guards/prompt-guard.service';
import { getAiCircuitBreaker, withRetry, embeddingRateLimiter } from '../utils';
import { AiError, AiErrorCode } from '../errors';

type ConversationMessage = {
  role: 'assistant' | 'user';
  content: string;
};

@Injectable()
export class MistralService {
  private logger = new Logger(MistralService.name);
  private defaultModel: string;
  private readonly embeddingModel = 'mistral-embed';

  // Rate limiting for direct embedding calls (not through queue)
  private readonly maxConcurrentEmbeddings: number;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private embeddingsService: EmbeddingsService,
    private promptGuard: PromptGuardService,
    @Optional() private queryEmbeddingCache?: QueryEmbeddingCacheService,
  ) {
    // Configure rate limiting from env (defaults: 3 concurrent)
    this.maxConcurrentEmbeddings = parseInt(
      this.configService.get<string>('AI_CONCURRENT_LIMIT') || '3',
      10,
    );

    if (this.queryEmbeddingCache) {
      this.logger.log('Query embedding cache enabled - expect 50-70% API cost savings');
    }
  }



  /**
   * Simple rate limiting for embedding calls.
   * Limits concurrent calls and adds delay between requests.
   */
  /**
   * Simple rate limiting for embedding calls.
   * Limits concurrent calls and adds delay between requests.
   */
  private async acquireEmbeddingSlot(): Promise<void> {
    await embeddingRateLimiter.acquire();
  }

  private releaseEmbeddingSlot(): void {
    // No-op: RateLimiter handles this internally via token bucket
  }

  private getApiKey(): string | undefined {
    return this.configService.get<string>('MISTRAL_API_KEY') || process.env.MISTRAL_API_KEY;
  }

  private getRequiredApiKey(): string {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new AiError('Mistral API key is not configured', AiErrorCode.PROVIDER_ERROR, {
        retryable: false,
      });
    }
    return apiKey;
  }

  private getModel(): string {
    return this.configService.get<string>('MISTRAL_MODEL') || process.env.MISTRAL_MODEL || this.defaultModel;
  }

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  async createMistralClient(): Promise<Mistral> {
    const apiKey = this.getRequiredApiKey();
    return this.createClient(apiKey);
  }

  // Input validation constants
  private static readonly MAX_USER_PROMPT_LENGTH = 10000;
  private static readonly MAX_SYSTEM_PROMPT_LENGTH = 5000;

  /**
   * Validate prompt inputs before sending to LLM
   */
  /**
   * Validate prompt inputs before sending to LLM
   */
  private validatePromptInputs(userPrompt: string, systemPrompt?: string): void {
    // 1. Basic validation
    if (!userPrompt || typeof userPrompt !== 'string') {
      throw new AiError('userPrompt is required and must be a string', AiErrorCode.INVALID_INPUT);
    }

    if (userPrompt.length > MistralService.MAX_USER_PROMPT_LENGTH) {
      throw new AiError(
        `userPrompt exceeds maximum length of ${MistralService.MAX_USER_PROMPT_LENGTH} characters`,
        AiErrorCode.INVALID_INPUT
      );
    }

    if (systemPrompt && systemPrompt.length > MistralService.MAX_SYSTEM_PROMPT_LENGTH) {
      throw new AiError(
        `systemPrompt exceeds maximum length of ${MistralService.MAX_SYSTEM_PROMPT_LENGTH} characters`,
        AiErrorCode.INVALID_INPUT
      );
    }

    // 2. Security validation via PromptGuard
    const validation = this.promptGuard.validateInput(userPrompt);
    if (!validation.isValid) {
      this.logger.warn(`Blocked malicious prompt: ${validation.blockReason} (Score: ${validation.riskScore})`);
      throw new AiError(
        `Prompt blocked by security guard: ${validation.blockReason}`,
        AiErrorCode.PROMPT_BLOCKED,
        { context: { riskScore: validation.riskScore, patterns: validation.detectedPatterns } }
      );
    }
  }

  async completePrompt(options: {
    systemPrompt?: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
    /** Timeout in milliseconds (default: 30000) */
    timeoutMs?: number;
    /** Telemetry context for tracking */
    telemetryContext?: { tenantId: string; userId?: string; promptName?: string };
    /** Model override: 'fast' for simple, 'medium' for extraction, 'default' for configured */
    modelTier?: 'fast' | 'medium' | 'default';
    /** Enable JSON mode for guaranteed valid JSON output */
    jsonMode?: boolean;
  }): Promise<string> {
    const { systemPrompt, userPrompt, temperature = 0.4, maxTokens = 512, timeoutMs = 30000, telemetryContext: _telemetryContext, modelTier, jsonMode = false } = options;

    // Model routing
    let model = this.getModel();
    if (modelTier === 'fast') {
      model = this.configService.get<string>('AI_MODEL_SIMPLE') || 'mistral-small-latest';
    } else if (modelTier === 'medium') {
      model = this.configService.get<string>('AI_MODEL_MEDIUM') || 'mistral-small-latest';
    }

    // Validate inputs before processing (includes security check)
    this.validatePromptInputs(userPrompt, systemPrompt);

    const cb = getAiCircuitBreaker('mistral', 'completion');

    return cb.execute(async () => {
      try {
        const executeCall = async () => {
          const client = await this.createMistralClient();
          const messages: MistralChatMessage[] = [];

          if (systemPrompt) {
            // Append defensive guardrails if not already present
            const defensivePrompt = this.promptGuard.getDefensiveSystemPrompt();
            const fullSystemPrompt = systemPrompt.includes('SECURITY GUIDELINES')
              ? systemPrompt
              : `${systemPrompt}\n\n${defensivePrompt}`;

            messages.push({ role: 'system', content: fullSystemPrompt });
          }

          messages.push({ role: 'user', content: userPrompt });

          // Wrap API call with timeout
          const completionPromise = client.chat.complete({
            model,
            messages,
            temperature,
            maxTokens,
            // Enable JSON mode for guaranteed valid JSON output
            ...(jsonMode && { responseFormat: { type: 'json_object' as const } }),
          });

          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new AiError(`LLM request timed out after ${timeoutMs}ms`, AiErrorCode.PROVIDER_TIMEOUT)), timeoutMs);
          });

          const completion = await Promise.race([completionPromise, timeoutPromise]);

          const text = this.extractAssistantContent(completion.choices?.[0]?.message).trim();

          if (!text) {
            throw new AiError('Empty response from AI service', AiErrorCode.EMPTY_RESPONSE);
          }

          // Output validation (leakage check)
          const outputValidation = this.promptGuard.validateOutput(text);
          if (!outputValidation.isValid) {
            this.logger.warn(`Blocked potential data leakage in output: ${outputValidation.blockReason}`);
            throw new AiError('Output blocked by security guard: Potential data leakage', AiErrorCode.OUTPUT_BLOCKED);
          }

          // Return both text and usage for telemetry
          return { text, usage: completion.usage };
        };

        return withRetry(
          async () => {
            const result = await executeCall();
            return result.text;
          },
          {
            maxRetries: 3,
            initialDelayMs: 500, // Longer delay for chat
            isRetryable: (err: unknown) => AiError.fromError(err).retryable,
          }
        );
      } catch (error) {
        const corrId = CorrelationContext.getCorrelationId();
        const aiError = AiError.fromError(error);
        if (aiError.code !== AiErrorCode.PROMPT_BLOCKED) {
          this.logger.error(`[${corrId}] Prompt completion failed: ${aiError.message}`);
        }
        throw aiError;
      }
    });
  }

  private createClient(apiKey: string): Mistral {
    return new Mistral({
      apiKey,
    });
  }

  private normaliseConversation(history: Array<{ role?: string; content?: unknown }>): MistralChatMessage[] {
    const result = history
      .filter((item): item is ConversationMessage => {
        return (
          item &&
          typeof item.content === 'string' &&
          (item.role === 'assistant' || item.role === 'user')
        );
      })
      .map((item) =>
        item.role === 'assistant'
          ? {
            role: 'assistant' as const,
            content: item.content,
          }
          : {
            role: 'user' as const,
            content: item.content,
          },
      );

    return result as MistralChatMessage[];
  }

  private extractAssistantContent(message: AssistantMessage | undefined): string {
    if (!message || message.content == null) {
      return '';
    }

    if (typeof message.content === 'string') {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      return message.content
        .map((chunk) => {
          if (chunk && typeof chunk === 'object' && 'text' in chunk && typeof chunk.text === 'string') {
            return chunk.text;
          }
          return '';
        })
        .join('')
        .trim();
    }

    return '';
  }

  async generateChatTitle(
    messages: Array<{ role: string; content: string }> = [],
    locale?: string,
  ): Promise<string> {
    const supportedLocale = getLocale(locale);
    const t = getTranslations(supportedLocale);

    if (!messages || messages.length === 0) {
      return t.mistral.title.defaultTitle;
    }

    const apiKey = this.getApiKey();
    if (!apiKey) {
      return this.buildFallbackTitle(messages, supportedLocale);
    }

    try {
      const client = this.createClient(apiKey);
      const recentMessages = messages.slice(-6);
      const transcript = recentMessages
        .map((message) => `${message.role === 'assistant' ? t.mistral.roles.assistant : t.mistral.roles.user}: ${message.content}`)
        .join('\n');

      const completion = await client.chat.complete({
        model: this.getModel(),
        temperature: 0.2,
        maxTokens: 32,
        messages: [
          {
            role: 'system',
            content: t.mistral.title.system,
          },
          {
            role: 'user',
            content: `${t.mistral.title.conversationLabel}:\n${transcript}\n\n${t.mistral.title.titleLabel}:`,
          },
        ],
      });

      const rawTitle =
        this.extractAssistantContent(completion.choices?.[0]?.message) ||
        this.buildFallbackTitle(messages, supportedLocale);
      return this.sanitiseTitle(rawTitle, supportedLocale);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to generate chat title: ${errorMessage}`);
      return this.buildFallbackTitle(messages, supportedLocale);
    }
  }

  private buildFallbackTitle(
    messages: Array<{ role: string; content: string }>,
    locale: SupportedLocale,
  ): string {
    const t = getTranslations(locale);
    const firstUserMessage = messages.find(
      (message) => message.role === 'user' && typeof message.content === 'string' && message.content.trim().length > 0,
    );

    if (!firstUserMessage) {
      return t.mistral.title.defaultTitle;
    }

    const trimmed = firstUserMessage.content.trim();
    if (trimmed.length <= 60) {
      return trimmed;
    }

    return `${trimmed.slice(0, 57)}...`;
  }

  private sanitiseTitle(title: string, locale: SupportedLocale): string {
    const t = getTranslations(locale);
    const cleaned = title.replace(/^"+|"+$/g, '').replace(/[\r\n]+/g, ' ').trim();

    if (!cleaned) {
      return t.mistral.title.defaultTitle;
    }

    if (cleaned.length <= 60) {
      return cleaned;
    }

    return `${cleaned.slice(0, 57)}...`;
  }

  /**
   * Generate embeddings for RAG (rate-limited with circuit breaker + Redis cache)
   *
   * GDPR COMPLIANT: Cache is tenant-isolated. tenantId is REQUIRED for caching.
   *
   * Cache provides:
   * - 50-70% reduction in Mistral API calls
   * - 2-3x faster (cache ~5ms vs API ~200ms)
   * - Critical for 1000+ user scale
   */
  async generateEmbedding(
    text: string,
    client?: Mistral,
    telemetryContext?: { tenantId: string; userId?: string },
  ): Promise<number[]> {
    const tenantId = telemetryContext?.tenantId;

    // Check cache first (HIGH IMPACT for scale) - GDPR: requires tenantId
    if (this.queryEmbeddingCache && tenantId) {
      const cached = await this.queryEmbeddingCache.getCachedEmbedding(tenantId, text);
      if (cached) {
        this.logger.debug(`Query embedding cache HIT for tenant=${tenantId}`);
        return cached;
      }
    } else if (this.queryEmbeddingCache && !tenantId) {
      this.logger.warn('Query embedding cache SKIPPED - no tenantId provided (GDPR requirement)');
    }

    const cb = getAiCircuitBreaker('mistral', 'embedding');

    const embedding = await cb.execute(async () => {
      await this.acquireEmbeddingSlot();
      try {
        const executeCall = async () => {
          const mistralClient = client ?? (await this.createMistralClient());
          const response = await mistralClient.embeddings.create({
            model: this.embeddingModel,
            inputs: text,
          });

          const embeddingResult = response.data?.[0]?.embedding;
          if (!embeddingResult || embeddingResult.length === 0) {
            throw new AiError('Mistral embeddings response did not contain data', AiErrorCode.EMPTY_RESPONSE);
          }

          return { embedding: embeddingResult, usage: response.usage };
        };

        return withRetry(
          async () => {
            const result = await executeCall();
            return result.embedding;
          },
          {
            maxRetries: 3,
            initialDelayMs: 200,
            isRetryable: (err: unknown) => AiError.fromError(err).retryable,
          }
        );
      } catch (error) {
        const corrId = CorrelationContext.getCorrelationId();
        const aiError = AiError.fromError(error);
        this.logger.error(`[${corrId}] Failed to generate embedding: ${aiError.message}`);
        throw aiError;
      }
    });

    // Cache the result for future queries - GDPR: requires tenantId
    if (this.queryEmbeddingCache && embedding && tenantId) {
      await this.queryEmbeddingCache.setCachedEmbedding(tenantId, text, embedding);
    }

    return embedding;
  }

  /**
   * Generate embeddings for multiple texts in a single bulk operation (rate-limited with circuit breaker)
   * This is more efficient than calling generateEmbedding multiple times
   * @param texts Array of texts to generate embeddings for
   * @param client Optional Mistral client instance
   * @param telemetryContext Optional telemetry context for tracking
   * @returns Array of embeddings in the same order as input texts
   */
  async generateBulkEmbeddings(
    texts: string[],
    client?: Mistral,
    _telemetryContext?: { tenantId: string; userId?: string },
  ): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    const cb = getAiCircuitBreaker('mistral', 'bulk_embedding');

    return cb.execute(async () => {
      await this.acquireEmbeddingSlot();
      try {
        const executeCall = async () => {
          const mistralClient = client ?? (await this.createMistralClient());
          const response = await mistralClient.embeddings.create({
            model: this.embeddingModel,
            inputs: texts,
          });

          if (!response.data || response.data.length === 0) {
            throw new AiError('Mistral bulk embeddings response did not contain data', AiErrorCode.EMPTY_RESPONSE);
          }

          // Sort by index to ensure correct order
          const sortedData = response.data.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

          const embeddings = sortedData.map((item, index) => {
            if (!item.embedding || item.embedding.length === 0) {
              throw new AiError(`Embedding at index ${index} is empty or invalid`, AiErrorCode.PROVIDER_ERROR);
            }
            return item.embedding;
          });

          if (embeddings.length !== texts.length) {
            throw new AiError(
              `Expected ${texts.length} embeddings but received ${embeddings.length}`,
              AiErrorCode.PROVIDER_ERROR,
            );
          }

          this.logger.debug(`Generated ${embeddings.length} embeddings in bulk`);
          return { embeddings, usage: response.usage };
        };

        return withRetry(
          async () => {
            const result = await executeCall();
            return result.embeddings;
          },
          {
            maxRetries: 3,
            initialDelayMs: 200,
            isRetryable: (err: unknown) => AiError.fromError(err).retryable,
          }
        );
      } catch (error) {
        const corrId = CorrelationContext.getCorrelationId();
        const aiError = AiError.fromError(error);
        this.logger.error(
          `[${corrId}] Failed to generate bulk embeddings: ${aiError.message}`,
        );
        throw aiError;
      }
    });
  }

  /**
   * Get similar embeddings from database for RAG context
   */
  async searchSimilarContent(tenantId: string, embedding: number[], limit: number = 5) {
    try {
      return await this.embeddingsService.findSimilarContent(tenantId, embedding, limit);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const corrId = CorrelationContext.getCorrelationId();
      this.logger.error(`[${corrId}] [tenant:${tenantId}] Similarity search failed: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Call Mistral API with RAG context and timeout protection
   */

  async generateResponse(
    tenantId: string,
    userId: string,
    userPrompt: string,
    conversationHistory: Array<{ role?: string; content?: unknown }> = [],
    options?: { conversationId?: string; locale?: string; timeoutMs?: number },
  ): Promise<string> {
    const apiKey = this.getApiKey();
    const model = this.getModel();
    const supportedLocale = getLocale(options?.locale);
    const t = getTranslations(supportedLocale);
    const timeoutMs = options?.timeoutMs ?? 60000; // Default 60s for RAG responses

    if (!apiKey) {
      const fallbackResponse = t.mistral.errors.notConfigured;
      this.logger.warn('Mistral API key missing. Responded with fallback message.');
      return fallbackResponse;
    }

    const cb = getAiCircuitBreaker('mistral', 'rag_completion');

    try {
      return await cb.execute(async () => {
        const executeCall = async () => {
          const mistralClient = this.createClient(apiKey);
          let ragContext = '';

          try {
            // Generate embedding for user prompt (using our resilient method)
            // Note: generateEmbedding handles its own rate limiting and circuit breaking
            const userEmbedding = await this.generateEmbedding(userPrompt, mistralClient, { tenantId, userId });

            await this.embeddingsService.saveEmbedding({
              tenantId,
              content: userPrompt,
              embedding: userEmbedding,
              model: this.embeddingModel,
              metadata: {
                source: 'user_prompt',
                createdBy: userId,
              },
            });

            // Search for similar content in knowledge base
            const similarContent = await this.searchSimilarContent(tenantId, userEmbedding);

            if (similarContent.length > 0) {
              const contextBlocks = similarContent
                .map((contentItem, index) => {
                  const title = contentItem.documentName || t.mistral.rag.sourceLabel(index + 1);
                  return `### ${title}\n${contentItem.content}`;
                })
                .join('\n\n');
              ragContext = `\n\n---\n${t.mistral.rag.contextIntro}\n\n${contextBlocks}\n\n---\n`;
            }
          } catch (ragError) {
            const ragMessage = ragError instanceof Error ? ragError.message : String(ragError);
            this.logger.warn(`Unable to build RAG context: ${ragMessage}`);
            // Proceed without RAG if it fails
          }

          // Prepare messages for Mistral
          const historyMessages = this.normaliseConversation(conversationHistory);
          const messages: MistralChatMessage[] = [
            ...historyMessages,
            {
              role: 'user',
              content: userPrompt + ragContext,
            } as MistralChatMessage,
          ];

          // Define the chat completion call
          const completionPromise = mistralClient.chat.complete({
            model,
            messages,
            temperature: 0.7,
            maxTokens: 1024,
          });

          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new AiError(`LLM request timed out after ${timeoutMs}ms`, AiErrorCode.PROVIDER_TIMEOUT)), timeoutMs);
          });

          const completion = await Promise.race([completionPromise, timeoutPromise]);

          const assistantMessage = completion.choices?.[0]?.message;
          const assistantResponse =
            this.extractAssistantContent(assistantMessage) || t.mistral.errors.tryAgain;

          return { response: assistantResponse, usage: completion.usage };
        };

        const result = await withRetry(async () => {
          return await executeCall();
        }, {
          maxRetries: 3,
          isRetryable: (err: unknown) => AiError.fromError(err).retryable,
          initialDelayMs: 500,
        });

        const corrId = CorrelationContext.getCorrelationId();
        this.logger.log(`[${corrId}] [tenant:${tenantId}] Generated response for user: ${userId}`);
        return result.response;
      });
    } catch (error) {
      // Log error and return user-friendly fallback
      const aiError = AiError.fromError(error);
      const corrId = CorrelationContext.getCorrelationId();
      this.logger.error(`[${corrId}] [tenant:${tenantId}] Failed to generate response: ${aiError.message}`);

      if (aiError.code === AiErrorCode.PROVIDER_UNAVAILABLE || aiError.code === AiErrorCode.CIRCUIT_BREAKER_OPEN) {
        return t.mistral.errors.unavailable;
      }
      if (aiError.code === AiErrorCode.PROVIDER_TIMEOUT) {
        return t.mistral.errors.serverError;
      }
      if (aiError.code === AiErrorCode.AUTH_FAILED) {
        return t.mistral.errors.unauthorized;
      }

      return t.mistral.errors.serverError;
    }
  }

  /**
   * Get the circuit breaker status for health monitoring
   * Returns aggregate status from the main completion circuit breaker
   */
  getCircuitBreakerStatus(): { state: 'open' | 'closed' | 'half-open'; failures: number; lastFailure?: Date; lastSuccess?: Date } {
    const cb = getAiCircuitBreaker('mistral', 'completion');
    const stats = cb.getStats();
    return {
      state: stats.state.toLowerCase() as 'open' | 'closed' | 'half-open',
      failures: stats.failures,
      lastFailure: stats.lastFailureAt,
      lastSuccess: stats.lastSuccessAt,
    };
  }


}
