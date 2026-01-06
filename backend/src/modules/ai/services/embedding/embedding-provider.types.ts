/**
 * Embedding Provider Types
 *
 * Shared types for all embedding providers.
 */

export type EmbeddingProviderType = 'mistral' | 'openai' | 'ollama';

export interface EmbeddingProviderConfig {
  provider: EmbeddingProviderType;
  model: string;
  dimensions: number;
  apiKey?: string;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface BulkEmbeddingResult {
  embeddings: number[][];
  model: string;
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface EmbeddingHealthStatus {
  status: 'ok' | 'error';
  provider: string;
  model: string;
  dimensions: number;
  cached: number;
  latencyMs?: number;
}

/**
 * Base interface for embedding providers
 *
 * Implement this to add new providers (OpenAI, Ollama, etc.)
 */
export interface IEmbeddingProvider {
  readonly provider: EmbeddingProviderType;
  readonly model: string;
  readonly dimensions: number;

  /**
   * Initialize the provider (create client, validate API key)
   */
  initialize(): Promise<void>;

  /**
   * Check if provider is ready
   */
  isReady(): boolean;

  /**
   * Generate single embedding
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Generate multiple embeddings in single API call
   */
  generateBulkEmbeddings(texts: string[]): Promise<number[][]>;
}
