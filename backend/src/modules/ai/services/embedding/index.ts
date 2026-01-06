/**
 * Embedding Module Exports
 *
 * Unified embedding provider with:
 * - Redis caching (50-70% API cost reduction)
 * - Rate limiting (prevents API throttling)
 * - Circuit breaker (graceful degradation)
 * - Provider abstraction (Mistral, future: OpenAI, Ollama)
 * - Batch API for async bulk operations (lower cost)
 */

// Types
export * from './embedding-provider.types';

// Providers
export * from './mistral-embedding.provider';
export * from './mistral-batch.provider';

// Main service
export * from './embedding-provider.service';
