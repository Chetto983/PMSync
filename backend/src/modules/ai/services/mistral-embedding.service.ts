/** MistralEmbeddingService - Embedding generation with caching (Phase 11-02). */
import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mistral } from '@mistralai/mistralai';
import { CorrelationContext } from '../../../common/services/correlation-context.service';
import { QueryEmbeddingCacheService } from './query-embedding-cache.service';
import { CostProtectionService } from '../../subscription/services/cost-protection.service';
import { getAiCircuitBreaker, withRetry, embeddingRateLimiter } from '../utils';
import { AiError, AiErrorCode } from '../errors';

@Injectable()
export class MistralEmbeddingService {
  private readonly logger = new Logger(MistralEmbeddingService.name);
  private readonly embeddingModel = 'mistral-embed';
  private createClientFn!: () => Promise<Mistral>;

  constructor(
    private readonly configService: ConfigService,
    @Optional() @Inject(QueryEmbeddingCacheService) private queryEmbeddingCache?: QueryEmbeddingCacheService,
    @Optional() @Inject(CostProtectionService) private costProtectionService?: CostProtectionService,
  ) {
    if (this.queryEmbeddingCache) {
      this.logger.log('Query embedding cache enabled - expect 50-70% API cost savings');
    }
  }

  /** Set the client factory (injected by MistralService to avoid circular dependency). */
  setClientFactory(fn: () => Promise<Mistral>): void { this.createClientFn = fn; }

  getEmbeddingModel(): string { return this.embeddingModel; }

  private async acquireSlot(): Promise<void> { await embeddingRateLimiter.acquire(); }

  /**
   * Generate embedding for a single text (rate-limited, circuit breaker, cached).
   * GDPR compliant: Cache is tenant-isolated. tenantId is REQUIRED for caching.
   */
  async generateEmbedding(
    text: string,
    client?: Mistral,
    telemetryContext?: { tenantId: string; userId?: string },
  ): Promise<number[]> {
    const tenantId = telemetryContext?.tenantId;

    // P10: Check cost cap BEFORE making embedding API call
    if (tenantId && this.costProtectionService) {
      const costCheck = await this.costProtectionService.canProceed(tenantId, 'embedding');
      if (!costCheck.allowed) {
        this.logger.warn(`[tenant:${tenantId}] Embedding cost cap reached: ${costCheck.reason}`);
        throw new AiError(costCheck.reason || 'Daily cost limit reached', AiErrorCode.QUOTA_EXCEEDED, {
          retryable: false, context: { tenantId },
        });
      }
    }

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
      await this.acquireSlot();
      try {
        const executeCall = async () => {
          const mistralClient = client ?? (await this.createClientFn());
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
          async () => (await executeCall()).embedding,
          { maxRetries: 3, initialDelayMs: 200, isRetryable: (err: unknown) => AiError.fromError(err).retryable }
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
   * Generate embeddings for multiple texts in a single bulk operation (rate-limited with circuit breaker).
   */
  async generateBulkEmbeddings(
    texts: string[],
    client?: Mistral,
    _telemetryContext?: { tenantId: string; userId?: string },
  ): Promise<number[][]> {
    if (!texts || texts.length === 0) return [];

    const cb = getAiCircuitBreaker('mistral', 'bulk_embedding');

    return cb.execute(async () => {
      await this.acquireSlot();
      try {
        const executeCall = async () => {
          const mistralClient = client ?? (await this.createClientFn());
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
          async () => (await executeCall()).embeddings,
          { maxRetries: 3, initialDelayMs: 200, isRetryable: (err: unknown) => AiError.fromError(err).retryable }
        );
      } catch (error) {
        const corrId = CorrelationContext.getCorrelationId();
        const aiError = AiError.fromError(error);
        this.logger.error(`[${corrId}] Failed to generate bulk embeddings: ${aiError.message}`);
        throw aiError;
      }
    });
  }
}
