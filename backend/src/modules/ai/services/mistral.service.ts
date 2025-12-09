import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mistral } from '@mistralai/mistralai';
import type { Messages as MistralChatMessage } from '@mistralai/mistralai/models/components/chatcompletionrequest.js';
import type { AssistantMessage } from '@mistralai/mistralai/models/components/assistantmessage.js';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';
import { CorrelationContext } from '../../../common/services/correlation-context.service';
import {
  getLocale,
  getTranslations,
  type SupportedLocale,
} from '../voltagent/locales';
import {
  LlmTelemetryService,
  type LlmCallContext,
} from '../voltagent/observability/telemetry';

type ConversationMessage = {
  role: 'assistant' | 'user';
  content: string;
};

/**
 * Simple circuit breaker state for Mistral API protection.
 * Prevents cascading failures when API is unavailable.
 */
interface CircuitBreakerState {
  /** Current state: closed (normal), open (blocking), half-open (testing) */
  state: 'closed' | 'open' | 'half-open';
  /** Number of consecutive failures */
  failures: number;
  /** Timestamp when circuit was opened */
  openedAt: number;
  /** Last successful call timestamp */
  lastSuccess: number;
}

@Injectable()
export class MistralService {
  private logger = new Logger(MistralService.name);
  private defaultModel = 'mistral-medium-latest';
  private readonly embeddingModel = 'mistral-embed';

  // Rate limiting for direct embedding calls (not through queue)
  private readonly maxConcurrentEmbeddings: number;
  private readonly embeddingDelayMs: number;
  private currentEmbeddingCalls = 0;
  private lastEmbeddingTime = 0;

  // Circuit breaker configuration
  private readonly circuitBreaker: CircuitBreakerState = {
    state: 'closed',
    failures: 0,
    openedAt: 0,
    lastSuccess: Date.now(),
  };
  private readonly circuitBreakerThreshold: number; // Failures before opening
  private readonly circuitBreakerResetMs: number; // Time before half-open
  private readonly circuitBreakerHalfOpenMax: number; // Max test requests in half-open

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private embeddingsService: EmbeddingsService,
    @Optional() private telemetry?: LlmTelemetryService,
  ) {
    // Configure rate limiting from env (defaults: 3 concurrent, 100ms delay)
    this.maxConcurrentEmbeddings = parseInt(
      this.configService.get<string>('AI_CONCURRENT_LIMIT') || '3',
      10,
    );
    this.embeddingDelayMs = parseInt(
      this.configService.get<string>('AI_EMBEDDING_DELAY_MS') || '100',
      10,
    );

    // Circuit breaker config (defaults: open after 5 failures, reset after 30s)
    this.circuitBreakerThreshold = this.configService.get<number>('MISTRAL_CIRCUIT_BREAKER_THRESHOLD', 5);
    this.circuitBreakerResetMs = this.configService.get<number>('MISTRAL_CIRCUIT_BREAKER_RESET_MS', 30000);
    this.circuitBreakerHalfOpenMax = this.configService.get<number>('MISTRAL_CIRCUIT_BREAKER_HALF_OPEN_MAX', 1);
  }

  /**
   * Check if circuit breaker allows the request.
   * Returns true if request should proceed, false if blocked.
   */
  private checkCircuitBreaker(): boolean {
    const now = Date.now();

    switch (this.circuitBreaker.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if enough time has passed to try again
        if (now - this.circuitBreaker.openedAt >= this.circuitBreakerResetMs) {
          this.circuitBreaker.state = 'half-open';
          this.logger.log('Circuit breaker: transitioning to half-open state');
          return true;
        }
        return false;

      case 'half-open':
        // Allow limited requests in half-open state
        return true;

      default:
        return true;
    }
  }

  /**
   * Record a successful API call. Resets circuit breaker.
   */
  private recordSuccess(): void {
    if (this.circuitBreaker.state === 'half-open') {
      this.circuitBreaker.state = 'closed';
      this.logger.log('Circuit breaker: closed (API recovered)');
    }
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.lastSuccess = Date.now();
  }

  /**
   * Record a failed API call. May open circuit breaker.
   */
  private recordFailure(): void {
    this.circuitBreaker.failures++;

    if (this.circuitBreaker.state === 'half-open') {
      // Failed during test - reopen circuit
      this.circuitBreaker.state = 'open';
      this.circuitBreaker.openedAt = Date.now();
      this.logger.warn('Circuit breaker: reopened (test request failed)');
    } else if (this.circuitBreaker.failures >= this.circuitBreakerThreshold) {
      // Too many failures - open circuit
      this.circuitBreaker.state = 'open';
      this.circuitBreaker.openedAt = Date.now();
      this.logger.warn(`Circuit breaker: opened after ${this.circuitBreaker.failures} consecutive failures`);
    }
  }

  /**
   * Get current circuit breaker status for monitoring.
   */
  getCircuitBreakerStatus(): { state: string; failures: number; lastSuccess: number } {
    return {
      state: this.circuitBreaker.state,
      failures: this.circuitBreaker.failures,
      lastSuccess: this.circuitBreaker.lastSuccess,
    };
  }

  /**
   * Simple rate limiting for embedding calls.
   * Limits concurrent calls and adds delay between requests.
   */
  private async acquireEmbeddingSlot(): Promise<void> {
    // Wait if too many concurrent calls
    while (this.currentEmbeddingCalls >= this.maxConcurrentEmbeddings) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // Enforce minimum delay between calls
    const now = Date.now();
    const elapsed = now - this.lastEmbeddingTime;
    if (elapsed < this.embeddingDelayMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.embeddingDelayMs - elapsed),
      );
    }

    this.currentEmbeddingCalls++;
    this.lastEmbeddingTime = Date.now();
  }

  private releaseEmbeddingSlot(): void {
    this.currentEmbeddingCalls = Math.max(0, this.currentEmbeddingCalls - 1);
  }

  private getApiKey(): string | undefined {
    return this.configService.get<string>('MISTRAL_API_KEY') || process.env.MISTRAL_API_KEY;
  }

  private getRequiredApiKey(): string {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Mistral API key is not configured');
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

  async completePrompt(options: {
    systemPrompt?: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
    /** Timeout in milliseconds (default: 30000) */
    timeoutMs?: number;
    /** Telemetry context for tracking */
    telemetryContext?: { tenantId: string; userId?: string; promptName?: string };
  }): Promise<string> {
    const { systemPrompt, userPrompt, temperature = 0.4, maxTokens = 512, timeoutMs = 30000, telemetryContext } = options;
    const model = this.getModel();

    // Check circuit breaker before making request
    if (!this.checkCircuitBreaker()) {
      throw new Error('Mistral API circuit breaker is open - service temporarily unavailable');
    }

    const executeCall = async () => {
      const client = await this.createMistralClient();
      const messages: MistralChatMessage[] = [];

      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      messages.push({ role: 'user', content: userPrompt });

      // Wrap API call with timeout
      const completionPromise = client.chat.complete({
        model,
        messages,
        temperature,
        maxTokens,
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`LLM request timed out after ${timeoutMs}ms`)), timeoutMs);
      });

      const completion = await Promise.race([completionPromise, timeoutPromise]);

      const text = this.extractAssistantContent(completion.choices?.[0]?.message).trim();

      if (!text) {
        throw new Error('Empty response from AI service');
      }

      // Return both text and usage for telemetry
      return { text, usage: completion.usage };
    };

    try {
      // Use telemetry tracking if available and context provided
      if (this.telemetry && telemetryContext?.tenantId) {
        const context: LlmCallContext = {
          tenantId: telemetryContext.tenantId,
          userId: telemetryContext.userId,
          operation: 'completion',
          promptName: telemetryContext.promptName,
          model,
        };

        const { result } = await this.telemetry.trackCall(context, executeCall);
        this.recordSuccess();
        return result.text;
      }

      // Fallback: execute without telemetry
      const result = await executeCall();
      this.recordSuccess();
      return result.text;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      const corrId = CorrelationContext.getCorrelationId();
      this.logger.error(`[${corrId}] Prompt completion failed: ${message}`, stack);

      // Record failure - may trip circuit breaker
      this.recordFailure();
      throw error;
    }
  }

  private createClient(apiKey: string): Mistral {
    return new Mistral({
      apiKey,
    });
  }

  private normaliseConversation(history: any[]): MistralChatMessage[] {
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
   * Generate embeddings for RAG (rate-limited with circuit breaker)
   */
  async generateEmbedding(
    text: string,
    client?: Mistral,
    telemetryContext?: { tenantId: string; userId?: string },
  ): Promise<number[]> {
    // Check circuit breaker before making request
    if (!this.checkCircuitBreaker()) {
      throw new Error('Mistral API circuit breaker is open - service temporarily unavailable');
    }

    await this.acquireEmbeddingSlot();
    try {
      const executeCall = async () => {
        const mistralClient = client ?? (await this.createMistralClient());
        const response = await mistralClient.embeddings.create({
          model: this.embeddingModel,
          inputs: text,
        });

        const embedding = response.data?.[0]?.embedding;
        if (!embedding || embedding.length === 0) {
          throw new Error('Mistral embeddings response did not contain data');
        }

        return { embedding, usage: response.usage };
      };

      // Use telemetry tracking if available and context provided
      if (this.telemetry && telemetryContext?.tenantId) {
        const context: LlmCallContext = {
          tenantId: telemetryContext.tenantId,
          userId: telemetryContext.userId,
          operation: 'embedding',
          model: this.embeddingModel,
        };

        const { result } = await this.telemetry.trackCall(context, executeCall);
        this.recordSuccess();
        return result.embedding;
      }

      // Fallback: execute without telemetry
      const result = await executeCall();
      this.recordSuccess();
      return result.embedding;
    } catch (error) {
      const corrId = CorrelationContext.getCorrelationId();
      this.logger.error(`[${corrId}] Failed to generate embedding:`, error instanceof Error ? error.message : error);
      this.recordFailure();
      throw error;
    } finally {
      this.releaseEmbeddingSlot();
    }
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
    telemetryContext?: { tenantId: string; userId?: string },
  ): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    // Check circuit breaker before making request
    if (!this.checkCircuitBreaker()) {
      throw new Error('Mistral API circuit breaker is open - service temporarily unavailable');
    }

    await this.acquireEmbeddingSlot();
    try {
      const executeCall = async () => {
        const mistralClient = client ?? (await this.createMistralClient());
        const response = await mistralClient.embeddings.create({
          model: this.embeddingModel,
          inputs: texts,
        });

        if (!response.data || response.data.length === 0) {
          throw new Error('Mistral bulk embeddings response did not contain data');
        }

        // Sort by index to ensure correct order
        const sortedData = response.data.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

        const embeddings = sortedData.map((item, index) => {
          if (!item.embedding || item.embedding.length === 0) {
            throw new Error(`Embedding at index ${index} is empty or invalid`);
          }
          return item.embedding;
        });

        if (embeddings.length !== texts.length) {
          throw new Error(
            `Expected ${texts.length} embeddings but received ${embeddings.length}`,
          );
        }

        this.logger.debug(`Generated ${embeddings.length} embeddings in bulk`);
        return { embeddings, usage: response.usage };
      };

      // Use telemetry tracking if available and context provided
      if (this.telemetry && telemetryContext?.tenantId) {
        const context: LlmCallContext = {
          tenantId: telemetryContext.tenantId,
          userId: telemetryContext.userId,
          operation: 'bulk_embedding',
          model: this.embeddingModel,
        };

        const { result } = await this.telemetry.trackCall(context, executeCall);
        this.recordSuccess();
        return result.embeddings;
      }

      // Fallback: execute without telemetry
      const result = await executeCall();
      this.recordSuccess();
      return result.embeddings;
    } catch (error) {
      const corrId = CorrelationContext.getCorrelationId();
      this.logger.error(
        `[${corrId}] Failed to generate bulk embeddings:`,
        error instanceof Error ? error.message : error,
      );
      this.recordFailure();
      throw error;
    } finally {
      this.releaseEmbeddingSlot();
    }
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
    conversationHistory: any[] = [],
    options?: { conversationId?: string; locale?: string; timeoutMs?: number },
  ): Promise<string> {
    const apiKey = this.getApiKey();
    const model = this.getModel();
    const supportedLocale = getLocale(options?.locale);
    const t = getTranslations(supportedLocale);
    const timeoutMs = options?.timeoutMs ?? 60000; // Default 60s for RAG responses

    // Check circuit breaker
    if (!this.checkCircuitBreaker()) {
      return t.mistral.errors.unavailable;
    }

    if (!apiKey) {
      const fallbackResponse = t.mistral.errors.notConfigured;
      this.logger.warn('Mistral API key missing. Responded with fallback message.');
      return fallbackResponse;
    }

    try {
      const mistralClient = this.createClient(apiKey);

      let ragContext = '';
      try {
        // Generate embedding for user prompt (with telemetry context)
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
            .map((contentItem: any, index: number) => {
              const title = contentItem.documentName || t.mistral.rag.sourceLabel(index + 1);
              return `### ${title}\n${contentItem.content}`;
            })
            .join('\n\n');
          ragContext = `\n\n---\n${t.mistral.rag.contextIntro}\n\n${contextBlocks}\n\n---\n`;
        }
      } catch (ragError) {
        const ragMessage = ragError instanceof Error ? ragError.message : String(ragError);
        this.logger.warn(`Unable to build RAG context: ${ragMessage}`);
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
      const executeChatCall = async () => {
        const completionPromise = mistralClient.chat.complete({
          model,
          messages,
          temperature: 0.7,
          maxTokens: 1024,
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`LLM request timed out after ${timeoutMs}ms`)), timeoutMs);
        });

        const completion = await Promise.race([completionPromise, timeoutPromise]);

        const assistantMessage = completion.choices?.[0]?.message;
        const assistantResponse =
          this.extractAssistantContent(assistantMessage) || t.mistral.errors.tryAgain;

        return { response: assistantResponse, usage: completion.usage };
      };

      // Get correlation ID for logging
      const corrId = CorrelationContext.getCorrelationId();
      const logPrefix = `[${corrId}] [tenant:${tenantId}]`;

      // Use telemetry tracking if available
      if (this.telemetry) {
        const context: LlmCallContext = {
          tenantId,
          userId,
          operation: 'chat',
          model,
          sessionId: options?.conversationId,
          traceId: corrId,
        };

        const { result } = await this.telemetry.trackCall(context, executeChatCall);
        this.recordSuccess();
        this.logger.log(`${logPrefix} Generated response for user: ${userId}`);
        return result.response;
      }

      // Fallback: execute without telemetry
      const result = await executeChatCall();
      this.recordSuccess();
      this.logger.log(`${logPrefix} Generated response for user: ${userId}`);
      return result.response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const corrId = CorrelationContext.getCorrelationId();
      const logPrefix = `[${corrId}] [tenant:${tenantId}]`;
      this.logger.error(`${logPrefix} Failed to generate response: ${errorMessage}`, errorStack);

      this.recordFailure();

      let fallbackResponse = t.mistral.errors.unavailable;

      if (errorMessage.includes('timed out')) {
        fallbackResponse = t.mistral.errors.serverError; // Timeout treated as server error
      } else if (error && typeof error === 'object' && 'statusCode' in error) {
        const statusCode = (error as { statusCode?: unknown }).statusCode;
        if (typeof statusCode === 'number') {
          this.logger.error(`${logPrefix} Mistral API returned status ${statusCode}`);
          if (statusCode === 401 || statusCode === 403) {
            fallbackResponse = t.mistral.errors.unauthorized;
          } else if (statusCode >= 500) {
            fallbackResponse = t.mistral.errors.serverError;
          }
        }
      }

      return fallbackResponse;
    }
  }
}
