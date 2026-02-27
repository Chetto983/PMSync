/**
 * MistralService - Facade for Mistral AI operations (Phase 23 rewire).
 *
 * Uses AI SDK generateText() via MistralProviderService. Delegates embedding
 * to MistralEmbeddingService, RAG to MistralRagService.
 *
 * Removed: direct @mistralai/mistralai imports, Batch API methods,
 * lazy client factory, manual timeout via Promise.race.
 */
import { Inject, Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateText } from 'ai';
import { MistralProviderService } from '../../mistral/mistral-provider.service';
import { CorrelationContext } from '../../../common/services/correlation-context.service';
import { getLocale, getTranslations, type SupportedLocale } from '../voltagent/locales';
import { PromptGuardService, type ValidationContext } from '../guards';
import { getAiCircuitBreaker, withRetry } from '../utils';
import { AiError, AiErrorCode } from '../errors';
import { UsageTrackingService } from '../../subscription/services/usage-tracking.service';
import { CostProtectionService } from '../../subscription/services/cost-protection.service';
import { MistralEmbeddingService } from './mistral-embedding.service';
import { MistralRagService } from './mistral-rag.service';

/** Simple circuit breaker for LLM API calls (RACE-04). */
class LlmCircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private isOpen = false;
  private readonly failureThreshold = 3;
  private readonly resetTimeMs = 60000;

  shouldAllowRequest(): boolean {
    if (!this.isOpen) return true;
    return Date.now() - this.lastFailure >= this.resetTimeMs;
  }
  recordSuccess(): void { this.failures = 0; this.isOpen = false; }
  recordFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.failureThreshold) this.isOpen = true;
  }
  isCircuitOpen(): boolean { return this.isOpen && Date.now() - this.lastFailure < this.resetTimeMs; }
}

@Injectable()
export class MistralService implements OnModuleInit {
  private logger = new Logger(MistralService.name);
  private readonly llmCircuitBreaker = new LlmCircuitBreaker();
  private static readonly MAX_USER_PROMPT_LENGTH = 10000;
  private static readonly MAX_SYSTEM_PROMPT_LENGTH = 5000;

  constructor(
    private configService: ConfigService,
    private mistralProvider: MistralProviderService,
    private promptGuard: PromptGuardService,
    private embeddingService: MistralEmbeddingService,
    private ragService: MistralRagService,
    @Optional() @Inject(UsageTrackingService) private usageTrackingService?: UsageTrackingService,
    @Optional() @Inject(CostProtectionService) private costProtectionService?: CostProtectionService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Wire up RAG service dependencies (avoids circular dependency)
    this.ragService.setDependencies({
      generateEmbedding: (text, ctx) => this.embeddingService.generateEmbedding(text, undefined, ctx),
      getModel: (tier) => this.getModel(tier),
      getEmbeddingModel: () => this.getEmbeddingModel(),
    });
  }

  private getModel(tier: 'fast' | 'creative' | 'router' | 'default' = 'default'): string {
    switch (tier) {
      case 'fast': return this.configService.get<string>('AI_MODEL_SIMPLE') || 'mistral-small-latest';
      case 'creative': return this.configService.get<string>('AI_MODEL_CREATIVE') || 'mistral-small-latest';
      case 'router': return this.configService.get<string>('AI_MODEL_ROUTER') || 'ministral-3b-latest';
      default: return this.configService.get<string>('AI_MODEL_SIMPLE') || 'mistral-small-latest';
    }
  }

  getEmbeddingModel(): string { return this.embeddingService.getEmbeddingModel(); }

  private validatePromptInputs(userPrompt: string, systemPrompt?: string, validationContext: ValidationContext = 'USER_PROMPT'): void {
    if (!userPrompt || typeof userPrompt !== 'string') {
      throw new AiError('userPrompt is required and must be a string', AiErrorCode.INVALID_INPUT);
    }
    const maxLength = validationContext === 'SYSTEM_INTERNAL' ? 100000 : MistralService.MAX_USER_PROMPT_LENGTH;
    if (userPrompt.length > maxLength) {
      throw new AiError(`userPrompt exceeds maximum length of ${maxLength} characters`, AiErrorCode.INVALID_INPUT);
    }
    if (systemPrompt && systemPrompt.length > MistralService.MAX_SYSTEM_PROMPT_LENGTH) {
      throw new AiError(`systemPrompt exceeds maximum length of ${MistralService.MAX_SYSTEM_PROMPT_LENGTH} characters`, AiErrorCode.INVALID_INPUT);
    }
    const validation = this.promptGuard.validateInput(userPrompt, validationContext);
    if (!validation.isValid) {
      this.logger.warn(`Blocked malicious prompt: ${validation.blockReason} (Score: ${validation.riskScore})`);
      throw new AiError(`Prompt blocked by security guard: ${validation.blockReason}`, AiErrorCode.PROMPT_BLOCKED, {
        context: { riskScore: validation.riskScore, patterns: validation.detectedPatterns },
      });
    }
  }

  /** Prompt completion via AI SDK generateText(). */
  async completePrompt(options: {
    systemPrompt?: string; userPrompt: string; temperature?: number; maxTokens?: number;
    timeoutMs?: number; telemetryContext?: { tenantId: string; userId?: string; promptName?: string };
    modelTier?: 'fast' | 'creative' | 'router' | 'default'; jsonMode?: boolean;
    validationContext?: ValidationContext;
  }): Promise<string> {
    const { systemPrompt, userPrompt, temperature = 0.4, maxTokens = 512, timeoutMs = 30000,
      telemetryContext: _telemetryContext, modelTier, jsonMode = false, validationContext = 'USER_PROMPT' } = options;

    const modelId = this.getModel(modelTier);
    this.validatePromptInputs(userPrompt, systemPrompt, validationContext);

    const tenantId = _telemetryContext?.tenantId;
    if (tenantId && this.costProtectionService) {
      const costCheck = await this.costProtectionService.canProceed(tenantId, 'smartReply');
      if (!costCheck.allowed) {
        this.logger.warn(`[tenant:${tenantId}] Cost cap reached: ${costCheck.reason}`);
        throw new AiError(costCheck.reason || 'Daily cost limit reached', AiErrorCode.QUOTA_EXCEEDED, { retryable: false, context: { tenantId } });
      }
    }

    const cb = getAiCircuitBreaker('mistral', 'completion');

    return cb.execute(async () => {
      try {
        const executeCall = async () => {
          let fullSystemPrompt = systemPrompt;
          if (systemPrompt) {
            const defensivePrompt = this.promptGuard.getDefensiveSystemPrompt();
            fullSystemPrompt = systemPrompt.includes('SECURITY GUIDELINES')
              ? systemPrompt
              : `${systemPrompt}\n\n${defensivePrompt}`;
          }

          const { text } = await generateText({
            model: this.mistralProvider.getChatModel(modelId),
            system: fullSystemPrompt,
            prompt: userPrompt,
            temperature,
            maxOutputTokens: maxTokens,
            abortSignal: AbortSignal.timeout(timeoutMs),
            providerOptions: {
              mistral: {
                safePrompt: true,
                ...(jsonMode && { responseFormat: { type: 'json_object' as const } }),
              },
            },
          });

          if (!text) throw new AiError('Empty response from AI service', AiErrorCode.EMPTY_RESPONSE);

          const outputValidation = this.promptGuard.validateOutput(text);
          if (!outputValidation.isValid) {
            this.logger.warn(`Blocked potential data leakage in output: ${outputValidation.blockReason}`);
            throw new AiError('Output blocked by security guard: Potential data leakage', AiErrorCode.OUTPUT_BLOCKED);
          }
          return text;
        };

        const text = await withRetry(async () => await executeCall(), {
          maxRetries: 3, initialDelayMs: 500, isRetryable: (err: unknown) => AiError.fromError(err).retryable,
        });

        if (tenantId && this.usageTrackingService) {
          await this.usageTrackingService.trackUsage(tenantId, 'ai-calls', 1).catch((err: Error) => {
            this.logger.warn(`[tenant:${tenantId}] Failed to track AI usage: ${err.message}`);
          });
        }
        return text;
      } catch (error) {
        const corrId = CorrelationContext.getCorrelationId();
        const aiError = AiError.fromError(error);
        if (aiError.code !== AiErrorCode.PROMPT_BLOCKED) this.logger.error(`[${corrId}] Prompt completion failed: ${aiError.message}`);
        throw aiError;
      }
    });
  }

  /** Title generation via AI SDK generateText(). */
  async generateChatTitle(messages: Array<{ role: string; content: string }> = [], locale?: string): Promise<string> {
    const supportedLocale = getLocale(locale);
    const t = getTranslations(supportedLocale);
    if (!messages || messages.length === 0) return t.mistral.title.defaultTitle;

    try {
      const recentMessages = messages.slice(-6);
      const transcript = recentMessages.map((m) => `${m.role === 'assistant' ? t.mistral.roles.assistant : t.mistral.roles.user}: ${m.content}`).join('\n');

      const { text } = await generateText({
        model: this.mistralProvider.getChatModel(this.getModel('fast')),
        system: t.mistral.title.system,
        prompt: `${t.mistral.title.conversationLabel}:\n${transcript}\n\n${t.mistral.title.titleLabel}:`,
        temperature: 0.2,
        maxOutputTokens: 32,
        abortSignal: AbortSignal.timeout(15_000),
        providerOptions: { mistral: { safePrompt: true } },
      });

      const rawTitle = text || this.buildFallbackTitle(messages, supportedLocale);
      return this.sanitiseTitle(rawTitle, supportedLocale);
    } catch (error) {
      this.logger.warn(`Failed to generate chat title: ${error instanceof Error ? error.message : String(error)}`);
      return this.buildFallbackTitle(messages, supportedLocale);
    }
  }

  private buildFallbackTitle(messages: Array<{ role: string; content: string }>, locale: SupportedLocale): string {
    const t = getTranslations(locale);
    const firstUserMessage = messages.find((m) => m.role === 'user' && typeof m.content === 'string' && m.content.trim().length > 0);
    if (!firstUserMessage) return t.mistral.title.defaultTitle;
    const trimmed = firstUserMessage.content.trim();
    return trimmed.length <= 60 ? trimmed : `${trimmed.slice(0, 57)}...`;
  }

  private sanitiseTitle(title: string, locale: SupportedLocale): string {
    const t = getTranslations(locale);
    const cleaned = title.replace(/^"+|"+$/g, '').replace(/[\r\n]+/g, ' ').trim();
    if (!cleaned) return t.mistral.title.defaultTitle;
    return cleaned.length <= 60 ? cleaned : `${cleaned.slice(0, 57)}...`;
  }

  // ===========================================================================
  // DELEGATION TO EXTRACTED SERVICES
  // ===========================================================================

  async generateEmbedding(text: string, _client?: unknown, telemetryContext?: { tenantId: string; userId?: string }): Promise<number[]> {
    return this.embeddingService.generateEmbedding(text, undefined, telemetryContext);
  }

  async generateBulkEmbeddings(texts: string[], _client?: unknown, telemetryContext?: { tenantId: string; userId?: string }): Promise<number[][]> {
    return this.embeddingService.generateBulkEmbeddings(texts, undefined, telemetryContext);
  }

  async searchSimilarContent(tenantId: string, embedding: number[], limit?: number): Promise<Array<{ documentName: string | null; content: string; distance?: number }>> {
    return this.ragService.searchSimilarContent(tenantId, embedding, limit);
  }

  async generateResponse(tenantId: string, userId: string, userPrompt: string, conversationHistory: Array<{ role?: string; content?: unknown }> = [], options?: { conversationId?: string; locale?: string; timeoutMs?: number }): Promise<string> {
    return this.ragService.generateResponse(tenantId, userId, userPrompt, conversationHistory, options);
  }

  getGracefulTimeoutResponse(message: string, locale?: string): string {
    return this.ragService.getGracefulTimeoutResponse(message, locale);
  }

  // ===========================================================================
  // CIRCUIT BREAKER (stays in MistralService)
  // ===========================================================================

  getCircuitBreakerStatus(): { state: 'open' | 'closed' | 'half-open'; failures: number; lastFailure?: Date; lastSuccess?: Date } {
    const cb = getAiCircuitBreaker('mistral', 'completion');
    const stats = cb.getStats();
    return { state: stats.state.toLowerCase() as 'open' | 'closed' | 'half-open', failures: stats.failures, lastFailure: stats.lastFailureAt, lastSuccess: stats.lastSuccessAt };
  }

  isLlmCircuitOpen(): boolean { return this.llmCircuitBreaker.isCircuitOpen(); }
  shouldAllowLlmRequest(): boolean { return this.llmCircuitBreaker.shouldAllowRequest(); }
  recordLlmSuccess(): void { this.llmCircuitBreaker.recordSuccess(); }
  recordLlmFailure(): void { this.llmCircuitBreaker.recordFailure(); }
}
