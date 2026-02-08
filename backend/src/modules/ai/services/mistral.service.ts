/**
 * MistralService - Facade for Mistral AI operations (Phase 11-02).
 * Delegates embedding to MistralEmbeddingService, RAG to MistralRagService.
 */
import { Inject, Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mistral } from '@mistralai/mistralai';
import type { Messages as MistralChatMessage } from '@mistralai/mistralai/models/components/chatcompletionrequest.js';
import type { AssistantMessage } from '@mistralai/mistralai/models/components/assistantmessage.js';
import { CorrelationContext } from '../../../common/services/correlation-context.service';
import { getLocale, getTranslations, type SupportedLocale } from '../voltagent/locales';
import { PromptGuardService, type ValidationContext } from '../guards';
import { getAiCircuitBreaker, withRetry, embeddingRateLimiter } from '../utils';
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

type ConversationMessage = { role: 'assistant' | 'user'; content: string };

@Injectable()
export class MistralService implements OnModuleInit {
  private logger = new Logger(MistralService.name);
  private readonly llmCircuitBreaker = new LlmCircuitBreaker();
  private static readonly MAX_USER_PROMPT_LENGTH = 10000;
  private static readonly MAX_SYSTEM_PROMPT_LENGTH = 5000;

  constructor(
    private configService: ConfigService,
    private promptGuard: PromptGuardService,
    private embeddingService: MistralEmbeddingService,
    private ragService: MistralRagService,
    @Optional() @Inject(UsageTrackingService) private usageTrackingService?: UsageTrackingService,
    @Optional() @Inject(CostProtectionService) private costProtectionService?: CostProtectionService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Wire up dependencies for extracted services (avoids circular dependency)
    this.embeddingService.setClientFactory(() => this.createMistralClient());
    this.ragService.setDependencies({
      createClient: () => this.createClient(this.getRequiredApiKey()),
      generateEmbedding: (text, client, ctx) => this.embeddingService.generateEmbedding(text, client, ctx),
      getModel: (tier) => this.getModel(tier),
      getEmbeddingModel: () => this.getEmbeddingModel(),
    });
  }

  private getApiKey(): string | undefined {
    return this.configService.get<string>('MISTRAL_API_KEY') || process.env.MISTRAL_API_KEY;
  }

  private getRequiredApiKey(): string {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new AiError('Mistral API key is not configured', AiErrorCode.PROVIDER_ERROR, { retryable: false });
    return apiKey;
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

  async createMistralClient(): Promise<Mistral> {
    return this.createClient(this.getRequiredApiKey());
  }

  private createClient(apiKey: string): Mistral { return new Mistral({ apiKey }); }

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

  private normaliseConversation(history: Array<{ role?: string; content?: unknown }>): MistralChatMessage[] {
    const result = history.filter((item): item is ConversationMessage =>
      item && typeof item.content === 'string' && (item.role === 'assistant' || item.role === 'user'))
      .map((item) => item.role === 'assistant'
        ? { role: 'assistant' as const, content: item.content }
        : { role: 'user' as const, content: item.content });
    return result as MistralChatMessage[];
  }

  private extractAssistantContent(message: AssistantMessage | undefined): string {
    if (!message || message.content == null) return '';
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      return message.content.map((chunk) => chunk && typeof chunk === 'object' && 'text' in chunk && typeof chunk.text === 'string' ? chunk.text : '').join('').trim();
    }
    return '';
  }

  /** Prompt completion (stays in MistralService - core chat). */
  async completePrompt(options: {
    systemPrompt?: string; userPrompt: string; temperature?: number; maxTokens?: number;
    timeoutMs?: number; telemetryContext?: { tenantId: string; userId?: string; promptName?: string };
    modelTier?: 'fast' | 'creative' | 'router' | 'default'; jsonMode?: boolean;
    validationContext?: ValidationContext;
  }): Promise<string> {
    const { systemPrompt, userPrompt, temperature = 0.4, maxTokens = 512, timeoutMs = 30000,
      telemetryContext: _telemetryContext, modelTier, jsonMode = false, validationContext = 'USER_PROMPT' } = options;

    const model = this.getModel(modelTier);
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
          const client = await this.createMistralClient();
          const messages: MistralChatMessage[] = [];
          if (systemPrompt) {
            const defensivePrompt = this.promptGuard.getDefensiveSystemPrompt();
            const fullSystemPrompt = systemPrompt.includes('SECURITY GUIDELINES') ? systemPrompt : `${systemPrompt}\n\n${defensivePrompt}`;
            messages.push({ role: 'system', content: fullSystemPrompt });
          }
          messages.push({ role: 'user', content: userPrompt });

          const completionPromise = client.chat.complete({
            model, messages, temperature, maxTokens, safePrompt: true,
            ...(jsonMode && { responseFormat: { type: 'json_object' as const } }),
          });

          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new AiError(`LLM request timed out after ${timeoutMs}ms`, AiErrorCode.PROVIDER_TIMEOUT)), timeoutMs);
          });

          const completion = await Promise.race([completionPromise, timeoutPromise]);
          const text = this.extractAssistantContent(completion.choices?.[0]?.message).trim();
          if (!text) throw new AiError('Empty response from AI service', AiErrorCode.EMPTY_RESPONSE);

          const outputValidation = this.promptGuard.validateOutput(text);
          if (!outputValidation.isValid) {
            this.logger.warn(`Blocked potential data leakage in output: ${outputValidation.blockReason}`);
            throw new AiError('Output blocked by security guard: Potential data leakage', AiErrorCode.OUTPUT_BLOCKED);
          }
          return { text, usage: completion.usage };
        };

        const text = await withRetry(async () => (await executeCall()).text, {
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

  /** Title generation (stays in MistralService - helper). */
  async generateChatTitle(messages: Array<{ role: string; content: string }> = [], locale?: string): Promise<string> {
    const supportedLocale = getLocale(locale);
    const t = getTranslations(supportedLocale);
    if (!messages || messages.length === 0) return t.mistral.title.defaultTitle;

    const apiKey = this.getApiKey();
    if (!apiKey) return this.buildFallbackTitle(messages, supportedLocale);

    try {
      const client = this.createClient(apiKey);
      const recentMessages = messages.slice(-6);
      const transcript = recentMessages.map((m) => `${m.role === 'assistant' ? t.mistral.roles.assistant : t.mistral.roles.user}: ${m.content}`).join('\n');
      const completion = await client.chat.complete({
        model: this.getModel('fast'), temperature: 0.2, maxTokens: 32, safePrompt: true,
        messages: [{ role: 'system', content: t.mistral.title.system }, { role: 'user', content: `${t.mistral.title.conversationLabel}:\n${transcript}\n\n${t.mistral.title.titleLabel}:` }],
      });
      const rawTitle = this.extractAssistantContent(completion.choices?.[0]?.message) || this.buildFallbackTitle(messages, supportedLocale);
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

  async generateEmbedding(text: string, client?: Mistral, telemetryContext?: { tenantId: string; userId?: string }): Promise<number[]> {
    return this.embeddingService.generateEmbedding(text, client, telemetryContext);
  }

  async generateBulkEmbeddings(texts: string[], client?: Mistral, telemetryContext?: { tenantId: string; userId?: string }): Promise<number[][]> {
    return this.embeddingService.generateBulkEmbeddings(texts, client, telemetryContext);
  }

  async searchSimilarContent(tenantId: string, embedding: number[], limit?: number): Promise<Array<{ documentName: string | null; content: string; distance?: number }>> {
    return this.ragService.searchSimilarContent(tenantId, embedding, limit);
  }

  async generateResponse(tenantId: string, userId: string, userPrompt: string, conversationHistory: Array<{ role?: string; content?: unknown }> = [], options?: { conversationId?: string; locale?: string; timeoutMs?: number }): Promise<string> {
    return this.ragService.generateResponse(tenantId, userId, userPrompt, conversationHistory, options, this.getApiKey());
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

  // ===========================================================================
  // BATCH API (stays in MistralService - batch operations)
  // ===========================================================================

  async createBatchJob(requests: Array<{ customId: string; systemPrompt: string; userPrompt: string; maxTokens?: number }>, model?: string): Promise<{ jobId: string; inputFileId: string; status: string }> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new AiError('Mistral API key not configured', AiErrorCode.AUTH_FAILED);

    const mistralClient = this.createClient(apiKey);
    const modelToUse = model || 'mistral-small-latest';

    const jsonlContent = requests.map((req) => JSON.stringify({
      custom_id: req.customId, body: { model: modelToUse, max_tokens: req.maxTokens || 500,
        messages: [{ role: 'system', content: req.systemPrompt }, { role: 'user', content: req.userPrompt }] },
    })).join('\n');

    try {
      const fileBlob = new Blob([jsonlContent], { type: 'application/jsonl' });
      const uploadResponse = await mistralClient.files.upload({ file: { fileName: `batch_${Date.now()}.jsonl`, content: fileBlob }, purpose: 'batch' });
      this.logger.log(`Batch file uploaded: ${uploadResponse.id} (${requests.length} requests)`);
      const jobResponse = await mistralClient.batch.jobs.create({ inputFiles: [uploadResponse.id], model: modelToUse, endpoint: '/v1/chat/completions', metadata: { source: 'mailagent', requestCount: String(requests.length) } });
      this.logger.log(`Batch job created: ${jobResponse.id} (status: ${jobResponse.status})`);
      return { jobId: jobResponse.id, inputFileId: uploadResponse.id, status: jobResponse.status };
    } catch (error) {
      const aiError = AiError.fromError(error);
      this.logger.error(`Failed to create batch job: ${aiError.message}`);
      throw aiError;
    }
  }

  async getBatchJobStatus(jobId: string): Promise<{ status: string; outputFileId?: string; totalRequests?: number; completedRequests?: number; failedRequests?: number }> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new AiError('Mistral API key not configured', AiErrorCode.AUTH_FAILED);
    const mistralClient = this.createClient(apiKey);
    try {
      const job = await mistralClient.batch.jobs.get({ jobId });
      return { status: job.status, outputFileId: job.outputFile ?? undefined, totalRequests: job.totalRequests ?? undefined, completedRequests: job.completedRequests ?? undefined, failedRequests: job.failedRequests ?? undefined };
    } catch (error) {
      const aiError = AiError.fromError(error);
      this.logger.error(`Failed to get batch job status: ${aiError.message}`);
      throw aiError;
    }
  }

  async downloadBatchResults(outputFileId: string): Promise<Map<string, { content: string; error?: string }>> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new AiError('Mistral API key not configured', AiErrorCode.AUTH_FAILED);
    const mistralClient = this.createClient(apiKey);
    try {
      const fileStream = await mistralClient.files.download({ fileId: outputFileId });
      const chunks: Uint8Array[] = [];
      const reader = fileStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const content = new TextDecoder().decode(chunks.reduce((acc, chunk) => new Uint8Array([...acc, ...chunk]), new Uint8Array()));
      const results = new Map<string, { content: string; error?: string }>();
      const lines = content.split('\n').filter((line) => line.trim());
      for (const line of lines) {
        try {
          const result = JSON.parse(line);
          const customId = result.custom_id;
          if (result.error) results.set(customId, { content: '', error: result.error.message || 'Unknown error' });
          else if (result.response?.body?.choices?.[0]?.message?.content) results.set(customId, { content: result.response.body.choices[0].message.content });
          else results.set(customId, { content: '', error: 'No content in response' });
        } catch { this.logger.warn(`Failed to parse batch result line`); }
      }
      this.logger.log(`Downloaded batch results: ${results.size} items`);
      return results;
    } catch (error) {
      const aiError = AiError.fromError(error);
      this.logger.error(`Failed to download batch results: ${aiError.message}`);
      throw aiError;
    }
  }

  async cancelBatchJob(jobId: string): Promise<{ status: string }> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new AiError('Mistral API key not configured', AiErrorCode.AUTH_FAILED);
    const mistralClient = this.createClient(apiKey);
    try {
      const job = await mistralClient.batch.jobs.cancel({ jobId });
      this.logger.log(`Batch job cancelled: ${jobId} (status: ${job.status})`);
      return { status: job.status };
    } catch (error) {
      const aiError = AiError.fromError(error);
      this.logger.error(`Failed to cancel batch job: ${aiError.message}`);
      throw aiError;
    }
  }
}
