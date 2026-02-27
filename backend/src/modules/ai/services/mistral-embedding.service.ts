/**
 * MistralEmbeddingService - Embedding generation via AI SDK (Phase 23 rewire).
 *
 * Uses AI SDK embed()/embedMany() with MistralProviderService.getEmbeddingModel().
 * Preserves: cache, cost protection, telemetry context.
 * Removed: manual circuit breaker, rate limiter, lazy client factory.
 */
import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { embed, embedMany } from 'ai';
import { MistralProviderService } from '../../mistral/mistral-provider.service';
import { QueryEmbeddingCacheService } from './query-embedding-cache.service';
import { CostProtectionService } from '../../subscription/services/cost-protection.service';
import { CorrelationContext } from '../../../common/services/correlation-context.service';
import { AiError, AiErrorCode } from '../errors';

@Injectable()
export class MistralEmbeddingService {
  private readonly logger = new Logger(MistralEmbeddingService.name);

  constructor(
    private readonly mistralProvider: MistralProviderService,
    @Optional() @Inject(QueryEmbeddingCacheService) private queryEmbeddingCache?: QueryEmbeddingCacheService,
    @Optional() @Inject(CostProtectionService) private costProtectionService?: CostProtectionService,
  ) {
    if (this.queryEmbeddingCache) {
      this.logger.log('Query embedding cache enabled - expect 50-70% API cost savings');
    }
  }

  getEmbeddingModel(): string {
    return 'mistral-embed';
  }

  /**
   * Generate embedding for a single text.
   * GDPR compliant: Cache is tenant-isolated. tenantId is REQUIRED for caching.
   *
   * The optional `_client` parameter is kept for backward compatibility with
   * callers that pass `undefined` (e.g., KnowledgeBaseService). It is ignored.
   */
  async generateEmbedding(
    text: string,
    _client?: unknown,
    telemetryContext?: { tenantId: string; userId?: string },
  ): Promise<number[]> {
    const tenantId = telemetryContext?.tenantId;

    // Cost cap check BEFORE API call
    if (tenantId && this.costProtectionService) {
      const costCheck = await this.costProtectionService.canProceed(tenantId, 'embedding');
      if (!costCheck.allowed) {
        this.logger.warn(`[tenant:${tenantId}] Embedding cost cap reached: ${costCheck.reason}`);
        throw new AiError(costCheck.reason || 'Daily cost limit reached', AiErrorCode.QUOTA_EXCEEDED, {
          retryable: false, context: { tenantId },
        });
      }
    }

    // Cache check (GDPR: requires tenantId)
    if (this.queryEmbeddingCache && tenantId) {
      const cached = await this.queryEmbeddingCache.getCachedEmbedding(tenantId, text);
      if (cached) {
        this.logger.debug(`Query embedding cache HIT for tenant=${tenantId}`);
        return cached;
      }
    } else if (this.queryEmbeddingCache && !tenantId) {
      this.logger.warn('Query embedding cache SKIPPED - no tenantId provided (GDPR requirement)');
    }

    try {
      const { embedding } = await embed({
        model: this.mistralProvider.getEmbeddingModel(),
        value: text,
        maxRetries: 3,
        abortSignal: AbortSignal.timeout(15_000),
      });

      if (!embedding || embedding.length === 0) {
        throw new AiError('Mistral embeddings response did not contain data', AiErrorCode.EMPTY_RESPONSE);
      }

      // Cache the result (GDPR: requires tenantId)
      if (this.queryEmbeddingCache && embedding && tenantId) {
        await this.queryEmbeddingCache.setCachedEmbedding(tenantId, text, embedding);
      }

      return embedding;
    } catch (error) {
      if (error instanceof AiError) throw error;
      const corrId = CorrelationContext.getCorrelationId();
      const aiError = AiError.fromError(error);
      this.logger.error(`[${corrId}] Failed to generate embedding: ${aiError.message}`);
      throw aiError;
    }
  }

  /**
   * Generate embeddings for multiple texts in a single bulk operation.
   *
   * The optional `_client` parameter is kept for backward compatibility.
   */
  async generateBulkEmbeddings(
    texts: string[],
    _client?: unknown,
    _telemetryContext?: { tenantId: string; userId?: string },
  ): Promise<number[][]> {
    if (!texts || texts.length === 0) return [];

    try {
      const { embeddings } = await embedMany({
        model: this.mistralProvider.getEmbeddingModel(),
        values: texts,
        maxRetries: 3,
        maxParallelCalls: 2, // matches existing 2 req/s rate limit
        abortSignal: AbortSignal.timeout(30_000),
      });

      if (!embeddings || embeddings.length === 0) {
        throw new AiError('Mistral bulk embeddings response did not contain data', AiErrorCode.EMPTY_RESPONSE);
      }

      if (embeddings.length !== texts.length) {
        throw new AiError(
          `Expected ${texts.length} embeddings but received ${embeddings.length}`,
          AiErrorCode.PROVIDER_ERROR,
        );
      }

      this.logger.debug(`Generated ${embeddings.length} embeddings in bulk`);
      return embeddings;
    } catch (error) {
      if (error instanceof AiError) throw error;
      const corrId = CorrelationContext.getCorrelationId();
      const aiError = AiError.fromError(error);
      this.logger.error(`[${corrId}] Failed to generate bulk embeddings: ${aiError.message}`);
      throw aiError;
    }
  }
}
