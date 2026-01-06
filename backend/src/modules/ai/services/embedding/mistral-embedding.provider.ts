import { Logger } from '@nestjs/common';
import { Mistral } from '@mistralai/mistralai';
import { IEmbeddingProvider, EmbeddingProviderType } from './embedding-provider.types';
import { AiError, AiErrorCode } from '../../errors';

/**
 * Mistral Embedding Provider
 *
 * Handles all Mistral-specific embedding logic.
 * Stateless - same text always produces same embedding.
 */
export class MistralEmbeddingProvider implements IEmbeddingProvider {
  private readonly logger = new Logger(MistralEmbeddingProvider.name);
  private client: Mistral | null = null;

  readonly provider: EmbeddingProviderType = 'mistral';
  readonly model: string;
  readonly dimensions: number;

  constructor(
    private readonly apiKey: string,
    model: string = 'mistral-embed',
    dimensions: number = 1024,
  ) {
    this.model = model;
    this.dimensions = dimensions;
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn('MISTRAL_API_KEY not set - embeddings will fail');
      return;
    }

    this.client = new Mistral({ apiKey: this.apiKey });
    this.logger.log(`Mistral provider initialized: ${this.model} (${this.dimensions}d)`);
  }

  isReady(): boolean {
    return this.client !== null;
  }

  /**
   * Generate single embedding
   *
   * @param text - Text to embed (max ~8000 tokens for mistral-embed)
   * @returns Embedding vector
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.client) {
      throw new AiError('Mistral client not initialized', AiErrorCode.PROVIDER_ERROR);
    }

    const response = await this.client.embeddings.create({
      model: this.model,
      inputs: text,
    });

    const embedding = response.data?.[0]?.embedding;
    if (!embedding || embedding.length === 0) {
      throw new AiError('Empty embedding response from Mistral', AiErrorCode.EMPTY_RESPONSE);
    }

    return embedding;
  }

  /**
   * Generate multiple embeddings in single API call
   *
   * Use for: Email indexing, document processing
   * More efficient than multiple single calls.
   *
   * @param texts - Array of texts to embed
   * @returns Array of embeddings (same order as input)
   */
  async generateBulkEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.client) {
      throw new AiError('Mistral client not initialized', AiErrorCode.PROVIDER_ERROR);
    }

    if (!texts || texts.length === 0) {
      return [];
    }

    const response = await this.client.embeddings.create({
      model: this.model,
      inputs: texts,
    });

    if (!response.data || response.data.length === 0) {
      throw new AiError('Empty bulk embedding response from Mistral', AiErrorCode.EMPTY_RESPONSE);
    }

    // Sort by index to maintain input order
    return response.data
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((item) => {
        if (!item.embedding || item.embedding.length === 0) {
          throw new AiError('Missing embedding in bulk response', AiErrorCode.EMPTY_RESPONSE);
        }
        return item.embedding;
      });
  }
}
